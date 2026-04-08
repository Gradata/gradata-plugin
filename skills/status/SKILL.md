---
name: gradata:status
description: Show brain health — rules count, lesson pipeline, convergence trend, daemon uptime
---

# Gradata Status

Show the user their brain's health at a glance.

## How to Execute

1. Resolve the brain directory:
   - Run: `git remote get-url origin 2>/dev/null` to get the remote URL
   - Hash it: first 12 chars of SHA256 of the lowercase URL (strip `.git` suffix)
   - Brain dir: `~/.gradata/projects/<hash>/`

2. Read the daemon PID file at `<brain_dir>/daemon.pid` (JSON with `port` field)

3. Call `GET http://127.0.0.1:<port>/health` (timeout 2s)

4. Present the response to the user in a readable format:
   - **Rules:** {rules_count} graduated rules
   - **Lessons:** {lessons_count} total lessons in pipeline
   - **Sessions:** {active_sessions} active
   - **Uptime:** {uptime_seconds}s
   - **SDK:** v{sdk_version}
   - **Brain:** {brain_dir}

5. If daemon is not running, tell the user: "Daemon not running. It will auto-start on your next prompt."
