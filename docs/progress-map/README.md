# Progress map

`../ui-oracle-loop.progress.json` is the machine-readable map of the UI Oracle Loop program —
waves, tasks, status, commits, rulings, what is waiting on Mark. It is the shared state between
sessions: update it whenever the SDD ledger changes, then rebuild and republish the page.

```
python3 docs/progress-map/build.py /path/to/scratch/ui-oracle-loop-map.html
# then: Artifact publish that file (same path each time keeps the URL)
```

Status vocabulary is fixed in `status_legend`; the build fails on an unknown status.
