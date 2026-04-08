#!/usr/bin/env node
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput, WRITE_TOOLS } = require('./lib/hook-input.js');
(async () => {
  try {
    const eventData = readHookInput();
    const toolName = eventData.tool_name || '';
    if (!WRITE_TOOLS.includes(toolName)) process.exit(0);
    const toolInput = eventData.tool_input || {};
    const oldStr = toolInput.old_string || '';
    const newStr = toolInput.new_string || toolInput.content || '';
    const filePath = toolInput.file_path || '';
    const sessionId = eventData.session_id || '';
    if (!oldStr && !newStr) process.exit(0);
    if (oldStr === newStr) process.exit(0);
    await callDaemon('/correct', {
      old_string: oldStr, new_string: newStr,
      file_path: filePath, session_id: sessionId,
    }, 1000);
  } catch (e) { /* Best-effort — never block editing */ }
})();
