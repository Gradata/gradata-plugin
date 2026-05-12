#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const GRADATA_HOME = process.env.GRADATA_HOME || path.join(HOME, '.gradata');
const PYTHON_CANDIDATES = process.platform === 'win32'
  ? ['python3', 'python', 'py -3']
  : ['python3', 'python', '/usr/local/bin/python3', '/usr/bin/python3'];

const ARGS = process.argv.slice(2);
function hasFlag(name) { return ARGS.indexOf(name) !== -1; }
function flagValue(name) {
  const i = ARGS.indexOf(name);
  if (i === -1) return null;
  const v = ARGS[i + 1];
  if (!v || v.startsWith('--')) return '';
  return v;
}

const AUTO = hasFlag('--auto');
const PATCH_AGENTS_MD_EXPLICIT = hasFlag('--patch-agents-md');
const CODEX_CONFIG_DIR = path.join(HOME, '.codex');
const CODEX_CONFIG_PATH = path.join(CODEX_CONFIG_DIR, 'config.toml');
const CLAUDE_CONFIG_DIR = path.join(HOME, '.claude');
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_CONFIG_DIR, 'settings.json');
const CURSOR_CONFIG_PATH = path.join(HOME, '.cursor', 'hooks.json');
const AGENT = flagValue('--agent');

function tryPython(cmd) {
  try {
    const version = execSync(`${cmd} --version 2>&1`, { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
    const match = version.match(/Python (\d+)\.(\d+)/);
    if (!match) return null;
    const [, major, minor] = match.map(Number);
    if (major < 3 || (major === 3 && minor < 10)) return null;
    const absPath = execSync(`${cmd} -c "import sys; print(sys.executable)"`, {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
    }).trim();
    return { cmd, absPath, version };
  } catch { return null; }
}

function hasGradata(pythonPath) {
  try {
    execSync(`"${pythonPath}" -c "import gradata"`, { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    return true;
  } catch { return false; }
}

// SDK install source: PyPI publish is not yet live. Install from git source.
// Package lives in the `Gradata/` subdirectory of the repo.
const SDK_GIT_URL = 'git+https://github.com/Gradata/gradata.git#subdirectory=Gradata';
const SDK_INSTALL_HINT = `pip install ${SDK_GIT_URL}`;

function isPep668Error(stderr) {
  if (!stderr) return false;
  const s = String(stderr).toLowerCase();
  return s.indexOf('externally-managed-environment') !== -1
    || s.indexOf('externally managed') !== -1
    || s.indexOf('pep 668') !== -1;
}

// Tiered install: plain → --user → --break-system-packages (gated on env).
// Returns { ok: bool, mode: string, stderr: string }.
function installSdkTiered(pythonPath) {
  const base = `"${pythonPath}" -m pip install ${SDK_GIT_URL}`;
  const opts = { encoding: 'utf8', windowsHide: true, timeout: 300000, stdio: ['ignore', 'inherit', 'pipe'] };
  // 1) plain
  try {
    execSync(base, opts);
    return { ok: true, mode: 'plain', stderr: '' };
  } catch (e1) {
    const err1 = (e1.stderr && e1.stderr.toString()) || '';
    if (!isPep668Error(err1)) {
      // Not a PEP 668 issue — propagate.
      return { ok: false, mode: 'plain', stderr: err1 || (e1.message || '') };
    }
    console.log('PEP 668 detected (externally-managed-environment). Retrying with --user...');
    // 2) --user
    try {
      execSync(`${base} --user`, opts);
      return { ok: true, mode: '--user', stderr: '' };
    } catch (e2) {
      const err2 = (e2.stderr && e2.stderr.toString()) || '';
      // 3) --break-system-packages, gated by env var
      if (process.env.GRADATA_FORCE_SYSTEM_PIP === '1') {
        console.log('GRADATA_FORCE_SYSTEM_PIP=1 set. Retrying with --break-system-packages...');
        try {
          execSync(`${base} --break-system-packages`, opts);
          return { ok: true, mode: '--break-system-packages', stderr: '' };
        } catch (e3) {
          const err3 = (e3.stderr && e3.stderr.toString()) || '';
          return { ok: false, mode: '--break-system-packages', stderr: err3 || (e3.message || '') };
        }
      }
      return { ok: false, mode: '--user', stderr: err2 || (e2.message || '') };
    }
  }
}

function printPep668Help(pythonPath) {
  console.log('');
  console.log('SDK install blocked. Your Python is externally-managed (PEP 668).');
  console.log('Pick one of:');
  console.log(`  pipx install ${SDK_GIT_URL}`);
  console.log(`  uv tool install ${SDK_GIT_URL}`);
  console.log(`  python3 -m venv ~/.gradata/venv && ~/.gradata/venv/bin/pip install ${SDK_GIT_URL}`);
  console.log(`  GRADATA_FORCE_SYSTEM_PIP=1 "${pythonPath}" -m pip install --break-system-packages ${SDK_GIT_URL}`);
}

function writeConfig(pythonPath) {
  fs.mkdirSync(GRADATA_HOME, { recursive: true });
  const configPath = path.join(GRADATA_HOME, 'config.toml');
  fs.writeFileSync(configPath, `# Gradata configuration\npython_path = "${pythonPath.replace(/\\/g, '\\\\')}"\n`, 'utf8');
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// --- AGENTS.md patching -----------------------------------------------------

const BEGIN_MARKER = '<!-- BEGIN GRADATA -->';
const END_MARKER = '<!-- END GRADATA -->';

function loadTemplate() {
  const tplPath = path.join(__dirname, 'AGENTS_MD_TEMPLATE.md');
  return fs.readFileSync(tplPath, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
}

// Line-based marker scan: only treat a marker as real if it appears on its
// own line (after trim). Avoids accidental matches inside indented code or
// inline prose. Returns { beginCount, endCount, beginLine, endLine }.
function scanMarkers(content) {
  const lines = content.split('\n');
  let beginCount = 0;
  let endCount = 0;
  let beginLine = -1;
  let endLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === BEGIN_MARKER) {
      beginCount++;
      if (beginLine === -1) beginLine = i;
    } else if (t === END_MARKER) {
      endCount++;
      if (endLine === -1) endLine = i;
    }
  }
  return { beginCount, endCount, beginLine, endLine };
}

function patchAgentsMd(targetPath) {
  const block = loadTemplate();
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, block, 'utf8');
    return { action: 'created', path: targetPath };
  }
  const original = fs.readFileSync(targetPath, 'utf8');
  const scan = scanMarkers(original);

  // Validate marker state. Only safe states:
  //  - 0/0: append
  //  - 1/1 with begin before end: replace between
  // Anything else: refuse.
  if (scan.beginCount === 0 && scan.endCount === 0) {
    let out = original;
    if (!out.endsWith('\n')) out += '\n';
    if (!out.endsWith('\n\n')) out += '\n';
    out += block;
    fs.writeFileSync(targetPath, out, 'utf8');
    return { action: 'appended', path: targetPath };
  }

  if (scan.beginCount === 1 && scan.endCount === 1 && scan.beginLine < scan.endLine) {
    const lines = original.split('\n');
    const before = lines.slice(0, scan.beginLine).join('\n');
    const after = lines.slice(scan.endLine + 1).join('\n');
    const blockTrimmed = block.trimEnd();
    let out = '';
    if (before.length > 0) out = before + '\n';
    out += blockTrimmed;
    if (after.length === 0) out += '\n';
    else out += '\n' + after;
    if (out === original) return { action: 'unchanged', path: targetPath };
    fs.writeFileSync(targetPath, out, 'utf8');
    return { action: 'replaced', path: targetPath };
  }

  // Corrupted / ambiguous markers — refuse.
  console.error(
    "warn: AGENTS.md has corrupted/ambiguous Gradata markers. " +
    "Refusing to patch — please fix manually. Expected exactly one " +
    "'<!-- BEGIN GRADATA -->' followed by exactly one '<!-- END GRADATA -->'."
  );
  return { action: 'refused', path: targetPath };
}

function resolveAgentsMdTarget() {
  const cli = flagValue('--patch-agents-md');
  if (cli && cli.length > 0) return path.resolve(cli);
  const cwdCandidate = path.resolve(process.cwd(), 'AGENTS.md');
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  const homeCandidate = path.join(HOME, 'AGENTS.md');
  return homeCandidate;
}

// --- Codex hooks patching ---------------------------------------------------

const CODEX_BEGIN_MARKER = '# BEGIN GRADATA CODEX HOOKS';
const CODEX_END_MARKER = '# END GRADATA CODEX HOOKS';

function buildCodexHookBlock(pluginRoot) {
  const p = pluginRoot.replace(/\\/g, '/').replace(/"/g, '\\"');
  return [
    CODEX_BEGIN_MARKER,
    '# Managed by Gradata installer. Re-run installer to update paths.',
    '[features]',
    'hooks = true',
    '',
    '[hooks]',
    '',
    '[[hooks.SessionStart]]',
    'matcher = "*"',
    '[[hooks.SessionStart.hooks]]',
    'type = "command"',
    `command = "node \\"${p}/hooks/session-start.js\\""`,
    '',
    '[[hooks.UserPromptSubmit]]',
    'matcher = "*"',
    '[[hooks.UserPromptSubmit.hooks]]',
    'type = "command"',
    `command = "node \\"${p}/hooks/user-prompt.js\\""`,
    '',
    '[[hooks.PostToolUse]]',
    'matcher = "*"',
    '[[hooks.PostToolUse.hooks]]',
    'type = "command"',
    `command = "node \\"${p}/hooks/post-edit.js\\""`,
    '[[hooks.PostToolUse.hooks]]',
    'type = "command"',
    `command = "node \\"${p}/hooks/post-tool-extended.js\\""`,
    '',
    '[[hooks.PreCompact]]',
    'matcher = "*"',
    '[[hooks.PreCompact.hooks]]',
    'type = "command"',
    `command = "node \\"${p}/hooks/pre-compact.js\\""`,
    '',
    '[[hooks.Stop]]',
    'matcher = "*"',
    '[[hooks.Stop.hooks]]',
    'type = "command"',
    `command = "node \\"${p}/hooks/session-stop.js\\""`,
    CODEX_END_MARKER,
    '',
  ].join('\n');
}

function buildClaudeHookBlock(pluginRoot) {
  const p = pluginRoot.replace(/\\/g, '/').replace(/"/g, '\\"');
  const buildCommand = name => `node "${p}/hooks/${name}"`;
  return {
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: buildCommand('session-start.js') }] },
      ],
      UserPromptSubmit: [
        { matcher: '*', hooks: [{ type: 'command', command: buildCommand('user-prompt.js') }] },
      ],
      PostToolUse: [
        { matcher: '*', hooks: [
          { type: 'command', command: buildCommand('post-edit.js') },
          {
            type: 'command',
            name: 'auto_correct',
            command: buildCommand('post-tool-extended.js'),
          },
        ] },
      ],
      PreCompact: [
        { matcher: '*', hooks: [{ type: 'command', command: buildCommand('pre-compact.js') }] },
      ],
      Stop: [
        {
          matcher: '*',
          hooks: [{
            type: 'command',
            name: 'session_close',
            command: buildCommand('session-stop.js'),
          }],
        },
      ],
    },
  };
}

function mergeClaudeSettings(patch) {
  fs.mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true });
  let out = {};
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    const existing = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8');
    const parsed = existing.trim() ? JSON.parse(existing) : {};
    out = typeof parsed === 'object' && parsed !== null ? parsed : {};
  }

  const current = out.hooks && typeof out.hooks === 'object' && !Array.isArray(out.hooks)
    ? out.hooks
    : {};
  const next = { ...current, ...patch.hooks };
  const merged = { ...out, hooks: next };
  const before = JSON.stringify(out);
  const after = JSON.stringify(merged);
  if (before === after) return { action: 'unchanged', path: CLAUDE_SETTINGS_PATH };
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  return { action: current && Object.keys(current).length ? 'updated' : 'created', path: CLAUDE_SETTINGS_PATH };
}

function patchClaudeSettings(pluginRoot) {
  return mergeClaudeSettings(buildClaudeHookBlock(pluginRoot));
}

function buildCursorHookBlock(pluginRoot) {
  return buildClaudeHookBlock(pluginRoot);
}

function patchCursorHooks(pluginRoot) {
  fs.mkdirSync(path.dirname(CURSOR_CONFIG_PATH), { recursive: true });
  const hadFile = fs.existsSync(CURSOR_CONFIG_PATH);
  const next = buildCursorHookBlock(pluginRoot);
  if (fs.existsSync(CURSOR_CONFIG_PATH)) {
    const before = fs.readFileSync(CURSOR_CONFIG_PATH, 'utf8');
    if (before.trim() === JSON.stringify(next, null, 2)) {
      return { action: 'unchanged', path: CURSOR_CONFIG_PATH };
    }
  }
  fs.writeFileSync(CURSOR_CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return { action: hadFile ? 'updated' : 'created', path: CURSOR_CONFIG_PATH };
}

function patchCodexConfig(pluginRoot) {
  const block = buildCodexHookBlock(pluginRoot);
  fs.mkdirSync(CODEX_CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CODEX_CONFIG_PATH)) {
    fs.writeFileSync(CODEX_CONFIG_PATH, block, 'utf8');
    return { action: 'created', path: CODEX_CONFIG_PATH };
  }

  const original = fs.readFileSync(CODEX_CONFIG_PATH, 'utf8');
  const begin = original.indexOf(CODEX_BEGIN_MARKER);
  const end = original.indexOf(CODEX_END_MARKER);

  if (begin === -1 && end === -1) {
    let out = original;
    if (!out.endsWith('\n')) out += '\n';
    if (!out.endsWith('\n\n')) out += '\n';
    out += block;
    fs.writeFileSync(CODEX_CONFIG_PATH, out, 'utf8');
    return { action: 'appended', path: CODEX_CONFIG_PATH };
  }

  if (begin !== -1 && end !== -1 && begin < end) {
    const before = original.slice(0, begin).replace(/\s*$/, '');
    const after = original.slice(end + CODEX_END_MARKER.length).replace(/^\s*/, '');
    const body = block.trimEnd();
    let out = '';
    if (before) out += `${before}\n\n`;
    out += body;
    if (after) out += `\n\n${after}`;
    out += '\n';
    if (out === original) return { action: 'unchanged', path: CODEX_CONFIG_PATH };
    fs.writeFileSync(CODEX_CONFIG_PATH, out, 'utf8');
    return { action: 'replaced', path: CODEX_CONFIG_PATH };
  }

  return { action: 'refused', path: CODEX_CONFIG_PATH };
}

// --- Main -------------------------------------------------------------------

async function main() {
  console.log('Gradata Plugin Setup\n');
  let python = null;
  for (const cmd of PYTHON_CANDIDATES) {
    python = tryPython(cmd);
    if (python) break;
  }
  if (!python) {
    console.log('Python 3.10+ not found.\n');
    if (process.platform === 'darwin') console.log('Install: brew install python3');
    else if (process.platform === 'win32') console.log('Install: Download from python.org/downloads (check "Add to PATH")');
    else console.log('Install: sudo apt install python3 python3-pip');
    process.exit(1);
  }
  console.log(`Python found: ${python.absPath} (${python.version})`);

  // Track whether the SDK is available (pre-existing OR successfully installed).
  let sdkInstalled = false;

  if (!hasGradata(python.absPath)) {
    console.log('Gradata SDK not found.');
    let doInstall = AUTO;
    if (!AUTO) {
      const answer = await ask(`Install? Run: "${python.absPath}" -m pip install ${SDK_GIT_URL} [Enter/n] `);
      doInstall = answer.toLowerCase() !== 'n';
    }
    if (!doInstall) {
      console.log(`Skipped. Run manually: ${SDK_INSTALL_HINT}`);
    } else {
      console.log('Installing gradata from git source...');
      const result = installSdkTiered(python.absPath);
      if (result.ok) {
        console.log(`Installed successfully (${result.mode}).`);
        sdkInstalled = hasGradata(python.absPath);
      } else {
        if (isPep668Error(result.stderr)) {
          printPep668Help(python.absPath);
        } else {
          console.log(`SDK install failed. Try manually: "${python.absPath}" -m pip install ${SDK_GIT_URL}`);
          if (result.stderr) {
            const tail = result.stderr.split('\n').slice(-5).join('\n');
            console.log(tail);
          }
        }
        if (!AUTO) process.exit(1);
      }
    }
  } else {
    let ver = 'unknown';
    try {
      ver = execSync(`"${python.absPath}" -c "import gradata; print(gradata.__version__)"`, {
        encoding: 'utf8', windowsHide: true, timeout: 10000,
      }).trim();
    } catch {}
    console.log(`Gradata SDK: v${ver}`);
    sdkInstalled = true;
  }

  writeConfig(python.absPath);
  console.log(`Config: ${path.join(GRADATA_HOME, 'config.toml')}`);

  // Patch AGENTS.md
  let patchResult = null;
  try {
    const target = resolveAgentsMdTarget();
    patchResult = patchAgentsMd(target);
    console.log(`AGENTS.md ${patchResult.action}: ${patchResult.path}`);
  } catch (e) {
    console.log(`AGENTS.md patch skipped: ${e.message}`);
  }

  // Wire Codex hooks so graduation and AGENTS.md maintenance run on Codex too.
  try {
    const codexPatch = patchCodexConfig(path.join(GRADATA_HOME, 'plugin'));
    if (codexPatch.action === 'refused') {
      console.log(`Codex hooks patch refused: ${codexPatch.path} has ambiguous Gradata markers`);
    } else {
      console.log(`Codex hooks ${codexPatch.action}: ${codexPatch.path}`);
    }
  } catch (e) {
    console.log(`Codex hooks patch skipped: ${e.message}`);
  }

  if (AGENT === 'claude') {
    try {
      const claudePatch = patchClaudeSettings(path.join(GRADATA_HOME, 'plugin'));
      console.log(`Claude settings ${claudePatch.action}: ${claudePatch.path}`);
    } catch (e) {
      console.log(`Claude settings patch skipped: ${e.message}`);
    }
  }

  if (AGENT === 'cursor') {
    try {
      const cursorPatch = patchCursorHooks(path.join(GRADATA_HOME, 'plugin'));
      console.log(`Cursor hooks ${cursorPatch.action}: ${cursorPatch.path}`);
    } catch (e) {
      console.log(`Cursor hooks patch skipped: ${e.message}`);
    }
  }

  console.log('\nReady.');
  if (AUTO) {
    const doctor = path.join(GRADATA_HOME, 'plugin', 'setup', 'doctor.js');
    console.log(`Verify: node "${doctor}"`);
  }

  // --auto + SDK install failure → loud failure with non-zero exit.
  if (AUTO && !sdkInstalled) {
    console.error('\n[FAIL] gradata SDK install failed. Run: ' + SDK_INSTALL_HINT);
    console.error('Run doctor for full diagnostics: node ' + path.join(GRADATA_HOME, 'plugin/setup/doctor.js'));
    process.exit(1);
  }

  // Explicit --patch-agents-md that refused → exit non-zero (user-requested op failed).
  if (PATCH_AGENTS_MD_EXPLICIT && patchResult && patchResult.action === 'refused') {
    process.exit(1);
  }
}

module.exports = {
  patchAgentsMd,
  loadTemplate,
  scanMarkers,
  BEGIN_MARKER,
  END_MARKER,
  patchCodexConfig,
  patchClaudeSettings,
  patchCursorHooks,
  buildClaudeHookBlock,
  buildCursorHookBlock,
  buildCodexHookBlock,
  CODEX_BEGIN_MARKER,
  CODEX_END_MARKER,
};

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
