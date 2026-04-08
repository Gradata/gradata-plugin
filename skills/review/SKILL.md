---
name: gradata:review
description: Review pending lesson promotions and approve or reject them interactively
---

# Gradata Review

Show pending promotions and let the user approve or reject them.

## How to Execute

1. Run this Python command to get pending promotions:
   ```bash
   python3 -c "
   from gradata import Brain
   import json, hashlib, subprocess
   remote = subprocess.run(['git', 'remote', 'get-url', 'origin'], capture_output=True, text=True).stdout.strip()
   h = hashlib.sha256(remote.lower().rstrip('.git').encode()).hexdigest()[:12]
   brain_dir = f'{__import__(\"os\").path.expanduser(\"~\")}/.gradata/projects/{h}'
   b = Brain(brain_dir)
   pending = b.review_pending()
   print(json.dumps(pending, indent=2, default=str))
   "
   ```

2. Present each pending lesson to the user:
   - Description, category, confidence, fire count, state
   - Ask: "Approve or reject? (a/r/skip)"

3. For approved lessons: run `brain.approve_lesson(approval_id)`
4. For rejected lessons: run `brain.reject_lesson(approval_id, reason="user rejected")`
5. Show summary: "Approved X, rejected Y, skipped Z"
