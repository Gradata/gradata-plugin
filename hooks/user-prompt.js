#!/usr/bin/env node
// Fix: removed redundant /detect call — /apply-rules already returns mode_detected
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput } = require('./lib/hook-input.js');
(async () => {
  try {
    const eventData = readHookInput();
    const message = eventData.message || eventData.content || '';
    const sessionId = eventData.session_id || '';
    if (!message || message.length < 5) process.exit(0);

    // Single daemon call — /apply-rules returns rules + mode_detected + fired_rule_ids
    const result = await callDaemon('/apply-rules', { prompt: message, session_id: sessionId }, 500);
    if (result && result.injection_text) process.stdout.write(result.injection_text);

    // Implicit feedback detection via /detect (only when pushback patterns detected client-side)
    const pushbackPatterns = /\b(that's wrong|not right|stop doing|don't|you forgot|you missed)\b/i;
    if (pushbackPatterns.test(message)) {
      await callDaemon('/detect', { user_message: message, session_id: sessionId }, 500);
    }
  } catch (e) { /* Never block the user's prompt */ }
})();
