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

function patchAgentsMd(targetPath) {
  const block = loadTemplate();
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, block, 'utf8');
    return { action: 'created', path: targetPath };
  }
  const original = fs.readFileSync(targetPath, 'utf8');
  const beginIdx = original.indexOf(BEGIN_MARKER);
  const endIdx = original.indexOf(END_MARKER);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = original.slice(0, beginIdx);
    const after = original.slice(endIdx + END_MARKER.length);
    // Trim trailing newline from `after` start so we don't accumulate them
    let out = before + block.trimEnd();
    if (after.length === 0) out += '\n';
    else if (after.startsWith('\n')) out += after;
    else out += '\n' + after;
    if (out === original) return { action: 'unchanged', path: targetPath };
    fs.writeFileSync(targetPath, out, 'utf8');
    return { action: 'replaced', path: targetPath };
  }
  // No markers — append.
  let out = original;
  if (!out.endsWith('\n')) out += '\n';
  if (!out.endsWith('\n\n')) out += '\n';
  out += block;
  fs.writeFileSync(targetPath, out, 'utf8');
  return { action: 'appended', path: targetPath };
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
  }

  writeConfig(python.absPath);
  console.log(`Config: ${path.join(GRADATA_HOME, 'config.toml')}`);

  // Patch AGENTS.md
  try {
    const target = resolveAgentsMdTarget();
    const result = patchAgentsMd(target);
    console.log(`AGENTS.md ${result.action}: ${result.path}`);
  } catch (e) {
    console.log(`AGENTS.md patch skipped: ${e.message}`);
  }

  console.log('\nReady.');
  if (AUTO) {
    const doctor = path.join(GRADATA_HOME, 'plugin', 'setup', 'doctor.js');
    console.log(`Verify: node "${doctor}"`);
  }
}

module.exports = { patchAgentsMd, loadTemplate, BEGIN_MARKER, END_MARKER };

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
