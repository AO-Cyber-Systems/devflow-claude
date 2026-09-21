#!/usr/bin/env python3
"""Render docs/ui-oracle-loop.progress.json into a single-file status page.

Usage: python3 docs/progress-map/build.py [OUT]
Default OUT: the session scratchpad if $CLAUDE_SCRATCHPAD is set, else docs/progress-map/out/ui-oracle-loop-map.html
The page is a Claude Artifact: publish OUT with the Artifact tool (same file path/URL every time).
"""
import json, os, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
progress = here.parent / "ui-oracle-loop.progress.json"
data = json.loads(progress.read_text())
# Fail loudly on shape drift so a stale map is never published silently.
for key in ("program", "updated", "now", "waiting_on_user", "status_legend", "waves", "rulings", "deferred_minors"):
    assert key in data, f"progress.json missing {key}"
for w in data["waves"]:
    for t in w.get("tasks", []):
        assert t["status"] in data["status_legend"], f"{t['id']}: unknown status {t['status']}"
html = (here / "template.html").read_text()
payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else (
    pathlib.Path(os.environ["CLAUDE_SCRATCHPAD"]) / "ui-oracle-loop-map.html" if os.environ.get("CLAUDE_SCRATCHPAD")
    else here / "out" / "ui-oracle-loop-map.html")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html.replace("__PROGRESS_JSON__", payload))
print(out)
