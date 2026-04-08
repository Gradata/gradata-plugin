#!/usr/bin/env node
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput, WRITE_TOOLS } = require('./lib/hook-input.js');
(async () => {
  try {
    const eventData = readHookInput();
    const toolName = eventData.tool_name || '';
    if (!WRITE_TOOLS.includes(toolName)) process.exit(0);

    const toolInput = eventData.tool_input || {};
    const filePath = toolInput.file_path || '';
    const content = toolInput.content || toolInput.new_string || '';
    const sessionId = eventData.session_id || '';

    const [recallResult, enforceResult] = await Promise.all([
      callDaemon('/brain-recall', {
        file_path: filePath, content_preview: content.slice(0, 500), session_id: sessionId,
      }, 500),
      callDaemon('/enforce-rules', {
        content: content, file_path: filePath, session_id: sessionId,
      }, 500),
    ]);

    if (recallResult && recallResult.context) process.stdout.write(recallResult.context);
    if (enforceResult && enforceResult.violations) {
      for (const v of enforceResult.violations) {
        process.stderr.write(`[gradata] Rule violation: ${v.description}\n`);
      }
    }
  } catch (e) { /* Never block tool execution */ }
})();
