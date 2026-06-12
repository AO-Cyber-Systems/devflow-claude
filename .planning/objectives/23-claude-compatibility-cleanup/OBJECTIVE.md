---
work: refactor
overrides:
  depth: standard
---

# Claude Compatibility Cleanup

## Goal

Align the plugin with current Claude Code for token efficiency and correctness: atomic mirror sync that excludes test code, removal of deprecated redirect skills, skill-description and context-injection trims, the gate-commits bypass fix, legacy workflow deletion, statusline caching, and agent-prompt dedup against the authoritative references.

## Why This Objective

A 2026-06-12 compatibility audit found ~800+ tokens of dead weight loaded every session, ~5-6k recoverable tokens per agent spawn, 2.4MB of test code shipped to every user's home dir, and two hook bugs. The sync-runtime race was confirmed live the same day: this machine's `~/.claude/devflow` mirror was missing 28 of 39 workflows while `.plugin-version` claimed it was current.

## Scope (seven work items, locked)

1. **sync-runtime atomic swap + exclusions** (`plugins/devflow/hooks/sync-runtime.js`). Copy into a temp dir then `fs.renameSync` atomic swap per subdirectory (or whole-tree), write `.plugin-version` only after a successful swap. Exclude `*.test.cjs`, `*.test.js`, and `__fixtures__/` from the mirror (~2.4MB of test code currently ships to every user, including mock-auth-server fixtures). Add a cheap content-sentinel so an incomplete mirror with a matching version marker self-heals (the observed corruption mode). Tests for the hook.

2. **Delete 13 deprecated redirect skills**: add-objective, add-todo, audit-milestone, check-todos, complete-milestone, health, insert-objective, new-milestone, pause-work, plan-milestone-gaps, progress, remove-objective, resume-work (~540 tokens of descriptions loaded every session for pure shims). CAREFUL: these are wired into df-tools SKILL_ROUTES/DEPRECATION_MAP (v1.2 obj "skill-consolidation") with tests asserting 13 deprecated entries, plus help.md's deprecation appendix and README. Update map/tests/docs coherently — discretion on whether DEPRECATION_MAP entries stay (for "use X instead" routing in route-intent) or go.

3. **Trim 8 oversized skill descriptions** to ≤350 chars each, moving trigger lists and mode documentation into the skill body: tui (976 chars), help (771), handoff (679), status (650), initiatives (618), awareness (591), gh-sync (472), sync-roadmap (464). Routing behavior must be preserved — keep the strongest 3-4 trigger phrases.

4. **Shrink route-intent.js injection** (`plugins/devflow/hooks/route-intent.js`): the per-prompt box-drawn directive is ~1.5KB; replace with a compact ≤400-byte reminder carrying the same routing decision table in terse form. Update its tests.

5. **gate-commits.js bypass fix** (`plugins/devflow/hooks/gate-commits.js:68-70`): the gate stands down when `.planning/STATE.md` is absent, so any manually created `.planning/` gets no commit enforcement. Gate on `ROADMAP.md` or the objectives dir instead. Update tests.

6. **Delete legacy workflow + statusline cache**: remove `plugins/devflow/devflow/workflows/execute-job.md` (status: legacy, 454 lines, 14KB) after grep-verifying zero incoming references in skills/agents/workflows; module-level cache for the stateLib `require()` in `plugins/devflow/hooks/statusline.js` (~15ms × 10-20 renders/session).

7. **Agent-prompt dedup against references** (highest token ROI, highest care): in `plugins/devflow/agents/planner.md` (50KB ≈ 12.6k tokens/spawn) collapse the duplicated checkpoint-types section (authoritative: references/checkpoints.md), the four TDD sections (authoritative: references/tdd.md — keep one short brief + @reference), and the five overlapping context-budgeting sections (consolidate). In `plugins/devflow/agents/executor.md` (24KB) extract deviation-rule definitions to `references/deviation-rules.md`, keeping application logic + a summary inline. Target ≥4k tokens/spawn combined reduction. Behavior must stay identical — the extracted references are loaded via @-reference at spawn, so content moves, not disappears.

## Notes

- **Preserve objective-10 additions**: executor.md's Rule-4 queueable return format and frontmatter hardening (maxTurns/isolation), verifier.md's checkpoint_verification_mode, execute-objective.md's three-branch checkpoint handler. Dedup must not regress these.
- @-references in agent bodies resolve via `~/.claude/devflow/...` (home mirror) — new references/deviation-rules.md ships through the same sync-runtime mirror, so item 1's exclusion rules must not exclude it.
- Wave shape suggestion: hooks (1, 4, 5, 6b) and deletions/trims (2, 3, 6a) are parallel-safe; agent dedup (7) last, alone, with before/after token measurements in the SUMMARY.
- Skill description token math: combined description+when_to_use budget per skill is 1,536 chars (docs); trims also reduce the per-session always-loaded cost (~3,400 tokens today across 42 skills).
- Port 8080 is permanently off-limits in every file this objective touches — use 8091 in any example. Propagate to all subagents.

---
*Created: 2026-06-12*
