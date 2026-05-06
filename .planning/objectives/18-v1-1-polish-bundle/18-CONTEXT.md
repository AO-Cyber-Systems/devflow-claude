# Objective 18 — v1.1 polish bundle (CONTEXT)

**Milestone:** v1.2 (objective 9 within v1.2; numbered 18 globally)
**Branch:** `feature/v1.2-obj-9-polish-bundle`
**Tracks:** v1.1 leveraging-gap audit (Phase 3 of v1.2 ROADMAP §"Milestone v1.2")

## 1. Why This Objective Exists

v1.1 shipped 9 objectives. Several of those tools work correctly but require manual invocation:

| v1.1 surface | Auto-wired? | User must currently do |
|---|---|---|
| `df-tools sync-roadmap` (obj 9) | NO | Run `/devflow:sync-roadmap` manually after objective complete |
| `df-tools gh sync` (obj 1) | NO | Run `df-tools gh sync <id>` manually after objective complete |
| `df-tools check-todos` (obj 6) | NO | Run `/devflow:check-todos` manually each session |
| awareness peer-scan (obj 2) | partial — only `--refresh` flag exists | User has to know to look |
| OBJECTIVE.md scaffold (obj 1 backfill helper) | only obj 0 has it | All v1.1 objectives missing the GH-coordination frontmatter file |

These are pure shelf-ware until they are surfaced in the natural workflow. This objective closes that gap.

## 2. Locked Decisions

The following decisions are **locked** by the planning context provided to the planner. Do not revisit:

1. **OBJECTIVE.md auto-scaffold + backfill** — extend `lib/project-bootstrap.cjs` with a `bootstrapObjectiveMd(cwd, objectiveId)` helper that writes a minimal OBJECTIVE.md when one is missing for a given objective dir. Backfill runs once across `.planning/objectives/01..17` (anything missing OBJECTIVE.md) — produces idempotent stub files with `work` (inherited from PROJECT.md `default_work` or `feature` fallback) and a templated body. **No `github_issue` auto-population** — leave that to the user to fill in (or to `df-tools gh sync objectives` later). Files are written but NOT auto-committed; the user folds them into the next commit (mirrors `bootstrapProjectMd` pattern).
2. **sync-roadmap auto-run at objective complete** — `execute-objective.md` step `update_roadmap` (line 626) calls `df-tools sync-roadmap` BEFORE the final `df-tools commit` so any drift gets fixed in the same atomic commit. Failure is non-blocking: emit a warning and proceed.
3. **gh sync auto-run at objective complete** — same step also calls `df-tools gh sync <objective_id>` AFTER sync-roadmap. Skipped silently when OBJECTIVE.md frontmatter has no `github_issue` field. Failure is non-blocking: emit a warning and proceed (auth gates produce instructions to user but don't abort the objective-complete flow).
4. **check-todos surfacing in init output** — `init plan-objective` and `init execute-objective` emit a one-line advisory `"📋 N todos in Now lane (run /devflow:check-todos for details)"` when `df-tools check-todos --raw --lane now` returns ≥1 entry. Skipped silently when zero. Cache lookup only — no fresh fetch (uses existing `.planning/.check-todos-cache.json`).
5. **awareness one-line in init output** — same init commands emit `"⚠ N other branches active on peer scan"` when the existing `awareness_refresh` flag is true AND a cached peer scan reports ≥1 branch. Cache lookup only.
6. **Each side-effect is non-blocking** — Wrap in try/catch. On any failure: emit a brief warning to the JSON output (`warnings: [...]` field) but never crash init. The skill UI surfaces warnings as informational text; the planner/executor agents continue.

## 3. Out of Scope

- **Bidirectional GH sync** (deferred to v1.2 obj 12 per ROADMAP).
- **Auto-create GH issues** for backfilled OBJECTIVE.md files — `bootstrapObjectiveMd` does NOT call `gh issue create`. User runs `df-tools gh sync objectives` if they want issue creation. (The locked decisions explicitly say "scaffold + backfill," not "create issues.")
- **Awareness/check-todos full views** — the init output is one line each. The full views remain behind `/devflow:check-todos` and `df-tools awareness show` invocations.
- **Backfill verification (per-objective audit)** — backfill produces stubs; the user can edit them. We do NOT verify each backfilled file matches some canonical "true" state. Idempotency is the only contract.
- **OBJECTIVE.md backfill via auto-commit** — backfilled files are written to disk but not committed automatically. Mirrors `bootstrapProjectMd` (init.cjs line 162) behavior.

## 4. Discretion Areas

- **Exact wording of one-line previews** — planner picks language that matches existing init JSON conventions. Suggested:
  - check-todos: `📋 N todos in Now lane (run /devflow:check-todos)`
  - awareness: `⚠ N other branches active (run df-tools awareness show)`
- **Warning-collection shape in init JSON** — extend the existing `bootstrap` field pattern (see init.cjs lines 158-162) or add a new `advisories` field. Whichever the planner picks, document it in TRD must_haves.
- **Where the `objective_complete` hook lives in execute-objective.md** — the locked decision pins it to "step `update_roadmap`," but the planner can choose to add it inline OR route through a small helper script. Both are acceptable.

## 5. Test Posture

This is a `kind: plugin, work: feature` objective. Per defaults table: **TDD strict** — all logic gets tests first. Per CLAUDE.md TDD Playbook:

- **Test list first.** Each TDD TRD must include a checklist of behavior cases before any test code is written.
- **Fixture generators, not LLM-generated test data.** Reuse existing fixture builders in `lib/__fixtures__/` (e.g. `awareness-fixtures.cjs`, `check-todos-fixtures` if present).
- **Outside-in for end-to-end paths.** Where possible, write integration tests against the real `df-tools` CLI binary (spawnSync) to exercise the wiring; complement with unit tests on the helper modules.
- **No multitenancy assertion** — devflow-claude is single-tenant (no per-user data segregation in the plugin runtime).

## 6. Surfaces Touched

| File | Concern | TRD candidate |
|---|---|---|
| `plugins/devflow/devflow/bin/lib/project-bootstrap.cjs` | Add `bootstrapObjectiveMd` + backfill helper | 18-01 |
| `plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs` | Tests for above | 18-01 |
| `plugins/devflow/devflow/workflows/execute-objective.md` | Wire `sync-roadmap` + `gh sync` into `update_roadmap` step | 18-02 |
| `plugins/devflow/devflow/bin/lib/init.cjs` | Add `check-todos` + `awareness` one-line preview to `cmdInitPlanObjective` + `cmdInitExecuteObjective` | 18-03 |
| `plugins/devflow/devflow/bin/lib/init.test.cjs` (new) OR existing init test files | Tests for above | 18-03 |
| `.planning/objectives/01..17/OBJECTIVE.md` | Backfilled stubs (output of 18-01 task 2) | 18-01 |

## 7. Quality Gate (verification target)

- OBJECTIVE.md exists for objectives 0-17 (objective 0 already has one; 1-17 backfilled)
- `execute-objective` workflow `update_roadmap` step calls `df-tools sync-roadmap` and `df-tools gh sync` (both with non-blocking error handling)
- `init plan-objective` and `init execute-objective` JSON output includes a `check_todos_preview` field (one line) and an `awareness_preview` field (one line) when relevant data exists; both fields are absent or empty string when no data
- All 1832 pre-existing tests still pass (CONTEXT-internal contract: zero regressions)
- New test count: ≥10 across the 3 TRDs (per TDD posture)

## 8. Coordination

- Per memory `feedback_planner_proto_conflict`: the orchestrator should resequence the wave on shared file co-modification regardless of `depends_on=[]`. The 3 TRDs touch disjoint files (`project-bootstrap.cjs` vs `execute-objective.md` vs `init.cjs`), so a single wave is safe.
- Per memory `feedback_executor_smaller_commits`: each TRD's executor should commit at smaller natural-breakpoint increments (RED → GREEN → REFACTOR per feature, plus a `feat:` commit per backfilled objective if any verification runs are needed).

---
*Created: 2026-05-04 (planner via /df:plan-objective for v1.2 obj 9)*
