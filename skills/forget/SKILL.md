---
name: gradata:forget
description: Undo lessons — "last", "last 3", "all TONE", or fuzzy description match
---

# Gradata Forget

Undo one or more lessons from the brain.

## How to Execute

1. Ask the user what to forget if they didn't specify. Examples:
   - "last" — most recent lesson
   - "last 3" — last 3 lessons
   - "all TONE" — all lessons in TONE category
   - "casual tone" — fuzzy match on description

2. Run this Python command (replace WHAT with the user's input):
   ```bash
   python3 -c "
   from gradata import Brain
   import json, hashlib, subprocess, os
   remote = subprocess.run(['git', 'remote', 'get-url', 'origin'], capture_output=True, text=True).stdout.strip()
   h = hashlib.sha256(remote.lower().rstrip('.git').encode()).hexdigest()[:12]
   brain_dir = f'{os.path.expanduser(\"~\")}/.gradata/projects/{h}'
   b = Brain(brain_dir)
   result = b.forget('WHAT')
   print(json.dumps(result, indent=2, default=str))
   "
   ```

3. Present what was forgotten:
   - For each rolled-back lesson: category, description, previous state/confidence
   - "Rolled back X lesson(s)"

4. If nothing matched: "No matching lessons found."
