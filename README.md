# Gradata Plugin for AGENTS.md-aware agent CLIs

Gradata is a learning layer for AI coding agents. It captures the corrections
you make to agent output, extracts behavioral instructions from those
corrections, and graduates them into durable rules that auto-inject into
future sessions. Over time the agent converges on *your* judgment.

The plugin is vendor-neutral: hooks and skills work with any CLI that reads
`AGENTS.md` (Claude Code, Codex, Hermes, OpenCode, …).

## Quick install

```sh
curl -fsSL https://raw.githubusercontent.com/Gradata/gradata-plugin/main/install.sh | sh
```

## Or install manually

```sh
git clone --depth 1 https://github.com/Gradata/gradata-plugin "$HOME/.gradata/plugin"
node "$HOME/.gradata/plugin/setup/install.js" --auto
```

## Verify

```sh
node ~/.gradata/plugin/setup/doctor.js
```

## What this added to your setup

- **Plugin checkout** at `~/.gradata/plugin/` (hooks + skills + setup).
- **AGENTS.md** updated with a Gradata section between `<!-- BEGIN GRADATA -->`
  and `<!-- END GRADATA -->` markers (re-runs replace the section in place).
- **Daemon-ready config** at `~/.gradata/config.toml` pointing at a working
  `python3 >= 3.10`. Install the SDK from git source to bring up the daemon
  (PyPI publish coming soon; install from source for now):

  ```sh
  pip install git+https://github.com/Gradata/gradata.git#subdirectory=Gradata
  # or, on system Python (Debian/Ubuntu — handles PEP 668):
  pip install --user git+https://github.com/Gradata/gradata.git#subdirectory=Gradata
  # or with pipx (recommended for isolation):
  pipx install git+https://github.com/Gradata/gradata.git#subdirectory=Gradata
  ```

## Privacy

- Gradata does not collect telemetry. No data leaves your machine. Local files only.
- All data stays local under `~/.gradata/`.
- The daemon binds to `127.0.0.1` only — no network exposure.
- Cloud sync is optional and only runs when you configure an API key.

## Supported agent CLIs

- **Claude Code** — installer also creates `~/.claude/plugins/gradata`
  symlinking the checkout, so `/gradata` slash-commands work out of the box.
- **Codex** — installer adds a managed Gradata hook block to
  `~/.codex/config.toml` so session lifecycle events fire graduation and
  AGENTS.md maintenance hooks.
- **OpenCode / Hermes** — pick up the Gradata block from `AGENTS.md`
  automatically. The `gradata-quickstart` skill provides the full reference;
  the doctor command is the universal health check:
  `node ~/.gradata/plugin/setup/doctor.js`.

Any other AGENTS.md-aware CLI works the same way: read the AGENTS.md block,
load the quickstart skill if you need detail, run the doctor for diagnostics.

---

## How it works

Gradata runs a three-stage graduation pipeline. Corrections start weak and
strengthen through repetition:

```
Session 1: You correct an em dash to a comma in a draft email
           -> Gradata extracts: "Never use em dashes in email prose"
           -> Lesson created as INSTINCT
Session 3: Same correction again
           -> Promoted to PATTERN
Session 7: Em dash corrections stop
           -> Graduated to RULE; auto-injected into every relevant session
```

Rules that stop being useful decay. Rules that conflict get flagged. The
system self-corrects.

## Architecture

```
+-------------------------------------------+
| Agent CLI (any AGENTS.md-aware runtime)   |
|                                           |
|  SessionStart --> inject graduated rules  |
|  UserPrompt   --> scope-match + detect    |
|  Edit         --> capture correction      |
|  Stop         --> graduation sweep        |
|         |                                 |
|         v                                 |
|  localhost HTTP daemon (Python)           |
|         |                                 |
|         v                                 |
|  ~/.gradata/projects/<hash>/              |
|    lessons.md | system.db | events.jsonl  |
+-------------------------------------------+
```

The plugin communicates with a local Python daemon over HTTP on `127.0.0.1`.
All processing is local. The daemon manages the brain vault (lessons, rules,
events) per project. Cloud sync is optional and only runs when you configure
a Gradata Cloud API key.

## Commands

- `status` — brain health: rule count, lesson stats, session number.
- `doctor` — diagnose daemon, config, plugin layout, AGENTS.md state.
- `review` — review pending lessons and promote / reject them.
- `promote` — manually promote a lesson to a higher tier.
- `forget` — remove a lesson or rule by ID.

In Claude Code these are `/gradata <cmd>`. In other CLIs invoke the
equivalent skill by name (`gradata-status`, `gradata-doctor`, …) or run
`node ~/.gradata/plugin/setup/doctor.js` for the universal health check.

## Detection signals

The plugin detects corrections through multiple channels:

- **Explicit corrections** — edits to AI-generated output (diffs tracked by severity)
- **Implicit feedback** — phrases like "that's wrong", "stop doing X", "I told you before"
- **Acceptance signals** — a rule fires and the output is not corrected (reinforcement)
- **Addition patterns** — repeatedly adding the same thing (type annotations, imports, headers)
- **Context switching** — different behavior expected in code vs email vs config
- **Correction conflicts** — a new edit contradicts a recent lesson (flags for review)

## Troubleshooting

**"Daemon not available"** — The Python daemon is not running or unreachable.
Run the doctor to diagnose. The daemon should auto-start on session begin.

**"No rules injecting"** — Rules require graduation. A correction must repeat
across multiple sessions to reach PATTERN, and further to reach RULE.

**"Wrong Python"** — The daemon needs the Python environment where `gradata`
is installed. Check `~/.gradata/config.toml` and update `python_path`.

**"Plugin not loading"** — Verify the plugin directory contains
`.claude-plugin/plugin.json`. The doctor will report this.

## Cloud is optional

You can use the plugin entirely locally with the Python SDK and the plugin
installed. Cloud sync adds hosted backup, dashboard visibility, and
cross-machine continuity, but it is not required for local rule capture,
graduation, or injection. Generate a key at
`https://app.gradata.ai/api-keys` and follow `https://app.gradata.ai/setup`
when you want to connect.

## Requirements

- Python 3.10+
- Node.js 18+
- An AGENTS.md-aware agent CLI
- `gradata` Python package (install from git: `pip install git+https://github.com/Gradata/gradata.git#subdirectory=Gradata` — PyPI publish coming soon)

## License

Apache-2.0. See [LICENSE](LICENSE).
