# Objective 21 — RESEARCH

Research findings supporting **Bidirectional GH sync + configurable defaults table**. Discovery level: **Level 1** (Quick Verification) — known libraries (`gh` CLI, fs, child_process), patterns established in objective 1. No new external dependencies.

## Standard stack (don't hand-roll)

| Concern | Use this | Why not hand-roll |
|--------|----------|-------------------|
| GitHub API access | `gh` CLI subprocess | Already used by `lib/gh.cjs`; auth + rate-limiting + token caching free; consistent with v1.1 |
| Subprocess invocation | `child_process.spawnSync` | Already used by `lib/gh.cjs` `runGh()`; sync is fine here (planning, not hot path) |
| Frontmatter parsing | `lib/frontmatter.cjs` `extractFrontmatter()` | Used everywhere in df-tools; tested |
| YAML in defaults-table.md | `lib/intent.cjs` `parseDefaultsYaml()` | Hand-tuned for the exact format; already loads tables |
| Atomic file writes | `fs.writeFileSync(path, content)` after `fs.writeFileSync(tmp, content) + fs.renameSync(tmp, path)` | Already pattern in `lib/global-config.cjs` (`atomicWrite`) — REUSE that |
| ETag handling | `gh` CLI `--jq` extraction from raw API responses | gh returns `ETag` header via `gh api --include` flag; parse from response |
| Diff display | Plain text 3-column view; no library | Diff is rendered for human eyes, not machine merge — terminal-printable suffices |

**Reuse `lib/global-config.cjs` `atomicWrite()` for `.gh-sync-state.json` writes.** It already implements `tmp + rename` pattern. Don't duplicate.

## Architecture patterns

### Pull command flow (TRD 21-01)

```
df-tools gh pull <objective>
   ↓
 readSyncState() — load .planning/.gh-sync-state.json
 readMappingV2() — get issue_ref for objective (already in lib/gh.cjs)
   ↓
 fetchGhIssue(issue_ref)
   - gh api repos/OWNER/REPO/issues/N --include  (captures ETag header)
   - parse JSON body + ETag
   ↓
 detectDrift({ disk_fm, gh_state, last_sync_state })
   - case 1: GH unchanged (etag matches) → no-op
   - case 2: GH changed, disk unchanged (last_synced_disk_hash matches) → drift
   - case 3: GH changed, disk also changed → conflict (defer to TRD 21-03)
   ↓
 if drift: print pretty diff (or apply if --apply); update sync state
 if conflict: exit non-zero with 3-column diff (handled by TRD 21-03)
```

### Sync state read/write flow (TRD 21-02)

```
readSyncState(projectRoot)        → returns { version, objectives: {...} } or default
writeSyncState(projectRoot, state) → atomicWrite to .planning/.gh-sync-state.json
                                     (mode 0o600 — contains issue refs, no secrets)
hashFrontmatter(fm)               → sha256 of canonicalized JSON of frontmatter dict
                                     (sort keys, drop _internal flags, normalize whitespace)
recordSync(projectRoot, objId, ghResponse, diskFm)
   - upsert objectives[objId] with etag, gh_updated_at, label_set, hash
   - called from BOTH push (gh sync) and pull (gh pull) paths
```

### Conflict detection (TRD 21-03)

```
detectConflict({ disk_fm, gh_state, last_sync_state }) →
  { conflict: bool, diff: {field: {disk, gh, last}}, resolution: null }

Conflict iff:
  - last_synced_disk_hash != hash(disk_fm)   ← disk changed since last sync
  AND
  - last_etag != gh_response.etag            ← GH changed since last sync

For each tracked field (status, labels, assignees, milestone):
  - if disk[field] != last[field]  AND  gh[field] == last[field]   → disk wins, no conflict
  - if gh[field] != last[field]    AND  disk[field] == last[field] → gh wins, no conflict
  - if both differ from last       AND  disk[field] != gh[field]  → CONFLICT on this field

3-way diff format:
  field=status
    disk:  in_progress
    gh:    closed
    last:  in_progress
```

### 3-tier defaults-table loader (TRD 21-04)

```
loadMergedDefaultsTable({ projectRoot, userHome }) →
  { table: { kind: { work: { ...fields } } },
    cellProvenance: { 'api.feature.tdd': 'project_table', ... } }

Algorithm:
  1. tables = []
     - if exists(projectRoot/.planning/defaults-table.md): tables.push(load(...), 'project_table')
     - if exists(userHome/.claude/devflow/defaults-table.md): tables.push(load(...), 'org_table')
     - tables.push(load(BUNDLED_PATH), 'bundled_table')
  2. Merge in REVERSE order (bundled first, then org overlays, then project overlays):
     For each tier (bundled → org → project):
       For each (kind, work) cell:
         For each field in cell:
           merged[kind][work][field] = value
           provenance[`${kind}.${work}.${field}`] = tier
  3. Return { merged, provenance }
```

This ensures a project file omitting `(api, prototype)` doesn't blank that cell — the bundled value flows through and provenance reports `bundled_table`.

### Per-cell provenance (TRD 21-05)

`intent.resolve()` already returns `provenance: { tdd: 'table', depth: 'table', ... }`. TRD 21-05 extends this with a parallel `cell_provenance` map produced by the 3-tier loader:

```
result.cell_provenance = {
  tdd:           'bundled_table',     // tier that supplied this cell value
  depth:         'project_table',
  model_profile: 'org_table',
  // ... one entry per field in ALL_FIELDS
}
```

When override layers (CLAUDE.md, OBJECTIVE.md, TRD frontmatter) override a field, the existing `provenance[field]` value (`user_playbook`, `objective_override`, `trd_override`) is what's reported. `cell_provenance` only reports the *table tier* origin — useful to answer "would my project's defaults-table have changed this if not for the override?"

## Common pitfalls

### GH `gh api` ETag extraction

- `gh api repos/OWNER/REPO/issues/N` returns body only by default. Use `--include` flag to also emit response headers, then parse `ETag: W/"..."` from the prefix.
- Or: GitHub returns a `node_id` and `updated_at` in the body; `updated_at` is sufficient for drift detection. **Prefer `updated_at`** — simpler, no header parsing, equally precise for our use case.
- Cassette fixtures should record both `body` and `headers.etag` so tests can opt into either path; document choice in TRD 21-01.

### Frontmatter hash determinism

- `hashFrontmatter()` MUST be deterministic across runs. JSON.stringify by default does NOT sort keys.
- Pattern: `hash(JSON.stringify(obj, Object.keys(obj).sort()))` — but recursively sort nested objects too.
- Use a tiny canonicalizer helper. Simple recursive sort suffices; the frontmatter is shallow.
- Drop `_objectiveId` and any leading-underscore internal keys before hashing.

### Atomic write race

- `atomicWrite()` from `lib/global-config.cjs` already handles tmp + rename. Verify it's exported; if not, copy the pattern.
- On macOS APFS rename is atomic across same-filesystem; do NOT rename across filesystems (tmp must be in same dir).

### Defaults-table loader cache invalidation

- `lib/intent.cjs` currently caches the bundled table in `_cachedTable` keyed by `tablePath === DEFAULTS_TABLE_PATH`.
- 3-tier loader cache key must factor projectRoot AND userHome; cache eviction needed when test fixtures swap files.
- Test pattern: tests already call `_resetCache()` between runs — extend that hook to clear merged cache too.

### `gh issue view` JSON shape

- `gh issue view N --json number,state,labels,assignees,milestone,updatedAt --repo OWNER/REPO` returns:
  ```json
  {
    "number": 9,
    "state": "OPEN",
    "labels": [{"name": "devflow:objective", "color": "..."}],
    "assignees": [{"login": "user"}],
    "milestone": {"title": "v1.2", "number": 1},
    "updatedAt": "2026-05-06T14:23:11Z"
  }
  ```
- Cassette captures should include all 6 fields. Drift detector reads only the 4 tracked fields.

### `gh` exit codes for "issue not found"

- `gh issue view 99999 --repo X/Y` exits with code 1 and stderr `Could not resolve to an Issue with the number of 99999`. Treat as "not synced yet" (return null, not error).

## Error recovery patterns

### gh pull fails because gh not authenticated

```javascript
try {
  requireGhAuth(['repo']);
} catch (e) {
  if (e.name === 'GhAuthError') {
    process.stderr.write(JSON.stringify({
      error: e.message,
      remediation: e.remediation,
    }, null, 2) + '\n');
    process.exit(1);
  }
  throw e;
}
```

(Same pattern as `cmdGhResolve` in `lib/gh.cjs`. REUSE.)

### gh pull when no .gh-mapping.json (objective never pushed)

- `cmdGhPull` should check `readMappingV2(cwd).objectives[objId]` first.
- If no mapping → exit non-zero with hint: "Objective NN has no GitHub issue. Run `df-tools gh sync-objectives` to create one before pulling."

### Defaults-table init when target file already exists

- `df-tools defaults-table init --scope=org` when `~/.claude/devflow/defaults-table.md` exists:
  - Default: refuse, exit 1, message "File exists. Use --force to overwrite."
  - With `--force`: backup existing to `<path>.bak.<timestamp>` first, then write.

### Conflict resolution: user runs `--resolve=merge` without editing

- `gh pull --resolve=merge` should not silently re-apply the conflict.
- If `--resolve=merge`, require a follow-up flag `--resolved` confirming the user has manually edited disk. Without `--resolved`, exit 1 with hint: "Edit OBJECTIVE.md to resolve conflicts, then re-run with --resolved."

## Library versions / API maturity

- **`gh` CLI** — already required by v1.1; documented at v2.40+ for `auth status` scope output. No new version requirements.
- **Node native test runner** — used throughout; no change.
- **`lib/global-config.cjs`** — atomic write helper exists; verify export at planning time.

## Anti-patterns observed in v1.1 to avoid

(From `lib/gh.cjs` review — these are patterns to **NOT** repeat:)

- ❌ **Mixing v1 and v2 mapping shapes in the same call site.** `gh.cjs` has `readMapping()` and `readMappingV2()` because the schema evolved. v2.1 (sync state) goes in a separate `lib/sync-state.cjs` file with a single, locked schema from day 1.
- ❌ **Module-level cassette loading at require time.** `PRODUCT_ROADMAP_FIELDS` is loaded eagerly in `lib/gh.cjs` — works but couples module load to disk state. New code: load cassettes inside the test setup, not at module load.
- ❌ **GraphQL strings as module-level constants.** Hard to read in diffs. New code: keep query strings inline at the call site or in a `*.queries.cjs` companion file if reused 3+ times.

## Pattern reuse map

| Need | Reuse from |
|------|-----------|
| `_setRunGh` test injection seam | `lib/gh.cjs` |
| `requireGhAuth` + `GhAuthError` | `lib/gh.cjs` |
| `extractFrontmatter` | `lib/frontmatter.cjs` |
| Cassette JSON storage | `lib/__fixtures__/gh-cassettes/*.json` |
| Mock runGh w/ exact + prefix matching | `lib/__fixtures__/gh-fixtures.cjs` `buildMockRunGh()` |
| Atomic file write | `lib/global-config.cjs` `atomicWrite()` |
| YAML parser for defaults table | `lib/intent.cjs` `parseDefaultsYaml()` (export it if not already) |
| Cache reset hook for tests | `lib/intent.cjs` `_resetCache()` pattern |
| Output JSON helper | `lib/helpers.cjs` `output(obj, raw, fallback)` |

## Confidence

**High** — all primitives exist. Pattern set is established. Risk is contained in two new behavioral surfaces (pull + conflict) and one structural change (3-tier loader). No novel research required.
