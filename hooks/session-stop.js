#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput } = require('./lib/hook-input.js');
const { ensureInstallId, determineCohort, sendTelemetryMetric, sendTelemetryEvent } = require('./lib/telemetry.js');

const GRADATA_HOME = process.env.GRADATA_HOME || path.join(os.homedir(), '.gradata');
const FIRST_RULE_FLAG = path.join(GRADATA_HOME, '.first_rule_injected');

(async () => {
  try {
    const eventData = readHookInput();
    const sessionId = eventData.session_id || '';

    const endResult = await callDaemon('/end-session', { session_id: sessionId }, 5000);
    let rulesWereActive = false;
    if (endResult) {
      const c = endResult.corrections_captured || 0;
      const i = endResult.instructions_extracted || 0;
      const g = endResult.lessons_graduated || 0;
      if (c > 0 || g > 0) {
        process.stderr.write(`[gradata] Session end: ${c} corrections, ${i} instructions, ${g} graduated\n`);
      }
      if (g > 0) await sendTelemetryMetric('rules_graduated', g);
      // Consider rules active if we captured corrections or graduated lessons this session
      rulesWereActive = (c > 0 || g > 0);
    }

    // Emit first_rule_injected once per install on the first session where rules were active
    if (rulesWereActive && !fs.existsSync(FIRST_RULE_FLAG)) {
      try {
        const installId = ensureInstallId();
        const cohort = determineCohort(installId);
        await sendTelemetryEvent('first_rule_injected', {
          install_id: installId,
          cohort,
        });
        // Write flag file to prevent re-emission
        fs.mkdirSync(path.dirname(FIRST_RULE_FLAG), { recursive: true });
        fs.writeFileSync(FIRST_RULE_FLAG, `${new Date().toISOString()}\n`, { mode: 0o600 });
      } catch (e) {
        // Best-effort — never block on telemetry or flag write failure
      }
    }

    const maintainResult = await callDaemon('/maintain', { tasks: ['manifest', 'patterns'] }, 10000);
    if (maintainResult && maintainResult.completed && maintainResult.completed.length > 0) {
      process.stderr.write(`[gradata] Maintenance: ${maintainResult.completed.join(', ')} (${maintainResult.duration_ms}ms)\n`);
    }
  } catch (e) { /* Best-effort — never block session teardown */ }
})();
