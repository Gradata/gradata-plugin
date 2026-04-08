---
name: gradata:promote
description: Promote a graduated rule to global scope so it applies across all projects
---

# Gradata Promote

Promote a project-level rule to global scope.

## How to Execute

1. If the user didn't specify a rule_id, first show available candidates:
   ```bash
   python3 -c "
   from gradata import Brain
   import json, hashlib, subprocess, os
   remote = subprocess.run(['git', 'remote', 'get-url', 'origin'], capture_output=True, text=True).stdout.strip()
   h = hashlib.sha256(remote.lower().rstrip('.git').encode()).hexdigest()[:12]
   brain_dir = f'{os.path.expanduser(\"~\")}/.gradata/projects/{h}'
   b = Brain(brain_dir)
   rules = b.export_rules_json(min_state='RULE')
   print(json.dumps(rules, indent=2, default=str))
   "
   ```

2. Let the user pick which rule(s) to promote.

3. For each selected rule, copy it to `~/.gradata/global/lessons.md`:
   - Read the rule's lesson line from the project's lessons.md
   - Append it to `~/.gradata/global/lessons.md` (create if missing)
   - Confirm: "Promoted 'RULE_DESCRIPTION' to global scope"

4. Global rules will auto-inject into all projects at next SessionStart.
