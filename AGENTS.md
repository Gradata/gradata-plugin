# AGENTS.md

Cross-agent context for the `gradata-plugin` repository. Loaded by AGENTS.md-aware
agent CLIs (Codex, Cursor, Hermes, Claude Code, etc.). LLM-agnostic — keep it that way.

This plugin ships **hooks** + **skills** that are consumed by multiple agent runtimes.
Anything written here must work for any agent, not one specific vendor.

---

## 1. MEMORY ROUTING

Where information lives. Do not co-locate.

- **Design notes, architecture decisions, pipeline diagrams** → `docs/` (create if absent).
- **Hook unit tests** → `hooks/<hook-name>/tests/` (per-hook, co-located).
- **Skill content + examples** → `skills/<skill-name>/SKILL.md` and `skills/<skill-name>/references/`.
- **Install / bootstrap logic** → `setup/install.js`.
- **Plugin manifest** → `.claude-plugin/plugin.json` (name, version, author).
- **Shared hook helpers** → `hooks/lib/` (`daemon-client.js`, `hook-input.js`).
- **User-facing docs** → `README.md`. Do not duplicate README content into AGENTS.md.
- **Disposable scratch / debug captures** → `.tmp/` (gitignored). Never commit.
- **Secrets / API keys** → never in repo. User config lives at `~/.gradata/config.toml`
  on the user's machine — never read or write it from this repo's code paths in tests.
- **Learned conventions discovered during a task** → append to §6 LEARNED below.

If a doc would touch two of these, split it. One topic per file.

---

## 2. HARD RULES (IMPORTANT / YOU MUST)

These are non-negotiable. Violating any of these breaks downstream agent runtimes.

- **IMPORTANT: Hooks are Node.js (`.js`) and MUST stay vendor-neutral.** They read
  hook input from stdin as JSON and write JSON to stdout. Do not import agent-CLI-
  specific globals. Anything Node ≥18 ships with is fair game; no Bun/Deno-only APIs.
- **IMPORTANT: Hooks MUST run on macOS, Linux, and WSL** with no extra install steps
  beyond `node`. No native binaries. No shell-outs that assume `bash` (use `/bin/sh`
  semantics if a hook ever shells out, no bash-isms like `[[`, `<<<`, arrays).
- **IMPORTANT: Every `skills/<name>/SKILL.md` MUST have valid frontmatter.** Required
  keys: `name` and `description`. `name` MUST be lowercase-with-hyphens (or
  `namespace:lowercase-hyphens`), max **64 chars**. `description` is one line, no
  trailing period required, ≤ ~200 chars. A missing or malformed frontmatter block
  causes silent skill load failure across runtimes.
- **IMPORTANT: The daemon contract is HTTP on `127.0.0.1` only.** Never propose
  binding to `0.0.0.0` or exposing the daemon to a network. Never log raw lesson
  contents at INFO level.
- **IMPORTANT: Confidence scores must never be surfaced to the model in injected
  context.** Tier names (INSTINCT / PATTERN / RULE) are fine; numeric confidence is not.
- **IMPORTANT: No agent-CLI brand names in hook output, error messages, or skill
  prose.** Use "agent", "agent CLI", "host runtime". The plugin is consumed by
  multiple agent runtimes; brand-locked strings break portability.
- **YOU MUST NOT push to `main` directly.** All changes ship via pull request from a
  feature branch (`docs/...`, `fix/...`, `feat/...`).
- **YOU MUST run `node --check` on every changed hook before commit.** Syntax errors
  in a hook silently disable that lifecycle stage on the user's machine.
- **YOU MUST NOT commit `.env`, daemon PID files, or anything under `~/.gradata/`.**
- **YOU MUST read a file before editing it.** Prefer targeted patches over rewrites.

---

## 3. READ SMALLEST USEFUL CONTEXT

Be surgical. Token budget matters.

- Start with `README.md` for product framing, then this file for repo rules.
- For a hook change: read **only** that hook + `hooks/lib/` helpers + the hook's tests.
  Do not pre-read sibling hooks unless the change touches a shared protocol.
- For a skill change: read **only** `skills/<name>/SKILL.md` and any file under
  `skills/<name>/references/` that the SKILL.md explicitly mentions.
- For an install change: `setup/install.js` + `.claude-plugin/plugin.json`. Nothing else.
- Do not load the entire `skills/` tree to "get oriented". Use `ls skills/` and pick.
- Avoid recursive directory dumps on `.git/`, `node_modules/`, `.tmp/`.
- Long investigations → write findings to `docs/<topic>.md`, do not inline-dump in chat.

---

## 4. WORKSPACE ORGANIZATION

Top-level layout (authoritative):

- `.claude-plugin/plugin.json` — plugin manifest (name, version, author).
- `hooks/` — lifecycle hooks consumed by agent runtimes:
  - `session-start.js` — inject graduated rules at session boot.
  - `session-stop.js` — graduation sweep on session end.
  - `user-prompt.js` — scope-match + signal detect on each user turn.
  - `pre-tool.js` / `post-tool-extended.js` — tool-call instrumentation.
  - `post-edit.js` — capture diffs on file edits (correction signal).
  - `pre-compact.js` — preserve state before context compaction.
  - `lib/daemon-client.js`, `lib/hook-input.js` — shared helpers.
- `skills/` — `SKILL.md` packages. One directory per skill. Current skills:
  `doctor`, `forget`, `index`, `promote`, `prove`, `review`, `status`.
- `setup/install.js` — installer / bootstrap (Node).
- `README.md`, `LICENSE`, `.gitignore` — standard repo metadata.
- `docs/` — design + architecture notes (create when needed).

### Install / verify / test

```sh
# Install (user-side; runs from the cloned repo)
node setup/install.js

# Sanity-check every hook parses
for f in hooks/*.js hooks/lib/*.js setup/*.js; do node --check "$f" || exit 1; done

# Validate every SKILL.md has frontmatter with required keys
for f in skills/*/SKILL.md; do
  head -1 "$f" | grep -q '^---$' || { echo "missing frontmatter: $f"; exit 1; }
done

# Run hook tests (when a hook ships tests under hooks/<name>/tests/)
node --test hooks/**/tests/*.test.js
```

CI should run all three blocks. Treat any failure as a release blocker.

### Branch + PR flow

```sh
git checkout -b <type>/<short-slug>     # docs/, fix/, feat/, chore/
# ...edit, test...
git add -A && git commit -m "<type>: <imperative summary>"
git push -u origin HEAD
gh pr create --base main --title "<type>: <summary>" --body "<context>"
```

Never `git push origin main`. Never `--force` on `main`.

---

## 5. PLATFORM FORMATTING

Output rules for any agent operating in this repo.

- **Markdown only.** No HTML. No tables — use bullet lists or `key: value` pairs.
  (Some surfaces auto-rewrite tables and the result is uglier than a clean list.)
- **Code fences must declare a language** (` ```sh `, ` ```js `, ` ```json `, ` ```md `).
- **Paths are POSIX-style** in docs (`hooks/lib/daemon-client.js`), even on Windows.
- **No emoji in hook stdout, skill output, or commit messages.** Headings/prose may
  use sparingly; never in machine-parsed surfaces.
- **Commit subjects** ≤ 72 chars, conventional prefix (`docs:`, `fix:`, `feat:`,
  `chore:`, `refactor:`, `test:`). Body wraps at 100. Imperative mood.
- **PR descriptions** open with one-sentence what/why, then a short bullet list of
  changes, then test evidence. No screenshots of terminal text — paste it.
- **Chat / interactive output stays under ~200 words.** Long analyses → file under
  `docs/` or `.tmp/` and reference the path.
- **Never claim a test passed without running it.** Never paste fabricated output.

---

## 6. LEARNED

(empty — append discoveries here as bullets, newest on top, with date and a one-line
takeaway. Promote durable lessons into the sections above and remove from here.)
