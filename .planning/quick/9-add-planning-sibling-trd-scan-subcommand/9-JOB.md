---
mode: quick
id: 9-add-planning-sibling-trd-scan-subcommand
title: Add `df-tools planning sibling-trd-scan` subcommand for cross-repo TRD discovery
type: tdd
tasks: 3
context_target: ~30%
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
must_haves:
  observable_truths:
    - "`df-tools planning sibling-trd-scan 18 --raw` against a project with a configured sibling that has `.planning/objectives/018-*/018-*-TRD.md` returns JSON listing each TRD with its files_modified, objective, trd, confidence, supersedes, and prerequisite_for fields."
    - "Numeric prefix matching is leading-zero tolerant: `objective_id=\"18\"` matches `018-foo` and `objective_id=\"018\"` matches `018-foo`."
    - "When no sibling repos are configured, the command returns `{ ok: true, scanned: 0, matches: [], warnings: [\"no sibling repos configured\"] }`."
    - "Malformed TRD frontmatter does NOT crash the scan; the file is skipped with a warning, valid sibling TRDs are still returned."
    - "`scanSiblings` and `_discoverSiblings` behavior is unchanged (no regression in the existing ~50 org-awareness tests)."
  artifacts:
    - "plugins/devflow/devflow/bin/lib/org-awareness.cjs — new exported `scanSiblingTrds` function (~50–80 LOC) added alongside `scanSiblings`; `module.exports` block extended to export it."
    - "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs — 7 new test cases (test-list-first per CLAUDE.md TDD Playbook habit 2)."
    - "plugins/devflow/devflow/bin/df-tools.cjs — new `case 'planning':` arm routing `sibling-trd-scan` (~5–10 LOC); usage string at line 229 amended to mention `planning`."
  key_links:
    - "`scanSiblingTrds` reuses `_discoverSiblings({ cwd, config_paths })` (does not duplicate sibling-discovery logic)."
    - "`scanSiblingTrds` reuses the `_runFs` injection pattern (`_runFs.readdirSync`, `_runFs.readFileSync`, `_runFs.existsSync`) — production code never calls `fs.X` directly. Tests inject mocks via `_setRunFs`."
    - "`scanSiblingTrds` reuses `extractFrontmatter` from `lib/frontmatter.cjs` for YAML parsing of TRD files (already imported at top of org-awareness.cjs)."
    - "df-tools.cjs `planning` case dispatches via the `output()` helper from `lib/helpers.cjs` (matches the org-awareness-cli.cjs pattern at line 90) so `--raw` JSON vs human-readable output is consistent with sibling subcommands."
---

<objective>
Add `df-tools planning sibling-trd-scan <objective-num> [--raw]` subcommand that surfaces TRD plans from sibling repos matching a given objective number prefix. Returns structured JSON the orchestrator can include in planner prompts as cross-repo TRD warnings, so a planner running on one repo can detect that a sibling repo has already drafted (or is drafting) a TRD for the same objective number.

**Why:** Item 6 from `~/.claude/devflow-efficiency-handoff.md`. In objective 018 (verticals milestone), the backend planner drafted `018-03-TRD.md` for EdenSignaturePad migration; two sessions later the frontend planner discovered the work was purely frontend (wrong API shape assumed). Backend `018-03` had to be marked SUPERSEDED by frontend `018-FE-01`. A planner running on flutter without sibling-repo TRD visibility would have planned a duplicate; the executor would have collided. This subcommand surfaces sibling TRDs as structured data the orchestrator can include in the planner's prompt as warnings.

**Output shape (per `--raw`):**
```json
{
  "ok": true,
  "scanned": 2,
  "siblings": ["/Users/.../eden-biz-go", "/Users/.../eden-ui-flutter"],
  "matches": [
    {
      "sibling_repo": "/Users/.../eden-biz-go",
      "trd_path": "/Users/.../eden-biz-go/.planning/objectives/018-verticals/018-01-TRD.md",
      "objective": "018-verticals",
      "trd": "018-01",
      "files_modified": ["a.go", "b.go"],
      "confidence": "high",
      "supersedes": null,
      "prerequisite_for": null
    }
  ],
  "warnings": []
}
```

Pure logic; no `process.exit` or stdout writes inside `scanSiblingTrds`. CLI command does the I/O.
</objective>

<embedded_context>

<codebase_examples>
**Pattern to follow — `_discoverSiblings` reuse:** Already exported as a private helper in `org-awareness.cjs` (lines 130–186). Pass `{ cwd, config_paths }`, get back `{ paths: string[], warnings: string[] }`. Each path is a sibling repo root (already validated to have `.git` + `.planning`). Just iterate `paths`, look at `<path>/.planning/objectives/`, and proceed.

**Pattern to follow — `_runFs` injection:** Production code at lines 46–55:
```js
const realFs = {
  readFileSync: (p, enc) => fs.readFileSync(p, enc),
  readdirSync: (p, opts) => fs.readdirSync(p, opts),
  existsSync: (p) => fs.existsSync(p),
  statSync: (p) => fs.statSync(p),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
```
All `scanSiblingTrds` filesystem calls MUST go through `_runFs.X(...)`, never `fs.X(...)`. Tests inject mocks via `oa._setRunFs({ readdirSync: (...) => [...], existsSync: (...) => true, readFileSync: (...) => '...', statSync: (...) => ({ isDirectory: () => true }) })`. Existing tests at lines 119–414 demonstrate this pattern.

**Pattern to follow — frontmatter parsing:** `extractFrontmatter` is already imported at line 27 of `org-awareness.cjs`:
```js
const { extractFrontmatter } = require('./frontmatter.cjs');
```
Returns the parsed frontmatter object directly (NOT `{ frontmatter, body }`); returns `null` or empty object on no/malformed frontmatter. Wrap in try/catch — if it throws (rare), record a warning and skip the file.

**Pattern to follow — config loading:** `org-awareness-cli.cjs` lines 19–28 show how to read `.planning/config.json` `awareness.sibling_repos`:
```js
function _loadAwarenessConfig(cwd) {
  try {
    const cfgPath = pathBase.join(cwd, '.planning', 'config.json');
    const raw = fsBase.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg.awareness || {};
  } catch {
    return {};
  }
}
```
Pass `cfg.sibling_repos` as `config_paths` to `_discoverSiblings`. If unconfigured (empty/missing), `_discoverSiblings` falls back to `~/Source/*` glob — but per the task spec, when no siblings configured we want the explicit "no sibling repos configured" warning, NOT the default glob behavior. **Pass `null`/empty to take the default glob path; emit the warning at the wrapper layer when `config_paths` is empty AND `_discoverSiblings` returns no paths.** Re-read the task spec edge cases: "No `.planning/config.json` or empty `awareness.sibling_repos` → `{ ok: true, scanned: 0, matches: [], warnings: [\"no sibling repos configured\"] }`." So the wrapper should NOT default-glob — it should only consult configured paths. Pass `config_paths` straight through; when null/empty, return the documented shape WITHOUT calling `_discoverSiblings`'s default-glob branch.

**Pattern to follow — df-tools.cjs subcommand routing:** Lines 861–865 show how `benchmark` was added:
```js
case 'benchmark': {
  const { cmdBenchmarkRoute } = require('./lib/benchmark.cjs');
  cmdBenchmarkRoute(cwd, args.slice(1), raw);
  break;
}
```
And lines 839–842 show how `org-awareness` is routed via a CLI module that handles its own subcommand dispatch:
```js
case 'org-awareness': {
  cmdOrgAwarenessRoute(cwd, args.slice(1), raw);
  break;
}
```

For this objective we add a small inline `case 'planning':` arm — no separate CLI module required because this is the only `planning` subcommand. Inline dispatch keeps the change small.

**Pattern to follow — usage string update:** Line 229:
```js
error('Usage: df-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-objective, commit, verify-summary, verify, detect, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, awareness, benchmark, init');
```
Add `planning` to the comma list after `benchmark`.
</codebase_examples>

<anti_patterns>
- **DO NOT** modify `scanSiblings` (lines 339–444) — different concern (token-overlap scoring against PROJECT.md + recent SUMMARYs). `scanSiblingTrds` is a sibling function that focuses on TRD frontmatter discovery.
- **DO NOT** modify `_discoverSiblings` internals — just call it.
- **DO NOT** call `fs.X(...)` directly in production code — always `_runFs.X(...)`. This is enforced by the existing test patterns and CONTEXT.md §Iron Law (line 19).
- **DO NOT** add a new CLI module file (e.g., `planning-cli.cjs`) for a single subcommand. Inline the dispatch in `df-tools.cjs` `case 'planning':` arm. If `planning` grows additional subcommands later, refactor to a module then.
- **DO NOT** use LLM-generated test data per Mark's CLAUDE.md TDD Playbook habit 4. Hand-build fixture file structures via `_setRunFs` mock returns or via `os.tmpdir()` real-fs scaffolding (existing test file uses both patterns; either works).
- **DO NOT** include property-based testing or Gherkin scaffolds — descriptive `test('T1 — ...')` names per existing convention.
- **DO NOT** crash on malformed TRD frontmatter. Wrap `extractFrontmatter` calls in try/catch; on throw OR on null/empty return where the file is non-empty with malformed YAML, push a warning and skip.
- **DO NOT** include the current repo (`cwd`) in the matches list. `_discoverSiblings` already filters this; trust its output.
</anti_patterns>

<gotchas>
- **Numeric prefix matching with leading zeros.** `objective_id="18"` should match dir `018-foo`. Strategy: normalize the input by stripping leading zeros (`"18"` → `"18"`, `"018"` → `"18"`), then compare against each candidate dir's normalized leading numeric prefix (extract leading `\d+`, strip leading zeros, compare). Example helper:
  ```js
  function _normalizeObjNum(s) {
    const m = String(s || '').match(/^0*(\d+)/);
    return m ? m[1] : null;
  }
  function _dirMatchesObjective(dirName, normalizedTarget) {
    const m = dirName.match(/^(\d+)/);
    if (!m) return false;
    return _normalizeObjNum(m[1]) === normalizedTarget;
  }
  ```
  Both `"18"` and `"018"` normalize to `"18"`. Dir `018-verticals` normalizes its prefix `018` to `"18"` and matches. Dir `18-something` (no leading zero) also normalizes to `"18"` and matches. Dir `180-something` normalizes its prefix `180` to `"180"` — does NOT match `"18"`. ✓

- **TRD filename pattern.** Look for `*-TRD.md` (suffix match), not `*TRD*` (substring). Existing TRDs in the codebase: `018-01-TRD.md`, `01-01-TRD.md`, `00-01-TRD.md`. The numeric portion before `-TRD.md` is the TRD ID; it's NOT necessarily numeric only (e.g., `018-FE-01-TRD.md` is valid per the task brief mentioning `018-FE-01`). Don't constrain the TRD ID parser; just slice the filename: `name.endsWith('-TRD.md')` and the TRD ID is everything before the `-TRD.md` suffix.

- **TRD frontmatter fields are optional except `objective` and `trd`.** Per the task spec, extract `files_modified`, `objective`, `trd`, `confidence`, `supersedes`, `prerequisite_for`. Per TRD-spec.md (referenced in planner agent), `objective` and `trd` are required; `files_modified` is required; `confidence`, `supersedes`, `prerequisite_for` are optional. When optional fields are absent, return them as `null` in the match record (NOT undefined; NOT missing key). Tests should assert this explicitly.

- **`scanSiblings` already has a `_readProjectMd` helper that calls `extractFrontmatter`.** That helper handles missing/empty frontmatter gracefully. Use the same defensive pattern: `try { const fm = extractFrontmatter(content); ... } catch { warnings.push(...); continue; }`.

- **Don't double-warn.** When `_discoverSiblings` itself returns warnings (e.g., "configured sibling path not found"), pass them through to the result's `warnings` array; don't re-emit them.

- **The `planning` switch case must be added BEFORE the `default:` case in `df-tools.cjs`.** Search the file for the dispatch order; existing alphabetical ordering is loose. Place it near `org-awareness` (alphabetical) or near `benchmark` (newest additions). Either is fine; near `org-awareness` makes most semantic sense.
</gotchas>

</embedded_context>

## Test list (test-first per CLAUDE.md TDD Playbook habit 2)

Behavior cases the new function must satisfy, ordered outside-in. Tests must be written and FAIL before any implementation code.

1. **No siblings configured (config_paths null/empty)** → `{ ok: true, scanned: 0, siblings: [], matches: [], warnings: ["no sibling repos configured"] }`. No fs reads beyond the config check.
2. **One sibling configured, no `.planning/objectives/018-*` dir at given number** → `{ ok: true, scanned: 1, siblings: [<sibling>], matches: [], warnings: [] }`.
3. **One sibling with `.planning/objectives/018-foo/018-01-TRD.md`** containing frontmatter `{ objective: "018-foo", trd: "018-01", files_modified: ["a.go", "b.go"], confidence: "high" }` → match returned with all five non-optional fields populated and `supersedes: null, prerequisite_for: null`.
4. **Multiple TRDs in same sibling objective dir** (`018-01-TRD.md`, `018-02-TRD.md`, `018-FE-01-TRD.md`) → all three returned in matches array, order stable (alphabetical by filename).
5. **Multiple siblings, each with matches** → all collated; `scanned: 2`; matches array contains all TRDs from both siblings.
6. **Malformed TRD frontmatter** (e.g., unterminated `---` block, garbage YAML) → warning emitted (`malformed frontmatter in <trd_path>: <reason>`); valid sibling TRDs in same dir still returned.
7. **Numeric prefix matching with leading zeros**: `objective_id="18"` matches dir `018-foo`; `objective_id="018"` matches dir `18-bar`. Dir `180-something` does NOT match `objective_id="18"`.

## Tasks

<task type="auto" tdd="true">
  <name>Test list — write 7 failing tests for `scanSiblingTrds`</name>
  <files>plugins/devflow/devflow/bin/lib/org-awareness.test.cjs</files>
  <action>
Append a new test group `// ─── Group ST — scanSiblingTrds (cross-repo TRD discovery) ──────────────` after the existing groups in `org-awareness.test.cjs`. Add 7 tests labeled `ST1` through `ST7`, one per case in the Test List above.

Use the existing test patterns:
- For tests that need real filesystem state, use `fs.mkdtempSync(path.join(os.tmpdir(), 'st-N-'))` (matches lines 443/484/544/etc.) and tear down with `fs.rmSync(tmp, { recursive: true, force: true })` in a finally block. Real-fs is preferred for ST3-ST6 because frontmatter parsing involves real string content.
- For ST1 (no siblings configured), no filesystem state is needed — just call `oa.scanSiblingTrds({ objective_id: "18", cwd: <anything>, config_paths: null })` and assert the documented shape.
- For ST2-ST7, build hand-written file structures: write `.planning/objectives/018-foo/018-01-TRD.md` with literal frontmatter strings (no LLM generation per CLAUDE.md habit 4).

Each test calls `oa.scanSiblingTrds({ objective_id, cwd, config_paths })` and asserts on the returned `{ ok, scanned, siblings, matches, warnings }` shape. Use `assert.deepStrictEqual` for full shape checks where practical, `assert.strictEqual` for individual field checks where shape includes irrelevant noise.

ST6 (malformed frontmatter) writes a TRD file with literal content `---\nobjective: 018-foo\ntrd: 018-01\nfiles_modified: [a.go,\n---\nbody` — note the unclosed array. Assert `result.warnings.some(w => /malformed frontmatter/.test(w))` AND a sibling valid TRD in the same dir is still returned.

ST7 builds two fixtures: dir `018-foo/018-01-TRD.md` (leading-zero form) and dir `18-bar/18-01-TRD.md` (no leading zero) — as separate temp roots, each as their own sibling. Run two assertions: `objective_id="18"` returns matches from BOTH; `objective_id="018"` returns matches from BOTH; `objective_id="180"` returns matches from NEITHER.

Run `npm test` and confirm all 7 tests FAIL with messages indicating `scanSiblingTrds` is not a function (or returns undefined). Commit:
```
test(quick-9): add failing tests for scanSiblingTrds (RED)
```
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs 2>&1 | grep -E 'ST[1-7]'` shows 7 failing tests.
- All pre-existing org-awareness tests still pass (no regression introduced by the test file additions).
- Commit message follows `test(quick-9): ...` convention.
  </verify>
  <done>
7 tests labeled ST1–ST7 exist in org-awareness.test.cjs, all currently failing because `scanSiblingTrds` does not exist. Existing test count is preserved (no removals or modifications to T*, SC*, D*, etc.). Single atomic commit on the test file only.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Implement `scanSiblingTrds` and export it (GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/org-awareness.cjs</files>
  <action>
Add `scanSiblingTrds` as a new exported function in `org-awareness.cjs`. Place it AFTER `scanSiblings` (line ~444) and BEFORE the `// ─── TRD 03-02: scanLibs` section (line ~446). Also add a small `_normalizeObjNum` helper near `_expandHome` (line ~106) since that's the path-helper grouping.

Implementation skeleton (filling in the gaps marked `<...>`):

```js
// ─── Quick-9: scanSiblingTrds (cross-repo TRD frontmatter scanner) ───────────

/**
 * Normalize an objective number for prefix matching.
 * "18" → "18", "018" → "18", "0018" → "18", "abc" → null.
 *
 * @param {string|number|null} s
 * @returns {string|null}
 */
function _normalizeObjNum(s) {
  const m = String(s == null ? '' : s).match(/^0*(\d+)/);
  return m ? m[1] : null;
}

/**
 * Scan sibling repos for TRD plans matching an objective number prefix.
 *
 * Reuses _discoverSiblings (sibling repo discovery + path validation) and
 * _runFs (filesystem injection) — never duplicates either.
 *
 * Match rule: a sibling's `.planning/objectives/<dir>/` matches when the
 * leading numeric prefix of <dir> normalizes (leading zeros stripped) to the
 * normalized form of objective_id. "18" and "018" both normalize to "18".
 *
 * For each matching dir, read all `*-TRD.md` files; parse frontmatter via
 * extractFrontmatter; emit one match record per parseable TRD.
 *
 * @param {object} opts
 * @param {string}        opts.objective_id   - objective number (required, e.g. "18" or "018")
 * @param {string}        [opts.cwd]          - current repo path (default: process.cwd())
 * @param {string[]|null} [opts.config_paths] - configured sibling paths from .planning/config.json
 * @returns {{
 *   ok: boolean,
 *   scanned: number,                                  // siblings actually inspected
 *   siblings: string[],                               // sibling paths discovered
 *   matches: Array<{
 *     sibling_repo: string,                           // absolute path to sibling
 *     trd_path: string,                               // absolute path to the TRD.md
 *     objective: string|null,                         // from frontmatter
 *     trd: string|null,                               // from frontmatter
 *     files_modified: string[]|null,                  // from frontmatter
 *     confidence: string|null,                        // from frontmatter
 *     supersedes: string|null,                        // from frontmatter (optional)
 *     prerequisite_for: string|null,                  // from frontmatter (optional)
 *   }>,
 *   warnings: string[],
 * }}
 */
function scanSiblingTrds({ objective_id, cwd = process.cwd(), config_paths = null } = {}) {
  if (!objective_id) throw new Error('scanSiblingTrds: objective_id is required');

  const out = { ok: true, scanned: 0, siblings: [], matches: [], warnings: [] };

  // No-config short-circuit: per task spec, return documented shape with
  // explicit warning. Do NOT fall through to default-glob behavior.
  if (!Array.isArray(config_paths) || config_paths.length === 0) {
    out.warnings.push('no sibling repos configured');
    return out;
  }

  const normalizedTarget = _normalizeObjNum(objective_id);
  if (normalizedTarget == null) {
    out.warnings.push(`objective_id "${objective_id}" has no leading numeric prefix`);
    return out;
  }

  // Reuse _discoverSiblings — never duplicate sibling validation.
  const disc = _discoverSiblings({ cwd, config_paths });
  out.warnings.push(...disc.warnings);
  out.siblings = disc.paths.slice();

  for (const siblingPath of disc.paths) {
    out.scanned++;

    const objsDir = path.join(siblingPath, '.planning', 'objectives');
    if (!_runFs.existsSync(objsDir)) continue;

    let dirEntries;
    try {
      dirEntries = _runFs.readdirSync(objsDir);
    } catch (e) {
      out.warnings.push(`readdir ${objsDir} failed: ${e.message}`);
      continue;
    }

    // Find directories whose leading numeric prefix matches normalizedTarget.
    const matchingDirs = dirEntries.filter((dn) => {
      const m = dn.match(/^(\d+)/);
      if (!m) return false;
      return _normalizeObjNum(m[1]) === normalizedTarget;
    });

    for (const dirName of matchingDirs) {
      const objDir = path.join(objsDir, dirName);
      let files;
      try {
        files = _runFs.readdirSync(objDir);
      } catch (e) {
        out.warnings.push(`readdir ${objDir} failed: ${e.message}`);
        continue;
      }

      // Stable iteration: alphabetical filename order so multi-TRD outputs are deterministic.
      files.sort();

      for (const fname of files) {
        if (!fname.endsWith('-TRD.md')) continue;
        const trdPath = path.join(objDir, fname);

        let content;
        try {
          content = _runFs.readFileSync(trdPath, 'utf-8');
        } catch (e) {
          out.warnings.push(`read ${trdPath} failed: ${e.message}`);
          continue;
        }

        let fm;
        try {
          fm = extractFrontmatter(content);
        } catch (e) {
          out.warnings.push(`malformed frontmatter in ${trdPath}: ${e.message}`);
          continue;
        }

        if (!fm || typeof fm !== 'object' || Object.keys(fm).length === 0) {
          // Treat empty/missing frontmatter as malformed for this contract — TRDs are required to have frontmatter.
          out.warnings.push(`malformed frontmatter in ${trdPath}: empty or missing`);
          continue;
        }

        out.matches.push({
          sibling_repo: siblingPath,
          trd_path: trdPath,
          objective: fm.objective != null ? String(fm.objective) : null,
          trd: fm.trd != null ? String(fm.trd) : null,
          files_modified: Array.isArray(fm.files_modified) ? fm.files_modified.slice() : null,
          confidence: fm.confidence != null ? String(fm.confidence) : null,
          supersedes: fm.supersedes != null ? String(fm.supersedes) : null,
          prerequisite_for: fm.prerequisite_for != null ? String(fm.prerequisite_for) : null,
        });
      }
    }
  }

  return out;
}
```

Then update the `module.exports` block (lines 1102–1133) — add `scanSiblingTrds` to the "Pure logic / scanners (TDD'd)" group AND add `_normalizeObjNum` to the "Internal helpers (exposed for tests)" group.

# CRITICAL: All filesystem calls go through `_runFs.X(...)` — never `fs.X(...)`. The Iron Law in CONTEXT.md §line 19.
# CRITICAL: Honor the `extractFrontmatter` return shape — it returns the parsed object directly, NOT `{ frontmatter, body }`. Existing scanSiblings._readProjectMd at line 197 confirms.
# GOTCHA: `extractFrontmatter` may return null OR throw on malformed input — handle BOTH. ST6 covers the throw case; the empty-object guard above covers the silent-empty case.
# PATTERN: Match the function-doc-comment style of `scanSiblings` and `scanLibs` (JSDoc with @param tags + return shape diagram).

Run `npm test` after implementing. All 7 ST tests should now PASS. Run the full test suite — pre-existing tests must still pass with no regressions.

Commit:
```
feat(quick-9): implement scanSiblingTrds for cross-repo TRD discovery (GREEN)
```
  </action>
  <verify>
- `node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` — all ST1-ST7 PASS, all pre-existing tests still pass.
- `npm test` shows no regression in total test count or pass count beyond the +7 new ST tests.
- `node -e "const oa = require('./plugins/devflow/devflow/bin/lib/org-awareness.cjs'); console.log(typeof oa.scanSiblingTrds);"` prints `function`.
- Module exports surface includes `scanSiblingTrds` and `_normalizeObjNum` (verify by inspecting the module.exports block at end of file).
  </verify>
  <done>
`scanSiblingTrds` is exported from `org-awareness.cjs`; all 7 ST tests pass; no regressions in pre-existing tests; commit follows `feat(quick-9): ...` convention.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Wire `df-tools planning sibling-trd-scan` CLI subcommand</name>
  <files>plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Add a new `case 'planning':` arm in the main switch in `df-tools.cjs`. Place it adjacent to `case 'org-awareness':` (line 839) for semantic grouping — alphabetical ordering is loose throughout this file.

```js
case 'planning': {
  const sub = args[1];
  if (sub === 'sibling-trd-scan') {
    const objective_id = args[2];
    if (!objective_id) {
      process.stderr.write('Usage: df-tools planning sibling-trd-scan <objective-num> [--raw]\n');
      process.exit(1);
    }
    const oa = require('./lib/org-awareness.cjs');
    // Read .planning/config.json awareness.sibling_repos (matches org-awareness-cli.cjs pattern)
    let config_paths = null;
    try {
      const fsBase = require('fs');
      const pathBase = require('path');
      const cfgPath = pathBase.join(cwd, '.planning', 'config.json');
      const cfgRaw = fsBase.readFileSync(cfgPath, 'utf-8');
      const cfg = JSON.parse(cfgRaw);
      if (cfg && cfg.awareness && Array.isArray(cfg.awareness.sibling_repos)) {
        config_paths = cfg.awareness.sibling_repos;
      }
    } catch {
      // missing/malformed config — pass null, scanSiblingTrds emits the documented warning
    }

    const result = oa.scanSiblingTrds({ objective_id, cwd, config_paths });

    if (raw) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      // Human-readable
      process.stdout.write(`scanned ${result.scanned} sibling repo(s)\n`);
      if (result.matches.length === 0) {
        process.stdout.write('no matching TRDs found\n');
      } else {
        process.stdout.write(`\nmatches (${result.matches.length}):\n`);
        for (const m of result.matches) {
          const supTag = m.supersedes ? ` [supersedes: ${m.supersedes}]` : '';
          const preTag = m.prerequisite_for ? ` [prereq for: ${m.prerequisite_for}]` : '';
          const conf = m.confidence ? ` (confidence: ${m.confidence})` : '';
          const files = Array.isArray(m.files_modified) ? m.files_modified.join(', ') : '(none)';
          process.stdout.write(`  - ${m.trd_path}\n`);
          process.stdout.write(`      objective=${m.objective || '?'} trd=${m.trd || '?'}${conf}${supTag}${preTag}\n`);
          process.stdout.write(`      files: ${files}\n`);
        }
      }
      if (result.warnings.length > 0) {
        process.stdout.write(`\nwarnings:\n`);
        for (const w of result.warnings) process.stdout.write(`  - ${w}\n`);
      }
    }
    process.exit(0);
  }
  error(`Unknown planning subcommand${sub ? ': ' + sub : ''}. Available: sibling-trd-scan`);
  break;
}
```

Update line 229's usage banner — append `, planning` to the comma list:
```js
error('Usage: df-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-objective, commit, verify-summary, verify, detect, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, awareness, benchmark, planning, init');
```

Manual smoke verification (does NOT need a test — this is glue):
```bash
# Should print "no sibling repos configured" warning + scanned: 0
node plugins/devflow/devflow/bin/df-tools.cjs planning sibling-trd-scan 18 --raw

# Should print usage error
node plugins/devflow/devflow/bin/df-tools.cjs planning sibling-trd-scan
# Should print unknown-subcommand error
node plugins/devflow/devflow/bin/df-tools.cjs planning bogus
```

# CRITICAL: Use `cwd` (already declared at line 226 of df-tools.cjs as `const cwd = process.cwd();`) — DO NOT redeclare it.
# GOTCHA: `error(...)` is the helper from `lib/helpers.cjs` already imported at line 148. It writes to stderr and `process.exit(1)`s — DO NOT add `process.exit(1)` after calling `error(...)`.
# PATTERN: Inline dispatch (not a separate `lib/planning-cli.cjs` module) is justified because `planning` has only one subcommand. If we add more later, refactor.

Commit:
```
feat(quick-9): wire df-tools planning sibling-trd-scan CLI subcommand
```
  </action>
  <verify>
- `node plugins/devflow/devflow/bin/df-tools.cjs planning sibling-trd-scan 18 --raw` returns valid JSON with `ok: true, scanned: 0, matches: [], warnings: ["no sibling repos configured"]` (devflow-claude has no awareness.sibling_repos configured).
- `node plugins/devflow/devflow/bin/df-tools.cjs planning sibling-trd-scan` exits 1 with usage error to stderr.
- `node plugins/devflow/devflow/bin/df-tools.cjs planning bogus` exits 1 with unknown-subcommand error.
- `node plugins/devflow/devflow/bin/df-tools.cjs unknownXYZ` (the bare usage path) prints the updated banner including `planning`.
- `npm test` still passes (no regression — this task added zero test changes; the existing suite is unaffected by CLI router additions).
  </verify>
  <done>
`df-tools planning sibling-trd-scan <num> [--raw]` is a working CLI command. Usage banner mentions `planning`. Three smoke tests pass manually. Single atomic commit on `df-tools.cjs` only.
  </done>
</task>

<verification>

## Verification Commands

Run these from the repo root after all 3 tasks land:

```bash
# 1. Full test suite — must pass with +7 new ST tests
npm test 2>&1 | tail -20

# 2. ST tests specifically
node --test plugins/devflow/devflow/bin/lib/org-awareness.test.cjs 2>&1 | grep -E 'ST[1-7]'

# 3. CLI smoke — empty-config path
node plugins/devflow/devflow/bin/df-tools.cjs planning sibling-trd-scan 18 --raw | jq '{ok, scanned, warnings}'
# Expected: {"ok": true, "scanned": 0, "warnings": ["no sibling repos configured"]}

# 4. CLI smoke — usage banner mentions planning
node plugins/devflow/devflow/bin/df-tools.cjs 2>&1 | grep -o 'planning'
# Expected: prints "planning"

# 5. Module export surface — scanSiblingTrds is callable
node -e "const oa = require('./plugins/devflow/devflow/bin/lib/org-awareness.cjs'); console.log(typeof oa.scanSiblingTrds, typeof oa._normalizeObjNum);"
# Expected: function function
```

</verification>

<success_criteria>

1. `scanSiblingTrds` is exported from `lib/org-awareness.cjs` and reuses `_discoverSiblings` + `_runFs` (no duplication of sibling-validation or fs-injection logic).
2. All 7 ST tests pass; no pre-existing test regresses.
3. `df-tools planning sibling-trd-scan <objective-num> [--raw]` produces the documented JSON shape under `--raw` and human-readable output without it.
4. Numeric prefix matching is leading-zero tolerant (ST7 covers).
5. Malformed TRD frontmatter does not crash the scan; valid sibling TRDs are still returned (ST6 covers).
6. Usage banner at line 229 mentions `planning`.
7. 3 atomic commits land:
   - `test(quick-9): add failing tests for scanSiblingTrds (RED)`
   - `feat(quick-9): implement scanSiblingTrds for cross-repo TRD discovery (GREEN)`
   - `feat(quick-9): wire df-tools planning sibling-trd-scan CLI subcommand`
8. Total LOC delta is well under 200 (target: ~50–80 LOC scanner + ~50–80 LOC tests + ~30 LOC CLI = ~130–190).

</success_criteria>

<output>

## Output

- New exported function `scanSiblingTrds` in `plugins/devflow/devflow/bin/lib/org-awareness.cjs`.
- New helper `_normalizeObjNum` (also exported for tests).
- 7 new tests `ST1`–`ST7` in `org-awareness.test.cjs`.
- New `case 'planning':` arm in `df-tools.cjs` routing `sibling-trd-scan`.
- Usage banner (line 229) includes `planning`.

**Deferred (out of scope for this quick):**
- Updating `plan-objective.md` workflow to invoke the new subcommand and pass results to the planner agent's prompt as `<sibling_warnings>` — flagged in task brief as File 4 (OPTIONAL). Defer to a follow-on quick to keep this change under 200 LOC. Note in SUMMARY.md when complete.

</output>
