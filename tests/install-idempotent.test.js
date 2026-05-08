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
