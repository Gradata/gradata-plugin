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

// --- Starter brain seeding ---------------------------------------------------

// Feature flag: check env GRADATA_STARTER_BRAIN=true or config.toml
// [starter_brain] section with enabled = true. Default: false.
function isStarterBrainEnabled() {
  if (process.env.GRADATA_STARTER_BRAIN === 'true') return true;
  if (process.env.GRADATA_STARTER_BRAIN === '1') return true;
  const configPath = path.join(GRADATA_HOME, 'config.toml');
  if (!fs.existsSync(configPath)) return false;
  try {
    const lines = fs.readFileSync(configPath, 'utf8').split('\n');
    let inSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '[starter_brain]') { inSection = true; continue; }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) { inSection = false; continue; }
      if (inSection && /^enabled\s*=\s*true\s*$/.test(trimmed)) return true;
    }
    return false;
  } catch { return false; }
}

// 10 safe starter rules. Id, title, description, tier.
// All rules are safe defaults: no dangerous file ops, no PII, no production mutators.
const STARTER_RULES = [
  {
    id: 'starter-01',
    title: 'Always run tests before committing code',
    description: 'Run the full test suite before every commit to catch regressions early.',
    tier: 'RULE'
  },
  {
    id: 'starter-02',
    title: "Don't use default exports in TypeScript files",
    description: 'Prefer named exports over default exports for better IDE support and tree-shaking.',
    tier: 'RULE'
  },
  {
    id: 'starter-03',
    title: 'Wrap HTTP fetch calls in try/catch blocks',
    description: 'Always handle network errors by wrapping fetch, axios, or other HTTP calls in try/catch.',
    tier: 'RULE'
  },
  {
    id: 'starter-04',
    title: "Don't push directly to main — use feature branches",
    description: 'All work must ship via feature branches and pull requests. Never push to main directly.',
    tier: 'RULE'
  },
  {
    id: 'starter-05',
    title: 'Run the formatter before committing',
    description: 'Run the project formatter (e.g., prettier, biome) before every commit.',
    tier: 'RULE'
  },
  {
    id: 'starter-06',
    title: "Don't commit secrets or API keys to the repository",
    description: 'Never commit credentials, tokens, or API keys. Use environment variables or a secrets manager.',
    tier: 'RULE'
  },
  {
    id: 'starter-07',
    title: 'Use descriptive variable names — no single-letter vars except loop counters',
    description: 'Variable names should clearly describe their purpose. Reserve single-letter names for loop indices only.',
    tier: 'RULE'
  },
  {
    id: 'starter-08',
    title: 'Keep functions under 50 lines — break up larger ones',
    description: 'Functions longer than 50 lines should be split into smaller, focused functions.',
    tier: 'PATTERN'
  },
  {
    id: 'starter-09',
    title: 'Write tests for new features before implementing them',
    description: 'Follow test-driven development: write failing tests first, then implement to make them pass.',
    tier: 'RULE'
  },
  {
    id: 'starter-10',
    title: "Don't leave console.log statements in production code",
    description: 'Remove debug logging before merging. Use a proper logger for intentional production logging.',
    tier: 'RULE'
  }
];

function seedStarterBrain() {
  if (!isStarterBrainEnabled()) {
    console.log('Starter brain not enabled — skipping seed.');
    return;
  }
  const brainRulesDir = path.join(GRADATA_HOME, 'brain', 'rules');
  fs.mkdirSync(brainRulesDir, { recursive: true });
  const starterPath = path.join(brainRulesDir, 'starter.json');

  // Idempotency: if file exists with the expected rule IDs, skip.
  if (fs.existsSync(starterPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(starterPath, 'utf8'));
      if (Array.isArray(existing)) {
        const existingIds = new Set(existing.map(r => r.id));
        const expectedIds = new Set(STARTER_RULES.map(r => r.id));
        const allPresent = [...expectedIds].every(id => existingIds.has(id));
        if (allPresent && existing.length >= STARTER_RULES.length) {
          console.log('Starter brain rules already seeded — skipping.');
          return;
        }
      }
    } catch { /* corrupt or empty file — reseed below */ }
  }

  fs.writeFileSync(starterPath, JSON.stringify(STARTER_RULES, null, 2) + '\n', 'utf8');
  console.log(`Starter brain rules seeded: ${starterPath}`);
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

  // Seed starter brain rules (gated by feature flag)
  seedStarterBrain();

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

module.exports = { patchAgentsMd, loadTemplate, scanMarkers, BEGIN_MARKER, END_MARKER };

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
