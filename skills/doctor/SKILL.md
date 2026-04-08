---
name: gradata:doctor
description: Health check — Python, SDK, daemon, brain vault, permissions
---

# Gradata Doctor

Run a comprehensive health check.

## How to Execute

Run these checks in order. Present each as pass/fail:

1. **Python:** Run `python3 --version`. Pass if >= 3.10.
2. **Gradata SDK:** Run `python3 -c "import gradata; print(gradata.__version__)"`. Pass if importable.
3. **Brain directory:** Check if `~/.gradata/` exists. Check if project brain dir exists.
4. **Config:** Read `~/.gradata/config.toml`. Check `python_path` is set and the binary exists.
5. **Daemon:** Read `<brain_dir>/daemon.pid`. Try `GET http://127.0.0.1:<port>/health`. Pass if status=ok.
6. **Daemon log:** Read last 50 lines of `<brain_dir>/daemon.log` and `<brain_dir>/daemon.log.1`. Report any ERROR or WARNING lines.
7. **Lessons file:** Check if `<brain_dir>/lessons.md` exists and is readable.
8. **Database:** Check if `<brain_dir>/system.db` exists and is readable.
9. **Permissions:** Check `<brain_dir>/` is writable.

Present results as:
```
Gradata Doctor
  Python 3.12.0 .............. OK
  Gradata SDK v0.2.0 ......... OK
  Brain directory ............. OK (~/.gradata/projects/a1b2c3d4/)
  Config ...................... OK (python_path set)
  Daemon ...................... OK (port 52341, uptime 342s)
  Daemon log .................. OK (no errors)
  Lessons file ................ OK (45 lessons)
  Database .................... OK (system.db present)
  Permissions ................. OK (writable)
```

For each failure, provide an actionable fix suggestion.
