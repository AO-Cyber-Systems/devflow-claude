# Objective 18 — RESEARCH

**Discovery level:** L0 (skip) for the wiring; L1 (verify syntax) for the touched libraries. All work follows existing devflow-claude patterns confirmed by grep against the codebase. No new external dependencies.

## 1. Existing Patterns This Objective Mimics

### 1.1 `bootstrapProjectMd` → `bootstrapObjectiveMd` (TRD 18-01)

The **exact** pattern to mirror lives in `plugins/devflow/devflow/bin/lib/project-bootstrap.cjs`:

- **Idempotency contract:** Returns `{ applied: false, reason: 'already bootstrapped' }` on second invocation.
- **No auto-commit:** Writes to disk; user folds the change into next commit.
- **Return shape:** `{ applied: boolean, added_fields: string[], path: string|null, reason: string|null }`.
- **Failure modes:** Missing file → `applied: false, reason: 'no PROJECT.md'`. Missing remote → `'no git remote'`. Non-GitHub remote → `'remote URL not GitHub'`.

`bootstrapObjectiveMd(cwd, objectiveId)` follows the SAME shape:

- Reads `.planning/objectives/<id>/OBJECTIVE.md` — if present and has frontmatter, return `{ applied: false, reason: 'already exists' }` (idempotent).
- If absent, write a minimal stub:
  ```yaml
  ---
  work: feature  # inherits from PROJECT.md default_work; falls back to feature
  ---

  # <Objective Name from ROADMAP.md>

  ## Goal

  <One-sentence goal extracted from ROADMAP.md "### Objective N:" entry>

  ---
  *Created: <YYYY-MM-DD> (auto-scaffold via bootstrapObjectiveMd)*
  ```
- Read `.planning/PROJECT.md` frontmatter to get `default_work`. If absent, use `feature`.
- Read `.planning/ROADMAP.md` to find `### Objective N:` line and extract the trailing goal sentence (best-effort regex; on miss, use generic placeholder).
- Return `{ applied: true, added_fields: ['work'], path: <absolute path>, reason: null }`.

**Backfill helper** = a thin wrapper that walks `.planning/objectives/*/`, calls `bootstrapObjectiveMd` for each, returns `{ scanned: N, applied: M, skipped: K, errors: [] }`.

### 1.2 Non-blocking side-effect wrapping (TRD 18-02)

Pattern from `dup_detect_check` in execute-objective.md (lines 67-78):

```bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode execute "${OBJECTIVE_ARG}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  echo "Note: dup-detect skipped (...); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,...,"warnings":["dup-detect CLI failed"],...}'
fi
```

For 18-02 we apply the same shape to `sync-roadmap` and `gh sync`:

```bash
# Inside step name="update_roadmap", BEFORE the final commit:
SYNC_OK=true
node ~/.claude/devflow/bin/df-tools.cjs sync-roadmap 2>/dev/null || {
  echo "Note: sync-roadmap reconcile skipped (CLI failed); continuing."
  SYNC_OK=false
}

# gh sync — only when OBJECTIVE.md has github_issue
GH_ISSUE=$(grep -E '^github_issue:' ".planning/objectives/${OBJECTIVE_DIR}/OBJECTIVE.md" 2>/dev/null | head -1 | awk '{print $2}')
if [[ -n "$GH_ISSUE" ]]; then
  node ~/.claude/devflow/bin/df-tools.cjs gh sync "${OBJECTIVE_NUMBER}" 2>/dev/null || {
    echo "Note: gh sync skipped (CLI failed; check gh auth status); continuing."
  }
fi
```

This is workflow-text only — no new code in `df-tools.cjs`. Both CLIs already exist and have non-zero-on-error contracts.

### 1.3 init.cjs preview emission (TRD 18-03)

Pattern from `awareness_refresh` (init.cjs lines 26-33, 156, 263):

- Helper function `_awarenessLoadable()` returns boolean — guarded by try/catch around `require('./awareness.cjs')`.
- Set `result.awareness_refresh = _awarenessLoadable()` directly on the result object.

For 18-03 we add **two** advisory fields:

- `result.check_todos_preview` — string OR null. Populated by reading `.planning/.check-todos-cache.json`, counting `now` lane entries, formatting one line. Cache-only — never spawn `df-tools check-todos` from within init.
- `result.awareness_preview` — string OR null. Populated by reading `.planning/.awareness-cache.json`, counting branches in `peer.branches[]`, formatting one line. Cache-only.

Both fields are emitted from BOTH `cmdInitPlanObjective` and `cmdInitExecuteObjective`. Wrap in try/catch; on any error set field to null and push a warning to a `result.advisories_warnings: []` array (reuse the `bootstrap` field-shape pattern).

## 2. CLI Surfaces Already in Place

- `df-tools sync-roadmap [--dry-run] [--interactive]` — exists per TRD 09-03. Default mode writes ROADMAP.md atomically. Exit 0 on success, non-zero on failure.
- `df-tools gh sync <objectiveId>` — exists per TRD 01-04. Returns `{ ok: true, ... }` on success. Exit 1 on auth failure with structured remediation.
- `df-tools check-todos --raw [--lane now]` — exists per TRD 06-04. Cache-only when `--refresh` is absent. Returns `{ blocked, now, soon, ideas, warnings, cached }`.
- `df-tools awareness show [--refresh]` — exists per TRD 02-05+ (the `awareness_refresh` flag is already plumbed into init.cjs).

## 3. Cache File Locations

- `.planning/.check-todos-cache.json` — per-source granularity; each section has `fetched_at`. Stale TTL: 30 minutes (per `isCheckTodosCacheStale`).
- `.planning/.awareness-cache.json` — `{ peer: { branches: [...], fetched_at }, org: {...} }`. Stale TTL: 24 hours per `awareness.cjs::isStale`.

For the init preview we **do not respect TTL** — we display whatever's in cache (even if stale), because the user can always run the full skill to refresh. The advisory is a heads-up, not a guarantee of freshness.

## 4. Test Strategy

### 4.1 TDD test lists per TRD

**TRD 18-01 (`bootstrapObjectiveMd` + backfill):**

- O1 — bootstrapObjectiveMd: missing OBJECTIVE.md + valid PROJECT.md → `{ applied: true, added_fields: ['work'], reason: null }`
- O2 — bootstrapObjectiveMd: existing OBJECTIVE.md → `{ applied: false, reason: 'already exists' }` (idempotency)
- O3 — bootstrapObjectiveMd: missing PROJECT.md → uses `work: feature` fallback; still applies
- O4 — bootstrapObjectiveMd: PROJECT.md has `default_work: refactor` → stub uses `work: refactor`
- O5 — bootstrapObjectiveMd: missing objective dir entirely → `{ applied: false, reason: 'objective dir not found' }`
- O6 — bootstrapObjectiveMd: ROADMAP.md has `### Objective 5: Foo bar` → stub goal includes "Foo bar"
- O7 — bootstrapObjectiveMd: idempotent — second invocation is a no-op (no file mtime change)
- O8 — backfillAllObjectives: scans `.planning/objectives/*/`, calls bootstrapObjectiveMd per dir, returns `{ scanned, applied, skipped, errors }`
- O9 — backfillAllObjectives on this repo's planning dir → returns `applied: 17` (objs 1-17), `skipped: 1` (obj 0 already has)
- O10 — Integration: `bootstrapObjectiveMd` does NOT shell out to git, ROADMAP.md, or any CLI — pure file I/O

**TRD 18-02 (objective-complete auto-hooks):**

- W1 — execute-objective.md `update_roadmap` step contains `sync-roadmap` invocation BEFORE the final `commit`
- W2 — `update_roadmap` step contains `gh sync` invocation, gated on `github_issue` presence in OBJECTIVE.md
- W3 — Both invocations wrap in `|| { echo "Note: ..."; }` non-blocking pattern (workflow integration test via `grep`)
- W4 — Workflow text mentions both `sync-roadmap` and `gh sync` exit-code handling (regression guard against silent removal)

(Standard TRD; no library changes. Tests are workflow-text greps + a manual integration smoke test running `/devflow:execute-objective` against a fixture.)

**TRD 18-03 (init preview wiring):**

- I1 — cmdInitPlanObjective: `.check-todos-cache.json` with `now: [entry, entry]` → `result.check_todos_preview === '📋 2 todos in Now lane (run /devflow:check-todos)'`
- I2 — cmdInitPlanObjective: missing cache → `result.check_todos_preview === null`
- I3 — cmdInitPlanObjective: cache with `now: []` → `result.check_todos_preview === null` (only emit when ≥1)
- I4 — cmdInitPlanObjective: malformed cache JSON → `result.check_todos_preview === null`, `result.advisories_warnings` contains 1 entry
- I5 — cmdInitPlanObjective: `.awareness-cache.json` with `peer.branches: [b1, b2, b3]` → `result.awareness_preview === '⚠ 3 other branches active (run df-tools awareness show)'`
- I6 — cmdInitPlanObjective: missing awareness cache → `result.awareness_preview === null`
- I7 — cmdInitPlanObjective: peer scan with only the current branch → `result.awareness_preview === null` (filter out current branch)
- I8 — cmdInitExecuteObjective: same fields populated identically (DRY-ness check)
- I9 — Backwards-compat: existing init JSON consumers (skill scripts) tolerate the new field — JSON parses, no missing-field crashes
- I10 — Non-blocking: throwing fs.readFileSync inside the preview helper doesn't crash init — wraps in try/catch

## 5. Common Pitfalls (planner heads-up)

1. **OBJECTIVE.md scaffolding cannot read frontmatter from a file that has no frontmatter.** Use the `extractFrontmatter` helper from `lib/frontmatter.cjs` if you need to parse PROJECT.md `default_work` — don't reinvent.
2. **`gh sync` with no `github_issue` errors** with `objective has no github_issue` (gh.cjs line 1362). Skip this case in 18-02 by checking the field BEFORE invoking the CLI. Otherwise the warning fires unnecessarily.
3. **`sync-roadmap` write mode rewrites `ROADMAP.md` atomically.** This means the executor's final `git commit` MUST come AFTER `sync-roadmap` has finished writing. Do NOT call sync-roadmap inside a subshell that the commit can't see.
4. **Cache-only reads must not invalidate the cache.** Don't call `aggregate({ refresh: false })` inside init.cjs — that triggers a full fetch on cache miss. Read the JSON file directly (`fs.readFileSync` + `JSON.parse`) and check the lane.
5. **Backfill iteration order matters for testability.** Sort directory entries (`fs.readdirSync` is platform-dependent) so test assertions on the per-objective result don't flake on macOS vs Linux.
6. **Idempotency guarantee for backfill.** Running backfill twice in a row produces zero file writes on the second run. Test O7 enforces this.

## 6. Anti-patterns to avoid

- **Auto-creating GH issues during backfill.** Decision-locked: backfill creates STUBS only.
- **Embedding the preview string in a way that breaks JSON consumers.** `result.check_todos_preview` is a top-level field, not a substring of an existing field.
- **Spawning subprocesses inside init.cjs.** init must be fast (<200ms typical). All preview reads are pure JSON file lookups.
- **Modifying any pre-existing test that checks `init plan-objective` JSON shape.** Add new fields; never rename or delete existing keys.

## 7. Library Confidence

- `lib/project-bootstrap.cjs` — well-tested (`project-bootstrap.test.cjs` has 8+ scenarios). Extending with a parallel `bootstrapObjectiveMd` is mechanical.
- `lib/init.cjs` — already has the bootstrap-pattern hook; adding two more advisory fields is safe.
- `workflows/execute-objective.md` — text-only edit; 6 occurrences of similar non-blocking patterns confirm the shape.

**Net assessment:** confidence HIGH for all 3 TRDs. No external integrations, no novel patterns, all touched code paths are battle-tested.

---
*Authored by planner during /df:plan-objective execution for objective 18-v1-1-polish-bundle.*
