# CLI Integration Matrix

Last verified: 2026-05-12

## Codex CLI smoke (GRA-56)

Status: **partial** (learning core works, Codex install/integration path diverges from Claude Code)

### Environment
- Plugin repo: `Gradata/gradata-plugin` @ `c05e648`
- SDK: `gradata 0.7.5` (editable install from `Gradata/gradata`)
- Codex CLI available locally (`codex --help`)

### What was tested
1. Attempted to install plugin into a fresh Codex worktree.
2. Ran two same-pattern corrections (`console.log` -> `logger.info`) across two sessions.
3. Verified capture + graduation state in daemon brain artifacts.
4. Checked whether any rule projection to `AGENTS.md` occurred.

### Results
- **Install path divergence**: this Codex build exposes `codex plugin marketplace {add,upgrade,remove}` but no direct plugin install command analogous to Claude plugin loading.
- **Manifest divergence**: repo ships `.claude-plugin/plugin.json` and Claude hook wiring (`hooks/hooks.json`), but no Codex plugin manifest/wiring in repo.
- **Capture works when hooks are invoked manually**:
  - `hooks/post-edit.js` posted to daemon `/correct` successfully for both corrections.
  - Daemon convergence showed `total_corrections=2` over `2` sessions.
- **Graduation expectation mismatch for 2 corrections**:
  - After two sessions, lesson remained `INSTINCT` (`lessons.md`), not a graduated `RULE`.
  - Daemon health showed `rules_count=0`, `lessons_count=1`.
- **AGENTS.md not written in this flow**:
  - No `AGENTS.md` created in tested brain directory.

### Repro commands used
```bash
# daemon
python3 -m gradata.daemon --brain-dir /tmp/gra56-brain --port 7342

# correction 1 (session codex-s1)
printf '%s' '{"session_id":"codex-s1","tool_name":"Edit","tool_input":{"old_string":"console.log(\"x\")","new_string":"logger.info(\"x\")","file_path":"src/app.ts"}}' | node hooks/post-edit.js
curl -s -X POST http://127.0.0.1:7342/end-session -H 'Content-Type: application/json' -d '{"session_id":"codex-s1"}'

# correction 2 (session codex-s2)
printf '%s' '{"session_id":"codex-s2","tool_name":"Edit","tool_input":{"old_string":"console.log(\"y\")","new_string":"logger.info(\"y\")","file_path":"src/worker.ts"}}' | node hooks/post-edit.js
curl -s -X POST http://127.0.0.1:7342/end-session -H 'Content-Type: application/json' -d '{"session_id":"codex-s2"}'
```

### Conclusion
For Codex CLI, we do **not** yet have parity with Claude Code install/wiring. The correction engine itself works when fed compatible hook payloads, but the current repo does not provide a Codex-native plugin manifest/install surface, and two repeated corrections did not graduate to a rule or produce `AGENTS.md` projection in this smoke.
