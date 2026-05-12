# Cross-CLI Smoke Test Matrix

Baseline run date: 2026-05-12

Legend: `pass` = checkpoint observable succeeded, `fail` = checkpoint observable failed, `not-tested` = not executed in this baseline run.

## Scope

This matrix tracks end-to-end behavior across 4 CLIs:
- Claude Code
- Codex CLI
- Hermes Agent
- Cursor

Required checkpoint coverage:
1. install
2. hook-fire
3. correction-capture
4. dedupe
5. graduation
6. injection
7. opt-out
8. uninstall

## Matrix (8 checkpoints x 4 CLIs)

| # | Checkpoint | Concrete observable event | Claude Code | Codex CLI | Hermes Agent | Cursor |
|---|---|---|---|---|---|---|
| 1 | install | Plugin files exist in CLI plugin directory and CLI binary is executable. | pass | fail | fail | fail |
| 2 | hook-fire | Starting and stopping a session appends hook lifecycle records to Gradata event logs. | not-tested | not-tested | not-tested | not-tested |
| 3 | correction-capture | A user correction creates a `CORRECTION` event in Gradata events. | not-tested | not-tested | not-tested | not-tested |
| 4 | dedupe | Replaying the same correction does not create duplicate rule candidates with the same provenance hash. | not-tested | not-tested | not-tested | not-tested |
| 5 | graduation | Repeated correction progresses lesson state to a graduated rule. | not-tested | not-tested | not-tested | not-tested |
| 6 | injection | A graduated rule is auto-injected on a new session start. | not-tested | not-tested | not-tested | not-tested |
| 7 | opt-out | Opt-out switch disables capture/injection and records disabled state. | not-tested | not-tested | not-tested | not-tested |
| 8 | uninstall | Removing plugin files prevents hook execution and Gradata slash commands. | not-tested | not-tested | not-tested | not-tested |

## Repro commands by checkpoint

Notes:
- These are exact commands for row-level verification.
- `<PROJECT_DIR>` should be any disposable test project.
- Log checks read `~/.gradata` and complete in under 5 minutes once the checkpoint action is performed.

### 1) install

```bash
# Claude Code
bash -lc 'command -v claude && test -f ~/.claude/plugins/gradata/.claude-plugin/plugin.json'

# Codex CLI
bash -lc 'command -v codex && test -f ~/.codex/plugins/gradata/.claude-plugin/plugin.json'

# Hermes Agent
bash -lc 'command -v hermes && test -f ~/.hermes/plugins/gradata/.claude-plugin/plugin.json'

# Cursor
bash -lc 'command -v cursor && test -f ~/.cursor/plugins/gradata/.claude-plugin/plugin.json'
```

### 2) hook-fire

```bash
# Claude Code
bash -lc 'rg -n "session[-_ ]?(start|stop)|hook" ~/.gradata -g "*.jsonl" | tail -n 5'

# Codex CLI
bash -lc 'rg -n "session[-_ ]?(start|stop)|hook" ~/.gradata -g "*.jsonl" | tail -n 5'

# Hermes Agent
bash -lc 'rg -n "session[-_ ]?(start|stop)|hook" ~/.gradata -g "*.jsonl" | tail -n 5'

# Cursor
bash -lc 'rg -n "session[-_ ]?(start|stop)|hook" ~/.gradata -g "*.jsonl" | tail -n 5'
```

### 3) correction-capture

```bash
# Claude Code
bash -lc 'rg -n "\"type\": \"CORRECTION\"" ~/.gradata -g "events*.jsonl" | tail -n 3'

# Codex CLI
bash -lc 'rg -n "\"type\": \"CORRECTION\"" ~/.gradata -g "events*.jsonl" | tail -n 3'

# Hermes Agent
bash -lc 'rg -n "\"type\": \"CORRECTION\"" ~/.gradata -g "events*.jsonl" | tail -n 3'

# Cursor
bash -lc 'rg -n "\"type\": \"CORRECTION\"" ~/.gradata -g "events*.jsonl" | tail -n 3'
```

### 4) dedupe

```bash
# Claude Code
bash -lc 'rg -n "provenance_hash" ~/.gradata -g "events*.jsonl" | tail -n 20'

# Codex CLI
bash -lc 'rg -n "provenance_hash" ~/.gradata -g "events*.jsonl" | tail -n 20'

# Hermes Agent
bash -lc 'rg -n "provenance_hash" ~/.gradata -g "events*.jsonl" | tail -n 20'

# Cursor
bash -lc 'rg -n "provenance_hash" ~/.gradata -g "events*.jsonl" | tail -n 20'
```

### 5) graduation

```bash
# Claude Code
bash -lc 'rg -n "graduat|RULE|PATTERN|INSTINCT" ~/.gradata -g "events*.jsonl" -g "*.md" | tail -n 20'

# Codex CLI
bash -lc 'rg -n "graduat|RULE|PATTERN|INSTINCT" ~/.gradata -g "events*.jsonl" -g "*.md" | tail -n 20'

# Hermes Agent
bash -lc 'rg -n "graduat|RULE|PATTERN|INSTINCT" ~/.gradata -g "events*.jsonl" -g "*.md" | tail -n 20'

# Cursor
bash -lc 'rg -n "graduat|RULE|PATTERN|INSTINCT" ~/.gradata -g "events*.jsonl" -g "*.md" | tail -n 20'
```

### 6) injection

```bash
# Claude Code
bash -lc 'rg -n "inject|injection|rule" ~/.gradata -g "events*.jsonl" | tail -n 20'

# Codex CLI
bash -lc 'rg -n "inject|injection|rule" ~/.gradata -g "events*.jsonl" | tail -n 20'

# Hermes Agent
bash -lc 'rg -n "inject|injection|rule" ~/.gradata -g "events*.jsonl" | tail -n 20'

# Cursor
bash -lc 'rg -n "inject|injection|rule" ~/.gradata -g "events*.jsonl" | tail -n 20'
```

### 7) opt-out

```bash
# Claude Code
bash -lc 'rg -n "opt[-_ ]?out|disabled" ~/.gradata ~/.claude ~/.config 2>/dev/null | tail -n 20'

# Codex CLI
bash -lc 'rg -n "opt[-_ ]?out|disabled" ~/.gradata ~/.codex ~/.config 2>/dev/null | tail -n 20'

# Hermes Agent
bash -lc 'rg -n "opt[-_ ]?out|disabled" ~/.gradata ~/.hermes ~/.config 2>/dev/null | tail -n 20'

# Cursor
bash -lc 'rg -n "opt[-_ ]?out|disabled" ~/.gradata ~/.cursor ~/.config 2>/dev/null | tail -n 20'
```

### 8) uninstall

```bash
# Claude Code
bash -lc 'test ! -d ~/.claude/plugins/gradata && ! command -v gradata >/dev/null 2>&1 || true'

# Codex CLI
bash -lc 'test ! -d ~/.codex/plugins/gradata && ! command -v gradata >/dev/null 2>&1 || true'

# Hermes Agent
bash -lc 'test ! -d ~/.hermes/plugins/gradata && ! command -v gradata >/dev/null 2>&1 || true'

# Cursor
bash -lc 'test ! -d ~/.cursor/plugins/gradata && ! command -v gradata >/dev/null 2>&1 || true'
```

## Baseline execution notes (2026-05-12)

Commands executed during this baseline capture:

```bash
claude --version
codex --version
hermes --version
cursor --version

test -f ~/.claude/plugins/gradata/.claude-plugin/plugin.json
test -f ~/.codex/plugins/gradata/.claude-plugin/plugin.json
test -f ~/.hermes/plugins/gradata/.claude-plugin/plugin.json
test -f ~/.cursor/plugins/gradata/.claude-plugin/plugin.json
```

Observed:
- `claude`, `codex`, and `hermes` binaries present.
- `cursor` binary not found in this environment.
- Only Claude plugin path was present.
- Rows 2-8 were intentionally left `not-tested` for this baseline because no interactive cross-CLI sessions were executed in this run.
