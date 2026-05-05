---
objective: 03-planning-time-org-awareness
job: "03-01"
subsystem: org-awareness
tags: [scanSiblings, tokenize, score, fixtures, cli, fs-injection]

requires:
  - objective: 01-github-coordination-layer
    provides: "resolveChain, requireGhAuth, walkProject primitives reused read-only"
  - objective: 02-cross-repo-awareness-layer
    provides: "awareness.cjs parseStateMd + awareness-fixtures.cjs extended with new builders"
provides:
  - "lib/org-awareness.cjs: scanSiblings + tokenize + _score + _setRunFs/_resetFsMock + constants"
  - "lib/org-awareness-cli.cjs: cmdOrgAwarenessRoute + scan-siblings subcommand"
  - "lib/__fixtures__/awareness-fixtures.cjs: buildSiblingRepoTree + buildMockRunFs added"
  - "df-tools case 'org-awareness' arm wired"
  - "templates/config.json: awareness.sibling_repos + awareness.eden_libs_path documented"
affects:
  - "03-02-eden-libs-scanner"
  - "03-03-org-overlap-and-misfiling"
  - "03-04-format-considerations"
  - "03-07-library-export-and-dogfood"

tech-stack:
  added: []
  patterns:
    - "_setRunFs injection hook: mirrors _setRunGit/_setRunGh pattern; wraps readFileSync/readdirSync/existsSync/statSync"
    - "Jaccard-like token scoring: |a ∩ b| / max(|a|, |b|); bounded [0,1]"
    - "buildSiblingRepoTree fixture: tmpdir-based real filesystem tree; caller owns cleanup"
    - "buildMockRunFs fixture: canned-response map with informative error on unconfigured path"
    - "extractFrontmatter returns parsed object directly (not {frontmatter,body}) — corrected in _readProjectMd"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/org-awareness.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
    - plugins/devflow/devflow/bin/lib/org-awareness-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/templates/config.json

key-decisions:
  - "extractFrontmatter returns parsed object directly — not {frontmatter,body} as TRD code comment implied; _readProjectMd corrected to use return value directly"
  - "_tokenize strips non-alphanum (except separators) before splitting — preserves path components like cjs while dropping punctuation"
  - "D4/D6/D8 tests use config_paths with explicit absolute paths instead of default ~/Source discovery — eliminates mock path mismatch between discovery expansion and file mock"
  - "buildSiblingRepoTree takes tmpdir as required param; caller responsible for cleanup via fs.rmSync(root, {recursive:true})"
  - "buildMockRunFs throws informative error for unconfigured paths (not silently returns undefined) — catches missing fixture setup early"

patterns-established:
  - "Filesystem mock injection: _setRunFs(mockObj) / _resetFsMock() — symmetric with _setRunGit/_setRunGh"
  - "Test fixture cleanup pattern: mkdtempSync in test body, rmSync in finally block"

requirements-completed: [SC-1, SC-2]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: ~30min
completed: 2026-05-04
---

# Objective 3 TRD 01: Sibling-repo scanner + filesystem fixtures + CLI scaffold Summary

**Token-intersection sibling scanner (scanSiblings) with _setRunFs injection hook, hand-built buildSiblingRepoTree/buildMockRunFs fixture builders, and df-tools org-awareness CLI router scaffold**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-04T~19:30Z
- **Completed:** 2026-05-04
- **Tasks:** 3 (fixtures + RED + GREEN)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `lib/org-awareness.cjs` created with `scanSiblings` (tokenize + Jaccard score + mtime recency filter + org matching), `_setRunFs`/`_resetFsMock` injection hooks, and 5 constants
- `lib/__fixtures__/awareness-fixtures.cjs` extended with `buildSiblingRepoTree` (real tmpdir tree) and `buildMockRunFs` (canned-response map); all 13 obj 2 builders preserved unchanged
- `lib/org-awareness-cli.cjs` CLI router: `scan-siblings` wired to `scanSiblings`; `scan-libs`/`scan-org-overlap`/`considerations` stubbed for TRDs 03-02/03-03/03-04
- `df-tools.cjs` extended with `case 'org-awareness':` arm and require import
- 39 new tests (Groups T, SC, D, S, F, CLI, I): 755/770 pass, 0 fail, 15 integration-gated skip (I1/I2 + pre-existing 13)
- TDD commit ordering: `test:` (2044c35) → `feat:` (f1178f4) per TDD Playbook habit 3

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures + config | `node -e 'const f=require("./plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs"); const os=require("os"); ...' + config.json python3 check` | 0 | PASS |
| 2: RED phase | `npm test 2>&1 \| grep 'Cannot find module ./org-awareness'` | 1 (intentional) | PASS |
| 3: GREEN phase | `npm test 2>&1 \| tail -6` (770/755/0) | 0 | PASS |

## Task Commits

1. **Task 1+2: Fixtures (RED)** - `2044c35` (test: add failing tests for scanSiblings + tokenize + scoring + CLI router)
2. **Task 3: Implementation (GREEN)** - `f1178f4` (feat: implement scanSiblings + tokenize + CLI router scaffold)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `npm test 2>&1 \| grep 'Cannot find module ./org-awareness'` | non-zero suite | FAIL (correct) |
| GREEN | `npm test 2>&1 \| tail -6` | 0 | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1
- **Must-haves verified:** 10/10
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/org-awareness.cjs` — Module skeleton + scanSiblings + tokenize + _setRunFs/_resetFsMock + constants
- `plugins/devflow/devflow/bin/lib/org-awareness.test.cjs` — 39-test suite (Groups T, SC, D, S, F, I; 37 non-gated pass)
- `plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs` — CLI router for df-tools org-awareness subcommand
- `plugins/devflow/devflow/bin/lib/org-awareness-cli.test.cjs` — 5 CLI wiring tests (CLI1–CLI5)
- `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` — Extended with buildSiblingRepoTree + buildMockRunFs
- `plugins/devflow/devflow/bin/df-tools.cjs` — Added require + case 'org-awareness' arm
- `plugins/devflow/devflow/templates/config.json` — Added awareness.sibling_repos + awareness.eden_libs_path keys

## Decisions Made

- **extractFrontmatter API correction** — `extractFrontmatter` returns the parsed frontmatter object directly (not `{ frontmatter, body }`). TRD code comment implied the latter; fixed in `_readProjectMd` and `_readCurrentObjectiveTokens`.
- **Test path alignment (D4/D6/D8)** — D4/D6/D8 tests initially used the default `~/Source/` discovery path; mock paths didn't align with the expanded absolute paths. Fixed by switching to `config_paths` with explicit absolute paths matching mock keys.
- **buildMockRunFs throws on unconfigured** — Throws informative error rather than silently returning undefined; catches missing fixture setup early in test development.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] extractFrontmatter API mismatch in _readProjectMd and _readCurrentObjectiveTokens**
- **Found during:** Task 3 (GREEN phase, D6/D8 test failures)
- **Issue:** TRD's embedded code used `const { frontmatter } = extractFrontmatter(content)` but `extractFrontmatter` returns the parsed object directly, not `{ frontmatter, body }`. All org-matching logic received `undefined` for `frontmatter`.
- **Fix:** Changed both callers to `const frontmatter = extractFrontmatter(content)`. Body extraction now uses a regex on raw content.
- **Files modified:** `lib/org-awareness.cjs`
- **Committed in:** f1178f4 (GREEN phase commit)

**2. [Rule 1 - Bug] Test path mismatch in D4/D6/D8 (corrected in RED test before GREEN commit)**
- **Found during:** Task 3 (GREEN phase debugging)
- **Issue:** D4 used default discovery path `~/Source/` but file mock used `/fake/...` paths — no overlap possible.
- **Fix:** Tests D4 now use `config_paths: [cwd, sibling]` with explicit absolute paths. D6/D8 got consistent `cwd` variable names to avoid key collision.
- **Files modified:** `lib/org-awareness.test.cjs`
- **Committed in:** f1178f4 (GREEN phase, same commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — API mismatch and test path alignment)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- JSDoc block comments containing `*/` terminated the comment prematurely — two occurrences in `org-awareness.cjs` caused `SyntaxError: Unexpected identifier`. Fixed by rewriting those comment lines to avoid the `*/` sequence (using descriptive text instead of the raw glob pattern).

## Next Objective Readiness

- TRD 03-02 (eden-libs scanner) can extend `org-awareness.cjs` in the `// TRD 03-02:` region without conflicts
- `buildSiblingRepoTree` and `buildMockRunFs` fixtures are stable for TRDs 03-02/03-03 to build on
- `_setRunFs` pattern is locked; subsequent TRDs use it transparently via the existing injection hook

---
*Objective: 03-planning-time-org-awareness*
*Completed: 2026-05-04*
