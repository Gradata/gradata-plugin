// gradata-plugin/hooks/lib/telemetry.js — Lab experiment telemetry
// Best-effort event emission. Never throws, never blocks critical paths.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { callDaemon } = require('./daemon-client.js');

const HOME = process.env.HOME || process.env.USERPROFILE || '~';
const GRADATA_HOME = process.env.GRADATA_HOME || path.join(HOME, '.gradata');

/** Path to persisted install_id. */
function installIdPath() {
  return path.join(GRADATA_HOME, 'install_id');
}

/** Generate a unique install ID (32-char hex). */
function generateInstallId() {
  const id = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(GRADATA_HOME, { recursive: true });
    fs.writeFileSync(installIdPath(), id, 'utf8');
  } catch { /* best-effort */ }
  return id;
}

/** Read persisted install_id. Returns empty string if not present. */
function getInstallId() {
  try {
    return fs.readFileSync(installIdPath(), 'utf8').trim();
  } catch { return ''; }
}

/**
 * Deterministic cohort assignment: hash installId, first hex char < '8' → control.
 * Returns 'control' or 'treatment'.
 */
function getCohort(installId) {
  const h = crypto.createHash('sha256').update(installId).digest('hex');
  return h[0] < '8' ? 'control' : 'treatment';
}

/** Emit install_completed event to daemon. Best-effort. */
async function emitInstallCompleted(installId, cohort) {
  try {
    await callDaemon('/telemetry/install-completed', {
      install_id: installId,
      cohort,
      timestamp: new Date().toISOString(),
    }, 3000);
  } catch { /* telemetry is best-effort */ }
}

/** Guard flag path for first_rule_injected — one per install. */
function firstRuleFlagPath(installId) {
  return path.join(GRADATA_HOME, `.first_rule_injected_${installId}`);
}

/** Check if first_rule_injected has already been emitted for this install. */
function isFirstRuleInjectedEmitted(installId) {
  try {
    return fs.existsSync(firstRuleFlagPath(installId));
  } catch { return false; }
}

/** Mark first_rule_injected as emitted (touch guard file). */
function markFirstRuleInjectedEmitted(installId) {
  try {
    fs.writeFileSync(firstRuleFlagPath(installId), new Date().toISOString(), 'utf8');
  } catch { /* best-effort */ }
}

/** Emit first_rule_injected event to daemon. Best-effort, fires once per install. */
async function emitFirstRuleInjected(installId) {
  if (isFirstRuleInjectedEmitted(installId)) return;
  markFirstRuleInjectedEmitted(installId);
  try {
    await callDaemon('/telemetry/first-rule-injected', {
      install_id: installId,
      timestamp: new Date().toISOString(),
    }, 3000);
  } catch { /* telemetry is best-effort */ }
}

module.exports = {
  generateInstallId,
  getInstallId,
  getCohort,
  emitInstallCompleted,
  emitFirstRuleInjected,
};
