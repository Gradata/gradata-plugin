---
name: gradata-quickstart
description: How to use Gradata: review/promote/forget lessons and verify daemon health.
---

# Gradata Quickstart

Gradata is a learning layer that captures the corrections you make to the
agent's output and graduates them into durable rules that auto-inject into
future sessions. Over time the agent converges on the user's judgment without
the user having to re-explain conventions.

## Three-tier graduation

- **INSTINCT** — first-time signal. The agent has seen the correction once.
  Treat as a hint, not a constraint.
- **PATTERN** — observed across multiple sessions. The agent should follow it
  unless overridden, and may reference it when relevant.
- **RULE** — stable behavior. Surfaced as guidance every relevant session.
  Treat as a hard convention until forgotten.

Never expose raw confidence numbers to the user. Tier names only.

## Commands

Some host CLIs expose slash-commands directly (for example `/gradata status`,
`/gradata review`, `/gradata promote`, `/gradata forget`, `/gradata doctor`).
Other agent CLIs invoke the equivalent skill by name. The vendor-neutral
health check that works everywhere:

```sh
node ~/.gradata/plugin/setup/doctor.js
```

- `status` — brain summary: rule count, pending lesson count, last session.
- `review` — walk pending lessons; promote, edit, or discard each.
- `promote <id>` — push a lesson to a higher tier manually.
- `forget <id>` — remove a lesson or rule by ID.
- `doctor` — diagnose daemon, config, plugin layout.

## Where data lives

- `~/.gradata/config.toml` — interpreter pointer.
- `~/.gradata/plugin/` — the plugin checkout (hooks, skills, setup scripts).
- `~/.gradata/projects/<hash>/lessons.md` — per-project lessons in plain markdown.
- `~/.gradata/projects/<hash>/system.db` — SQLite index. Do not edit by hand.

## When to use which tier

- One-off preference shown by the user → INSTINCT (let graduation handle it).
- Pattern you have seen the user enforce twice or more → PATTERN by promotion.
- Convention the user has stated explicitly as a rule → RULE by promotion.

## Common pitfalls

- Do not edit `system.db` directly — go through the daemon.
- Do not surface numeric confidence in agent output. Tier names only.
- Do not assume the daemon is running for read-only flows. Soft-fail and
  continue if `/health` is unreachable; report it via the doctor command.
- Do not bake host-CLI brand names into hook output, skill prose, or rule
  text. The plugin must work across multiple agent runtimes.
