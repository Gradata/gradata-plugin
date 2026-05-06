---
name: gradata
description: |
  Brain status overview — rules count, recent learning, convergence trend, link to dashboard.
  The shareable "screenshot this" command. Triggers on `/gradata` with no args, or
  when user says "show me the brain", "is gradata working", "what has gradata learned".
  Sub-commands also exist: gradata:status, gradata:prove, gradata:promote, gradata:forget,
  gradata:doctor, gradata:review.
---

# /gradata — Brain Overview

The screenshottable command. Shows the user, in one compact panel, that
their brain is working and what it has learned.

## How to Execute

### 1. Resolve the brain directory
```bash
git_url=$(git remote get-url origin 2>/dev/null | sed 's|\.git$||' | tr '[:upper:]' '[:lower:]')
hash=$(printf '%s' "$git_url" | sha256sum | cut -c1-12)
brain_dir="$HOME/.gradata/projects/$hash"
```
If `$brain_dir` doesn't exist, the user has Gradata installed but no brain
for this project yet. Tell them: "No brain yet for this repo. Run `gradata init`
or just start working — the brain will be created automatically."

### 2. Read brain stats from the daemon
```bash
port=$(cat "$brain_dir/daemon.pid" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["port"])' 2>/dev/null)
if [ -n "$port" ]; then
  status=$(curl -s --max-time 2 "http://127.0.0.1:$port/health")
  applied=$(curl -s --max-time 2 "http://127.0.0.1:$port/session/current")
  recent=$(curl -s --max-time 2 "http://127.0.0.1:$port/lessons/recent?limit=5")
fi
```

If the daemon is not running, fall back to direct SDK call:
```bash
cd <repo_root>
python3 -c "
from gradata import Brain
b = Brain('$brain_dir')
print('rules:', b.stats()['rule_count'])
print('recent:', b.stats()['recent_lessons'][:5])
print('convergence:', b.convergence()['trend'])
"
```

### 3. Resolve the cloud link
- If `$brain_dir/cloud-config.json` exists and `enabled=true`:
  - Extract `brain_id` (UUID)
  - Dashboard URL: `https://app.gradata.ai/lift-report/<brain_id>`
- Else: link to the local `gradata status` command instead.

### 4. Output (screenshot-worthy format)

Print exactly this format to the chat — concise, ASCII-friendly,
one screen tall:

```
🧠 Gradata Brain Status

Active rules: 47
This session:  3 rules applied, 1 correction captured
Convergence:   ↘ -23% corrections vs last week

Recent rules (last 5 graduated):
  ✓ Use 'unknown' not 'any' in TypeScript [conf 0.92]
  ✓ Skip "I think" hedging [0.88]
  ✓ Add explicit return types on public functions [0.85]
  ✓ Prefer composition over inheritance for React hooks [0.81]
  ✓ Sign emails with first name only [0.78]

Lift report: https://app.gradata.ai/lift-report/<brain_id>
```

Replace placeholder values with the real ones from steps 2-3.

If the brain is too young to compute convergence (<5 sessions),
replace the `Convergence:` line with: `Convergence: too early — keep working`.

If no rules graduated yet:
```
🧠 Gradata Brain Status

No rules graduated yet — corrections accumulate as INSTINCTs first.
Currently: 12 INSTINCTs, 3 PATTERNs (need 1 more reinforcement to graduate)

This session:  0 rules applied, 1 correction captured

Keep working. After 10-15 sessions you'll see corrections drop.
```

### 5. Empty/error states

- **No brain dir for this repo**: "No brain yet. Run `gradata init` or just start
  working — the brain auto-creates on first correction."
- **Daemon AND SDK both fail**: "Brain is initialized but I can't read it.
  Run `gradata doctor` to diagnose."
- **No `gradata` CLI on PATH**: "Gradata SDK not found. Install: pip install gradata"

## Why this matters

This is the "is it actually working?" answer. It's the most-screenshotted
command in the toolkit. Make it look good.

Council 2026-05-06 (install-ICP P7): "the slash command — turns invisible
memory into screenshottable proof. Addresses the unique virality vector
(X reply-guy) better than any other perspective."
