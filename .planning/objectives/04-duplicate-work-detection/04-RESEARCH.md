---
objective: 04-duplicate-work-detection
title: Research pointer — duplicate-work detection
created: 2026-05-04
status: pointer
research_source: .planning/research/cross-session-coordination.md
---

# Objective 4 — Research pointer

This objective consumes the research already captured in `.planning/research/cross-session-coordination.md` §"Duplicate detection". No new research required — the locked decisions in `04-CONTEXT.md` (8 items) directly translate that research's design into implementation contracts.

## Anchor sections in `cross-session-coordination.md`

- **§"Duplicate detection"** (lines ~88-122 of the research doc):
  - Plan-time check (in `/df:plan-objective`): comparison after planner drafts JOB.md, before committing.
  - Execute-time check (in `/df:execute-objective`): re-run before each job in the wave.
  - Signal table (Files / Module-or-class names / GitHub issue / Objective summary) with weights.
  - Resolution flow: Merge / Defer / Coordinate / Proceed-anyway.
  - Honoring `feedback_autopilot_after_setup`: only strong matches block; weak matches advisory.

- **§"Mapping to v1.1 milestone objectives"**:
  - Slots obj 4 into the milestone as the "duplicate-work detection" runtime layer.
  - Confirms dependency chain: obj 1 (GH primitives) + obj 2 (peer scanner) + obj 3 (org-overlap) → obj 4.

## Deltas from the research doc to obj 4's locked decisions

The research doc contemplated some choices that the locked decisions narrow:

| Research-doc option | Locked decision | Rationale |
|---|---|---|
| LLM semantic compare across active session intents (weak signal) | NO LLM scoring (obj 4 is purely lexical) | Per ROADMAP "Out of scope: LLM-based semantic similarity — locked deterministic per obj 3 precedent" |
| Heartbeat schema with `files_planned` / `files_touched` arrays per session | Obj 4 reads `files_modified` from peer's TRD frontmatter (via `git show <branch>:.planning/.../*-TRD.md` + `extractFrontmatter`) | No live heartbeat in v1.1; peer scanner aggregates state from STATE.md + TRDs (obj 2 ship). Files come from TRD frontmatter, not runtime telemetry. |
| Module/class name match as a strong signal | NOT included in obj 4 v1.1 (only file-path + keyword) | Lexical signals limited to the 3 classes locked in CONTEXT.md decision #2. Module-name matching would require AST parsing — out of scope. |
| Choice recorded in BOTH sessions' heartbeats so the other dev sees "Mark hit a dup against you" | NOT included in obj 4 v1.1 (no cross-write) | No write to peer branches' state; resolution is single-sided. The shared visibility comes via the JSONL log + CONTEXT.md note that lives in the user's own objective dir. |

## Companion research

- `.planning/research/github-coordination-layer.md` — establishes the GH primitives (`resolveChain`, `requireGhAuth`) that obj 1 ships and obj 4 transitively consumes via obj 3.
- `.planning/research/cross-session-coordination.md` (this objective's primary research) — runtime layer design.

## Library / tool dependencies

No new external libraries. All implementation uses Node native modules (`fs`, `path`, `child_process` for `git show`) + existing devflow internal libs (`lib/awareness.cjs`, `lib/org-awareness.cjs`, `lib/gh.cjs`, `lib/frontmatter.cjs`, `lib/helpers.cjs`).

## Common pitfalls (extracted from research + obj 1+2+3 ship experience)

- **`git show <branch>:<path>` returns non-zero status when path absent on branch** — `_readPeerFilesModified` MUST handle missing files gracefully (peer's TRDs may not exist if planning hasn't happened). Mirror obj 2's `scanPeer` pattern: silent skip, no warning.
- **CommonJS `extractFrontmatter` returns parsed object directly** (NOT `{ frontmatter, body }`) — confirmed by obj 3's TRD 03-01 deviation; tests must use direct return.
- **JSONL append must be atomic-enough on macOS/Linux** — use `fs.appendFileSync` (atomic per write on POSIX). Concurrent dup-detect calls from parallel workflows are unlikely but possible; locked behavior: last-writer-wins is acceptable for v1.1 (no rotation, no compaction).
- **AskUserQuestion in the skill workflow must serialize options** — workflow markdown calls AskUserQuestion via the orchestrator (Claude Code), passing the 4 options as a single multi-choice question. Workflow text MUST follow the SKILL.md `AskUserQuestion(...)` pattern documented in `plan-objective.md` step 4 (already used for "You decide" / "Let me specify").
- **Plan-time `current_files_modified` may be EMPTY** when running for the first time on a fresh objective dir (no TRDs yet exist). Detection MUST handle empty array gracefully — keyword overlap is the only available signal in this case.
- **`scanOrgOverlap` returns `skipped: true` (not throws) when gh auth missing** — confirmed by obj 3 TRD 03-03 locked behavior. Obj 4 detection treats `skipped: true` as "no org signals available" + warning, NOT as an error.

## Anti-patterns to avoid

From `<tdd_playbook_directives>`:

- `no_llm_test_data` — Hand-built fixtures only. The new `buildPeerBranch` / `buildOrgOverlapMatch` / `buildDupDetectFixtures` factories live in `awareness-fixtures.cjs` (extending obj 2+3's file).
- `no_property_based_default` — Enumerated test cases. NO rapid/quickcheck/hypothesis.
- `no_gherkin_layer` — No `.feature` files. Descriptive `t.test('SC-N: ...')` names.

From CONTEXT.md decisions:

- NO new GitHub-side storage backend.
- NO daemon. Pull-only at plan/execute entry.
- NO LLM scoring. Lexical only.
- NO writes to peer branches. Resolution is single-sided.
