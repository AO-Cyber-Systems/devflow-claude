---
objective: 21-bidirectional-gh-sync
trd: 03
type: tdd
confidence: medium
wave: 2
depends_on: ["21-01", "21-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/conflict.cjs
  - plugins/devflow/devflow/bin/lib/conflict.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/conflict-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/gh-pull.cjs
autonomous: true
requirements:
  - CONFLICT-DETECT
  - CONFLICT-RESOLVE
  - CONFLICT-EXIT-NONZERO

must_haves:
  truths:
    - "When BOTH disk and GH changed since last sync, gh pull exits non-zero with a 3-way diff"
    - "Per-field conflict detection: disk vs GH vs last-known-sync; only fields where ALL THREE differ flag as conflicts"
    - "`gh pull --resolve=disk` keeps disk values + pushes them to GH"
    - "`gh pull --resolve=gh` overwrites disk with GH values"
    - "`gh pull --resolve=merge` requires user to manually edit then re-run with `--resolved`"
    - "3-way diff is human-readable terminal output (3 columns or 3-line stanza per field)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/conflict.cjs"
      provides: "detectConflict, formatThreeWayDiff, resolveDisk, resolveGh, resolveMerge"
      exports: ["detectConflict", "formatThreeWayDiff", "resolveDisk", "resolveGh", "resolveMerge"]
    - path: "plugins/devflow/devflow/bin/lib/conflict.test.cjs"
      provides: "tests covering 3-way diff cases + resolve flag paths"
      contains: "describe('detectConflict"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/conflict-fixtures.cjs"
      provides: "buildThreeWayScenario helpers"
  key_links:
    - from: "lib/gh-pull.cjs cmdGhPull"
      to: "lib/conflict.cjs detectConflict"
      via: "called when last_sync_state present + disk hash mismatch"
      pattern: "detectConflict\\("
    - from: "lib/gh-pull.cjs cmdGhPull"
      to: "lib/conflict.cjs resolveDisk / resolveGh / resolveMerge"
      via: "dispatched on --resolve= flag value"
      pattern: "args\\.find.*--resolve"
    - from: "lib/conflict.cjs resolveDisk"
      to: "lib/gh.cjs cmdGhSyncObjective (push)"
      via: "calls existing push path to upload disk state to GH"
      pattern: "cmdGhSyncObjective"
    - from: "lib/conflict.cjs resolveGh"
      to: "lib/gh-pull.cjs applyDrift"
      via: "calls existing apply path with conflict_suspected=false"
      pattern: "applyDrift"
---

<objective>
Layer real conflict resolution on top of TRD 21-01's drift detection. When both disk and GH changed since the last sync, surface a 3-way diff (disk | GH | last-sync) and require explicit user decision. Three resolution paths: keep disk (push), accept GH (pull-overwrite), manual merge.

Purpose: The "exits non-zero with hint" stub from TRD 21-01 (`conflict_suspected: true`) is a placeholder. Real conflict resolution detects per-field conflicts (not whole-record), formats human-readable diffs, and provides clean recovery paths for each resolution choice.

Output: New `lib/conflict.cjs` with pure-logic `detectConflict`, formatter, and 3 resolver functions. Refactor `cmdGhPull` to delegate conflict cases to `conflict.cjs`. New `--resolve=disk|gh|merge` and `--resolved` flags wired through.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── conflict.cjs                                                              ← CREATE
├── conflict.test.cjs                                                         ← CREATE
├── gh-pull.cjs                                                               ← MODIFY (replace conflict_suspected stub; wire --resolve flag)
└── __fixtures__/
    └── conflict-fixtures.cjs                                                 ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: pure-logic detection separated from IO orchestration (from `lib/gh-pull.cjs` `detectDrift`)**

```javascript
// detectDrift is pure logic — takes already-loaded inputs, returns descriptive object.
// IO (read disk, fetch GH, read sync-state) is the caller's responsibility.
// SAME PATTERN here for detectConflict.
function detectConflict({ disk_fm, gh_norm, last_sync, current_disk_hash }) { /* ... */ }
```

**Pattern: formatter separate from detector (from `lib/gh-pull.cjs` `formatDriftPretty`)**

```javascript
function formatDriftPretty(drift) {
  const lines = [];
  // ... build human-readable output ...
  return lines.join('\n');
}
// detectDrift returns data; formatDriftPretty turns data into a string.
// SAME PATTERN: detectConflict returns data; formatThreeWayDiff renders it.
```

**Pattern: dispatch on flag value (from `cmdGhPull` `--apply`)**

```javascript
const apply = args.includes('--apply');
const resolveFlag = args.find(a => a.startsWith('--resolve='));
const resolveValue = resolveFlag ? resolveFlag.split('=')[1] : null;
if (resolveValue && !['disk', 'gh', 'merge'].includes(resolveValue)) { /* error */ }
```

</codebase_examples>

<anti_patterns>

- ❌ **Auto-merge.** v1.2 NEVER auto-resolves conflicts. The `--resolve=` flag IS the user's decision. Without that flag, conflict path always exits non-zero.
- ❌ **Per-field auto-merge based on heuristics.** "Disk changed status, GH changed labels — merge both!" is a footgun. v1.2 scope: whole-record resolution. If user wants partial merge, they pick `--resolve=merge` and edit manually.
- ❌ **Re-fetching GH state inside conflict.cjs.** detectConflict is pure logic — caller passes already-fetched GH state. No `_runGh` calls in conflict.cjs.
- ❌ **Diff formatting that requires terminal width detection.** Stanza format (3 lines per field) works at any width. No tables, no colors required (color is nice-to-have via `process.stdout.isTTY` if cheap).
- ❌ **Burying the resolution choice.** `--resolved` after `--resolve=merge` is a deliberate two-step gate. Don't shortcut it with auto-detection of "did the file change since last call?"

</anti_patterns>

<error_recovery>

**Failure: --resolve=merge invoked but disk hash unchanged (user didn't edit)**
- Detected by re-reading disk frontmatter, computing current hash, comparing to the hash captured when conflict was first surfaced
- If hashes match → user didn't edit → exit 1 with: "OBJECTIVE.md unchanged since conflict was surfaced. Edit it, then re-run with --resolved."
- Stash the original-conflict-time hash where? **In sync state under a transient field** `pending_resolution_disk_hash`. Cleared when `--resolved` succeeds OR when next non-conflict pull runs.

**Failure: --resolve=disk push fails (GH offline)**
- `resolveDisk` calls `cmdGhSyncObjective` from `lib/gh.cjs`; if push fails, return `{ ok: false, error }`.
- Sync state is NOT updated on failure. User can re-run `--resolve=disk` after fixing connectivity.

**Failure: --resolve=gh apply fails (OBJECTIVE.md write permission denied)**
- `resolveGh` calls `applyDrift`; if it returns `{ ok: false, error }`, propagate.
- Sync state NOT updated on failure.

**Failure: 4+ fields conflict simultaneously**
- No special handling; format all of them. The stanza format scales — 4 fields = 12 lines of diff.

**Failure: --resolve= without `=` value (e.g., `--resolve disk` as separate args)**
- Strict `--resolve=` parsing only. `--resolve disk` (space) is rejected with hint: "Use --resolve=disk (with equals sign)."

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/21-bidirectional-gh-sync/OBJECTIVE.md
@.planning/objectives/21-bidirectional-gh-sync/21-CONTEXT.md
@.planning/objectives/21-bidirectional-gh-sync/21-RESEARCH.md
@.planning/objectives/21-bidirectional-gh-sync/21-01-gh-pull-cli-SUMMARY.md
@.planning/objectives/21-bidirectional-gh-sync/21-02-sync-state-tracking-SUMMARY.md
</context>

<research_context>

**Per-field conflict detection algorithm:**

For each field in TRACKED_FIELDS (status, labels, assignees, milestone):

```
diskVal = disk_fm[field]
ghVal   = gh_norm[field]
lastVal = last_sync[field equivalent]   // last_sync.label_set for labels; last_sync.status for status; etc.

case 1: diskVal == lastVal AND ghVal == lastVal     → no change anywhere; SKIP
case 2: diskVal != lastVal AND ghVal == lastVal     → DISK changed (no conflict; --apply harmless)
case 3: diskVal == lastVal AND ghVal != lastVal     → GH changed (no conflict; --apply harmless)
case 4: diskVal != lastVal AND ghVal != lastVal AND diskVal == ghVal   → both made the same change (no conflict)
case 5: diskVal != lastVal AND ghVal != lastVal AND diskVal != ghVal   → CONFLICT on this field
```

Only case 5 is a conflict. Cases 2, 3, 4 are non-conflicting drifts.

**Top-level conflict outcome:**

- `conflict: true` iff ANY field is in case 5
- `non_conflicting_fields: [...]` listing case-2, case-3, case-4 fields (these can apply unilaterally)
- `conflicting_fields: { field: { disk, gh, last } }` for case-5 fields

**3-way diff format (stanza):**

```
Conflict in objective 21-bidirectional-gh-sync (issue #NN):

  status:
    disk:  done
    gh:    in_progress
    last:  open

  labels:
    disk:  [devflow:objective, devflow:in-progress]
    gh:    [devflow:objective, devflow:done]
    last:  [devflow:objective]

Resolution:
  --resolve=disk    Push disk values to GH (overwrites GH state)
  --resolve=gh      Apply GH values to disk (overwrites disk state)
  --resolve=merge   Manually edit OBJECTIVE.md, then re-run with --resolved
```

**Resolver functions:**

- `resolveDisk({ projectRoot, objectiveId, issueRef })` → calls `cmdGhSyncObjective(cwd, objectiveId)` from `lib/gh.cjs` (single-objective push). Re-uses existing push surface; minimal new code.
- `resolveGh({ projectRoot, objectiveId, ghIssue, ... })` → calls `applyDrift` from `lib/gh-pull.cjs` with `conflict_suspected: false` (forced) since user accepted GH side. Then calls `recordSync`.
- `resolveMerge({ projectRoot, objectiveId, currentDiskHash, conflictTimeDiskHash })` → checks if user edited (hash differs); if not, exit 1; if yes, treat as "disk now wins" → call `recordSync` with current state, optionally call `cmdGhSyncObjective` to push merged state.

**Pending-resolution tracking:**

When conflict is FIRST surfaced, sync state gets a transient field:
```json
{ ..., "pending_resolution": { "disk_hash_at_conflict": "sha256:...", "surfaced_at": "ISO8601" } }
```

`--resolved` checks: current disk hash vs pending_resolution.disk_hash_at_conflict. If unchanged → exit 1. If changed → clear pending_resolution and proceed with merge resolution.

</research_context>

<gotchas>

- **last_sync schema includes ALL tracked fields** (per TRD 21-02 schema). detectConflict reads `last_sync.status`, `last_sync.label_set`, `last_sync.assignees`, `last_sync.milestone`. If any of these are missing in older sync state records, treat as "field never recorded" → fall back to disk value as the baseline (defensive: avoids false-positive conflicts on legacy records).
- **Cases 2/3/4 (non-conflicting drift) should still get `--apply`-able results.** detectDrift in TRD 21-01 already handles these; conflict.cjs ONLY adds case-5 detection on top.
- **detectConflict is pure logic.** No fs reads, no _runGh calls, no Date.now(). Test by passing fixed inputs.
- **Disk-hash-at-conflict-time** must be captured when conflict is FIRST detected, not when --resolved runs. Record it in sync state.
- **Resolution writes BOTH ways:** `--resolve=disk` updates sync state to mark "we pushed" (GH state now matches disk); `--resolve=gh` updates sync state to mark "we pulled" (disk state now matches GH). Both clear `pending_resolution`.

</gotchas>

<tasks>

<task type="auto" tdd="strict">
  <name>Task 1: Test list + fixtures + detectConflict + formatThreeWayDiff (D1-D8, F1-F3)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/conflict-fixtures.cjs, plugins/devflow/devflow/bin/lib/conflict.test.cjs, plugins/devflow/devflow/bin/lib/conflict.cjs</files>
  <action>
**Test list (top-of-file comment in `conflict.test.cjs`):**

```
// conflict.test.cjs — Test list
//
// detectConflict (D group):
//   D1: all fields unchanged (cases 1+1+1+1) → { conflict: false, conflicting_fields: {}, non_conflicting_fields: [] }
//   D2: disk changed labels, GH unchanged everything → { conflict: false, non_conflicting_fields: [labels] }
//   D3: GH changed status, disk unchanged everything → { conflict: false, non_conflicting_fields: [status] }
//   D4: both changed status to SAME value (case 4) → { conflict: false, non_conflicting_fields: [status] }
//   D5: disk and GH both changed status to DIFFERENT values (case 5) → { conflict: true, conflicting_fields: { status } }
//   D6: 2 conflicting fields (status + labels) + 1 disk-only field → conflict: true, conflicting_fields has 2 entries
//   D7: last_sync missing field (legacy record) → fallback to disk as baseline; field counted as non-conflicting drift
//   D8: arrays compared by sorted set semantics — labels [A,B] vs [B,A] → equal (no drift, no conflict)
//
// formatThreeWayDiff (F group):
//   F1: 1 conflict field → 3 indented lines under field header (disk:/gh:/last:)
//   F2: 0 conflict fields → returns string with no field stanzas (only header + resolution-options block)
//   F3: array values render as JSON arrays, not [object Object]
```

**Fixtures (`conflict-fixtures.cjs`):**

```javascript
'use strict';

function buildThreeWayScenario({
  disk = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null },
  gh   = { status: 'open', labels: ['devflow:objective'], assignees: [], milestone: null },
  last = { status: 'open', label_set: ['devflow:objective'], assignees: [], milestone: null },
} = {}) {
  return { disk_fm: disk, gh_norm: gh, last_sync: last };
}

module.exports = { buildThreeWayScenario };
```

**`conflict.cjs` — detectConflict:**

```javascript
'use strict';

const TRACKED_FIELDS = ['status', 'labels', 'assignees', 'milestone'];

// Map disk-fm field name → last_sync record field name
const LAST_SYNC_FIELD_MAP = {
  status: 'status',
  labels: 'label_set',          // last_sync uses label_set
  assignees: 'assignees',
  milestone: 'milestone',
};

function detectConflict({ disk_fm, gh_norm, last_sync }) {
  if (!last_sync) {
    // No baseline; can't detect conflict (TRD 21-01 first_sync path handles this)
    return { conflict: false, conflicting_fields: {}, non_conflicting_fields: [] };
  }

  const conflicting_fields = {};
  const non_conflicting_fields = [];

  for (const field of TRACKED_FIELDS) {
    const diskVal = disk_fm[field];
    const ghVal = gh_norm[field];
    const lastKey = LAST_SYNC_FIELD_MAP[field];
    const lastVal = (last_sync[lastKey] !== undefined) ? last_sync[lastKey] : disk_fm[field];  // D7: legacy fallback

    const diskEqLast = setsEqual(diskVal, lastVal);
    const ghEqLast = setsEqual(ghVal, lastVal);
    const diskEqGh = setsEqual(diskVal, ghVal);

    if (diskEqLast && ghEqLast) continue;          // case 1: nothing changed
    if (diskEqLast && !ghEqLast) {                 // case 3: GH only
      non_conflicting_fields.push(field);
      continue;
    }
    if (!diskEqLast && ghEqLast) {                 // case 2: disk only
      non_conflicting_fields.push(field);
      continue;
    }
    if (!diskEqLast && !ghEqLast && diskEqGh) {    // case 4: same change
      non_conflicting_fields.push(field);
      continue;
    }
    // case 5: real conflict
    conflicting_fields[field] = { disk: diskVal, gh: ghVal, last: lastVal };
  }

  return {
    conflict: Object.keys(conflicting_fields).length > 0,
    conflicting_fields,
    non_conflicting_fields,
  };
}

// Set-equality for arrays of primitives + strict-equal for scalars + null-safe
function setsEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort(), sb = [...b].sort();
    return sa.every((x, i) => x === sb[i]);
  }
  return false;
}

function formatThreeWayDiff({ objectiveId, issueRef, conflicting_fields }) {
  const lines = [];
  lines.push(`Conflict in objective ${objectiveId} (issue ${issueRef}):`);
  lines.push('');

  for (const [field, vals] of Object.entries(conflicting_fields)) {
    lines.push(`  ${field}:`);
    lines.push(`    disk:  ${JSON.stringify(vals.disk)}`);
    lines.push(`    gh:    ${JSON.stringify(vals.gh)}`);
    lines.push(`    last:  ${JSON.stringify(vals.last)}`);
    lines.push('');
  }

  lines.push('Resolution:');
  lines.push('  --resolve=disk    Push disk values to GH (overwrites GH state)');
  lines.push('  --resolve=gh      Apply GH values to disk (overwrites disk state)');
  lines.push('  --resolve=merge   Manually edit OBJECTIVE.md, then re-run with --resolved');

  return lines.join('\n');
}

module.exports = { detectConflict, formatThreeWayDiff, TRACKED_FIELDS };  // partial — task 2 adds resolvers
```

# CRITICAL: detectConflict is pure logic — NO fs, NO Date, NO _runGh. Test with hand-built fixtures.
# GOTCHA: D7 (legacy fallback) — when last_sync.label_set is undefined (older record from before TRD 21-02 was strict), treat lastVal as diskVal. This means we report "no drift" rather than "false conflict." Conservative + correct.
# GOTCHA: setsEqual sorts arrays before compare — labels are unordered. Tests verify D8.
# PATTERN: Same module shape as gh-pull.cjs — pure detection + separate formatter.
  </action>
  <verify>
```bash
node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs 2>&1 | grep -c "^ok"           # >=11 (D1-D8 + F1-F3)
node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs 2>&1 | grep -c "^not ok"       # 0
ls plugins/devflow/devflow/bin/lib/conflict.cjs
ls plugins/devflow/devflow/bin/lib/__fixtures__/conflict-fixtures.cjs
```
  </verify>
  <done>D1-D8, F1-F3 (11 tests) pass. `conflict.cjs` exports `detectConflict`, `formatThreeWayDiff`, `TRACKED_FIELDS`. ~22 atomic commits.</done>
  <recovery>If D8 fails: verify setsEqual sorts both arrays before .every. If D7 fails: verify the `(last_sync[lastKey] !== undefined)` guard returns disk value, not undefined.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 2: RED → GREEN — resolveDisk, resolveGh, resolveMerge resolver functions (R1-R6)</name>
  <files>plugins/devflow/devflow/bin/lib/conflict.cjs, plugins/devflow/devflow/bin/lib/conflict.test.cjs</files>
  <action>
**Test list (additional):**

```
// resolveDisk (R group):
//   R1: calls cmdGhSyncObjective from gh.cjs to push disk state; on success, recordSync + clear pending_resolution
//   R2: gh push fails → returns { ok: false, error }; sync state NOT updated
//
// resolveGh (R group):
//   R3: calls applyDrift from gh-pull.cjs to overwrite disk; on success, recordSync + clear pending_resolution
//   R4: applyDrift fails → returns { ok: false, error }; sync state NOT updated
//
// resolveMerge (R group):
//   R5: --resolved called when current disk hash == conflict-time disk hash → returns { ok: false, error: 'unchanged' }
//   R6: --resolved called when current disk hash != conflict-time disk hash → recordSync with new disk state; optionally push to GH
```

**Add to `conflict.cjs`:**

```javascript
const { recordSync, hashFrontmatter, getLastSync } = require('./sync-state.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');
const fs = require('fs');
const path = require('path');

/**
 * resolveDisk — user chose to keep disk values; push them to GH.
 * Re-uses cmdGhSyncObjective from lib/gh.cjs (singular push path).
 *
 * Inputs:
 *   - cwd, objectiveId, issueRef, ghIssue, currentDiskFm
 * Output: { ok, action: 'pushed', error? }
 */
function resolveDisk({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm }) {
  const { cmdGhSyncObjective } = require('./gh.cjs');

  // Push disk state via existing push path. cmdGhSyncObjective writes to gh + updates mapping + records sync.
  // We capture the result by intercepting via a dry-run flag... actually, cmdGhSyncObjective
  // doesn't accept that. Pragmatic: call it directly; if it doesn't throw, consider it success.
  // Wrap in try/catch to collect failure.
  try {
    cmdGhSyncObjective(cwd, objectiveId, false /* raw */);
    // Clear pending_resolution
    const last = getLastSync(cwd, objectiveId) || {};
    delete last.pending_resolution;
    recordSync(cwd, objectiveId, last);
    return { ok: true, action: 'pushed' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * resolveGh — user chose to accept GH values; overwrite disk.
 * Re-uses applyDrift from lib/gh-pull.cjs.
 */
function resolveGh({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm }) {
  const { applyDrift, normalizeGhIssue } = require('./gh-pull.cjs');

  // Build a synthetic "drift" object covering all conflicting + non-conflicting fields
  const ghNorm = normalizeGhIssue(ghIssue);
  const fields = {};
  for (const f of TRACKED_FIELDS) {
    if (currentDiskFm[f] !== ghNorm[f]) fields[f] = { disk: currentDiskFm[f], gh: ghNorm[f] };
  }
  const drift = { drift: true, fields, first_sync: false, conflict_suspected: false };

  const r = applyDrift({ projectRoot: cwd, objectiveId, drift, ghIssue, hasLastSync: true });
  if (!r.ok) return { ok: false, error: r.error };

  // applyDrift also calls recordSync (via TRD 21-02 wiring). Clear pending_resolution.
  const last = getLastSync(cwd, objectiveId) || {};
  delete last.pending_resolution;
  recordSync(cwd, objectiveId, last);

  return { ok: true, action: 'pulled', applied: r.applied };
}

/**
 * resolveMerge — user manually edited; verify hash changed and record.
 *
 * Inputs:
 *   - cwd, objectiveId, currentDiskFm
 * Output: { ok, action: 'merged' | 'unchanged', error? }
 */
function resolveMerge({ cwd, objectiveId, currentDiskFm }) {
  const last = getLastSync(cwd, objectiveId);
  if (!last || !last.pending_resolution) {
    return { ok: false, error: 'No pending conflict resolution. Run `df-tools gh pull <objective>` first to surface conflicts.' };
  }

  const conflictTimeHash = last.pending_resolution.disk_hash_at_conflict;
  const currentHash = hashFrontmatter(currentDiskFm);

  if (currentHash === conflictTimeHash) {
    return { ok: false, error: 'OBJECTIVE.md unchanged since conflict was surfaced. Edit it, then re-run with --resolved.' };
  }

  // User edited — record their merge as authoritative
  // Note: We do NOT auto-push to GH from here. User runs `df-tools gh sync <obj>` afterward if desired.
  const cleared = { ...last };
  delete cleared.pending_resolution;
  cleared.last_synced_disk_hash = currentHash;
  cleared.last_synced_at = new Date().toISOString();
  recordSync(cwd, objectiveId, cleared);

  return { ok: true, action: 'merged', message: 'Manual merge recorded. Run `df-tools gh sync <objective>` to push merged state to GitHub.' };
}

module.exports = { detectConflict, formatThreeWayDiff, resolveDisk, resolveGh, resolveMerge, TRACKED_FIELDS };
```

**Test pattern for R5 (unchanged disk):**

```javascript
test('R5: --resolved with unchanged disk hash returns unchanged error', () => {
  // Set up: project with sync state including pending_resolution.disk_hash_at_conflict = hash of current OBJECTIVE.md
  const fm = { status: 'open', labels: ['x'] };
  const project = fx.buildTempProjectWithObjective({ objectiveId: 'o1', frontmatter: fm });
  try {
    const ss = require('./sync-state.cjs');
    ss.recordSync(project.root, 'o1', {
      issue_ref: 'org/repo#1',
      gh_updated_at: '2026-01-01T00:00:00Z',
      label_set: ['x'],
      pending_resolution: { disk_hash_at_conflict: ss.hashFrontmatter(fm), surfaced_at: '2026-01-01T01:00:00Z' },
    });

    const conflict = require('./conflict.cjs');
    const r = conflict.resolveMerge({ cwd: project.root, objectiveId: 'o1', currentDiskFm: fm });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /unchanged/);
  } finally {
    project.cleanup();
  }
});
```

# CRITICAL: resolveDisk and resolveGh delegate to existing push/pull primitives. Don't duplicate gh-issue-edit logic here.
# GOTCHA: cmdGhSyncObjective (referenced from lib/gh.cjs) — TRD 21-01 may have introduced this; verify it exists. If not, use cmdGhSyncObjectives (plural) and let it process all objectives. Single-objective push path is preferred.
# GOTCHA: resolveMerge does NOT auto-push to GH. Manual merge means user is in control; they decide when to push. Output message tells them next step.
# PATTERN: Resolver functions return { ok, action, error? } — same shape as applyDrift.
  </action>
  <verify>
```bash
node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs 2>&1 | grep -c "^ok"           # >=17 (D8 + F3 + R6)
node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs 2>&1 | grep -c "^not ok"       # 0
```
  </verify>
  <done>R1-R6 pass. `conflict.cjs` exports `resolveDisk`, `resolveGh`, `resolveMerge`. ~12 atomic commits.</done>
  <recovery>If R1 fails because cmdGhSyncObjective doesn't exist: the function is referenced in df-tools.cjs case 'gh' subcommand 'sync' branch with single-objective signature. If it's not exported from lib/gh.cjs, add it to module.exports in a SEPARATE commit before the resolveDisk implementation. If R5 fails: ensure pending_resolution structure is `{ disk_hash_at_conflict, surfaced_at }` not nested differently.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 3: Wire conflict detection + --resolve flag into cmdGhPull (W1-W4)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pull.cjs, plugins/devflow/devflow/bin/lib/conflict.test.cjs</files>
  <action>
**Test list (additional W group — integration):**

```
// W1: cmdGhPull when last_sync exists AND disk hash differs AND GH changed → conflict path; exits 1; prints 3-way diff
// W2: cmdGhPull --resolve=disk on conflict → calls resolveDisk; exits 0 on success
// W3: cmdGhPull --resolve=gh on conflict → calls resolveGh; exits 0 on success
// W4: cmdGhPull --resolve=merge --resolved with unchanged disk → exits 1 with "unchanged" error
// W5: cmdGhPull --resolve=merge --resolved with edited disk → calls resolveMerge; exits 0
```

**Refactor `cmdGhPull` in `lib/gh-pull.cjs`:**

```javascript
function cmdGhPull(cwd, args, raw) {
  const objectiveId = args.find(a => !a.startsWith('--'));
  const apply = args.includes('--apply');
  const resolveFlag = args.find(a => a.startsWith('--resolve='));
  const resolveValue = resolveFlag ? resolveFlag.split('=')[1] : null;
  const resolved = args.includes('--resolved');

  // Validate --resolve value
  if (resolveValue && !['disk', 'gh', 'merge'].includes(resolveValue)) {
    output({ ok: false, error: `Invalid --resolve value: ${resolveValue}. Use disk, gh, or merge.` }, raw, '');
    process.exit(1);
    return;
  }
  // Reject `--resolve disk` (space-separated)
  if (args.includes('--resolve')) {
    output({ ok: false, error: 'Use --resolve=disk (with equals sign), not --resolve disk.' }, raw, '');
    process.exit(1);
    return;
  }

  // ... existing prelude (usage, auth, mapping, fetchGhIssue) ...

  // Read disk + sync state
  const disk_fm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
  const last_sync_state = getLastSync(cwd, objectiveId);

  // ── New: detect conflict before drift logic ──
  if (last_sync_state) {
    const currentDiskHash = hashFrontmatter(disk_fm);
    const diskChangedSinceLastSync = currentDiskHash !== last_sync_state.last_synced_disk_hash;
    const ghChangedSinceLastSync = ghIssue.updatedAt !== last_sync_state.gh_updated_at;

    if (diskChangedSinceLastSync && ghChangedSinceLastSync) {
      // Both sides changed — possible conflict. Run detector.
      const ghNorm = normalizeGhIssue(ghIssue);
      const conflict = detectConflict({ disk_fm, gh_norm: ghNorm, last_sync: last_sync_state });

      if (conflict.conflict) {
        // Real conflict on at least one field. Handle resolve flags.

        if (resolveValue === 'disk') {
          const r = resolveDisk({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm: disk_fm });
          if (!r.ok) { output({ ok: false, error: r.error }, raw, ''); process.exit(1); return; }
          output({ ok: true, action: 'pushed', resolution: 'disk' }, raw, 'Pushed disk state to GitHub.');
          return;
        }
        if (resolveValue === 'gh') {
          const r = resolveGh({ cwd, objectiveId, issueRef, ghIssue, currentDiskFm: disk_fm });
          if (!r.ok) { output({ ok: false, error: r.error }, raw, ''); process.exit(1); return; }
          output({ ok: true, action: 'pulled', resolution: 'gh', applied: r.applied }, raw, 'Applied GitHub state to disk.');
          return;
        }
        if (resolveValue === 'merge' && resolved) {
          const r = resolveMerge({ cwd, objectiveId, currentDiskFm: disk_fm });
          if (!r.ok) { output({ ok: false, error: r.error }, raw, ''); process.exit(1); return; }
          output({ ok: true, action: 'merged', resolution: 'merge', message: r.message }, raw, r.message);
          return;
        }
        if (resolveValue === 'merge' && !resolved) {
          // Capture conflict-time disk hash into sync state for later --resolved verification
          recordSync(cwd, objectiveId, {
            ...last_sync_state,
            pending_resolution: { disk_hash_at_conflict: currentDiskHash, surfaced_at: new Date().toISOString() },
          });
          output({ ok: false, error: 'Edit OBJECTIVE.md to merge changes, then re-run with --resolve=merge --resolved.' }, raw, formatThreeWayDiff({ objectiveId, issueRef, conflicting_fields: conflict.conflicting_fields }) + '\n\nNext: edit OBJECTIVE.md, then re-run with --resolve=merge --resolved.');
          process.exit(1);
          return;
        }

        // No --resolve flag → surface diff and exit 1
        recordSync(cwd, objectiveId, {
          ...last_sync_state,
          pending_resolution: { disk_hash_at_conflict: currentDiskHash, surfaced_at: new Date().toISOString() },
        });
        const diffStr = formatThreeWayDiff({ objectiveId, issueRef, conflicting_fields: conflict.conflicting_fields });
        process.stderr.write(diffStr + '\n');
        output({ ok: false, conflict: true, conflicting_fields: conflict.conflicting_fields, non_conflicting_fields: conflict.non_conflicting_fields }, raw, '');
        process.exit(1);
        return;
      }
    }
  }

  // ── Existing detectDrift path (no conflict) ──
  const drift = detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });
  // ... existing branches: no-drift / drift-without-apply / drift-with-apply ...
}
```

**Imports to add to `gh-pull.cjs`:**

```javascript
const { detectConflict, formatThreeWayDiff, resolveDisk, resolveGh, resolveMerge } = require('./conflict.cjs');
const { hashFrontmatter, getLastSync, recordSync } = require('./sync-state.cjs');
```

# CRITICAL: Conflict path runs BEFORE drift path. If conflict is detected, drift logic is skipped.
# GOTCHA: pending_resolution is recorded even when --resolve is absent — so subsequent `--resolve=merge --resolved` calls have the snapshot they need.
# GOTCHA: --resolve=merge WITHOUT --resolved is a different code path from --resolve=merge WITH --resolved. The first surfaces the conflict + records pending; the second commits the merge.
# PATTERN: All resolver paths exit 0 on success (ok: true) and 1 on failure (ok: false) — CI-friendly.
  </action>
  <verify>
```bash
# All conflict tests pass
node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs 2>&1 | grep -c "^ok"           # >=22 (D+F+R+W)
node --test plugins/devflow/devflow/bin/lib/conflict.test.cjs 2>&1 | grep -c "^not ok"       # 0

# TRD 21-01 + 21-02 tests still pass
node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs 2>&1 | grep -c "^not ok"        # 0
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^not ok"     # 0

# Full suite
npm test 2>&1 | tail -3                                                                       # 2053+ tests
```
  </verify>
  <done>W1-W5 (5+ tests) pass. `cmdGhPull` handles all 4 conflict paths: no-resolve (surface + exit 1), --resolve=disk (push), --resolve=gh (pull-overwrite), --resolve=merge --resolved (record manual merge). TRDs 21-01 and 21-02 tests still green. ~10 atomic commits.</done>
  <recovery>If TRD 21-01 D5 test fails after this refactor: the `conflict_suspected: true` stub in detectDrift is now superseded — that branch returns `false` always (TRD 21-01 anticipated this). Update D5 expectations or remove the assertion if TRD 21-01's test asserts the stub value. If wave ordering breaks: 21-03 must run AFTER 21-01 + 21-02 complete; if executor scheduler runs 21-03 too early, depends_on enforces ordering.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(none)</lint>
<build>(none)</build>
</validation_gates>

<verification>
1. **Files exist:** `lib/conflict.cjs`, `lib/conflict.test.cjs`, `lib/__fixtures__/conflict-fixtures.cjs`
2. **Per-field detection:** D1-D8 cover all 5 cases (1=unchanged, 2=disk-only, 3=gh-only, 4=same-change, 5=conflict)
3. **Resolvers wired:** R1-R6 confirm `resolveDisk` calls push, `resolveGh` calls applyDrift, `resolveMerge` checks hash change
4. **CLI flag dispatch:** W1-W5 confirm `--resolve=disk|gh|merge` plus `--resolved` reach their resolver functions
5. **Exit codes:** conflict without resolve → exit 1; successful resolve → exit 0
6. **Pending resolution lifecycle:** recorded on conflict surface; cleared on successful resolution
7. **Full suite:** `npm test` ≥ 2053 baseline + ~22 new conflict tests
</verification>

<success_criteria>
- [ ] Per-field 5-case conflict detection: pure logic, hand-built fixtures
- [ ] 3-way diff formatter: stanza format, no terminal-width assumptions
- [ ] `--resolve=disk` pushes disk state to GH via existing push path
- [ ] `--resolve=gh` overwrites disk via existing applyDrift
- [ ] `--resolve=merge --resolved` requires hash change vs conflict-time snapshot
- [ ] Pending resolution tracked in sync state; cleared on resolution
- [ ] `gh pull` (no flag) on conflict → exit 1 with diff + hint
- [ ] All 22+ tests passing; 2053 baseline still passing
</success_criteria>

<output>
After completion, create `.planning/objectives/21-bidirectional-gh-sync/21-03-conflict-resolution-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`.
</output>
