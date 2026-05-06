---
objective: 21-bidirectional-gh-sync
trd: 02
type: tdd
confidence: high
wave: 2
depends_on: ["21-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/sync-state.cjs
  - plugins/devflow/devflow/bin/lib/sync-state.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/gh-pull.cjs
  - plugins/devflow/devflow/bin/lib/gh.cjs
autonomous: true
requirements:
  - SYNC-STATE-SCHEMA
  - SYNC-STATE-WIRING

must_haves:
  truths:
    - ".planning/.gh-sync-state.json records per-objective { etag, gh_updated_at, label_set, last_synced_at, last_synced_disk_hash }"
    - "Both gh sync (push) and gh pull (TRD 21-01) update sync state atomically after a successful operation"
    - "hashFrontmatter(fm) is deterministic across runs (sorted keys, recursive normalization)"
    - "atomicWrite ensures sync state file is never half-written if the process is killed mid-write"
    - "Sync state is consulted by detectDrift (TRD 21-01) and conflict detection (TRD 21-03)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/sync-state.cjs"
      provides: "readSyncState, writeSyncState, recordSync, hashFrontmatter, getLastSync, atomicWrite"
      exports: ["readSyncState", "writeSyncState", "recordSync", "hashFrontmatter", "getLastSync"]
    - path: "plugins/devflow/devflow/bin/lib/sync-state.test.cjs"
      provides: "tests covering schema, atomic write, hash determinism, push+pull integration"
      contains: "describe('sync-state"
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs"
      provides: "buildSyncStateRecord, buildTempProjectWithSyncState helpers"
  key_links:
    - from: "lib/gh-pull.cjs cmdGhPull"
      to: "lib/sync-state.cjs readSyncState + recordSync"
      via: "require — replaces _readSyncStateRaw stub from TRD 21-01"
      pattern: "require\\(['\"]\\./sync-state\\.cjs['\"]\\)"
    - from: "lib/gh.cjs cmdGhSyncObjective (push path)"
      to: "lib/sync-state.cjs recordSync"
      via: "call after successful gh issue create/edit"
      pattern: "recordSync\\(cwd"
    - from: "lib/sync-state.cjs writeSyncState"
      to: ".planning/.gh-sync-state.json"
      via: "atomicWrite (tmp + rename)"
      pattern: "fs\\.renameSync"
---

<objective>
Build the persistence layer that bidirectional sync depends on: a typed `.planning/.gh-sync-state.json` file recording the last-known-good GH state per objective. The file is the single source of truth for "what was on GH the last time we successfully synced" — needed by both pull (TRD 21-01) and conflict detection (TRD 21-03).

Purpose: Without sync state, detectDrift can't distinguish "GH changed" from "first time we've looked." Without sync state, conflict detection can't distinguish "disk changed since last sync" from "disk has always been this way." Sync state is the missing third leg of the 3-way diff.

Output: `lib/sync-state.cjs` with read/write helpers + atomic write + deterministic frontmatter hashing. Refactor TRD 21-01's `_readSyncStateRaw` stub to use the new module. Wire `recordSync` into both push (`gh sync-objectives`) and pull (`gh pull --apply`) success paths.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── sync-state.cjs                                                            ← CREATE
├── sync-state.test.cjs                                                       ← CREATE
├── gh-pull.cjs                                                               ← MODIFY (replace _readSyncStateRaw with readSyncState; wire recordSync)
├── gh.cjs                                                                    ← MODIFY (wire recordSync into push success path)
└── __fixtures__/
    └── sync-state-fixtures.cjs                                               ← CREATE
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: atomic write (from `lib/global-config.cjs`)**

```javascript
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);  // atomic on same filesystem
}
```

If `lib/global-config.cjs` doesn't export `atomicWrite`, copy this implementation into `sync-state.cjs`. Don't depend on a private helper — duplicate to keep the module self-contained.

**Pattern: deterministic hash (no existing example — build from scratch)**

```javascript
const crypto = require('crypto');

function hashFrontmatter(fm) {
  // Step 1: filter internal keys (leading underscore)
  const filtered = {};
  for (const [k, v] of Object.entries(fm)) {
    if (k.startsWith('_')) continue;
    filtered[k] = v;
  }

  // Step 2: canonicalize — recursive sorted-key JSON
  function canonical(v) {
    if (Array.isArray(v)) return v.map(canonical);  // arrays preserve order
    if (v !== null && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
      return out;
    }
    return v;
  }

  const canonStr = JSON.stringify(canonical(filtered));
  return 'sha256:' + crypto.createHash('sha256').update(canonStr).digest('hex');
}
```

**Pattern: schema versioning (from `.gh-mapping.json` migration in `lib/gh.cjs`)**

```javascript
// Read with schema version check; migrate v0 → v1 transparently on first read
function readSyncState(cwd) {
  const p = path.join(cwd, '.planning', '.gh-sync-state.json');
  if (!fs.existsSync(p)) return { version: 1, objectives: {} };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return { version: 1, objectives: {} }; }

  // Future migrations branch on parsed.version
  if (!parsed.version || parsed.version === 1) {
    return { version: 1, objectives: parsed.objectives || {} };
  }

  // Unknown version — defensive: treat as empty
  return { version: 1, objectives: {} };
}
```

</codebase_examples>

<anti_patterns>

- ❌ **Two mapping shapes coexisting (v1 and v2 in `lib/gh.cjs`).** Lock the schema at v1 from day 1. If we need to evolve, write an explicit migrator, not a parallel read path.
- ❌ **JSON.stringify without sorted keys.** Keys come out in insertion order, which is not deterministic across `extractFrontmatter` runs. ALWAYS canonicalize before hashing.
- ❌ **Synchronous fs.writeFileSync as "atomic enough".** Truncate-write is not atomic — process kill mid-write leaves a half-written file. Use tmp + rename.
- ❌ **Storing secrets in sync state.** ETag and updated_at are public; issue refs are public. Do NOT add tokens, auth headers, or anything else to this file. Sync state is committed-or-not at user discretion (default `.gitignore` later).
- ❌ **Mutating the in-memory state object before writing.** Always work on a deep clone — if the write fails, callers shouldn't see the half-mutated state.

</anti_patterns>

<error_recovery>

**Failure: .gh-sync-state.json corrupted (invalid JSON)**
- `readSyncState` catches `JSON.parse` exception, returns `{ version: 1, objectives: {} }` (empty default)
- Logs warning to stderr: `Warning: .gh-sync-state.json malformed; treating as empty.`
- Caller continues; first sync after this re-creates a clean file

**Failure: atomicWrite tmp file already exists**
- `tmp` filename includes `process.pid` + `Date.now()` — collision is statistically impossible
- If somehow it exists, `fs.writeFileSync` overwrites it; rename succeeds. Defensive try/unlink before rename if pre-existing tmp detected.

**Failure: hashFrontmatter on object with circular refs**
- `JSON.stringify` throws; catch and rethrow with: `hashFrontmatter: frontmatter contains circular reference`
- Frontmatter from `extractFrontmatter` is plain dict from YAML — no circular refs in practice. Defensive only.

**Failure: recordSync called for objective not in mapping**
- `recordSync(cwd, objId, ghResponse, diskFm)` doesn't validate against mapping; it just upserts the entry.
- This is intentional: sync state can record entries before mapping has them (e.g., if mapping was manually deleted). recordSync is dumb persistence.

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
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/global-config.cjs
</context>

<research_context>

**Sync state schema (locked at v1):**

```typescript
interface SyncState {
  version: 1;
  objectives: {
    [objectiveId: string]: {
      issue_ref: string;                 // 'owner/repo#NN'
      etag: string | null;               // ETag from gh response (optional; updated_at primary)
      gh_updated_at: string;             // ISO8601 from gh issue.updatedAt
      label_set: string[];               // labels at last sync
      assignees: string[];               // assignees at last sync
      milestone: string | null;          // milestone title at last sync
      status: string;                    // disk-shape status at last sync ('open' | 'done')
      last_synced_at: string;            // ISO8601 when WE wrote this record
      last_synced_disk_hash: string;     // sha256: prefix; hashes disk frontmatter at sync time
    };
  };
}
```

Why all 4 tracked fields (label_set, assignees, milestone, status) live in sync state: TRD 21-03 needs to compute "did GH change this field since last sync" — comparing GH-now vs GH-then-as-stored-in-sync-state. Without storing the field's value at sync time, we can only tell *something* changed (via updatedAt mismatch), not *which field*.

**Atomic write requirements:**
- Tmp file in same directory (cross-fs rename is non-atomic)
- Tmp filename includes pid + timestamp to avoid concurrent-process collision
- Rename via `fs.renameSync` (atomic on POSIX same-fs; atomic on macOS APFS)

**Hash canonicalization:**
- Strip `_objectiveId` and any `_*` keys
- Recursive sorted-key serialization
- Arrays preserve order (don't sort — order is semantic for `requirements: [A, B, C]`)
- Strings, numbers, nulls pass through

**Wiring points for `recordSync`:**

1. **Push path** (`lib/gh.cjs` `cmdGhSyncObjectives`): after a successful `gh issue create` or `gh issue edit`, fetch the now-current GH state (or use the response's `updatedAt`/`labels` if available) and call `recordSync`. **TRD 21-02 scope: minimal touch on gh.cjs — add a `recordSync` call where push currently writes the mapping.**

2. **Pull-apply path** (`lib/gh-pull.cjs` `cmdGhPull` with `--apply`): after a successful `applyDrift`, call `recordSync` with the GH state we just read.

3. **Pull report-only path** (`gh pull` without `--apply`): does NOT call `recordSync`. Sync state only records writes, not reads.

</research_context>

<gotchas>

- **`recordSync` MUST be called AFTER the disk write, not before.** If we record sync state first and the disk write fails, sync state lies. Sequence: write disk → write sync state. Either both succeed or sync state stays in old shape.
- **`recordSync` MUST clone the input record.** Mutating `state.objectives[objId]` and then writing fails callers who held a reference to the old state. Deep-clone via `JSON.parse(JSON.stringify(state))` before mutation.
- **`hashFrontmatter` of `{}` (empty dict) is well-defined** (`sha256:e3b0c...` — empty string hash). Test that case.
- **Schema migration not needed in v1.2.** v1 is locked; v2 is hypothetical. Don't write migration scaffolding before it's needed.
- **TRD 21-01 used `_readSyncStateRaw` as a stub.** Refactor that callsite in `gh-pull.cjs` Task 4 below to use `readSyncState` from this module. Do NOT delete the stub until TRD 21-02's tests pass.
- **`.planning/.gh-sync-state.json` should be `.gitignore`d by default.** Decision deferred — for now, leave commit-or-not to user discretion. If the user has it, treat existing entries as authoritative.

</gotchas>

<tasks>

<task type="auto" tdd="strict">
  <name>Task 1: Test list + sync-state-fixtures + RED → GREEN — schema + readSyncState + writeSyncState (S1-S6)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs, plugins/devflow/devflow/bin/lib/sync-state.test.cjs, plugins/devflow/devflow/bin/lib/sync-state.cjs</files>
  <action>
Per TDD playbook: test list first, fixtures task ahead of behavior tests.

**Test list (top-of-file comment in `sync-state.test.cjs`):**

```
// sync-state.test.cjs — Test list
//
// readSyncState (S group):
//   S1: file missing → returns { version: 1, objectives: {} }
//   S2: file present with v1 schema → returns parsed content
//   S3: file present with malformed JSON → returns empty default + warning to stderr
//   S4: file present with unknown version → returns empty default (defensive)
//
// writeSyncState (S group continued):
//   S5: writes { version: 1, objectives: {...} } via atomicWrite (tmp + rename)
//   S6: when .planning/ doesn't exist, creates it before write
//
// hashFrontmatter (H group):
//   H1: empty object → 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'  (well-known empty-string sha256)
//   H2: deterministic — same input across 100 calls returns same hash
//   H3: key order independence — { a: 1, b: 2 } and { b: 2, a: 1 } produce identical hashes
//   H4: nested key order independence — { x: { a: 1, b: 2 } } and { x: { b: 2, a: 1 } } match
//   H5: array order PRESERVED — { reqs: [A, B] } and { reqs: [B, A] } produce DIFFERENT hashes
//   H6: strips _-prefix keys — { a: 1, _objectiveId: 'foo' } and { a: 1 } match
//
// recordSync (R group):
//   R1: upserts a new objective entry; returns updated state
//   R2: overwrites existing entry without modifying other entries
//   R3: persists to disk via writeSyncState
//   R4: deep-clones input — caller's state object is unchanged
//
// getLastSync (G group):
//   G1: missing entry → null
//   G2: present entry → returns full record
```

**Fixtures (`sync-state-fixtures.cjs`):**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function buildSyncStateRecord({
  issue_ref = 'AO-Cyber-Systems/devflow-claude#10',
  etag = 'W/"abc123"',
  gh_updated_at = '2026-05-01T00:00:00Z',
  label_set = ['devflow:objective'],
  assignees = [],
  milestone = null,
  status = 'open',
  last_synced_at = '2026-05-01T00:00:00Z',
  last_synced_disk_hash = 'sha256:def456',
} = {}) {
  return { issue_ref, etag, gh_updated_at, label_set, assignees, milestone, status, last_synced_at, last_synced_disk_hash };
}

function buildSyncStateFile({ objectives = {} } = {}) {
  return JSON.stringify({ version: 1, objectives }, null, 2) + '\n';
}

function buildTempProjectWithSyncState({ syncState = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'df-syncstate-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  if (syncState !== null) {
    fs.writeFileSync(path.join(root, '.planning', '.gh-sync-state.json'), JSON.stringify(syncState, null, 2));
  }
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

module.exports = { buildSyncStateRecord, buildSyncStateFile, buildTempProjectWithSyncState };
```

**Implementation (`sync-state.cjs`)** — RED → GREEN cycle for S1-S6:

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readSyncState(cwd) {
  const p = path.join(cwd, '.planning', '.gh-sync-state.json');
  if (!fs.existsSync(p)) return { version: 1, objectives: {} };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    process.stderr.write(`Warning: .gh-sync-state.json malformed; treating as empty.\n`);
    return { version: 1, objectives: {} };
  }
  if (!parsed.version || parsed.version === 1) {
    return { version: 1, objectives: parsed.objectives || {} };
  }
  // Unknown version — defensive
  return { version: 1, objectives: {} };
}

function writeSyncState(cwd, state) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  const filePath = path.join(planningDir, '.gh-sync-state.json');
  const content = JSON.stringify({ version: 1, objectives: state.objectives || {} }, null, 2) + '\n';
  atomicWrite(filePath, content);
}

function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, filePath);
}

module.exports = { readSyncState, writeSyncState };  // partial — tasks 2 + 3 add more
```

# CRITICAL: writeSyncState ALWAYS sets `version: 1` in output, regardless of input. This makes the on-disk file forward-compatible: future migrators see v1 and migrate; if we accidentally wrote v2 from a future module, old readers wouldn't know.
# GOTCHA: process.stderr.write for "malformed" warning — DO NOT use console.warn (mixes with stdout in test runs).
# PATTERN: Same atomicWrite pattern as lib/global-config.cjs.
  </action>
  <verify>
```bash
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^ok"           # >=6 (S1-S6)
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^not ok"       # 0
ls plugins/devflow/devflow/bin/lib/sync-state.cjs                                              # exists
ls plugins/devflow/devflow/bin/lib/__fixtures__/sync-state-fixtures.cjs                        # exists
```
  </verify>
  <done>S1-S6 (6 tests) pass. `sync-state.cjs` exports `readSyncState`, `writeSyncState`. Fixtures committed. ~12 atomic commits (test:/feat: pairs).</done>
  <recovery>If atomicWrite test fails on macOS: check that tmp dir is the same dir as target (cross-fs rename non-atomic). If S3 (malformed JSON) test fails: check stderr capture pattern in tests — node test runner doesn't capture stderr by default; test by inspecting the returned object, NOT by capturing stderr.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 2: RED → GREEN — hashFrontmatter + recordSync + getLastSync (H1-H6, R1-R4, G1-G2)</name>
  <files>plugins/devflow/devflow/bin/lib/sync-state.cjs, plugins/devflow/devflow/bin/lib/sync-state.test.cjs</files>
  <action>
RED → GREEN for H1-H6, R1-R4, G1-G2 (12 tests).

**Add to `sync-state.cjs`:**

```javascript
function hashFrontmatter(fm) {
  if (fm == null || typeof fm !== 'object') {
    throw new Error('hashFrontmatter: input must be an object');
  }

  // Filter internal keys (_-prefix)
  const filtered = {};
  for (const [k, v] of Object.entries(fm)) {
    if (k.startsWith('_')) continue;
    filtered[k] = v;
  }

  // Recursive canonicalization: sort object keys; arrays preserve order
  function canonical(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(canonical);
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
      return out;
    }
    return v;
  }

  let canonStr;
  try {
    canonStr = JSON.stringify(canonical(filtered));
  } catch (e) {
    throw new Error(`hashFrontmatter: cannot serialize input — ${e.message}`);
  }

  return 'sha256:' + crypto.createHash('sha256').update(canonStr).digest('hex');
}

function recordSync(cwd, objectiveId, record) {
  // Read current state, deep-clone, mutate clone, write
  const current = readSyncState(cwd);
  const clone = JSON.parse(JSON.stringify(current));
  clone.objectives[objectiveId] = { ...record };
  writeSyncState(cwd, clone);
  return clone;
}

function getLastSync(cwd, objectiveId) {
  const state = readSyncState(cwd);
  return state.objectives[objectiveId] || null;
}

module.exports = { readSyncState, writeSyncState, recordSync, hashFrontmatter, getLastSync };
```

**Test pattern for H3 (key order independence):**

```javascript
test('H3: hash of { a: 1, b: 2 } equals hash of { b: 2, a: 1 }', () => {
  const h1 = ss.hashFrontmatter({ a: 1, b: 2 });
  const h2 = ss.hashFrontmatter({ b: 2, a: 1 });
  assert.strictEqual(h1, h2);
});
```

**Test pattern for R4 (deep clone):**

```javascript
test('R4: recordSync does not mutate caller state', () => {
  const project = fx.buildTempProjectWithSyncState({ syncState: { version: 1, objectives: { 'foo': { etag: 'old' } } } });
  try {
    ss.recordSync(project.root, 'foo', { etag: 'new' });
    const re_read = ss.readSyncState(project.root);
    assert.strictEqual(re_read.objectives.foo.etag, 'new');
    // The original object literal we passed isn't mutated; the on-disk version is the new one
  } finally {
    project.cleanup();
  }
});
```

# CRITICAL: hashFrontmatter MUST throw on null/non-object input. Don't silently return a known-empty hash — that masks bugs.
# GOTCHA: Object.keys() returns insertion order in V8, but the spec only guarantees that for string keys. We sort explicitly via Object.keys(v).sort() to guarantee determinism across JS engines.
# PATTERN: recordSync wraps readSyncState + writeSyncState. Other helpers MAY read or write directly; recordSync is the canonical "I just synced; record it" entry point.
  </action>
  <verify>
```bash
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^ok"           # >=18 (S1-S6 + H1-H6 + R1-R4 + G1-G2)
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^not ok"       # 0
# Determinism check (run hash 100 times via test):
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep "H2"               # ok H2
```
  </verify>
  <done>H1-H6, R1-R4, G1-G2 (12 tests) pass. `sync-state.cjs` exports the full surface: `readSyncState`, `writeSyncState`, `recordSync`, `hashFrontmatter`, `getLastSync`. ~24 atomic commits (test:/feat: pairs).</done>
  <recovery>If H3 fails: verify Object.keys is being .sort()ed (not relying on insertion order). If H5 fails: arrays should NOT be sorted — that's a feature, not a bug. If H6 fails: confirm the `if (k.startsWith('_'))` filter is reached.</recovery>
</task>

<task type="auto" tdd="strict">
  <name>Task 3: Wire recordSync into push (gh.cjs) + pull-apply (gh-pull.cjs); replace _readSyncStateRaw stub (W1-W3)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pull.cjs, plugins/devflow/devflow/bin/lib/gh.cjs, plugins/devflow/devflow/bin/lib/sync-state.test.cjs</files>
  <action>
RED → GREEN for integration tests:

```
// W1: cmdGhPull --apply success path writes a recordSync entry to .gh-sync-state.json
// W2: cmdGhSyncObjectives push success path writes a recordSync entry per objective
// W3: cmdGhPull no-drift path does NOT write a recordSync entry (only writes are recorded)
```

**Step 1 — Refactor `lib/gh-pull.cjs`** to use `sync-state.cjs`:

```diff
+ const { readSyncState, recordSync, hashFrontmatter, getLastSync } = require('./sync-state.cjs');
- function _readSyncStateRaw(cwd) { /* ... DELETE ... */ }

  function cmdGhPull(cwd, args, raw) {
    // ... existing prelude ...

-   const syncState = _readSyncStateRaw(cwd);
-   const last_sync_state = syncState.objectives[objectiveId] || null;
+   const last_sync_state = getLastSync(cwd, objectiveId);

    const drift = detectDrift({ disk_fm, gh_state: ghIssue, last_sync_state });

    // ... existing branching ...

    if (apply) {
      // ... existing apply branch ...

      const applyResult = applyDrift({ ... });
      if (!applyResult.ok) { /* error */ }

+     // After successful disk write, record new sync state
+     const ghNorm = normalizeGhIssue(ghIssue);
+     const updatedDiskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
+     recordSync(cwd, objectiveId, {
+       issue_ref: issueRef,
+       etag: null,
+       gh_updated_at: ghIssue.updatedAt,
+       label_set: ghNorm.labels,
+       assignees: ghNorm.assignees,
+       milestone: ghNorm.milestone,
+       status: ghNorm.status,
+       last_synced_at: new Date().toISOString(),
+       last_synced_disk_hash: hashFrontmatter(updatedDiskFm),
+     });

      output({ ok: true, drift: true, applied: applyResult.applied }, ...);
    }
  }
```

**Step 2 — Wire `recordSync` into push path in `lib/gh.cjs`** — find `cmdGhSyncObjectives` (line ~710) and add recordSync after writeMapping:

```diff
+ const { recordSync, hashFrontmatter } = require('./sync-state.cjs');

  function cmdGhSyncObjectives(cwd, raw) {
    // ... existing logic ...

    for (const obj of objectives) {
      // ... existing create/edit ...
    }

    writeMapping(cwd, mapping);

+   // Record sync state for each successfully synced objective
+   for (const item of result.objectives) {
+     if (item.action === 'created' || item.action === 'updated') {
+       const objPath = path.join(cwd, '.planning', 'objectives', findObjectiveDir(cwd, item.number), 'OBJECTIVE.md');
+       if (!fs.existsSync(objPath)) continue;
+       const diskFm = extractFrontmatter(fs.readFileSync(objPath, 'utf-8')) || {};
+       const issueRef = `${repo}#${item.issue}`;
+       recordSync(cwd, item.number, {
+         issue_ref: issueRef,
+         etag: null,
+         gh_updated_at: new Date().toISOString(),  // approximate; we just wrote
+         label_set: [baseLabel],                    // we just applied this label
+         assignees: [],                             // push doesn't set assignees
+         milestone: milestoneTitle,
+         status: 'open',                            // push creates as open
+         last_synced_at: new Date().toISOString(),
+         last_synced_disk_hash: hashFrontmatter(diskFm),
+       });
+     }
+   }

    output(result, raw, '');
  }

+ function findObjectiveDir(cwd, objectiveNumber) {
+   // Best-effort: list .planning/objectives/, find dir starting with the number
+   const objDir = path.join(cwd, '.planning', 'objectives');
+   if (!fs.existsSync(objDir)) return null;
+   const padded = String(objectiveNumber).padStart(2, '0');
+   for (const entry of fs.readdirSync(objDir)) {
+     if (entry.startsWith(padded + '-') || entry === padded) return entry;
+   }
+   return null;
+ }
```

**Step 3 — Add W1-W3 integration tests to `sync-state.test.cjs`:**

```javascript
describe('integration with gh-pull (W group)', () => {
  test('W1: cmdGhPull --apply success writes recordSync entry', () => {
    // Set up: temp project with OBJECTIVE.md, .gh-mapping.json, no sync-state yet
    // Mock _runGh to return objective-closed-on-gh cassette
    // Run cmdGhPull(cwd, [objectiveId, '--apply'], false)
    // Assert: readSyncState(cwd).objectives[objId] is populated with gh_updated_at = cassette's updatedAt
  });

  test('W3: cmdGhPull no-drift does NOT write recordSync', () => {
    // Set up: existing sync-state matching cassette's updatedAt
    // Mock _runGh to return objective-open-no-drift cassette
    // Run cmdGhPull(cwd, [objectiveId], false)  // no --apply, but also no drift
    // Assert: readSyncState mtime unchanged (or content byte-identical)
  });
});

describe('integration with gh-push (W group)', () => {
  test('W2: cmdGhSyncObjectives push success writes recordSync entry', () => {
    // Set up: temp project with ROADMAP.md, OBJECTIVE.md, no sync-state
    // Mock _runGh to return successful issue create
    // Run cmdGhSyncObjectives(cwd, false)
    // Assert: readSyncState(cwd).objectives['1'] is populated
  });
});
```

# CRITICAL: hash MUST be re-computed AFTER applyDrift writes (the disk frontmatter changed). last_synced_disk_hash is the hash of the file POST-write, so subsequent pulls can detect "did anything change since this sync".
# GOTCHA: `findObjectiveDir` is best-effort because `.gh-mapping.json` keys by objective number (e.g., '1') but objective dirs use slugs ('01-github-coordination-layer'). Existing code already has this fuzz; document the heuristic.
# GOTCHA: TRD 21-01's tests were written against `_readSyncStateRaw`. After this refactor, those tests should still pass because `getLastSync(cwd, objId)` returns the same shape (`null` or the record). Re-run TRD 21-01 tests to confirm; if they break, the refactor isn't shape-preserving.
# PATTERN: All sync state IO goes through sync-state.cjs from this point forward. gh-pull.cjs and gh.cjs both import it.
  </action>
  <verify>
```bash
# All sync-state tests pass
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^ok"           # >=21 (S+H+R+G+W = 6+6+4+2+3 = 21)
node --test plugins/devflow/devflow/bin/lib/sync-state.test.cjs 2>&1 | grep -c "^not ok"       # 0

# TRD 21-01 tests still pass (the refactor is shape-preserving)
node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs 2>&1 | grep -c "^not ok"          # 0

# Full suite still passes
npm test 2>&1 | tail -3                                                                        # 2053+ tests, +21 new

# _readSyncStateRaw is gone
grep "_readSyncStateRaw" plugins/devflow/devflow/bin/lib/gh-pull.cjs                           # no match (removed)
```
  </verify>
  <done>W1-W3 integration tests pass. `gh-pull.cjs` `_readSyncStateRaw` stub removed; uses `sync-state.cjs` exclusively. `gh.cjs` `cmdGhSyncObjectives` calls `recordSync` after each successful issue create/edit. TRD 21-01 tests still green (shape preserved). Full suite green. ~6 atomic commits (test:/feat: pairs for W1-W3 plus refactor commits).</done>
  <recovery>If TRD 21-01 tests break after refactor: the issue is `getLastSync` returning a different shape than `_readSyncStateRaw`'s output. Verify both return `null` for missing entries (not `undefined`); verify both return the record object (not the entire state) for present entries. If push integration test (W2) fails: check that `findObjectiveDir` correctly maps objective number → dir name; the mapping uses fuzzy prefix match.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<lint>(none)</lint>
<build>(none)</build>
</validation_gates>

<verification>
1. **Files exist:** `lib/sync-state.cjs`, `lib/sync-state.test.cjs`, `lib/__fixtures__/sync-state-fixtures.cjs`
2. **Schema locked at v1:** `readSyncState` always returns `{ version: 1, objectives: {...} }`; `writeSyncState` always emits `version: 1`
3. **Atomic write verified:** test S5 confirms tmp + rename pattern (file appears atomically; no partial-write window)
4. **Hash determinism:** H1-H6 cover empty input, repeat calls, key order, nested keys, array ordering, internal-key stripping
5. **Wiring verified:** W1-W3 confirm recordSync is called from both push and pull-apply paths; not from pull-noop
6. **TRD 21-01 still green:** all 19 tests from gh-pull.test.cjs still pass after refactor
7. **Full suite:** `npm test` passes ≥2053 baseline + ~21 new sync-state tests
8. **Atomic commits:** ~36 commits total across 3 tasks
</verification>

<success_criteria>
- [ ] `.planning/.gh-sync-state.json` schema v1 implemented; `readSyncState` + `writeSyncState` exported
- [ ] `hashFrontmatter` deterministic across runs, key-order independent, array-order preserving, strips _-keys
- [ ] `recordSync` wired into both `cmdGhSyncObjectives` (push) and `cmdGhPull --apply` (pull) success paths
- [ ] TRD 21-01's `_readSyncStateRaw` stub removed; `getLastSync` is the canonical reader
- [ ] Atomic write: tmp + rename pattern, never half-written file
- [ ] All 21+ tests passing; 2053 baseline tests still passing
</success_criteria>

<output>
After completion, create `.planning/objectives/21-bidirectional-gh-sync/21-02-sync-state-tracking-SUMMARY.md` per `@/Users/markemerson/.claude/devflow/templates/summary.md`.
</output>
