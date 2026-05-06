---
work: feature
---

# Roadmap ↔ disk reconciliation

## Goal

`df:sync-roadmap` walks `ROADMAP.md` and reconciles its checkbox state against on-disk reality (which TRDs have SUMMARY.md, which objectives are complete, etc.). Drift between ROADMAP claims and actual filesystem state is silently corrected (or surfaced for review). Eliminates the recurring chore of manually flipping `[ ]` → `[x]` after each TRD ships.

---
*Created: 2026-05-06 (auto-scaffold via bootstrapObjectiveMd)*
