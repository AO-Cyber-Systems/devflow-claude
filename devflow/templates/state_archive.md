# State Archive Template

Template for `.planning/STATE_ARCHIVE.md` — append-only log of decisions and performance metrics.

---

## File Template

```markdown
# State Archive

Append-only log. Written by df-tools `add-decision` and `record-metric`.
STATE.md stays lean; this file grows over time.

## Decisions

- *(none yet)*

## Performance Metrics

| Objective | Duration | Tasks | Files |
|-----------|----------|-------|-------|
| - | - | - | - |
```

<purpose>

STATE_ARCHIVE.md is the project's long-term decision and metrics log.

**Problem it solves:** STATE.md grew unbounded as decisions and metrics accumulated, making it slow to parse and noisy for session restoration.

**Solution:** A dedicated append-only file that:
- Receives all `state add-decision` and `state record-metric` writes
- Is never read during normal execution (executor reads STATE.md only)
- Is optionally read by the planner for deep constraint analysis
- Keeps STATE.md under its 100-line budget

</purpose>

<lifecycle>

**Creation:** Alongside STATE.md during project init.

**Writing:** By df-tools commands only:
- `state add-decision` appends to Decisions section
- `state record-metric` appends to Performance Metrics table

**Reading:** Optional, by planner during deep constraint analysis.
Never read during execution or verification workflows.

</lifecycle>
