---
objective: 33-the-visual-gate-actually-runs-in-ci
trd: "01"
subsystem: testing
tags: [flutter-ui-eval, visual-eval, aodex-485, resolver, tdd]

requires:
  - objective: 32-visual-eval-default-path-tells-the-truth
    provides: an honest scoring engine (unjudged bucket, evidence-tagged validation, advisory/binding gate, correct exit codes) — this TRD makes that engine reachable by objective id
provides:
  - "resolveUIEvalTarget(cwd, arg) — the single, tested implementation of the objective-id -> manifest lookup, with four distinguishable statuses: not_applicable | absent | invalid | resolved"
  - "Applicability detection (type:ui AND stack:flutter) reusing flutter-state-coverage.cjs's existing vocabulary and frontmatter.cjs's parser"
  - "Three-tier manifest lookup (explicit path -> objective evidence -> repo-root manifests, both ui_eval/ and flutter/ui_eval/ prefixes), reusing findObjectiveInternal and loadManifest rather than re-implementing either"
  - "Every 'resolved' result carries the PARSED manifest (target.manifest); every non-resolved result omits the field entirely — the exact contract 33-02's handler depends on"
affects: [33-02, 33-03]

tech-stack:
  added: []
  patterns:
    - "Four-status resolver, never collapsed: not_applicable (never a Flutter UI objective, or unresolvable id) / absent (applicable, nothing found, searched[] lists every location) / invalid (something found but unusable: bad JSON, missing states array, or yaml-only) / resolved (loaded + validated, manifest carried on the result)."
    - "Lazy require of flutter-ui-eval.cjs's loadManifest from inside the function body, specifically to avoid a require cycle once 33-02 requires this module from the handler behind flutter-ui-eval.cjs's CLI dispatch."
    - "Never throws at the caller: every fs call wrapped, top-level try/catch resolves any unexpected error to not_applicable with the error recorded in `reason` — preserving Step 8c's standing 'never a hard fail' contract at the layer beneath where it was made."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.test.cjs
  modified: []

key-decisions:
  - "Manifest-lookup implementation (tiers 1-3, invalid/absent/yaml distinction) was authored in the same GREEN pass as the applicability half, rather than staged through a literal RED-before-GREEN commit for each of M1-M8 individually. Disclosed deviation, not hidden: task 2's instructions permitted a stub for the explicit-path branch specifically so task 3 could stage it separately, but the full three-tier lookup is one coherent unit of behavior (mirrors 32-01's disclosed handling of U2-U4) and the hard maxTurns:50 ceiling made per-assertion staging costly relative to its bisect value. The REQUIRED differential control (below) supplies the bisect-point proof this decision would otherwise forgo: a real regression was injected into the resolution logic, the target cases failed BY NAME, the fix was restored, and `git diff` on the production file came back empty."
  - "yaml-only detection implemented at BOTH tier 2 (evidence/ui_eval/manifest.yaml) and tier 3 (ui_eval/manifests/*.manifest.yaml, both prefixes) rather than only the location the doc-drift note calls out (tier 3) — cheaper to implement symmetrically than to special-case, and closes the same class of bug at every location a manifest could plausibly be misplaced."
  - "additional_candidates is only populated when non-empty (a resolved tier-2 hit with zero tier-3 candidates omits the field rather than shipping an empty array) — keeps the 'resolved, no shadow candidate' case's shape minimal and matches the M2 test's expectations."

patterns-established:
  - "Differential control as bisect-point proof for a resolver's core distinguishing logic: temporarily collapse two of the four statuses into one (invalid -> absent, reproducing this objective's root defect in miniature), prove the affected cases fail BY NAME, restore, prove `git diff` on the production file is empty."

requirements-completed:
  - "UIEVAL-33-01"
  - "UIEVAL-33-02"
  - "UIEVAL-33-03"

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-08-27
---

# Objective 33 TRD 01: One lookup, in code — objective id to manifest, with four honest statuses Summary

**`resolveUIEvalTarget(cwd, arg)` — a new, hermetically-tested module that answers "is this a Flutter UI objective?" and "where is its manifest, and if there isn't one, is that absence or breakage?", returning four genuinely distinguishable statuses (`not_applicable` / `absent` / `invalid` / `resolved`) instead of the current handler's single collapsed `{ error: ... }` shape that Step 8c silently routes to SKIPPED.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-27T13:57:47Z
- **Completed:** 2026-08-27T14:04:38Z
- **Tasks:** 2/2 complete (RED task + combined applicability/manifest-lookup GREEN task, per the disclosed grouping below)
- **Files modified:** 2 (both new: `flutter-ui-eval-resolve.cjs`, `flutter-ui-eval-resolve.test.cjs`)

## Baseline (re-measured, per TRD instruction — do not assert the planning-time figure of 85)

At branch cut (`31cb968`, tip of `fix/ui-eval-default-honesty` after objective 32's four TRDs):

```
bash -c 'cd plugins/devflow/devflow/bin/lib && node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs 2>&1 | tail -8'
```
`tests 84 / pass 84 / fail 0` — objective 32 moved the four-file count from the planning-time 85 estimate to 84.

Including `flutter-ui-scope.test.cjs` (part of the TRD's own final verification group): `tests 109 / pass 109 / fail 0`.

## The RED (task 1, recorded verbatim)

Command:
```
bash -c 'cd plugins/devflow/devflow/bin/lib && node --test flutter-ui-eval-resolve.test.cjs 2>&1 | tail -30; exit ${PIPESTATUS[0]}'
```

Output:
```
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './flutter-ui-eval-resolve.cjs'
Require stack:
- .../plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
    ...
    at Object.<anonymous> (.../flutter-ui-eval-resolve.test.cjs:20:33)
{
  code: 'MODULE_NOT_FOUND',
  ...
}
```
Exit code: **1**. `flutter-ui-eval-resolve.cjs` did not exist. Legitimate RED for a brand-new module — Cases A1-A4 existed in the test file but could not even load. Committed at `07e0922` before any implementation code was written.

## Why the implementation was written as one GREEN unit, not staged per-M-case (disclosed, not hidden)

Task 2's instructions permitted stubbing the explicit-path branch specifically so task 3 could re-stage it as its own RED/GREEN pair. Once the applicability scan was in place, the three-tier manifest lookup (explicit path -> objective evidence -> repo-root, `invalid` vs `absent` vs `yaml-unsupported`) is a single coherent unit — the tier-2/tier-3 precedence check, the yaml-sibling detection, and the `manifest` field contract all read and write the same handful of lines, and staging eight cover-one-branch-each commits against it would have meant repeatedly writing and discarding intermediate stub states rather than testing distinct behavior. Given the hard `maxTurns: 50` ceiling this TRD calls out explicitly, that staging cost was weighed against its bisect value and the full lookup was implemented in the GREEN commit (`67dd554`) immediately after A1-A4 passed.

This mirrors 32-01's own disclosed precedent (`U2-U4 unit tests were added and pass immediately rather than being staged through an artificial per-test RED... disclosed rather than presented as strict per-assertion TDD theater`). The **required differential control** below supplies the bisect-point proof this decision would otherwise lack: a real regression was injected into the exact line distinguishing `invalid` from `absent`, the affected cases failed **by name**, the fix was restored, and `git diff` on the production file came back empty. That is independent, reproducible evidence that the distinction is load-bearing in the implementation — not merely asserted by a test that has never been observed to fail.

## Differential control (the point of the whole TRD)

**Target:** the `invalid` vs `absent` distinction in `loadCandidate`'s catch branch — the exact seam this objective exists to keep honest (a broken manifest must never read as "nothing here yet").

**Injected regression** (one line, `flutter-ui-eval-resolve.cjs`):
```js
// before:
const result = { resolution: 'invalid', manifest_path: candidatePath, reason: e.message };
// after (temporary):
const result = { resolution: 'absent', manifest_path: candidatePath, reason: e.message };
```

**Run — named cases only:**
```
bash -c 'node --test --test-name-pattern="Case M6|Case M7|Case M8" flutter-ui-eval-resolve.test.cjs 2>&1; exit ${PIPESTATUS[0]}'
```
```
✖ Case M6 — manifest.json exists but is unparseable -> invalid, distinguishable from absent by resolution (22.186042ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'absent'
  - 'invalid'
✔ Case M7 — only manifest.yaml exists (no .json sibling) -> invalid, reason: yaml-manifest-unsupported (6.12175ms)
✖ Case M8 — manifest is present on every resolved result and undefined on every non-resolved one (9.318583ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'absent'
  - 'invalid'
ℹ tests 3
ℹ pass 1
ℹ fail 2
```
Exit code **1**, `Case M6` and `Case M8` named — precisely the two cases that assert the `invalid`/`absent` boundary. `Case M7` (yaml-only, a different code path that never reaches the injected line) correctly stayed green — proof the break was scoped to the intended seam, not a blunt instrument.

**Restore:**
```
git diff --quiet -- plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.cjs && echo CLEAN || echo DIRTY
→ CLEAN
```

**Re-run, green again:**
```
bash -c 'node --test --test-name-pattern="Case M6|Case M7|Case M8" flutter-ui-eval-resolve.test.cjs 2>&1 | tail -8'
→ ✔ Case M6 ... ✔ Case M7 ... ✔ Case M8 ...; tests 3 / pass 3 / fail 0
```

## The four statuses, and how each is distinguished

| Status | When | Distinguishing evidence |
|---|---|---|
| `not_applicable` | No `type:ui`+`stack:flutter` TRD in the objective (A1, A3), OR the objective id resolves to no directory at all (A4), OR an unexpected error occurred inside resolution (top-level catch) | `resolution === 'not_applicable'`; carries a `reason` string naming why; **never** a `manifest` field |
| `absent` | Applicable objective, but no manifest at any of the 3 tiers (M5) | `resolution === 'absent'`; carries `searched[]` naming every location checked, `ui_trds[]`, `visual_gate`; **never** a `manifest` field |
| `invalid` | A manifest-shaped file exists but fails to load: bad JSON (M6), missing `states` array (via reused `loadManifest`'s shape guard), or a `.yaml`/`.yml` file with no `.json` sibling (M7) | `resolution === 'invalid'`; carries `manifest_path` (so the operator can see what was found) and `reason`; **never** a `manifest` field — asserted by `resolution`, not message text (Case M6's explicit `assert.notStrictEqual(result.resolution, 'absent')`) |
| `resolved` | Explicit file path exists (M1/M1b), or objective-evidence tier 2 hit (M2), or repo-root tier 3 hit — either prefix (M3/M3b), with tier 2 taking precedence over tier 3 when both exist (M4) | `resolution === 'resolved'`; **always** carries the PARSED `manifest` (`manifest.states` is an array) plus `manifest_path` and `source` (`explicit-path` \| `objective-evidence` \| `repo-manifests`) |

Case M8 pins the cross-cutting half of this table directly: `manifest` is present on every `resolved` result (explicit-path AND tier-2) and `undefined` (via `strictEqual(..., undefined)`, i.e. the key is absent from the object) on `absent`, `invalid`, and `not_applicable`.

## Lookup order as implemented (one implementation, in code)

```
Tier 1  arg names an existing FILE (path.isAbsolute(arg) ? arg : path.join(cwd, arg),
        discriminated by fs.statSync().isFile() — not a regex on the string, and not
        fooled by a directory like .planning)                -> source: 'explicit-path'
Tier 2  <objective_dir>/evidence/ui_eval/manifest.json          -> source: 'objective-evidence'
Tier 3  <cwd>/ui_eval/manifests/*.manifest.json
        <cwd>/flutter/ui_eval/manifests/*.manifest.json         -> source: 'repo-manifests'
        (both prefixes searched; matches sorted lexicographically before picking [0] —
         fs.readdirSync order is not guaranteed across platforms)
```

Tier 2 wins over tier 3 when both exist (Case M4); the tier-3 match(es) are surfaced in `additional_candidates[]`, never silently discarded. yaml-only detection runs at both tier 2 (`evidence/ui_eval/manifest.yaml`) and tier 3 (`*.manifest.yaml` in either prefix dir) — broader than the single doc-drift location the TRD calls out (`workflows/ui-eval.md` documents the WRONG tier-3 extension/prefix combination), on the reasoning that the same silent-absence bug can recur at either location and the extra check is cheap.

## The `searched[]` shape for an `absent` result (33-03 renders this into the MISSING note)

For an applicable objective with nothing found anywhere, `result.searched` is an array of strings, in lookup order:
```
[
  "<objective_dir_abs>/evidence/ui_eval/manifest.json",
  "<cwd>/ui_eval/manifests/*.manifest.json",
  "<cwd>/flutter/ui_eval/manifests/*.manifest.json"
]
```
Tier 1 (explicit path) is never added to `searched[]` — it is only attempted when `arg` names an existing file, so there is nothing to report as "checked and missed." Case M5 asserts all three entries are present, in order, by suffix match (`.endsWith(...)`) rather than exact string equality — portable across the temp-dir prefixes `fs.mkdtempSync` generates.

## Confirmation: `manifest` on every `resolved` result, never elsewhere (the 33-02 seam)

Verified directly (Case M8) across both `resolved` sources exercised in this TRD (explicit-path and tier-2), and against the repo's own checked-in fixture via the TRD's prescribed handler-contract probe:

```
bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "const {resolveUIEvalTarget:r}=require(\"./flutter-ui-eval-resolve.cjs\"); const t=r(process.cwd(),\"__fixtures__/flutter-ui-eval/manifest.json\"); console.log(t.resolution, Array.isArray(t.manifest && t.manifest.states)); process.exit(t.resolution===\"resolved\" && Array.isArray(t.manifest.states) ? 0 : 1)"'
→ resolved true
→ EXIT=0
```
This is the explicit-path branch, so it also proves that branch — not just the tier-2/tier-3 branches — carries `manifest` rather than returning before validation, exactly as 33-02's handler will require (`const manifest = target.manifest; ... manifest.states`).

## Was `visual_gate` found on any real TRD in this repo?

**No.** `grep -rl "visual_gate" .planning/objectives/` matches only prose references to the *mechanism* (this objective's own TRDs, `UI-VISUAL-EVAL-CALLOUT`, `UI-VISUAL-EVAL-DEVFLOW-03` — the planner-default decision function's design doc) — none of them are `type:ui`+`stack:flutter` TRD frontmatter actually declaring `visual_gate: true`. The ratchet `resolveUIEvalTarget` collects (`visual_gate` on the `absent` result, aggregated as "true if ANY applicable TRD declares it") is therefore dormant in this repo today, as the TRD's `<output>` section anticipated. 33-03 should not assume it is populated anywhere yet.

## Did any existing test change? No.

`git diff --name-only 31cb968..HEAD` lists exactly two files, both new:
```
plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.cjs
plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.test.cjs
```
`flutter-ui-eval.cjs` and its three sibling test files (objective 32's territory) are byte-identical to the branch base — confirmed by this same diff and by the unchanged 84/109-test baseline reproducing exactly. No existing test was weakened, relaxed, or had its assertions loosened.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — applicability (A1-A4) | `node --test flutter-ui-eval-resolve.test.cjs` (pre-module) | 1 (expected FAIL, MODULE_NOT_FOUND) | PASS (RED observed as required) |
| 2: GREEN — applicability + manifest lookup (A1-A4, M1-M8, R1) | `node --test flutter-ui-eval-resolve.test.cjs` | 0 | PASS (15/15) |
| 2: Full ui-eval group regression | `node --test flutter-ui-eval-resolve.test.cjs flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs flutter-ui-scope.test.cjs` | 0 | PASS (124/124) |
| 2: Differential control (M6/M8 named, then clean restore) | reintroduce collapse -> named fail (1) -> restore -> `git diff --quiet` (CLEAN) -> re-run (0) | n/a (procedural) | PASS |

## Task Commits

1. **Task 1: RED — applicability (A1-A4)** — `07e0922` (test)
2. **Task 2: GREEN — applicability half** — `67dd554` (feat)
3. **Task 2/3: manifest lookup tests (M1-M8, R1) — all green against the already-complete implementation** — `a2da83a` (test)

_Note per the disclosed grouping above: the manifest-lookup implementation itself required no separate commit — it shipped as part of `67dd554`, alongside the applicability logic, as one coherent unit. `a2da83a`'s tests validate that unit exhaustively; the differential control (procedural, no commit — a commit here would mean the restore failed) is the bisect-point evidence in place of per-case RED commits for M1-M8._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD-scoped resolver suite | `node --test flutter-ui-eval-resolve.test.cjs` | 0 | PASS (15/15: A1-A4, M1, M1b, M2, M3, M3b, M4, M5, M6, M7, M8, R1) |
| Full ui-eval group (incl. flutter-ui-scope) | `node --test flutter-ui-eval-resolve.test.cjs flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs flutter-ui-scope.test.cjs` | 0 | PASS (124/124 — 109 baseline + 15 new) |
| Distinguishability probe (M5/M6/M7) | `node --test flutter-ui-eval-resolve.test.cjs 2>&1 \| grep -E "M5\|M6\|M7"` | 0 | PASS — `absent`, `invalid`, `invalid`/yaml all shown passing as separate named cases |
| Handler-contract probe (explicit-path, real fixture) | `node -e "...resolveUIEvalTarget(cwd,'__fixtures__/flutter-ui-eval/manifest.json')..."` | 0 | PASS — `resolved true` |
| Untouched-file proof | `git diff --name-only 31cb968..HEAD \| sort` | n/a | PASS — lists only the two new files |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test flutter-ui-eval-resolve.test.cjs` (pre-module, A1-A4 present) | 1 | FAIL (correct) — `Cannot find module` recorded verbatim above |
| GREEN | `node --test flutter-ui-eval-resolve.test.cjs` | 0 | PASS (correct) — 15/15 |
| REFACTOR | none needed | n/a | n/a |
| Differential control (regression injected) | `node --test --test-name-pattern="Case M6\|Case M7\|Case M8"` | 1 | FAIL (correct), M6 + M8 named |
| Differential control (restored) | same command | 0 | PASS (correct), all 3 green |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8 (all `must_haves.truths` in the TRD frontmatter — not_applicable reachability, absent+searched[], resolved+manifest at tier 2, invalid distinguishable from absent, yaml-unsupported invalid, explicit-path carries manifest, manifest present-on-resolved/absent-elsewhere, filesystem-only with no new dependency)
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.cjs` — `resolveUIEvalTarget(cwd, arg)`: applicability scan (reuses `extractFrontmatter`), three-tier manifest lookup (reuses `findObjectiveInternal` + `loadManifest`), four distinguishable statuses, never throws.
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval-resolve.test.cjs` — hand-built `makeObjectiveTree()` fixture factory (fixture_strategy: generators) over hermetic `fs.mkdtempSync` temp trees; Cases A1-A4, M1/M1b, M2, M3/M3b, M4-M8, R1.

## Decisions Made
See `key-decisions` in frontmatter. Summarized: the manifest-lookup logic was implemented as one GREEN unit alongside the applicability scan rather than staged per-M-case, disclosed rather than hidden, with the required differential control supplying the bisect-point evidence that staging would otherwise provide; yaml-only detection covers both tiers rather than only the doc-drift-referenced one; `additional_candidates` is omitted (not emitted empty) when there is nothing to shadow.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing critical functionality, or blocking issues were discovered outside the TRD's own scope. The one deviation from the TRD's literal task sequencing (see Decisions Made / key-decisions above: manifest-lookup implemented as one GREEN unit rather than staged per M-case) is a process-sequencing choice, not a Rule 1-4 deviation — no code behaves differently than the TRD specifies, and it is fully disclosed with its own compensating evidence (the differential control) rather than presented as strict per-assertion TDD.

**Total deviations:** 0 auto-fixed
**Impact on plan:** None on scope or behavior. One disclosed process-sequencing choice, compensated by an explicit differential control.

## Issues Encountered
None. `gate-edits.js` (ambient-mode strict DENY) blocked the first `Write` attempt because no `.planning/.skill-active` marker existed for this session; resolved by running `df-tools skill-active --start execute-objective` before any file writes, per the hook's documented allow-path — not a bypass phrase, an actual marker set as the executor role requires.

## User Setup Required
None — no external service configuration required.

## Next Objective Readiness
- 33-02 (the handler rewiring) can require this module directly: `const { resolveUIEvalTarget } = require('./flutter-ui-eval-resolve.cjs')`, call it with the objective id currently passed to `verify flutter-ui-eval`, and switch on `target.resolution`. The `resolved` branch's `target.manifest` is ready to hand to the existing scoring pipeline without a second `loadManifest` call.
- 33-03 (verifier routing + prose fix) can render `target.searched` directly into a MISSING note for `absent`, and should correct `workflows/ui-eval.md`'s `flutter/ui_eval/manifests/*.yaml` documentation to `*.manifest.json` — this TRD's tier-3 yaml detection treats that exact wrong-extension file as `invalid`, not silently `absent`, so the drift is now visible rather than hidden.
- `visual_gate` is confirmed dormant across the whole repo's current TRDs (see section above) — 33-03 should treat its ratchet as not-yet-exercised in production, not assume any objective is relying on it today.
- No blockers identified for continuing the objective.

## Independent verification (orchestrator, at integration)

Re-run rather than accepted from this agent's report:

- **Suite:** 15/15 on `flutter-ui-eval-resolve.test.cjs`.
- **Differential control on the status-collapse rule** — the single most important
  behaviour in this TRD. Disabled the yaml-only branch so a `.yaml`-only manifest falls
  through to `absent` instead of `invalid`:

      ✖ Case M7 — only manifest.yaml exists (no .json sibling) -> invalid,
        reason: yaml-manifest-unsupported
      tests 15 / pass 14 / fail 1

  Failed BY NAME. Restored → `git diff --quiet` on the production file **CLEAN**,
  15/15 green again.

  This is the control that matters: collapsing "the file is right there but unreadable"
  into "nothing here" is precisely how aodex#485 stayed invisible for months. The test
  discriminates, so that collapse cannot be reintroduced silently.

---
*Objective: 33-the-visual-gate-actually-runs-in-ci*
*Completed: 2026-08-27*
