# Gradata Plugin

AI that learns your judgment — one correction at a time.

```sh
curl -fsSL https://raw.githubusercontent.com/Gradata/gradata-plugin/main/install.sh | sh
```

---

## How it works

Every time you correct AI output, Gradata learns. After a few sessions, it
starts getting it right without being told.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   1. You correct          2. Daemon captures                    │
│   ─────────────           ─────────────────                     │
│                                                                 │
│   You edit Claude's       The hook fires on                     │
│   output — change a       your edit. Payload:                   │
│   word, add a type,       old → new, file,                      │
│   fix a style call.       session id.                           │
│                                                                 │
│           │                       │                             │
│           └───────────────────────┘                             │
│                       │                                         │
│                       ▼                                         │
│   4. Auto-injects         3. Rule graduates                     │
│   ────────────────        ────────────────                      │
│                                                                 │
│   On session start,       Lesson confidence                     │
│   graduated rules         rises with each                       │
│   are injected into       repetition. After                     │
│   the system prompt       3+ corrections the                    │
│   silently. No more       lesson becomes a                      │
│   same correction.        durable rule.                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

<!-- Demo GIF: replace src with GRA-50 output when ready -->
![Gradata demo — rule graduating over three sessions](docs/demo-placeholder.gif)

---

## Why this matters

- **You correct once, not forever.** Gradata remembers corrections across
  sessions so the same mistake stops recurring — no repeated prompting.

- **Rules emerge from real use.** There is no rulebook to write. Your
  corrections are the source of truth; the system extracts and strengthens
  them automatically.

- **Everything stays local.** No data leaves your machine. The daemon binds
  to `127.0.0.1` only. Cloud sync is optional and content-free until you
  opt in.

---

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/Gradata/gradata-plugin/main/install.sh | sh
```

Or manually:

```sh
git clone --depth 1 https://github.com/Gradata/gradata-plugin "$HOME/.gradata/plugin"
node "$HOME/.gradata/plugin/setup/install.js" --auto
```

Verify the install:

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

- Telemetry is **opt-in only** via `GRADATA_TELEMETRY=1` (default is off).
- Opt-in telemetry sends only aggregate counters (`wau_ping`, `corrections_captured`, `rules_graduated`), plugin version, UTC timestamp, and an anonymous `user_id` (sha256 of local install ID).
- No prompt text, file paths, emails, API keys, lesson content, or correction payloads are sent.
- All data stays local under `~/.gradata/`.
- The daemon binds to `127.0.0.1` only — no network exposure.
- Cloud sync is optional and only runs when you configure an API key.

---

Telemetry endpoint defaults to `https://api.gradata.ai/telemetry/plugin` and can be overridden for testing with `GRADATA_TELEMETRY_ENDPOINT`.

## Supported agent CLIs

The plugin works with any CLI that reads `AGENTS.md`.

| CLI | Correction capture | Rule injection |
|---|---|---|
| Claude Code | ✅ | ✅ |
| Codex | ⬜ (coming) | ✅ |
| Hermes | ⬜ (coming) | ✅ |
| OpenCode | ⬜ (coming) | ✅ |

Claude Code users also get `/gradata` slash commands. All others pick up the
Gradata block from `AGENTS.md` automatically on session start.

---

## Graduation pipeline

Corrections start weak and strengthen through repetition.

```
Session 1: You change an em dash to a comma in a draft email
           -> Extracted: "Never use em dashes in email prose"
           -> Lesson: INSTINCT (confidence 0.40)

Session 2: Same correction again
           -> PATTERN (confidence 0.60, 2+ fires)

Session 3: No correction needed — rule fires correctly
           -> RULE (confidence 0.90, 3+ fires, Beta-LB ≥ 0.75)
           -> Auto-injected into every relevant session from now on
```

Rules that stop being useful decay. Rules that conflict get flagged. The
system self-corrects.

Minimum graduation path: **3 corrections spanning 2+ sessions.**

---

## Commands

In Claude Code, run `/gradata <cmd>`. In other CLIs, invoke the equivalent
skill by name (`gradata-status`, `gradata-doctor`, …).

| Command | What it does |
|---|---|
| `status` | Brain health: rule count, lesson stats, session number |
| `doctor` | Diagnose daemon, config, plugin layout, AGENTS.md state |
| `review` | Review pending lessons; promote or reject |
| `promote` | Manually promote a lesson to a higher tier |
| `forget` | Remove a lesson or rule by ID |

---

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
events) per project.

---

## Detection signals

- **Explicit corrections** — edits to AI-generated output (diffs tracked by severity)
- **Implicit feedback** — phrases like "that's wrong", "stop doing X", "I told you before"
- **Acceptance signals** — a rule fires and output is not corrected (reinforcement)
- **Addition patterns** — repeatedly adding the same thing (type annotations, imports, headers)
- **Context switching** — different behavior expected in code vs email vs config

---

## Privacy

- No telemetry. No data leaves your machine.
- All state lives under `~/.gradata/`.
- Daemon binds to `127.0.0.1` only — no network exposure.
- Cloud sync is optional and only runs when you configure a Gradata API key.

---

## Troubleshooting

**"Daemon not available"** — Run `doctor` to diagnose. The daemon should
auto-start on session begin.

**"No rules injecting"** — Graduation requires 3+ corrections across 2+
sessions. Check `status` for pending lessons.

**"Wrong Python"** — Update `python_path` in `~/.gradata/config.toml`.

**"Plugin not loading"** — Verify `.claude-plugin/plugin.json` exists in the
plugin directory. Run `doctor`.

---

## Requirements

- Python 3.10+
- Node.js 18+
- An `AGENTS.md`-aware agent CLI
- `gradata` Python package:

  ```sh
  pip install git+https://github.com/Gradata/gradata.git#subdirectory=Gradata
  # or with pipx (recommended):
  pipx install git+https://github.com/Gradata/gradata.git#subdirectory=Gradata
  ```

## License

Apache-2.0. See [LICENSE](LICENSE).
