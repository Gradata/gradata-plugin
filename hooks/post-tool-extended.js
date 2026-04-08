#!/usr/bin/env node
const { callDaemon } = require('./lib/daemon-client.js');
const { readHookInput, WRITE_TOOLS } = require('./lib/hook-input.js');
(async () => {
  try {
    const eventData = readHookInput();
    const toolName = eventData.tool_name || '';
    const toolInput = eventData.tool_input || {};
    const toolOutput = eventData.tool_output || eventData.output || '';
    const sessionId = eventData.session_id || '';

    if (WRITE_TOOLS.includes(toolName)) process.exit(0);

    const promises = [];
    if (toolName === 'Agent') {
      promises.push(callDaemon('/log-event', {
        event_type: 'agent_complete',
        data: {
          agent_type: toolInput.subagent_type || 'general-purpose',
          description: toolInput.description || '',
          output_length: typeof toolOutput === 'string' ? toolOutput.length : 0,
        },
        session_id: sessionId,
      }, 500));
    }
    if (toolName.startsWith('mcp__') && eventData.error) {
      promises.push(callDaemon('/log-event', {
        event_type: 'tool_failure',
        data: { tool: toolName, error: String(eventData.error).slice(0, 500) },
        session_id: sessionId,
      }, 500));
    }
    if (toolName === 'Bash') {
      const cmd = toolInput.command || '';
      if (cmd.includes('git commit')) {
        promises.push(callDaemon('/log-event', {
          event_type: 'commit', data: { command: cmd.slice(0, 200) }, session_id: sessionId,
        }, 500));
      }
    }
    if (promises.length > 0) await Promise.all(promises);
  } catch (e) { /* Best-effort */ }
})();
