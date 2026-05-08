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
      const answer = await ask(`Install? Run: "${python.absPath}" -m pip install gradata [Enter/n] `);
      doInstall = answer.toLowerCase() !== 'n';
    }
    if (!doInstall) {
      console.log('Skipped. Run manually: pip install gradata');
    } else {
      try {
        console.log('Installing gradata...');
        execSync(`"${python.absPath}" -m pip install gradata`, { stdio: 'inherit', windowsHide: true, timeout: 120000 });
        console.log('Installed successfully.');
        sdkInstalled = hasGradata(python.absPath);
      } catch {
        console.log(`SDK install failed (package may not yet be on PyPI). Try: "${python.absPath}" -m pip install gradata`);
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

  console.log('\nReady.');
  if (AUTO) {
    const doctor = path.join(GRADATA_HOME, 'plugin', 'setup', 'doctor.js');
    console.log(`Verify: node "${doctor}"`);
  }

  // --auto + SDK install failure → loud failure with non-zero exit.
  if (AUTO && !sdkInstalled) {
    console.error('\n[FAIL] gradata SDK install failed. Run: pip install gradata');
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
