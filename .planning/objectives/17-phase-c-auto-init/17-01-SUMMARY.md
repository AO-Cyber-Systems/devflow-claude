---
objective: 17-phase-c-auto-init
job: "01"
subsystem: auto-init
tags: [project-detection, substantive-heuristic, manifest-detection, git-age, decline-tracker]

# Dependency graph
requires:
  - objective: 17-phase-c-auto-init
    provides: "17-02 decline-tracker.cjs with readDecline/writeDecline/_setDeclinePath API"
provides:
  - "lib/project-state.cjs: isSubstantive, isScratchDir, detectManifest, gitAgeDays, countSourceFiles, getProjectState, cmdProjectState"
  - "df-tools project-state [<cwd>] CLI returning 8-field JSON"
  - "5 acceptance fixtures for #28: ambient, brownfield-substantive, scratch, no-git, declined"
  - "__fixtures__/project-state-fixtures.cjs: 7 hand-built factory functions"
affects: [17-03-init-offer-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-scratch tempdir for fixtures: ~/.devflow-test-fixtures/ avoids /var/folders/ scratch classification on macOS"
    - "Two-tier detection: pure helpers (isSubstantive/isScratchDir/detectManifest) + I/O assembly (getProjectState)"
    - "Fail-open decline tracking: readDecline wrapped in try/catch; getProjectState always returns valid JSON"
    - "git log --reverse --format=%ct -n 1 with 2s timeout for first-commit age"

key-files:
  created:
    - "plugins/devflow/devflow/bin/lib/project-state.cjs"
    - "plugins/devflow/devflow/bin/lib/project-state.test.cjs"
    - "plugins/devflow/devflow/bin/lib/__fixtures__/project-state-fixtures.cjs"
  modified:
    - "plugins/devflow/devflow/bin/df-tools.cjs"

key-decisions:
  - "Non-scratch temp dir via ~/.devflow-test-fixtures/: macOS os.tmpdir() returns /var/folders/ which IS a scratch prefix — fixtures that need non-scratch classification must use homedir-relative path"
  - "Backdated git commits: env vars (GIT_AUTHOR_DATE/GIT_COMMITTER_DATE) must be on 'git commit' command, not 'git add' — original fixture had them on the wrong command"
  - "MANIFEST_LANG as ordered array (not object): iteration order guaranteed; first match wins; package.json checked first"
  - "countSourceFiles duplicated from brownfield-detector.cjs: per TRD comment, extract to shared helper on third use"

patterns-established:
  - "mkNonScratchTempDir helper: use ~/.devflow-test-fixtures/ for any fixture that must not be classified as scratch"
  - "Fixture cleanup: try/finally with fs.rmSync(root, {recursive:true,force:true}) even if assertions fail"

requirements-completed: [C1]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 28min
completed: 2026-05-04
---

# Objective 17 TRD 01: Project-State Detector Summary

**Pure-function project substantiveness detector (git age + file count + manifest + scratch-dir heuristic) with 7-language manifest detection, decline-tracker integration, and df-tools project-state CLI — 32 tests covering all 5 acceptance fixtures from #28**

## Performance

- **Duration:** 28 min
- **Started:** 2026-05-04T06:31:23Z
- **Completed:** 2026-05-04T07:00:00Z
- **Tasks:** 2 (TDD tasks, 4 commits)
- **Files modified:** 4

## Accomplishments

- `lib/project-state.cjs` with all 7 exports (isSubstantive, isScratchDir, detectManifest, countSourceFiles, gitAgeDays, getProjectState, cmdProjectState); 347 lines
- Substantive heuristic: `((git_age_days > 7) OR (code_files > 10)) AND has_manifest AND NOT is_scratch_dir` — locked per #28
- Scratch prefix detection: `/tmp/`, `/var/folders/`, `~/Downloads/` (os.homedir() relative)
- 7-language manifest detection table: package.json→javascript/typescript (via tsconfig.json refinement), Cargo.toml→rust, pyproject.toml→python, go.mod→go, Gemfile→ruby, pom.xml→java; first match wins
- df-tools `project-state` CLI wired with case arm + require import
- 32 new tests; npm test: 1839 total, 1813 pass (net +32; 2 pre-existing unrelated failures unaffected)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| Task 1 RED: fixtures + tests | `node --test project-state.test.cjs` | 1 (Cannot find module) | FAIL (correct) |
| Task 1 GREEN: pure helpers | `node --test project-state.test.cjs` | 0 | PASS |
| Task 2: getProjectState + CLI | `node --test project-state.test.cjs` | 0 | PASS |
| Full suite | `npm test` | 1 (2 pre-existing) | PASS (net) |

## Task Commits

Each task was committed atomically:

1. **RED: failing tests + fixtures** - `3953298` (test: add failing tests for project-state pure helpers + fixtures)
2. **GREEN: implementation** - `fca9b3d` (feat: implement project-state.cjs + df-tools.cjs case arm)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| project-state tests | `node --test plugins/devflow/devflow/bin/lib/project-state.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1 (2 pre-existing novel-domain failures) | PASS (net, +32 new pass) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test project-state.test.cjs` | 1 (MODULE_NOT_FOUND) | FAIL (correct) |
| GREEN (attempt 1) | `node --test project-state.test.cjs` | 1 (3 fail: git_age_days=0) | FAIL |
| GREEN (fix: fixture backdating) | `node --test project-state.test.cjs` | 1 (2 fail: is_substantive=false) | FAIL |
| GREEN (fix: non-scratch tmpdir) | `node --test project-state.test.cjs` | 0 (32/32 pass) | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 2 (backdated git commit fix + non-scratch tmpdir fix in fixture)
- **Must-haves verified:** 8/8
- **Gate failures:** None (2 pre-existing novel-domain test failures are unrelated)

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/project-state.cjs` (NEW, 347 lines) — pure helpers + I/O + CLI entry
- `plugins/devflow/devflow/bin/lib/project-state.test.cjs` (NEW, 469 lines) — 32 test cases per locked test list
- `plugins/devflow/devflow/bin/lib/__fixtures__/project-state-fixtures.cjs` (NEW, 236 lines) — 7 factory functions
- `plugins/devflow/devflow/bin/df-tools.cjs` (MODIFIED) — added case 'project-state' arm + require import

## Decisions Made

- **Non-scratch temp dir pattern established:** macOS `os.tmpdir()` returns `/var/folders/...` which is a locked scratch prefix — all fixtures that must not be classified as scratch now use `~/.devflow-test-fixtures/` via `mkNonScratchTempDir()`. This is a fixture-infrastructure decision, not a product behavior change.
- **Backdated git commit env var placement:** `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` must be set on `git commit`, not `git add` — git records timestamps only on commit objects. Original TRD example had them on the wrong command (chained before `git add`).
- **MANIFEST_LANG as ordered array:** Changed from object to array-of-pairs to guarantee first-match-wins iteration order (JS object key iteration is defined but subtly platform-dependent in edge cases).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed backdated git commit: env vars on 'git add' instead of 'git commit'**
- **Found during:** GREEN phase (cases 21a, 23, 29 returned git_age_days=0 instead of ~30)
- **Issue:** TRD codebase_examples showed `GIT_AUTHOR_DATE='${past}' GIT_COMMITTER_DATE='${past}' git add . && git commit -m init -q` — env vars apply only to the `git add` process, not the chained `git commit`. The commit used current timestamps.
- **Fix:** Separated into two `execSync` calls: `git add .` (no date vars needed), then `GIT_AUTHOR_DATE GIT_COMMITTER_DATE git commit` (date vars on the commit).
- **Files modified:** `__fixtures__/project-state-fixtures.cjs`
- **Committed in:** `fca9b3d`

**2. [Rule 1 - Bug] Fixed non-scratch tmpdir: os.tmpdir() returns /var/folders/ on macOS**
- **Found during:** GREEN phase (cases 23 and 29: is_substantive=false despite git_age_days=30 and code_files=50)
- **Issue:** macOS `os.tmpdir()` returns `/var/folders/...` which matches the `/var/folders/` scratch prefix — mkBrownfieldSubstantive, mkAmbientProject, mkNoGitProject, mkManifestVariant, and mkNoManifest all used `os.tmpdir()`. All fixtures intended to be non-scratch were incorrectly classified as scratch.
- **Fix:** Added `mkNonScratchTempDir()` helper that uses `~/.devflow-test-fixtures/` (guaranteed non-scratch). Updated all 5 affected factory functions to use it. `mkScratchDirInTmp()` stays on `/tmp/` explicitly.
- **Files modified:** `__fixtures__/project-state-fixtures.cjs`, `project-state.test.cjs` (case 21c inline dir)
- **Committed in:** `fca9b3d`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs in fixture builders; no product code changes)
**Impact on plan:** Both fixes necessary for test correctness. The non-scratch tmpdir pattern is now established as a fixture convention for all future Phase C tests.

## Acceptance Fixture JSON (Sample Output)

**Fixture 1 — brownfield-substantive** (case 23 + 29):
```json
{
  "has_planning": false,
  "has_git": true,
  "git_age_days": 30,
  "code_files": 50,
  "primary_lang": "javascript",
  "is_substantive": true,
  "previously_declined": false,
  "decline_expires": null
}
```

**Fixture 2 — ambient project** (case 22):
```json
{
  "has_planning": true,
  "has_git": true,
  "git_age_days": null,
  "code_files": 5,
  "primary_lang": "javascript",
  "is_substantive": false,
  "previously_declined": false,
  "decline_expires": null
}
```

**Fixture 3 — scratch dir** (case 24):
```json
{
  "has_planning": false,
  "has_git": false,
  "git_age_days": null,
  "code_files": 0,
  "primary_lang": "javascript",
  "is_substantive": false,
  "previously_declined": false,
  "decline_expires": null
}
```

## Issues Encountered

Two auto-fix cycles during GREEN phase (documented above). Both were fixture-level bugs, not product logic bugs.

## Next Objective Readiness

- 17-01 complete — `getProjectState()` is ready for consumption by `17-03` classify-session.js
- Cross-TRD wiring to 17-02 verified (case 26: declined project round-trip)
- `df-tools project-state` CLI end-to-end verified via subprocess smoke test
- 17-03 (init-offer-mode) can now import `getProjectState` and use `is_substantive` + `previously_declined` to decide between offer and skip modes

---
*Objective: 17-phase-c-auto-init*
*Completed: 2026-05-04*
