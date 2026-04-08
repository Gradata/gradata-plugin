// gradata-plugin/hooks/lib/hook-input.js — Shared stdin reader for all hooks
const fs = require('fs');

/** Tools that produce write/edit corrections. */
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit'];

/** Read and parse JSON from stdin (Claude Code hook input). */
function readHookInput() {
  let input = '';
  if (!process.stdin.isTTY) {
    input = fs.readFileSync(0, 'utf8');
  }
  try { return JSON.parse(input); } catch { return {}; }
}

module.exports = { readHookInput, WRITE_TOOLS };
