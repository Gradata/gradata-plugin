---
name: gradata:doctor
description: Health check — verify full plugin chain for dogfood readiness
---

# Gradata Doctor

Run the full pre-dogfood gate check:

```bash
node setup/doctor-full.js
```

For a synthetic fail-path run (for verification screenshots):

```bash
node setup/doctor-full.js --simulate-fail
```

## Checks (ordered)

1. **Hook registration** — validates `~/.claude/settings.json` or project `.claude/settings.json` contains all events and hook commands from `hooks/hooks.json`.
2. **Hook fires** — sends a synthetic `PostToolUse`-shaped probe through daemon `/log-event` and confirms probe appears in daemon logs within 2s.
3. **Graduation runnable** — executes a Python dry-run with synthetic lessons and verifies pattern/rule thresholds (`MIN_APPLICATIONS_FOR_PATTERN=2`, `MIN_APPLICATIONS_FOR_RULE=3`) plus at least one RULE promotion.
4. **AGENTS.md export** — verifies export path can write/read a probe rule line in a temporary project-root `AGENTS.md`.

Output includes pass/fail per check and final summary:

```text
Dogfood readiness: READY / NOT READY (failed: <step name>)
```
