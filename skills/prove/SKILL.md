---
name: gradata:prove
description: Show statistical proof that the brain improves output quality
---

# Gradata Prove

Generate statistical evidence that the brain is improving.

## How to Execute

1. Run this Python command:
   ```bash
   python3 -c "
   from gradata import Brain
   import json, hashlib, subprocess, os
   remote = subprocess.run(['git', 'remote', 'get-url', 'origin'], capture_output=True, text=True).stdout.strip()
   h = hashlib.sha256(remote.lower().rstrip('.git').encode()).hexdigest()[:12]
   brain_dir = f'{os.path.expanduser(\"~\")}/.gradata/projects/{h}'
   b = Brain(brain_dir)
   proof = b.prove()
   print(json.dumps(proof, indent=2, default=str))
   "
   ```

2. Present the results:
   - **Convergence trend:** improving/stable/degrading
   - **Corrections per session:** show the trend (decreasing = good)
   - **Effect size:** how much impact the brain has
   - **Statistical significance:** p-value if available
   - **Sessions analyzed:** total sessions in the dataset

3. If insufficient data (< 3 sessions), tell the user: "Need more sessions to generate proof. Keep working and corrections will accumulate."
