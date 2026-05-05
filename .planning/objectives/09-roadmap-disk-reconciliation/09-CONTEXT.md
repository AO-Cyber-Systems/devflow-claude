---
objective: 09-roadmap-disk-reconciliation
title: Roadmap ↔ disk reconciliation — sync ROADMAP.md checkbox state with on-disk SUMMARY.md presence
created: 2026-05-04
status: locked
tracks: AO-Cyber-Systems/devflow-claude#18
parent_issue: AO-Cyber-Systems/devflow-claude#9
github_repo: AO-Cyber-Systems/devflow-claude
---

# Objective 9 — Locked Context

This file captures user decisions that are **LOCKED** for the planner. Do not re-litigate. Do not propose alternatives. Implement exactly.

## Goal

`df:sync-roadmap` walks `ROADMAP.md` and reconciles its checkbox state against on-disk reality. Three rules drive the reconciliation:

- **summary_exists**: TRD listed in ROADMAP and `<TRD-id>-SUMMARY.md` exists on disk → `[x]`
- **summary_failed**: SUMMARY exists but contains `Self-Check: FAILED` → `[ ]` + ` (failed)` annotation
- **orphan_warning**: TRD listed in ROADMAP but no TRD file (`<TRD-id>-TRD.md`) on disk → leave `[ ]`, surface warning, never auto-delete

Plus an **objective-level rollup**: when ALL TRDs in an objective are `[x]`, the objective's `**Status:**` line is updated to `complete YYYY-MM-DD`, and (if present) the Progress table is updated similarly.

Eliminates the recurring chore of manually flipping `[ ]` → `[x]` after each TRD ships (a chore performed manually on every v1.1 objective so far).

## What's already built (the pieces obj 9 reuses)

Obj 9 is largely self-contained — it doesn't depend on the GH/awareness coordination layer. But it **reuses two well-established patterns**:

### Atomic tmp + rename write pattern

Used by obj 5 TRD 05-02 `_writeInitiativeFile` and obj 2 TRD 02-04 `writeCache`. Reference:

```js
// obj 5 — lib/initiatives.cjs::_writeInitiativeFile
const tmpPath = path.join(home, `.${slug}.md.${tmpSuffix}`);
_runFs.writeFileSync(tmpPath, content, 'utf-8');
try {
  _runFs.renameSync(tmpPath, dest);
} catch (e) {
  try { _runFs.unlinkSync(tmpPath); } catch {}
  throw e;
}
```

Mirror this for `_writeReconciledRoadmap`. Tmp file lives in same directory as dest (so rename is same-filesystem, atomic on POSIX).

### Test injection hook pattern (`_setRunFs` / `_resetMocks`)

Established across obj 2/3/4/5. Module declares `realFs` with bound methods, `_runFs = realFs` mutable, `_setRunFs(fn)` swap, `_resetMocks()` restores. All production fs reads/writes route through `_runFs.X()`. See `lib/initiatives.cjs:47-64`.

### TRD type discipline

Per TDD Playbook directives:

- **reconciler logic** (rule helpers, walker, atomic write) — `type: tdd`
- **CLI + skill plumbing** — `type: standard`
- **export lock + integration** — `type: tdd`

Anti-patterns: `no_llm_test_data` (use hand-built fixtures via `buildReconcileFixtures`), `no_property_based_default` (deterministic test cases), `no_gherkin_layer` (descriptive test names, not Given/When/Then).

## Locked decisions (from ROADMAP §"Objective 9" + planning context)

### 1. Walk + write default; --dry-run + --interactive flags

`df-tools sync-roadmap` defaults to **write mode** — when drift is detected, ROADMAP.md is rewritten without prompting. The two flags cover the cases where the user wants different behavior:

- `--dry-run` — emit diff (or structured changes JSON) to stdout, exit 0, write nothing
- `--interactive` — for each drift, prompt y/N via TTY readline; non-TTY environments fall back to write mode with a warning

### 2. Three reconciliation rules (locked names)

Internal helper names are LOCKED for SC-7 export surface:

| Rule kind | Helper | Behavior |
|-----------|--------|----------|
| `trd_summary_exists` | `_checkSummaryExists` | TRD has SUMMARY → mark `[x]` |
| `trd_summary_failed` | `_checkSummaryFailed` | SUMMARY contains `Self-Check: FAILED` → `[ ]` + `(failed)` |
| `trd_orphan_warning` | (in `_walkTrdLines`) | TRD listed but no TRD file → warning only |

Self-Check detection MUST handle two SUMMARY formats observed in this repo:
- `## Self-Check: PASSED` (single-line, locked-vocab)
- `## Self-Check` (section header, followed by per-rule body lines)

For PASSED: regex match `^## Self-Check:\s+PASSED` → not failed.
For FAILED: regex match `^## Self-Check:\s+FAILED` (single-line) OR section body containing `FAILED` token → failed.

### 3. Objective-level rollup (Status line + Progress table)

When ALL TRDs under `### Objective N: ...` are `[x]` (or `[x]` after reconcile):

- **Status line:** `**Status:** in flight` (or any non-complete state) → `**Status:** complete YYYY-MM-DD` (today's date in UTC)
- **Progress table:** if a markdown table exists with column "Objective" or row matching `Objective N`, update its status cell. Pattern detection: section starting with `## Progress` containing a `|` table. If absent, skip silently (table is OPTIONAL — this repo's ROADMAP.md doesn't have one currently).

Idempotency for rollup: if Status line already says `complete` (any date), no rewrite. If Progress table cell already says `complete`, no rewrite.

### 4. Single ROADMAP.md only

`<projectRoot>/.planning/ROADMAP.md`. No multi-repo. No nested ROADMAPs. (Cross-repo reconciliation is obj 6 territory in v1.1+.)

### 5. Atomic tmp + rename

`<projectRoot>/.planning/.ROADMAP.md.tmp.<pid>` written first, then `renameSync` to `ROADMAP.md`. On rename failure, unlink tmp (best-effort, ignore unlink errors). Mirror obj 5 TRD 05-02 pattern exactly.

### 6. Idempotent

Running `df-tools sync-roadmap` twice in a row → second run produces zero changes (`changes: []`). Test assertion: `assert.deepStrictEqual(secondRun.changes, [])`.

### 7. Read-only during plan/execute

`df-tools sync-roadmap` is invoked **manually** by the user OR as a **post-execute hook** (out of v1.1 scope; documented as future-extension hook in CONTEXT.md). Plan-objective and execute-objective workflows MUST NOT invoke `sync-roadmap` automatically — ROADMAP.md mutation during planning would race with the planner's own ROADMAP updates (`update_roadmap` step).

### 8. No GitHub side effects

Pure local file mutation. No `gh api` calls. No `requireGhAuth`. (GitHub state sync is obj 1's `df-tools gh sync` — separate command, separate concerns.)

## Out of scope (v1.1 — explicit)

- Cross-repo reconciliation (obj 6 territory)
- Auto-deletion of orphan TRDs (warn only — never delete user files)
- GitHub issue state sync (that's obj 1's `df-tools gh sync`)
- ROADMAP.md schema migration (assumes current format — v1.1 milestone with `### Objective N:` headers + `**Status:**` lines + `TRDs:` checkbox lists)
- Post-execute hook auto-invocation (manual-only in v1.1)
- Verification gap propagation (if a TRD's SUMMARY says FAILED, just annotate `(failed)`; don't trigger gap-closure planning)

## Module surface (locked by TRD 09-03 SC-7)

`lib/roadmap-reconcile.cjs` exports a 7-entry surface (asserted by EX1 deepStrictEqual test):

```js
module.exports = {
  // Public API
  reconcile,                    // main entry: { projectRoot, mode } → { changes, warnings }

  // Helpers (testable independently)
  _walkTrdLines,                // parse ROADMAP, return [{ objective_num, trd_id, line, checked, failed_annotation }]
  _checkSummaryExists,          // (objectiveDir, trdId) → boolean
  _checkSummaryFailed,          // (summaryPath) → boolean
  _writeReconciledRoadmap,      // (projectRoot, content) → atomic write
  _rollupObjectiveStatus,       // (lines, objectiveNum, allTrdsChecked) → updated lines

  // Test hooks
  _setRunFs,                    // inject fs mock
  _resetMocks,                  // restore real fs
};
```

Banner comment LOCKED format: `// ─── module.exports — LOCKED by TRD 09-03 (8-entry surface; SC-7)`.

## TRD breakdown

| TRD | Type | Wave | Tasks | SC |
|-----|------|------|-------|------|
| 09-01-reconciler-engine-and-fixtures-TRD | tdd | 1 | 3 | SC-1, SC-2, SC-3 |
| 09-02-objective-rollup-TRD | tdd | 2 | 2 | SC-4 |
| 09-03-cli-skill-and-integration-TRD | mixed (tdd + standard tasks) | 3 | 3 | SC-5, SC-6, SC-7, SC-8, SC-9, SC-10 |

**Wave structure:**

- **Wave 1** (09-01): pure-logic core. Reconciler engine, 3 rule helpers, atomic write, fixture builder. No CLI, no skill, no integration.
- **Wave 2** (09-02): objective-level rollup atop the engine. Adds `_rollupObjectiveStatus`. Modifies `reconcile` to call it after rule loop.
- **Wave 3** (09-03): CLI subcommand routing + skill thin-orchestrator + export-lock test + idempotency e2e + self-test against THIS repo's ROADMAP. Mixed-task TRD: tasks 1+2 are standard (CLI/skill), task 3 is tdd (export lock + e2e).

`lib/roadmap-reconcile.cjs` is serialized across all 3 waves — same pattern as obj 5 `initiatives.cjs`. Each wave adds a region; final wave locks `module.exports`.

## Test list approach (TDD Playbook habit 2)

Each TDD TRD includes a `## Test list` checklist before any test code is written. Reviewable artifact, prevents implementation-shaped tests.

## Fixtures (TDD Playbook habit 4)

Hand-built `buildReconcileFixtures(opts)` factory in `__fixtures__/awareness-fixtures.cjs` (extending the multi-objective fixture module — same module obj 2/3/4/5 added to). Returns a tmpdir tree:

```
<tmpdir>/
├── .planning/
│   ├── ROADMAP.md             ← input ROADMAP with mixed [ ]/[x]
│   └── objectives/
│       ├── 01-foo/
│       │   ├── 01-01-bar-TRD.md
│       │   ├── 01-01-bar-SUMMARY.md       ← exists
│       │   ├── 01-02-baz-TRD.md
│       │   └── (no 01-02-baz-SUMMARY.md)  ← missing
│       └── 02-quux/
│           ├── 02-01-foo-TRD.md
│           └── 02-01-foo-SUMMARY.md       ← contains Self-Check: FAILED
```

Fixture options: `{ objectives: [{ num, trds: [{ id, summary: 'present'|'missing'|'failed' }] }], status: 'in flight'|'complete' }`. Returns `{ projectRoot, cleanup }`.

## Anti-patterns to avoid

- **No LLM-generated test data.** Use `buildReconcileFixtures` factory with explicit options for happy path, missing-summary, failed-summary, orphan-trd, idempotency, rollup-trigger. Each test specifies the fixture shape it needs.
- **No property-based testing.** Reconciliation logic is small (3 rule kinds × ~5 cases each = ~15 deterministic test cases). Property-based adds ceremony without value here.
- **No Gherkin layer.** Test names like `'reconcile flips [ ] → [x] when SUMMARY exists'` are sufficient. Don't add Given/When/Then.
- **No regex-based YAML manipulation for the rollup section's Status line.** The Status line is plain markdown text (`**Status:** ...`); regex match-and-replace is appropriate here. Don't import a YAML parser.

## Self-test as final acceptance gate (SC-9)

After all 3 TRDs ship:

1. `df-tools sync-roadmap --dry-run` against this repo's `.planning/ROADMAP.md` → expect `changes: []` (we maintain it manually; zero drift is the baseline).
2. Manually `sed -i '' 's/\[x\] 02-01-state-md/\[ \] 02-01-state-md/' .planning/ROADMAP.md` (force fake breakage on a known-shipped TRD).
3. `df-tools sync-roadmap --dry-run` → expect `changes: [{ kind: 'trd_summary_exists', ... }]`.
4. `df-tools sync-roadmap` (write mode) → fix the drift on disk.
5. Re-run `--dry-run` → expect `changes: []` again. Idempotent.

This is the SC-9 acceptance gate. The fake-breakage workflow is documented in TRD 09-03's `<verification>` section.
