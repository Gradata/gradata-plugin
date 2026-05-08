<!-- BEGIN GRADATA -->
## Gradata (learned conventions)

Gradata captures corrections you make to AI output and graduates them into
durable rules that auto-inject into future sessions. Over time the agent
converges on *your* judgment.

### How corrections become rules

- **INSTINCT** — first-time signal, low weight. Not yet enforced.
- **PATTERN** — repeated across multiple sessions. Used as a hint.
- **RULE** — stable, surfaced as guidance every relevant session.

The agent should never surface raw confidence numbers. Tier names are fine.

### Where data lives

- Per-project lessons: `~/.gradata/projects/<hash>/lessons.md`
- User config: `~/.gradata/config.toml`
- Plugin checkout: `~/.gradata/plugin/`

### Health check (vendor-neutral)

```sh
node ~/.gradata/plugin/setup/doctor.js
```

### Commands (Claude Code surface)

`/gradata status`, `/gradata review`, `/gradata promote`,
`/gradata forget`, `/gradata doctor`. Other agent CLIs invoke
the equivalent skill by name (`gradata-quickstart`, `gradata-review`, etc.).

If you need full detail, load the `gradata-quickstart` skill.

> Note: do not put `<!-- BEGIN GRADATA -->` or `<!-- END GRADATA -->` on
> their own line elsewhere in this file (even inside fenced code blocks).
> The installer scans line-by-line and treats any line that trims to one of
> those markers as the real marker.
<!-- END GRADATA -->
