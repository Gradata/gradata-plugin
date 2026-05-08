#!/usr/bin/env node
// Vendor-neutral health check for a Gradata install.
// No deps. Node >= 18.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const HOME = process.env.HOME || process.env.USERPROFILE || '';
const GRADATA_HOME = process.env.GRADATA_HOME || path.join(HOME, '.gradata');
const PLUGIN_DIR = path.join(GRADATA_HOME, 'plugin');
const CONFIG_PATH = path.join(GRADATA_HOME, 'config.toml');

const results = [];
function record(name, ok, detail, critical) {
  results.push({ name, ok: !!ok, detail: detail || '', critical: !!critical });
}

// 1. config.toml + python3 >= 3.10
function checkConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    record('config.toml', false, `missing at ${CONFIG_PATH}`, true);
    return null;
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const m = raw.match(/python_path\s*=\s*"([^"]+)"/);
  if (!m) {
    record('config.toml python_path', false, 'no python_path entry', true);
    return null;
  }
  const py = m[1].replace(/\\\\/g, '\\');
  try {
    const v = execSync(`"${py}" -c "import sys;print('%d.%d'%sys.version_info[:2])"`, {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
    }).trim();
    const [maj, min] = v.split('.').map(Number);
    if (maj > 3 || (maj === 3 && min >= 10)) {
      record('python3 >= 3.10', true, `${py} (${v})`, true);
      return py;
    }
    record('python3 >= 3.10', false, `${py} reports ${v}`, true);
    return null;
  } catch (e) {
    record('python3 reachable', false, `${py}: ${e.message.split('\n')[0]}`, true);
    return null;
  }
}

// 2. import gradata
function checkSDK(py) {
  if (!py) {
    record('gradata SDK installed', false, 'python unavailable', true);
    return;
  }
  try {
    const v = execSync(`"${py}" -c "import gradata;print(getattr(gradata,'__version__','?'))"`, {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
    }).trim();
    record('gradata SDK installed', true, `v${v}`, true);
  } catch {
    record('gradata SDK installed', false, 'import gradata failed (SDK not installed)', true);
  }
}

// 3. plugin manifest
function checkPlugin() {
  const manifest = path.join(PLUGIN_DIR, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(manifest)) {
    record('plugin checkout', true, manifest, true);
  } else {
    record('plugin checkout', false, `missing ${manifest}`, true);
  }
}

// 4. daemon health (soft)
//
// Resolve daemon port: config.toml (port = N) > $GRADATA_DAEMON_PORT > 7342.
function resolveDaemonPort() {
  // 1) config.toml `port = NNNN`
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const m = raw.match(/^\s*port\s*=\s*(\d+)\s*$/m);
      if (m) {
        const p = parseInt(m[1], 10);
        if (Number.isInteger(p) && p > 0 && p < 65536) return p;
      }
    }
  } catch {}
  // 2) env var
  const envPort = process.env.GRADATA_DAEMON_PORT;
  if (envPort) {
    const p = parseInt(envPort, 10);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  // 3) canonical default (matches hooks/lib/daemon-client.js)
  return 7342;
}

function checkDaemon() {
  const port = resolveDaemonPort();
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (res) => {
      record(`daemon /health (:${port})`, res.statusCode === 200, `status ${res.statusCode}`, false);
      res.resume();
      resolve();
    });
    req.on('timeout', () => { req.destroy(); record(`daemon /health (:${port})`, false, 'timeout (not running?)', false); resolve(); });
    req.on('error', (e) => { record(`daemon /health (:${port})`, false, `not reachable (${e.code || e.message})`, false); resolve(); });
  });
}

// 5. AGENTS.md detection
function checkAgentsMd() {
  const candidates = [];
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    candidates.push(dir);
    if (dir === HOME || dir === path.dirname(dir)) break;
    dir = path.dirname(dir);
  }
  if (candidates.indexOf(HOME) === -1 && HOME) candidates.push(HOME);

  const found = [];
  const seen = {};
  for (const d of candidates) {
    for (const name of ['AGENTS.md', 'CLAUDE.md', '.cursorrules']) {
      const p = path.join(d, name);
      if (seen[p]) continue;
      seen[p] = true;
      if (fs.existsSync(p)) {
        let hasMarkers = false;
        try {
          const c = fs.readFileSync(p, 'utf8');
          hasMarkers = c.indexOf('<!-- BEGIN GRADATA -->') !== -1;
        } catch {}
        found.push({ path: p, hasMarkers });
      }
    }
  }
  if (found.length === 0) {
    record('AGENTS.md present', false, 'none found in cwd, parents, or $HOME', false);
    return;
  }
  const withMarkers = found.filter(f => f.hasMarkers);
  const detail = found.map(f => `${f.path}${f.hasMarkers ? ' [GRADATA]' : ''}`).join('; ');
  record('AGENTS.md present', true, detail, false);
  record('GRADATA markers in AGENTS.md', withMarkers.length > 0,
    withMarkers.length > 0 ? `${withMarkers.length} file(s)` : 'no GRADATA section found', false);
}

async function main() {
  console.log('Gradata doctor\n');
  console.log(`GRADATA_HOME=${GRADATA_HOME}`);
  console.log('');

  const py = checkConfig();
  checkSDK(py);
  checkPlugin();
  await checkDaemon();
  checkAgentsMd();

  for (const r of results) {
    const tag = r.ok ? 'PASS' : (r.critical ? 'FAIL' : 'WARN');
    console.log(`[${tag}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }

  const criticalFail = results.some(r => !r.ok && r.critical);
  console.log('');
  console.log(criticalFail ? 'Status: FAIL (critical checks failed)' : 'Status: OK');
  process.exit(criticalFail ? 1 : 0);
}

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(2); });
}

module.exports = { resolveDaemonPort };
