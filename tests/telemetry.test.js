const { test } = require('node:test');
const assert = require('node:assert');

test('telemetry disabled by default', () => {
  const prev = process.env.GRADATA_TELEMETRY;
  delete process.env.GRADATA_TELEMETRY;
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
  const { telemetryEnabled } = require('../hooks/lib/telemetry.js');
  assert.strictEqual(telemetryEnabled(), false);
  if (prev === undefined) delete process.env.GRADATA_TELEMETRY; else process.env.GRADATA_TELEMETRY = prev;
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
});

test('telemetry enabled with GRADATA_TELEMETRY=1', () => {
  const prev = process.env.GRADATA_TELEMETRY;
  process.env.GRADATA_TELEMETRY = '1';
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
  const { telemetryEnabled } = require('../hooks/lib/telemetry.js');
  assert.strictEqual(telemetryEnabled(), true);
  if (prev === undefined) delete process.env.GRADATA_TELEMETRY; else process.env.GRADATA_TELEMETRY = prev;
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
});

test('anonymous user id is stable 64-char lowercase hex hash', () => {
  const prevHome = process.env.GRADATA_HOME;
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradata-telemetry-'));
  process.env.GRADATA_HOME = dir;
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
  const { getAnonymousUserId } = require('../hooks/lib/telemetry.js');
  const a = getAnonymousUserId();
  const b = getAnonymousUserId();
  assert.strictEqual(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  if (prevHome === undefined) delete process.env.GRADATA_HOME; else process.env.GRADATA_HOME = prevHome;
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
});

test('determineCohort returns control or treatment deterministically', () => {
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
  const { determineCohort } = require('../hooks/lib/telemetry.js');
  // Same input always returns same result
  const a = determineCohort('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  const b = determineCohort('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.strictEqual(a, b);
  assert.ok(a === 'control' || a === 'treatment', 'must be control or treatment');
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
});

test('determineCohort returns control for empty/bad input', () => {
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
  const { determineCohort } = require('../hooks/lib/telemetry.js');
  assert.strictEqual(determineCohort(''), 'control');
  assert.strictEqual(determineCohort('x'), 'control');
  assert.strictEqual(determineCohort(null), 'control');
  assert.strictEqual(determineCohort(undefined), 'control');
  delete require.cache[require.resolve('../hooks/lib/telemetry.js')];
});
