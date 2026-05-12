// Node built-in test runner. No deps.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { patchAgentsMd, loadTemplate, BEGIN_MARKER, END_MARKER } = require('../setup/install.js');

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradata-test-'));
  return path.join(dir, name);
}

test('absent → file created with markers', () => {
  const p = tmpFile('AGENTS.md');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'created');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes(BEGIN_MARKER), 'has BEGIN marker');
  assert.ok(content.includes(END_MARKER), 'has END marker');
});

test('present-without-markers → content appended, original preserved', () => {
  const p = tmpFile('AGENTS.md');
  const original = '# Existing AGENTS.md\n\nSome existing prose.\n';
  fs.writeFileSync(p, original, 'utf8');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'appended');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.startsWith(original), 'original preserved at start');
  assert.ok(content.includes(BEGIN_MARKER));
  assert.ok(content.includes(END_MARKER));
});

test('present-with-markers → content between markers replaced, rest preserved', () => {
  const p = tmpFile('AGENTS.md');
  const before = '# AGENTS.md\n\nIntro section.\n\n';
  const after = '\n## Trailing section\n\nKeep me.\n';
  const stale = `${BEGIN_MARKER}\nold gradata content\n${END_MARKER}`;
  fs.writeFileSync(p, before + stale + after, 'utf8');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'replaced');
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.startsWith(before), 'pre-marker preserved');
  assert.ok(content.includes('Trailing section'), 'post-marker preserved');
  assert.ok(!content.includes('old gradata content'), 'stale content removed');
  const tpl = loadTemplate();
  // Spot-check: a recognizable line from the template appears
  const sample = tpl.split('\n').find(l => l.startsWith('## '));
  if (sample) assert.ok(content.includes(sample), 'new template content present');
});

test('idempotent: running twice produces identical file', () => {
  const p = tmpFile('AGENTS.md');
  patchAgentsMd(p);
  const first = fs.readFileSync(p, 'utf8');
  patchAgentsMd(p);
  const second = fs.readFileSync(p, 'utf8');
  assert.strictEqual(first, second, 'second run produces identical content');
});

test('idempotent on existing-with-prose: three runs converge', () => {
  const p = tmpFile('AGENTS.md');
  fs.writeFileSync(p, '# Hi\n\nbody\n', 'utf8');
  patchAgentsMd(p);
  const a = fs.readFileSync(p, 'utf8');
  patchAgentsMd(p);
  const b = fs.readFileSync(p, 'utf8');
  patchAgentsMd(p);
  const c = fs.readFileSync(p, 'utf8');
  assert.strictEqual(a, b);
  assert.strictEqual(b, c);
});

// --- Marker validation (P0-1, P0-2) ----------------------------------------

test('corrupted: BEGIN without END → refuses, file unchanged, no throw', () => {
  const p = tmpFile('AGENTS.md');
  const original = `# Mine\n${BEGIN_MARKER}\nUSER STUFF\n## section\nkeep me\n`;
  fs.writeFileSync(p, original, 'utf8');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'refused');
  const after = fs.readFileSync(p, 'utf8');
  assert.strictEqual(after, original, 'file unchanged after refused patch');
  assert.ok(after.includes('keep me'), 'user content preserved');
});

test('corrupted: multiple BEGINs → refuses', () => {
  const p = tmpFile('AGENTS.md');
  const original = `${BEGIN_MARKER}\nstale 1\n${END_MARKER}\n\n${BEGIN_MARKER}\nstale 2\n${END_MARKER}\nuser tail\n`;
  fs.writeFileSync(p, original, 'utf8');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'refused');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), original);
});

test('corrupted: END before BEGIN → refuses', () => {
  const p = tmpFile('AGENTS.md');
  const original = `prelude\n${END_MARKER}\nmiddle\n${BEGIN_MARKER}\ntail\n`;
  fs.writeFileSync(p, original, 'utf8');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'refused');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), original);
});

test('markers-in-code-fence: line-based scan does treat fenced markers as real (documented limitation)', () => {
  // Per spec: trim()-equality scan means a marker on its own line inside a
  // fenced block IS matched. We verify the documented behavior: with two
  // BEGINs (one fenced, one real) the patcher refuses (multiple-begin guard
  // protects user content).
  const p = tmpFile('AGENTS.md');
  const original = [
    '# Mine',
    '',
    'Example block:',
    '```',
    BEGIN_MARKER,
    'fenced sample',
    END_MARKER,
    '```',
    '',
    BEGIN_MARKER,
    'real gradata block',
    END_MARKER,
    '',
    'tail content',
    '',
  ].join('\n');
  fs.writeFileSync(p, original, 'utf8');
  const r = patchAgentsMd(p);
  assert.strictEqual(r.action, 'refused', 'must refuse rather than risk overwriting fenced content');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), original, 'file unchanged');
  assert.ok(fs.readFileSync(p, 'utf8').includes('tail content'), 'user content preserved');
});

// --- doctor.js port resolution (P0-3) --------------------------------------

test('doctor: resolveDaemonPort honors GRADATA_DAEMON_PORT env var', () => {
  // Mock GRADATA_HOME to an empty dir so config.toml lookup misses,
  // forcing the env-var branch.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradata-doctor-'));
  const prevHome = process.env.GRADATA_HOME;
  const prevPort = process.env.GRADATA_DAEMON_PORT;
  process.env.GRADATA_HOME = dir;
  process.env.GRADATA_DAEMON_PORT = '9999';
  // Bust require cache so doctor re-reads env at module load.
  delete require.cache[require.resolve('../setup/doctor.js')];
  const { resolveDaemonPort } = require('../setup/doctor.js');
  try {
    assert.strictEqual(resolveDaemonPort(), 9999, 'env var honored');
  } finally {
    if (prevHome === undefined) delete process.env.GRADATA_HOME; else process.env.GRADATA_HOME = prevHome;
    if (prevPort === undefined) delete process.env.GRADATA_DAEMON_PORT; else process.env.GRADATA_DAEMON_PORT = prevPort;
    delete require.cache[require.resolve('../setup/doctor.js')];
  }
});

test('doctor: resolveDaemonPort default is 7342 when nothing configured', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradata-doctor-'));
  const prevHome = process.env.GRADATA_HOME;
  const prevPort = process.env.GRADATA_DAEMON_PORT;
  process.env.GRADATA_HOME = dir;
  delete process.env.GRADATA_DAEMON_PORT;
  delete require.cache[require.resolve('../setup/doctor.js')];
  const { resolveDaemonPort } = require('../setup/doctor.js');
  try {
    assert.strictEqual(resolveDaemonPort(), 7342);
  } finally {
    if (prevHome === undefined) delete process.env.GRADATA_HOME; else process.env.GRADATA_HOME = prevHome;
    if (prevPort !== undefined) process.env.GRADATA_DAEMON_PORT = prevPort;
    delete require.cache[require.resolve('../setup/doctor.js')];
  }
});

test('codex config: absent -> created with managed markers', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gradata-codex-home-'));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  delete require.cache[require.resolve('../setup/install.js')];
  const { patchCodexConfig, CODEX_BEGIN_MARKER, CODEX_END_MARKER } = require('../setup/install.js');
  try {
    const pluginRoot = path.join(home, '.gradata', 'plugin');
    const r = patchCodexConfig(pluginRoot);
    assert.strictEqual(r.action, 'created');
    const cfg = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');
    assert.ok(cfg.includes(CODEX_BEGIN_MARKER));
    assert.ok(cfg.includes(CODEX_END_MARKER));
    assert.ok(cfg.includes('hooks = true'));
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    delete require.cache[require.resolve('../setup/install.js')];
  }
});

test('codex config: existing content preserved and gradata block appended idempotently', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gradata-codex-home-'));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  delete require.cache[require.resolve('../setup/install.js')];
  const { patchCodexConfig } = require('../setup/install.js');
  try {
    const codexDir = path.join(home, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const cfgPath = path.join(codexDir, 'config.toml');
    const original = 'personality = "pragmatic"\n';
    fs.writeFileSync(cfgPath, original, 'utf8');
    const pluginRoot = path.join(home, '.gradata', 'plugin');
    const a = patchCodexConfig(pluginRoot);
    const first = fs.readFileSync(cfgPath, 'utf8');
    const b = patchCodexConfig(pluginRoot);
    const second = fs.readFileSync(cfgPath, 'utf8');
    assert.strictEqual(a.action, 'appended');
    assert.ok(first.startsWith(original));
    assert.strictEqual(b.action, 'unchanged');
    assert.strictEqual(first, second);
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    delete require.cache[require.resolve('../setup/install.js')];
  }
});
