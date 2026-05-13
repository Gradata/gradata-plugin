#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { callDaemon } = require('../hooks/lib/daemon-client.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const FAIL_FLAG = process.argv.includes('--simulate-fail');

function dots(label, value) {
  const width = 30;
  const padded = `${label} ${'.'.repeat(Math.max(2, width - label.length))}`;
  console.log(`  ${padded} ${value}`);
}

function ok(detail) {
  return { pass: true, detail };
}

function fail(detail, fix) {
  return { pass: false, detail, fix };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveSettingsPath() {
  const local = path.join(process.cwd(), '.claude', 'settings.json');
  const global = path.join(HOME, '.claude', 'settings.json');
  if (fs.existsSync(local)) return local;
  if (fs.existsSync(global)) return global;
  return null;
}

function expectedHookCommands() {
  const hooksPath = path.join(REPO_ROOT, 'hooks', 'hooks.json');
  const manifest = readJson(hooksPath);
  const expected = new Map();
  for (const [eventName, entries] of Object.entries(manifest.hooks || {})) {
    const commands = [];
    for (const entry of entries || []) {
      for (const hook of entry.hooks || []) {
        if (hook.type === 'command' && typeof hook.command === 'string') {
          commands.push(hook.command);
        }
      }
    }
    expected.set(eventName, commands);
  }
  return expected;
}

function commandMatches(expectedCommand, actualCommand) {
  const expectedBase = path.basename(expectedCommand);
  if (!actualCommand.includes(expectedBase)) return false;
  const usesPluginRootToken = actualCommand.includes('${CLAUDE_PLUGIN_ROOT}');
  const usesRepoPath = actualCommand.includes(path.join(REPO_ROOT, 'hooks'));
  return usesPluginRootToken || usesRepoPath;
}

function checkHookRegistration() {
  if (FAIL_FLAG) {
    return fail('simulated failure', 'Remove --simulate-fail to run actual hook registration checks.');
  }

  const settingsPath = resolveSettingsPath();
  if (!settingsPath) {
    return fail(
      'no Claude settings found',
      'Create ~/.claude/settings.json (or project .claude/settings.json) and ensure plugin hooks are registered.'
    );
  }

  let settings;
  try {
    settings = readJson(settingsPath);
  } catch (err) {
    return fail(
      `invalid JSON in ${settingsPath}: ${err.message}`,
      'Fix JSON syntax in the Claude settings file, then rerun doctor.'
    );
  }

  const expected = expectedHookCommands();
  const configuredHooks = settings.hooks || {};
  const problems = [];

  for (const [eventName, commands] of expected.entries()) {
    const eventEntries = configuredHooks[eventName];
    if (!Array.isArray(eventEntries) || eventEntries.length === 0) {
      problems.push(`${eventName}: missing registration`);
      continue;
    }

    const actualCommands = [];
    for (const entry of eventEntries) {
      for (const hook of entry.hooks || []) {
        if (hook.type === 'command' && typeof hook.command === 'string') {
          actualCommands.push(hook.command);
        }
      }
    }

    for (const expectedCommand of commands) {
      if (!actualCommands.some((cmd) => commandMatches(expectedCommand, cmd))) {
        problems.push(`${eventName}: missing/wrong path for ${path.basename(expectedCommand)}`);
      }
    }
  }

  if (problems.length > 0) {
    return fail(
      `${problems.length} registration issue(s) in ${settingsPath}`,
      `Reinstall or re-enable the plugin, then verify hooks from hooks/hooks.json are present: ${problems.join('; ')}`
    );
  }

  return ok(`all hook events registered in ${settingsPath}`);
}

function findDaemonLogs() {
  const base = path.join(HOME, '.gradata', 'projects');
  if (!fs.existsSync(base)) return [];
  const logs = [];
  for (const projectId of fs.readdirSync(base)) {
    const p = path.join(base, projectId);
    const candidates = [path.join(p, 'daemon.log'), path.join(p, 'daemon.log.1')];
    for (const file of candidates) {
      if (fs.existsSync(file)) logs.push(file);
    }
  }
  return logs;
}

async function checkHookFires() {
  const probeId = `doctor_probe_${Date.now()}`;
  const payload = {
    event_type: 'doctor_posttool_probe',
    session_id: `doctor-session-${Date.now()}`,
    data: {
      source: 'doctor-full',
      probe_id: probeId,
      claude_event: 'PostToolUse',
      tool_name: 'Edit',
    },
  };

  const result = await callDaemon('/log-event', payload, 2000);
  if (!result) {
    return fail(
      'daemon did not respond to /log-event',
      'Start Gradata daemon by opening Claude Code with plugin enabled, then rerun doctor.'
    );
  }

  const deadline = Date.now() + 2000;
  const logFiles = findDaemonLogs();
  while (Date.now() < deadline) {
    for (const file of logFiles) {
      try {
        const tail = fs.readFileSync(file, 'utf8').slice(-30000);
        if (tail.includes(probeId)) {
          return ok(`probe delivered and observed in ${file}`);
        }
      } catch {
        // best effort
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return fail(
    'probe sent but not observed in daemon logs within 2s',
    'Check daemon logging path under ~/.gradata/projects/*/daemon.log and verify /log-event persistence.'
  );
}

function runPython(code) {
  try {
    const out = execFileSync('python3', ['-c', code], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return {
      ok: false,
      out: (err.stdout || '').toString().trim(),
      err: (err.stderr || err.message || '').toString().trim(),
    };
  }
}

function checkGraduationRunnable() {
  const code = [
    'from gradata._types import Lesson, LessonState, CorrectionType',
    'from gradata.enhancements.self_improvement import graduate, MIN_APPLICATIONS_FOR_PATTERN, MIN_APPLICATIONS_FOR_RULE',
    'assert MIN_APPLICATIONS_FOR_PATTERN == 2, f"pattern threshold mismatch: {MIN_APPLICATIONS_FOR_PATTERN}"',
    'assert MIN_APPLICATIONS_FOR_RULE == 3, f"rule threshold mismatch: {MIN_APPLICATIONS_FOR_RULE}"',
    'lessons = [',
    '  Lesson(category="PROCESS", description="Always include tests with behavior changes", state=LessonState.INSTINCT, confidence=0.95, fire_count=3, sessions_since_fire=0, correction_type=CorrectionType.REWRITTEN, context_type="code", contradiction_count=0, successful_applications=0),',
    '  Lesson(category="PROCESS", description="Always include tests with behavior changes", state=LessonState.PATTERN, confidence=0.99, fire_count=3, sessions_since_fire=0, correction_type=CorrectionType.REWRITTEN, context_type="code", contradiction_count=0, successful_applications=0),',
    '  Lesson(category="PROCESS", description="Always include tests with behavior changes", state=LessonState.INSTINCT, confidence=0.88, fire_count=2, sessions_since_fire=0, correction_type=CorrectionType.REWRITTEN, context_type="code", contradiction_count=0, successful_applications=0),',
    ']',
    'active, graduated = graduate(lessons)',
    'states = [l.state.name for l in lessons]',
    'assert "RULE" in states, f"expected RULE promotion, got {states}"',
    'assert "PATTERN" in states, f"expected PATTERN state present, got {states}"',
    'print("ok|" + ",".join(states))',
  ].join('\n');

  const result = runPython(code);
  if (!result.ok) {
    return fail(
      `dry-run graduation failed: ${result.err || result.out || 'unknown error'}`,
      'Ensure `gradata` SDK is installed in `python3` environment and graduation API is importable.'
    );
  }

  return ok(`synthetic lessons graduated successfully (${result.out})`);
}

function checkAgentsExport() {
  const code = [
    'from pathlib import Path',
    'import tempfile',
    'from gradata.enhancements.rule_export import export_rules',
    'root = Path(tempfile.mkdtemp(prefix="gradata-doctor-export-"))',
    '(root / "lessons.md").write_text("", encoding="utf-8")',
    'text = export_rules(root, target="agents")',
    '(root / "AGENTS.md").write_text(text + "\\n# doctor-export-probe\\n", encoding="utf-8")',
    'read_back = (root / "AGENTS.md").read_text(encoding="utf-8")',
    'assert "doctor-export-probe" in read_back',
    'assert (root / "AGENTS.md").exists()',
    'print(str(root / "AGENTS.md"))',
  ].join('\n');

  const result = runPython(code);
  if (!result.ok) {
    return fail(
      `AGENTS.md export check failed: ${result.err || result.out || 'unknown error'}`,
      'Verify SDK export path is writable and `gradata.enhancements.rule_export.export_rules` works in current python env.'
    );
  }

  return ok(`wrote and verified ${result.out}`);
}

async function main() {
  console.log('Gradata Doctor');
  const checks = [];

  checks.push(['Hook registration', checkHookRegistration()]);
  checks.push(['Hook fires', await checkHookFires()]);
  checks.push(['Graduation runnable', checkGraduationRunnable()]);
  checks.push(['AGENTS.md export', checkAgentsExport()]);

  let firstFailure = null;
  for (const [name, result] of checks) {
    if (result.pass) {
      dots(name, `OK (${result.detail})`);
      continue;
    }
    if (!firstFailure) firstFailure = name;
    dots(name, `FAIL (${result.detail})`);
    dots(`${name} fix`, result.fix);
  }

  if (firstFailure) {
    console.log(`Dogfood readiness: NOT READY (failed: ${firstFailure})`);
    process.exit(1);
  }

  console.log('Dogfood readiness: READY');
}

main().catch((err) => {
  console.error(`Doctor runtime error: ${err.message}`);
  process.exit(1);
});
