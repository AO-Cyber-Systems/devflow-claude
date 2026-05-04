---
objective: 02-cross-repo-awareness-layer
trd: 02-04
title: Cache layer — readCache + writeCache + isStale + .gitignore + config docs
type: tdd
confidence: high
wave: 2
depends_on: [02-01]
files_modified:
  - plugins/devflow/devflow/bin/lib/awareness.cjs
  - plugins/devflow/devflow/bin/lib/awareness.test.cjs
  - .gitignore
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements: [SC-7]
verification_commands:
  - "npm test -- --grep awareness"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/awareness.cjs\"); for (const k of [\"readCache\",\"writeCache\",\"isStale\"]) if (typeof a[k] !== \"function\") throw new Error(k); console.log(\"OK\");'"
  - "grep -q '\\.awareness-cache\\.json' .gitignore"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/awareness.cjs | grep -E '^[a-f0-9]+ test\\(02-04\\)' | head -1"
  - "git log --oneline feature/v1.1-obj-2-heartbeat -- plugins/devflow/devflow/bin/lib/awareness.cjs | grep -E '^[a-f0-9]+ feat\\(02-04\\)' | head -1"

must_haves:
  truths:
    - "readCache(cwd) returns null when .planning/.awareness-cache.json absent"
    - "readCache(cwd) returns null when JSON is malformed (does NOT throw)"
    - "readCache(cwd) returns parsed { peer?, org? } object on success; missing sections are simply absent (no defaulting)"
    - "writeCache(cwd, sections) writes the object as pretty JSON to .planning/.awareness-cache.json"
    - "writeCache merges into existing file (preserves the OTHER section): if file has both peer + org, writing only `{ peer: {...} }` keeps existing org; writing both replaces both"
    - "writeCache creates .planning/ directory if missing"
    - "isStale(fetched_at, ttl_minutes) returns true when fetched_at is null/undefined/invalid"
    - "isStale returns true when (now - fetched_at) > ttl_minutes * 60_000 ms"
    - "isStale returns false when fetched_at is within ttl_minutes window"
    - "isStale handles edge cases: ttl_minutes=0 → always stale; ttl_minutes=null/undefined → uses DEFAULT_TTL_MINUTES (10)"
    - ".gitignore includes the line `.planning/.awareness-cache.json`"
    - "templates/config.json documents the awareness.* config block (cache_ttl_minutes, peer_stale_days, branch_patterns, org_project_id)"
    - "Test list documented in TRD body BEFORE test code written (TDD Playbook habit 2)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      provides: "readCache, writeCache, isStale + extended module.exports."
      exports: ["readCache", "writeCache", "isStale", "parseStateMd", "aggregateOrgByProductQuarter", "DEFAULT_TTL_MINUTES", "DEFAULT_STALE_DAYS", "DEFAULT_BRANCH_PATTERNS", "AWARENESS_CACHE_REL"]
    - path: "plugins/devflow/devflow/bin/lib/awareness.test.cjs"
      provides: "Test groups for readCache, writeCache merge semantics, isStale TTL math."
      min_lines: 100
    - path: ".gitignore"
      provides: "Added line: .planning/.awareness-cache.json"
      contains: ".awareness-cache.json"
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "Documents awareness.* config block with comments / examples"
      contains: "awareness"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/awareness.cjs"
      to: "AWARENESS_CACHE_REL constant (TRD 02-01)"
      via: "internal import + path.join with cwd"
      pattern: "AWARENESS_CACHE_REL"
---

<objective>
Ship the cache layer for the awareness module: read/write/TTL helpers backed by `.planning/.awareness-cache.json` (gitignored). Two namespaced sections (`peer`, `org`) each with their own `fetched_at` timestamp. Independent TTLs.

Purpose: Locked decision #5 — single cache file, namespaced. Locked decision #2 — read-side aggregation (cache is the read-time short-circuit). The `--refresh peer` / `--refresh org` semantics (TRD 02-05's CLI flags) require that writing one section preserves the other. This TRD's `writeCache` enforces that contract.

Output: `readCache`, `writeCache`, `isStale` exported from `lib/awareness.cjs`; `.gitignore` updated; `templates/config.json` documents the awareness config block.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── awareness.cjs                          ← MODIFY  (add cache region; extend module.exports)
└── awareness.test.cjs                     ← MODIFY  (add Group C tests)

.gitignore                                 ← MODIFY  (add .awareness-cache.json line)
plugins/devflow/devflow/templates/
└── config.json                            ← MODIFY  (document awareness.* block)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing fs-based cache pattern in `lib/gh.cjs::readMapping`** (the closest analog):

```js
const MAPPING_REL = path.join('.planning', '.gh-mapping.json');

function readMapping(cwd) {
  const p = path.join(cwd, MAPPING_REL);
  if (!fs.existsSync(p)) return { milestone_id: null, objectives: {} };
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return { milestone_id: m.milestone_id || null, objectives: m.objectives || {} };
  } catch {
    return { milestone_id: null, objectives: {} };
  }
}

function writeMapping(cwd, mapping) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(cwd, MAPPING_REL), JSON.stringify(mapping, null, 2) + '\n');
}
```

Pattern: relative-path constant, sync fs ops, try/catch on JSON parse, mkdirSync with recursive:true on write. Match this style.

**Existing `templates/config.json`** — has top-level keys for `mode`, `depth`, `parallelization`, `gates`, `safety`, `github`. New `awareness` block goes alongside `github`:

```json
{
  "github": { "enabled": false, "repo": "owner/name", ... },
  "awareness": {
    "cache_ttl_minutes": 10,
    "peer_stale_days": 30,
    "branch_patterns": ["feature/*", "df/*", "fix/*", "proposal/*"],
    "org_project_id": "PVT_kwDODwqLrc4BRsOP"
  }
}
```

</codebase_examples>

<anti_patterns>

- **Do NOT throw on missing file or malformed JSON.** Return null. The skill renderer (TRD 02-05) handles "no cache yet" gracefully.
- **Do NOT overwrite the WHOLE file when writing one section.** `writeCache(cwd, { peer: ... })` MUST preserve `{ org: ... }` if it exists on disk. Locked semantics — TRD 02-05's `--refresh peer` test asserts this.
- **Do NOT depend on the cache file's git-tracked status.** The .gitignore line is THIS TRD's responsibility; tests should NOT git-add the cache file.
- **Do NOT use Date.parse without validation.** `isStale(undefined, 10)` must return true (defensive default). Don't `NaN > something` your way to a bug.
- **Do NOT add a config-validating function.** The values in `templates/config.json` are documentation/defaults; the cache layer reads them lazily via standard config loading. No validation here.

</anti_patterns>

<error_recovery>

- If `.planning/.awareness-cache.json` is corrupt mid-write (process crash), `readCache` next time returns null. Cache regenerates on next scan.
- If `writeCache` can't create the directory (permissions), throw — caller wraps in try/catch and falls back to no-cache mode.
- If `isStale` is called with a future timestamp (clock skew), treat as fresh (`now - future = negative`, less than ttl, returns false). Locked: don't try to detect skew — it's not worth the complexity.
- Per project memory `feedback_planner_proto_conflict`: this TRD modifies awareness.cjs WHICH IS ALSO touched by 02-01 (foundation, Wave 1, before this TRD's Wave 2). Wave sequencing prevents merge conflicts. Append below the TRD-02-01 region.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/templates/config.json
</context>

<gotchas>

- **AWARENESS_CACHE_REL** is defined in TRD 02-01's constants block. THIS TRD reuses it as `path.join(cwd, AWARENESS_CACHE_REL)`. Don't redefine.
- **Cache merge semantics**: `writeCache(cwd, { peer: X })` keeps existing `org` if present. `writeCache(cwd, { peer: X, org: Y })` replaces both. `writeCache(cwd, { peer: null })` is NOT a valid signal to delete — passing null in a section just sets section to null in the merged file (caller responsibility to NOT pass null unless they mean it).
- **Pretty-printed JSON with trailing newline**: match the rest of the codebase's writeMapping pattern. `JSON.stringify(obj, null, 2) + '\n'`.
- **.gitignore behavior**: project-root .gitignore. Match exact path: `.planning/.awareness-cache.json` (anchored at root). Tests verify with `grep -q`.

</gotchas>

## Test list

Per TDD Playbook habit 2. All cases enumerated BEFORE test code:

**Group C — readCache happy paths:**
1. C1: cache file absent → returns null
2. C2: cache file empty → returns null (JSON.parse fails on empty string)
3. C3: cache file contains valid `{ peer: {...} }` → returns object with peer section
4. C4: cache file contains both peer + org → returns object with both
5. C5: cache file contains malformed JSON → returns null (does not throw)

**Group W — writeCache merge semantics:**
6. W1: empty file + writeCache({peer:X}) → file contains {peer:X} only
7. W2: existing file {org:Y} + writeCache({peer:X}) → file contains BOTH peer:X AND org:Y (merge)
8. W3: existing file {peer:OLD, org:Y} + writeCache({peer:NEW}) → file contains peer:NEW + org:Y (peer overwritten, org preserved)
9. W4: existing file {peer:OLD, org:Y} + writeCache({peer:NEW, org:Y2}) → file contains peer:NEW + org:Y2 (both replaced)
10. W5: missing .planning/ directory → writeCache creates it
11. W6: writeCache produces pretty JSON with trailing newline (matches writeMapping format)

**Group I — isStale TTL math:**
12. I1: fetched_at=null → returns true
13. I2: fetched_at=undefined → returns true
14. I3: fetched_at='not-an-iso' → returns true
15. I4: fetched_at = (now - 5 minutes), ttl=10 → returns false
16. I5: fetched_at = (now - 11 minutes), ttl=10 → returns true
17. I6: fetched_at = (now - 1 minute), ttl=0 → returns true (zero TTL = always stale; locked)
18. I7: fetched_at = (now - 1 minute), ttl=undefined → uses DEFAULT_TTL_MINUTES (10) → returns false
19. I8: fetched_at = (now + 5 minutes) (future, clock skew) → returns false (treated as fresh)

**Group G — .gitignore line:**
20. G1: file `.gitignore` contains line matching `^\.planning/\.awareness-cache\.json$` (anchored)
21. G2: gitignore line does NOT inadvertently ignore other awareness files (`grep -c '.awareness-cache.json' .gitignore` === 1)

**Group T — templates/config.json documentation:**
22. T1: templates/config.json has top-level `awareness` key
23. T2: awareness block documents cache_ttl_minutes, peer_stale_days, branch_patterns, org_project_id with example values
24. T3: existing config blocks (mode, github, etc.) are preserved unchanged

Total: 23 enumerated cases. RED → GREEN one at a time per TDD Playbook habit 3.

<tasks>

<task type="auto">
  <name>Task 1: RED — failing tests for readCache, writeCache merge semantics, isStale, gitignore, config docs</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.test.cjs
  </files>
  <action>
Append section to test file:

```js
// ─── TRD 02-04: cache layer ───────────────────────────────────────────────
const { readCache, writeCache, isStale } = require('./awareness.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');
```

Implement Group C (5 tests), Group W (6 tests), Group I (8 tests), Group G (2 tests), Group T (3 tests) — 24 total cases (one duplicate enumerated; reduce to 23 distinct).

For Group C / W / I, use a tmp-dir helper:

```js
function tempCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-awareness-cache-'));
  return {
    cwd: dir,
    cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}
```

Group W tests need to set up an existing cache file BEFORE calling writeCache:
```js
test('W2: writeCache merges into existing file (preserves other section)', () => {
  const t = tempCwd();
  try {
    fs.mkdirSync(path.join(t.cwd, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'),
      JSON.stringify({ org: { items: ['existing'] } }, null, 2) + '\n');
    writeCache(t.cwd, { peer: { branches: ['new'] } });
    const after = JSON.parse(fs.readFileSync(path.join(t.cwd, '.planning', '.awareness-cache.json'), 'utf-8'));
    assert.ok(after.peer);
    assert.deepStrictEqual(after.peer.branches, ['new']);
    assert.ok(after.org); // preserved
    assert.deepStrictEqual(after.org.items, ['existing']);
  } finally { t.cleanup(); }
});
```

For Group I (TTL math), construct ISO timestamps from `Date.now()`:
```js
test('I4: isStale within window returns false', () => {
  const fivMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  assert.strictEqual(isStale(fivMinAgo, 10), false);
});
```

For Group G, test `.gitignore` content (read repo-root .gitignore):
```js
test('G1: .gitignore includes .awareness-cache.json line', () => {
  const gitignorePath = path.resolve(__dirname, '../../../../.gitignore');
  // Or: walk up from cwd until .gitignore found; whichever works in this repo's test layout
  if (!fs.existsSync(gitignorePath)) return; // skip if not at expected path
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  assert.match(content, /^\.planning\/\.awareness-cache\.json$/m);
});
```

For Group T, test templates/config.json:
```js
test('T1: templates/config.json has awareness block', () => {
  const cfgPath = path.resolve(__dirname, '../../../templates/config.json');
  if (!fs.existsSync(cfgPath)) return; // skip if path layout differs
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.ok(cfg.awareness, 'config.json missing awareness block');
  assert.strictEqual(typeof cfg.awareness.cache_ttl_minutes, 'number');
});
```

Commit RED:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "test(02-04): add failing tests for cache layer + gitignore + config docs" \
  --files plugins/devflow/devflow/bin/lib/awareness.test.cjs
```

# CRITICAL: Group W tests are the ones that catch the "preserve other section" merge contract. Don't water them down.
# GOTCHA: Tests run from repo root (npm test). Path-relative resolves should anchor on `__dirname` not `process.cwd()`.
# PATTERN: tmp-dir helper + try/finally cleanup mirrors gh.test.cjs's buildSyncTargetProject pattern.
  </action>
  <verify>
1. `npm test` shows 23 NEW failing tests (RED phase)
2. RED commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ test\(02-04\):'`
  </verify>
  <done>
Test file has all 23 enumerated cases. RED-phase commit landed.
  </done>
  <recovery>
If path-resolution to .gitignore or templates/config.json doesn't work in test context (different working dir), record the actual `__dirname` and adjust the relative path. Both files are at predictable locations: repo-root .gitignore and `plugins/devflow/devflow/templates/config.json`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement readCache, writeCache, isStale + update .gitignore + update templates/config.json</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness.cjs
    .gitignore
    plugins/devflow/devflow/templates/config.json
  </files>
  <action>
**Step A — Implement cache helpers in awareness.cjs:**

Append below TRD 02-01 region. Section divider:

```js
// ─── TRD 02-04: cache layer ───────────────────────────────────────────────

/**
 * Read the awareness cache file. Returns null on missing file or malformed JSON.
 * Never throws.
 */
function readCache(cwd) {
  const p = path.join(cwd, AWARENESS_CACHE_REL);
  if (!fs.existsSync(p)) return null;
  try {
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write awareness cache file with MERGE semantics: passing only `{ peer: X }`
 * preserves existing `org` section if present. Passing both replaces both.
 *
 * Locked semantic: writing { peer: NEW } where existing has { peer: OLD, org: Y }
 *   → result is { peer: NEW, org: Y }.
 */
function writeCache(cwd, sections) {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });

  // Read existing for merge
  const existing = readCache(cwd) || {};
  const merged = Object.assign({}, existing, sections || {});

  fs.writeFileSync(
    path.join(cwd, AWARENESS_CACHE_REL),
    JSON.stringify(merged, null, 2) + '\n'
  );
}

/**
 * Returns true when fetched_at is null/missing/invalid OR (now - fetched_at) > ttl ms.
 * - ttl_minutes=0 → always stale (locked)
 * - ttl_minutes=null/undefined → uses DEFAULT_TTL_MINUTES (10)
 * - fetched_at in future (clock skew) → returns false (treated as fresh)
 */
function isStale(fetched_at, ttl_minutes) {
  if (fetched_at == null) return true;
  if (typeof fetched_at !== 'string') return true;
  const ts = Date.parse(fetched_at);
  if (!Number.isFinite(ts)) return true;
  const ttl = (ttl_minutes != null) ? ttl_minutes : DEFAULT_TTL_MINUTES;
  if (ttl <= 0) return true;
  const age_ms = Date.now() - ts;
  if (age_ms < 0) return false; // future → fresh (clock skew tolerance)
  return age_ms > (ttl * 60_000);
}
```

Update module.exports — append to the existing block:

```js
module.exports = {
  parseStateMd,
  aggregateOrgByProductQuarter,
  readCache, writeCache, isStale,
  DEFAULT_TTL_MINUTES, DEFAULT_STALE_DAYS, DEFAULT_BRANCH_PATTERNS, AWARENESS_CACHE_REL,
};
```

**Step B — Update repo-root .gitignore:**

Read the existing .gitignore (DO NOT replace existing lines). Append a new line:

```
# Awareness cache (TRD 02-04 — generated by df-tools awareness scan-*)
.planning/.awareness-cache.json
```

If .gitignore already has the line, no-op. If .gitignore doesn't exist (unusual for this repo), create it with just these 2 lines.

**Step C — Update templates/config.json:**

Read the file. Add an `awareness` block at the top level (sibling to `github`):

```json
{
  "...existing...": "...",
  "github": { ... },
  "awareness": {
    "cache_ttl_minutes": 10,
    "peer_stale_days": 30,
    "branch_patterns": ["feature/*", "df/*", "fix/*", "proposal/*"],
    "org_project_id": "PVT_kwDODwqLrc4BRsOP"
  }
}
```

Use a JSON-aware edit (read, parse, set property, write back) to avoid breaking any existing keys. **Preserve all existing fields verbatim.**

Run `npm test`. All 23 Task-1 tests pass; no regressions.

Commit GREEN:
```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-04): implement awareness cache layer with merge semantics + gitignore + config docs" \
  --files plugins/devflow/devflow/bin/lib/awareness.cjs .gitignore plugins/devflow/devflow/templates/config.json
```

# CRITICAL: writeCache's merge semantics are the heart of the --refresh peer / --refresh org flag UX in TRD 02-05. Don't break the W2/W3 tests.
# GOTCHA: AWARENESS_CACHE_REL = path.join('.planning', '.awareness-cache.json'). Use it; don't hardcode a string.
# PATTERN: Cache helper signatures match readMapping/writeMapping from gh.cjs — both take cwd as first arg, return JSON-parseable shapes.
  </action>
  <verify>
1. `npm test` passes ALL Task-1 tests (23 new green checks)
2. No existing tests broken
3. GREEN commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-04\):'`
4. `.gitignore` contains the line: `grep -q '\.planning/\.awareness-cache\.json' .gitignore`
5. templates/config.json has awareness block: `node -e 'const c=JSON.parse(require("fs").readFileSync("plugins/devflow/devflow/templates/config.json","utf-8")); if(!c.awareness) throw new Error("no awareness block"); console.log("OK")'`
6. Existing config blocks preserved: `node -e 'const c=JSON.parse(require("fs").readFileSync("plugins/devflow/devflow/templates/config.json","utf-8")); if(!c.github) throw new Error("github block lost"); console.log("OK")'`
  </verify>
  <done>
Cache layer implemented. .gitignore + templates/config.json updated. All 23 Task-1 tests pass. GREEN commit landed via df-tools.cjs.
  </done>
  <recovery>
If templates/config.json has trailing JSON comments or non-JSON syntax (some configs use JSON5), parse with a permissive parser OR fall back to text-edit (insert the awareness block before the closing brace, with appropriate comma). Verify the file is still valid JSON after edit (`node -e 'JSON.parse(require("fs").readFileSync("plugins/devflow/devflow/templates/config.json","utf-8"))'`).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `lib/awareness.cjs` exports readCache, writeCache, isStale
2. `lib/awareness.test.cjs` includes 23 new tests, all passing
3. `.gitignore` contains the cache-file line (verifiable via `grep -q`)
4. `templates/config.json` documents the awareness.* block
5. Two atomic commits: `test(02-04):` + `feat(02-04):`
6. SC-7 covered: single cache file, namespaced peer + org sections with own fetched_at; merge semantics preserve unedited section
7. writeCache merge contract verified by tests W2/W3 (the --refresh peer/--refresh org flag UX prerequisite)
</verification>

<success_criteria>
- SC-7 fully met: cache file shape + TTL + merge semantics
- Foundation for TRD 02-05 (`--refresh peer` / `--refresh org` flags rely on writeCache merge)
- Foundation for TRD 02-06 (SessionStart hook reads cache via readCache + isStale)
- 2 atomic commits per TDD Playbook
- Test list (23 cases) implemented per TDD Playbook habit 2
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-04-cache-layer-SUMMARY.md`
</output>
