#!/usr/bin/env node
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput } = require('./lib/hook-input.js');
(async () => {
  try {
    const eventData = readHookInput();
    const sessionId = eventData.session_id || '';
    const result = await callDaemon('/checkpoint', { session_id: sessionId, reason: 'pre_compact' }, 2000);
    if (result && result.pending_lessons > 0) {
      process.stderr.write(`[gradata] Checkpoint: ${result.pending_lessons} pending lessons saved\n`);
    }
  } catch (e) { /* Never block compaction */ }
})();
