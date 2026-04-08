# Gradata Plugin for Claude Code

AI that learns your judgment. Gradata captures your corrections to AI output, extracts behavioral instructions, and graduates them into rules that auto-inject into future sessions. Over time, the AI converges on how *you* think -- not generally smarter, but calibrated to you.

## Install

```bash
# Clone into your Claude Code plugins directory
git clone https://github.com/gradata-ai/gradata-plugin ~/.claude/plugins/gradata

# Install the Python SDK (required for the daemon)
pip install gradata
```

Verify the plugin loaded:
```
/gradata doctor
```

## How It Works

Gradata runs a three-stage graduation pipeline. Corrections start weak and strengthen through repetition:

```
Session 1: You correct Claude's output (change em dash to comma in an email)
           -> Gradata extracts: "Never use em dashes in email prose"
           -> Lesson created as INSTINCT (confidence 0.40)

Session 3: Same correction again
           -> Confidence boosted to PATTERN (0.60)

Session 7: No more em dash corrections needed
           -> Graduated to RULE (confidence 0.90)
           -> Auto-injected into every future session
```

Rules that stop being useful decay. Rules that conflict get flagged. The system self-corrects.

## Architecture

```
+-------------------------------------------+
| Claude Code                               |
|                                           |
|  SessionStart --> inject rules            |
|  UserPrompt  --> scope-match + detect     |
|  Edit        --> capture correction       |
|  Stop        --> graduation sweep         |
|         |                                 |
|         v                                 |
|  localhost HTTP daemon (Python)            |
|         |                                 |
|         v                                 |
|  ~/.gradata/projects/<hash>/              |
|    lessons.md | system.db | events.jsonl  |
+-------------------------------------------+
```

The plugin communicates with a local Python daemon over HTTP. All processing happens on your machine. The daemon manages the brain vault (lessons, rules, events) per project.

## Commands

| Command | Description |
|---------|-------------|
| `/gradata status` | Show brain health: rule count, lesson stats, session number |
| `/gradata doctor` | Diagnose daemon, config, and plugin connectivity |
| `/gradata review` | Review pending lessons and promote/reject them |
| `/gradata promote` | Manually promote a lesson to a higher confidence tier |
| `/gradata forget` | Remove a lesson or rule by ID |
| `/gradata prove` | Generate a provenance proof for the current brain state |

## Detection Signals

The plugin detects corrections through multiple channels:

- **Explicit corrections** -- edits to AI-generated output (diffs tracked by severity)
- **Implicit feedback** -- phrases like "that's wrong", "stop doing X", "I told you before"
- **Acceptance signals** -- a rule fires and the output is not corrected (reinforcement)
- **Addition patterns** -- repeatedly adding the same thing (type annotations, imports, headers)
- **Context switching** -- different behavior expected in code vs email vs config
- **Correction conflicts** -- a new edit contradicts a recent lesson (flags for review)

## Troubleshooting

**"Daemon not available"**
The Python daemon is not running or unreachable. Run `/gradata doctor` to diagnose. The daemon should auto-start on session begin.

**"No rules injecting"**
Rules require graduation. A correction must repeat across 3+ sessions to reach PATTERN, and further to reach RULE. Check `/gradata status` for pending lessons.

**"Wrong Python"**
The daemon needs the Python environment where `gradata` is installed. Check `~/.gradata/config.toml` and update `python_path` to point to the correct interpreter.

**"Plugin not loading"**
Verify the plugin directory contains `.claude-plugin/plugin.json`. Run `ls ~/.claude/plugins/gradata/.claude-plugin/` to confirm.

## Privacy

- All data stays local in `~/.gradata/`
- The daemon binds to `127.0.0.1` only -- no network exposure
- No cloud sync in v1
- Optional anonymous telemetry is opt-in and content-free (event counts only)

## Requirements

- Python 3.10+
- Claude Code CLI
- `gradata` Python package (`pip install gradata`)

## License

AGPL-3.0. See [LICENSE](LICENSE).
