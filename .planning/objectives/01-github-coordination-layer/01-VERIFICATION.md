---
objective: 01-github-coordination-layer
status: passed
verified_at: 2026-05-04T00:00:00Z
verifier_model: sonnet
test_count: 563
score: 10/10 success criteria verified
re_verification: false
human_verification:
  - test: "Run df:gh-sync <objective> end-to-end against devflow-claude#10"
    expected: "Issue body rewritten, sticky comment upserted in-place (action: edited not created on second run), Project v2 Status + Quarter fields updated"
    why_human: "Requires live GH credentials and write access to verify idempotency diff is actually zero on second run. Automated tests mock runGh; real PATCH behavior needs human verification against GitHub UI."
---

# Objective 1: GitHub Coordination Layer — Verification Report

**Objective Goal:** Establish the GitHub coordination foundation that v1.1 objectives 2–6 depend on. Three components: (1) frontmatter convention; (2) resolver service walking objective→repo Roadmap→org Project; (3) df:gh-sync skill + lib/gh.cjs helpers pushing state. One-way disk→GitHub for v1.1.

**Verified:** 2026-05-04

**Status:** PASSED (with one human verification item and one noted deviation)

**Re-verification:** No — initial verification

---

## Test Suite

```
npm test: 559 pass / 4 skipped / 0 fail (563 total)
```

The 4 skipped tests are the `L1`–`L4` live integration tests in `gh.test.cjs`, correctly gated on `GH_INTEGRATION=1`. All other tests pass.

All 18 commits documented in TRD summaries verified in git history with correct TDD ordering (test: → feat: → docs: per TRD).

---

## SC-1: Template files document new optional frontmatter fields with examples; back-compat

**Status: PASS**

Evidence:
- `plugins/devflow/devflow/templates/project.md` — `github_repo` and `org_project` declared in frontmatter example with `# OPTIONAL` inline comments; prose at line 111–113 explains both fields.
- `plugins/devflow/devflow/templates/objective.md` — `github_issue`, `parent_issue`, `org_initiative`, `org_project` in frontmatter example with `# OPTIONAL` comments and examples at lines 32–43. Line 85 explicitly states: "All four fields are optional and back-compat — existing OBJECTIVE.md files without them parse and resolve cleanly."
- `plugins/devflow/devflow/templates/job-prompt.md` — per-TRD `github_issue` optional override documented at line 25 with a table row at line 179.
- `plugins/devflow/devflow/bin/lib/frontmatter.test.cjs` line 40: test `'extractFrontmatter — absence of new fields is silent'` asserts `github_issue`, `parent_issue`, `org_initiative`, `org_project` are all `undefined` (not thrown) for files that omit them.

Total frontmatter field mentions across the three templates: 18 (grep count).

---

## SC-2: df-tools gh resolve returns structured JSON with all required fields + provenance

**Status: PASS**

Live command output verified:

```
node plugins/devflow/devflow/bin/df-tools.cjs gh resolve 00-refine-defaults-table
```

Returns JSON containing all 8 required keys: `github_issue`, `parent_issue`, `org_initiative` (null), `org_project`, `roadmap_issue`, `milestone` (object with `draft_or_issue_ref`, `title`, `product`, `quarter`, `status`), `provenance` (per-field source map), `warnings` (array).

Provenance vocabulary verified in output: `frontmatter`, `walked_from_parent`, `absent`, `inherited_from_project`. All five vocabulary terms (`frontmatter`, `inherited_from_project`, `walked_from_parent`, `absent`, `cached`) are implemented in `gh.cjs` lines 380–465.

---

## SC-3: Resolver uses in-memory per-process cache; never persisted to disk

**Status: PASS**

Evidence in `plugins/devflow/devflow/bin/lib/gh.cjs`:
- Line 200: `let _cachedChains = new Map();` — module-level in-memory store.
- Line 201: `function _resetCache() { _cachedChains = new Map(); }` — test hook for isolation.
- Lines 380–381: cache hit returns early with `provenance.cached`.
- Line 465: `_cachedChains.set(cacheKey, result)` — populated after live resolve.
- No `writeFileSync` call touches `_cachedChains`. The only `writeFileSync` in `gh.cjs` is at line 931, inside `cmdGhSyncRelease` (release notes temp file), unrelated to the resolver cache.
- No `--refresh` flag exists in the CLI surface (confirmed by grep — absent).

---

## SC-4: /devflow:gh-sync skill + df-tools gh sync <objective> pushes issue body + sticky comment + Project v2 fields

**Status: PASS**

Evidence:
- `plugins/devflow/skills/gh-sync/SKILL.md` — updated skill covers four modes including `sync <objective>`. SKILL.md lines 14–20 document `sync <objective_id>` mode explicitly as "sync ONE objective: rewrite linked issue body to canonical form, upsert sticky state comment in-place, update Project v2 fields (Status, Quarter). Idempotent — safe to run repeatedly."
- `df-tools.cjs` lines 746–749: `'sync'` branch dispatches to `cmdGhSyncObjective(cwd, args[2], raw)`.
- `gh.cjs` line 1347: `syncObjective` return shape is `{ ok, issue_updated, comment_action, comment_id, project_fields_updated, chain, state, warnings }`.
- Line 1431–1434: `issue_updated`, `comment_action`, `project_fields_updated` are populated from live gh calls.
- `readObjectiveState` reads TRD total/done, wave, SUMMARY count, last commit from disk.

---

## SC-5: df:gh-sync is idempotent; sticky comment in-place via marker

**Status: PASS (automated; human spot-check recommended)**

Evidence in `gh.cjs`:
- Line 1028: `buildStickyComment` first line is exactly `<!-- df:state -->`.
- Line 1033: `lines.push('<!-- df:state -->')` — marker always prepended.
- Lines 1049–1073: `findStickyComment` searches all issue comments for a body starting with `<!-- df:state -->\n`.
- Lines 1075–1111: `upsertStickyComment` — 3-path logic: (1) known `state_comment_id` → PATCH; (2) marker found → PATCH by marker; (3) neither → POST (create). Comment ID persisted in `.planning/.gh-mapping.json` key `state_comment_id`.
- Line 1181: `addToProject` notes it is "idempotent — already_exists is OK".
- Issue body rewrite is unconditional (same input → same output → no diff on second run).

Human verification recommended: confirm second live `gh sync` run shows `action: edited` (not `action: created`) in the return JSON, and that GitHub shows the comment was last-edited (not a new comment).

---

## SC-6: lib/gh.cjs stable surface; all take parsed objects; room for sibling backends

**Status: PASS (with noted deviation on pm-backend wiring)**

`gh.cjs` `module.exports` (lines 1475–1511) exports exactly:

Existing (preserved): `ghStatus`, `cmdGhStatus`, `cmdGhSyncObjectives`, `cmdGhComment`, `cmdGhCloseIssue`, `cmdGhSyncRelease`

New from TRD 01-02: `resolveChain`, `findRoadmapIssue`, `addToProject`, `linkSubIssue`, `cmdGhResolve`

New from TRD 01-03: `requireGhAuth`, `GhAuthError`

New from TRD 01-04: `buildIssueBody`, `buildStickyComment`, `findStickyComment`, `upsertStickyComment`, `updateProjectFields`, `readObjectiveState`, `syncObjective`, `cmdGhSyncObjective`, `readMappingV2`, `writeMappingV2`, `PRODUCT_ROADMAP_FIELDS`

Test hooks: `_resetCache`, `_setRunGh`

All new functions take parsed objects (frontmatter dicts, project ctx objects, resolved refs) — no raw file paths.

`lib/pm-backend.cjs` (line 47): exports `{ getBackend, VALID_BACKENDS }`. `getBackend(projectConfig)` dispatches on `pm.backend` string, `case 'github'` returns `require('./gh.cjs')`. `VALID_BACKENDS = ['github']` with comment "v1.2+ extends: 'linear', 'jira'". Linear/Jira stubs throw with explicit v1.2 messaging.

**Deviation (as noted in task context):** No df-tools.cjs or gh.cjs call site currently imports from `pm-backend.cjs` — `getBackend` is structural scaffold only. The seam exists and is correct per CONTEXT.md §6 locked decision ("The seam exists so swapping in lib/linear.cjs or lib/jira.cjs later doesn't require a rewrite of call sites"). This is intentional v1.1 scope. SC-6 is PASSED with note: the surface is stable and parsable-objects-only; the pm-backend dispatcher is scaffold, not wired.

---

## SC-7: Frontmatter parsing supports full ref AND same-repo shorthand #N

**Status: PASS**

Evidence:
- `frontmatter.test.cjs` lines 30–37: test `'extractFrontmatter — OBJECTIVE.md shorthand parse'` covers both `parent_issue: "#9"` (quoted) and `parent_issue: #9` (unquoted YAML), asserting both yield the `#9` literal.
- `gh.test.cjs` lines 94–156: Group B (`resolveChain — shorthand`) has 4 tests:
  - B1: `parent_issue: #9` + valid `github_repo` → expanded to `AO-Cyber-Systems/devflow-claude#9`, provenance = `frontmatter`.
  - B2: `github_issue: #10` + valid `github_repo` → expanded full ref.
  - B3: shorthand + no `github_repo` → keeps literal `#9` + warning (no throw).
  - B4: shorthand + malformed `github_repo` → warning + literal kept.
- `gh.cjs` lines 207–235: `_resolveRef` function handles full-ref, shorthand, absent. Falls back to `git config remote.origin.url` when PROJECT.md `github_repo` is missing (line 444–446).

---

## SC-8: Auth/binary failures exit non-zero with exact remediation command

**Status: PASS**

Evidence:
- `gh.cjs` lines 83–98: `GhAuthError` class with `.remediation` field (runnable shell command, no placeholders).
- Lines 147–195: `requireGhAuth(requiredScopes)` throws `GhAuthError` for: missing binary (remediation: install URL), unauthenticated (remediation: `gh auth login`), missing single scope (remediation: `gh auth refresh -h github.com -s <scope>`), missing multiple scopes (remediation: comma-joined).
- Lines 573–594: `cmdGhResolve` and `syncObjective` catch `GhAuthError`, write `JSON.stringify({error, remediation})` to stderr, call `process.exit(1)`.
- `gh.test.cjs` lines 927–997: Group B (auth tests): B1 (missing binary), B2 (unauthenticated), B3 (single missing scope), B4 (multiple missing scopes) — all assert `e.name === 'GhAuthError'` and exact `e.remediation` strings.

---

## SC-9: Round-trip integration test gated on GH_INTEGRATION=1

**Status: PASS**

Evidence:
- `gh.test.cjs` line 2344: `const LIVE = process.env.GH_INTEGRATION === '1';`
- Lines 2346–2430: L1–L4 tests all declared with `{ skip: !LIVE }`:
  - L1: live `resolveChain` walks `devflow-claude#9` and returns `roadmap_issue` + `DevFlow` product.
  - L2: live result matches cassette shape.
  - L3: live sync round-trip returns `ok:true`.
  - L4: live sync is idempotent (second run `action: edited`, not `created`).
- `npm test` with default env: 4 skipped (these L tests). `npm test` with `GH_INTEGRATION=1`: 563 pass, 0 skipped (per CONTEXT claims — not independently verified here without live credentials).
- Cassette at `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json` contains valid GraphQL response with project item data for issue #9 at `data.repository.issue.projectItems.nodes[0].project.id == 'PVT_kwDODwqLrc4BRsOP'`.

---

## SC-10: Resolver + sync validated against THIS repo: chain leads to #20 → #9 → org Product Roadmap

**Status: PASS**

Live command output (`df-tools gh resolve 00-refine-defaults-table`):

```json
{
  "github_issue": "AO-Cyber-Systems/devflow-claude#20",
  "parent_issue": "AO-Cyber-Systems/devflow-claude#9",
  "roadmap_issue": "AO-Cyber-Systems/devflow-claude#9",
  "org_project": "PVT_kwDODwqLrc4BRsOP",
  "milestone": {
    "draft_or_issue_ref": "AO-Cyber-Systems/devflow-claude#9",
    "title": "Product Roadmap",
    "product": "DevFlow",
    "quarter": "Q2 2026",
    "status": "In Progress"
  }
}
```

Chain verified: `devflow-claude#20` → parent `devflow-claude#9` → org Product Roadmap project `PVT_kwDODwqLrc4BRsOP`. Provenance fields all correct (`frontmatter` for `github_issue` and `parent_issue`, `walked_from_parent` for `roadmap_issue` and `milestone`).

Obj 0 OBJECTIVE.md frontmatter backfilled at `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` lines 3–5:
```yaml
github_issue: AO-Cyber-Systems/devflow-claude#20
parent_issue: AO-Cyber-Systems/devflow-claude#9
org_project: PVT_kwDODwqLrc4BRsOP
```

`gh.test.cjs` test `H1 (01-06)` at line 2020 asserts this programmatically.

---

## Required Artifacts

| Artifact | Status | Notes |
| -------- | ------ | ----- |
| `plugins/devflow/devflow/templates/project.md` | VERIFIED | github_repo, org_project documented |
| `plugins/devflow/devflow/templates/objective.md` | VERIFIED | All 4 GH-link fields, back-compat stated |
| `plugins/devflow/devflow/templates/job-prompt.md` | VERIFIED | Per-TRD github_issue override documented |
| `plugins/devflow/devflow/bin/lib/frontmatter.test.cjs` | VERIFIED | 8 tests, back-compat + new fields |
| `plugins/devflow/devflow/bin/lib/gh.cjs` | VERIFIED | All 5 new functions + exports surface correct |
| `plugins/devflow/devflow/bin/lib/gh.test.cjs` | VERIFIED | 109 tests, groups A–L, L1-L4 gated |
| `plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs` | VERIFIED | Hand-built factory functions |
| `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/devflow-claude-9-walk.json` | VERIFIED | Live GraphQL capture, issue #9 project data present |
| `plugins/devflow/devflow/bin/lib/__fixtures__/gh-cassettes/product-roadmap-fields.json` | VERIFIED | 12 fields including Status, Product, Quarter |
| `plugins/devflow/devflow/bin/lib/pm-backend.cjs` | VERIFIED (scaffold) | getBackend + VALID_BACKENDS exported; call sites not wired (intentional v1.1 scope) |
| `plugins/devflow/devflow/bin/lib/pm-backend.test.cjs` | VERIFIED | 7 tests including default, explicit, and future-backend error cases |
| `plugins/devflow/skills/gh-sync/SKILL.md` | VERIFIED | 4 modes including `sync <objective>`, idempotency documented |
| `.planning/objectives/00-refine-defaults-table/OBJECTIVE.md` | VERIFIED | github_issue #20, parent_issue #9, org_project backfilled |
| `.planning/.gh-mapping.json` | VERIFIED | Contains `objectives.0.state_comment_id` (v2 shape via readMappingV2/writeMappingV2) |

---

## Anti-Patterns

No blockers or warnings found. Grepped all modified files for TODO/FIXME/PLACEHOLDER/return null/console.log stubs — none present in the new code surfaces.

`pm-backend.cjs` contains a `case 'linear': case 'jira':` stub that throws with a v1.2 message — this is intentional scaffolding, not a placeholder bug.

---

## Human Verification Required

### 1. Live gh sync idempotency

**Test:** Run `node plugins/devflow/devflow/bin/df-tools.cjs gh sync 00-refine-defaults-table` twice in sequence with valid GH credentials.

**Expected:** First run returns `comment_action: 'created'` or `'edited'`; second run returns `comment_action: 'edited'` (not `'created'`). GitHub issue #20 shows one sticky comment with `<!-- df:state -->` marker, not two.

**Why human:** Requires live GH write access. The automated test suite mocks `runGh` — the in-place PATCH path (`upsertStickyComment` path 1 and 2) is unit-tested but the actual GH API PATCH behavior is not verified without credentials.

---

## Noted Deviation

**pm-backend.cjs not wired at call sites (SC-6 — intentional):**

Per CONTEXT.md §6 (locked): "v1.1 ships lib/gh.cjs only. The seam in TRD 01-05 is scaffold-only." The executor correctly interpreted this as "seam exists; v1.2 wires it." No call site in `df-tools.cjs` or `gh.cjs` imports from `pm-backend.cjs` — both continue to `require('./gh.cjs')` directly. This is the explicitly locked v1.1 behavior. SC-6 is satisfied because the stable surface and structural seam exist; wiring call sites through `getBackend()` is v1.2 work.

---

_Verified: 2026-05-04_
_Verifier: Claude (df-verifier / sonnet)_
