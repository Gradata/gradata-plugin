#!/usr/bin/env node
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput } = require('./lib/hook-input.js');
(async () => {
  try {
    const eventData = readHookInput();
    const sessionId = eventData.session_id || '';

    const endResult = await callDaemon('/end-session', { session_id: sessionId }, 5000);
    if (endResult) {
      const c = endResult.corrections_captured || 0;
      const i = endResult.instructions_extracted || 0;
      const g = endResult.lessons_graduated || 0;
      if (c > 0 || g > 0) {
        process.stderr.write(`[gradata] Session end: ${c} corrections, ${i} instructions, ${g} graduated\n`);
      }
    }

    const maintainResult = await callDaemon('/maintain', { tasks: ['manifest', 'patterns'] }, 10000);
    if (maintainResult && maintainResult.completed && maintainResult.completed.length > 0) {
      process.stderr.write(`[gradata] Maintenance: ${maintainResult.completed.join(', ')} (${maintainResult.duration_ms}ms)\n`);
    }
  } catch (e) { /* Best-effort — never block session teardown */ }
})();
