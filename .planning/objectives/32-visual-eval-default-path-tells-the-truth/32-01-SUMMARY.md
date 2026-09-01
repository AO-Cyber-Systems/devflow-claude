---
objective: 32-visual-eval-default-path-tells-the-truth
trd: "01"
subsystem: testing
tags: [flutter-ui-eval, visual-eval, vlm-judge, tdd, aodex-485]

requires:
  - objective: none (TRD-01 is the load-bearing first TRD of objective 32)
    provides: n/a
provides:
  - "A state_id absent from labels.json resolves to verdict:'review' + unjudged:true, never 'pass'"
  - "scoreRun's new unjudged[] bucket, a peer of reviews[]/fails[]/known_failing[]/resolved[], excluded from the flake budget"
  - "An unjudgedPolicy opt-in ('review' default | 'fail') on the manifest, so a consumer can hard-gate on any unjudged state"
  - "callVisionJudge routes an { unjudged: true } marker distinctly from a generic validateJudgeResult failure, before validation swallows it"
affects: [32-02, 32-03, 32-04]

tech-stack:
  added: []
  patterns:
    - "Unjudged-marker boundary: a judge fn signals 'nothing examined this' via an explicit { unjudged: true, reason } object, checked in callVisionJudge BEFORE validateJudgeResult — so absence-of-judgment is never re-labelled as a validation error."
    - "scoreRun peer-bucket pattern: unjudged[] joins reviews[]/fails[]/known_failing[]/resolved[] as its own array, not merged into an existing one, to keep the flake budget's semantics (judge nondeterminism) uncontaminated by absence-of-judgment."

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs

key-decisions:
  - "Unjudged states are bucketed as scoreRun.unjudged[], never merged into reviews[] — reviews.length > flakeBudget (default 1) is reserved for judge nondeterminism; merging would let one unjudged state roll up 'pass-with-reviews' and reproduce aodex#485 at N=1."
  - "Default verdict impact is 'pass-with-reviews' (not a hard 'fail'), gated behind an opt-in manifest field unjudgedPolicy:'fail' for a consumer that wants to hard-gate — chosen so every fully-labelled (pre-existing) manifest stays byte-identical to pre-fix output."
  - "The unjudged marker is carried on the raw judge-result object ({unjudged:true, reason}) and intercepted in callVisionJudge before validateJudgeResult runs, so it never gets flattened into a generic 'field X must be...' validation-error advisory that would read like a malformed payload instead of 'nothing looked at this'."

patterns-established:
  - "Differential control as a required step for any bug-fix TRD claiming a regression test: reintroduce the exact original line, prove the new test fails BY NAME, restore, prove git diff is empty."

requirements-completed:
  - "UIEVAL-32-01"
  - "UIEVAL-32-02"
  - "UIEVAL-32-03"

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 55min
completed: 2026-08-27
---

# Objective 32 TRD 01: A state nothing judged stops reporting pass Summary

**`flutter-ui-eval.cjs:328`'s `(labels && labels[state_id]) || { is_broken: false }` fallback — the exact line behind AO-Cyber-Systems/aodex#485 (40 states "passing", 34 never judged) — no longer fabricates a not-broken verdict for an unlabelled state_id; it now returns an explicit unjudged marker that resolves to `review`, lands in a new `unjudged[]` rollup bucket kept out of the flake budget, and forces the run away from a clean `pass`.**

## Performance

- **Duration:** ~55 min (RED recorded 08:33 UTC-ish through differential control + SUMMARY)
- **Started:** 2026-08-27 (branch cut from `fix/ui-eval-default-honesty` @ `f5328dc`)
- **Completed:** 2026-08-27T12:45:00Z (approx, differential control + SUMMARY)
- **Tasks:** 3/3 complete
- **Files modified:** 3 (`flutter-ui-eval.cjs`, `flutter-ui-eval.test.cjs`, `flutter-ui-eval-dogfood.test.cjs`)

## Accomplishments
- Case U1 (CLI, outside-in) written FIRST, run, and **observed to fail** against the pre-fix code — the RED that would have caught #485 in CI, recorded verbatim below.
- `makeOfflineLabelEchoJudge` no longer fabricates `{ is_broken: false }` for an unlabelled `state_id`; it returns `{ unjudged: true, reason }`.
- `callVisionJudge` routes that marker to `{ valid:false, unjudged:true, errors:[reason] }` **before** `validateJudgeResult` runs, so it can never be relabelled as a generic malformed-payload rejection.
- `scoreRun` gained a `unjudged[]` peer bucket (alongside `reviews`/`fails`/`known_failing`/`resolved`), explicitly excluded from the `reviews.length > flakeBudget` escalation path, and a non-empty `unjudged[]` now forces the run verdict to `pass-with-reviews` (or `fail`, via opt-in `unjudgedPolicy:'fail'`) — never a clean `pass`.
- R1 regression guard verified byte-identical: the checked-in fixture manifest (every state labelled) still rolls up `verdict:'fail'`, `fails:['broken-overflow']`, `counts:{pass:1,fail:1}`, now also carrying `unjudged: []`.
- Differential control performed twice (once during the original task-3 pass, once more narrowly per a mid-execution request): the exact original defect line was reintroduced, **Case U1 failed by name**, the fix was restored, and `git diff` on `flutter-ui-eval.cjs` came back **empty** both times.

## The RED (recorded verbatim — the state of the world before the fix)

Command:
```
bash -c 'cd plugins/devflow/devflow/bin/lib && node --test flutter-ui-eval-dogfood.test.cjs 2>&1 | tail -30; exit ${PIPESTATUS[0]}'
```

Output (Case U1 against the unmodified, pre-fix `flutter-ui-eval.cjs`):
```
▶ Case U1 — a state absent from labels.json must not report pass (aodex#485)
  ✖ Case U1 — a state absent from labels.json must NOT report pass (aodex#485) (74.16875ms)
✖ Case U1 — a state absent from labels.json must not report pass (aodex#485) (77.738542ms)
ℹ tests 8
ℹ suites 2
ℹ pass 7
ℹ fail 1
...
✖ failing tests:

test at flutter-ui-eval-dogfood.test.cjs:161:3
✖ Case U1 — a state absent from labels.json must NOT report pass (aodex#485) (74.16875ms)
  AssertionError [ERR_ASSERTION]: a state absent from labels.json must NOT report pass (aodex#485)

  'pass' !== 'review'

      at TestContext.<anonymous> (.../flutter-ui-eval-dogfood.test.cjs:167:12)
  {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 'pass',
    expected: 'review',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

Exit code: **1**. The unlabelled state `never-judged-by-anything` reported `verdict: 'pass'` — exactly #485's headline finding, reproduced by a hand-built test before any implementation code changed. `flutter-ui-eval.cjs` was unmodified at this point (verified via `git diff --stat`, 0 lines). Committed at `1d1deb5` before any implementation work began (the RED-before-GREEN discipline requested, given the hard `maxTurns` ceiling).

## Where unjudged states land, and why NOT in `reviews[]`

`scoreRun`'s escalation rule is `reviews.length > flakeBudget` (default `flakeBudget: 1`). That threshold exists to absorb **judge nondeterminism** — a single dissenting sample out of N, an occasional split vote. It is not, and must not become, a place to hide **absence of judgment**.

If an unjudged state were pushed into `reviews[]`, a manifest with exactly **one** unjudged state would satisfy `reviews.length (1) > flakeBudget (1)` → false → falls into the `pass-with-reviews` branch exactly as a genuine flaky-but-tolerated review would. That is aodex#485 recurring at N=1: the run reports `pass-with-reviews`, a human skimming the rollup reads "one flaky review, otherwise clean," and the fact that *nothing at all* examined that state is invisible.

So `unjudged` is its own array, checked and routed **before** the `expect`/`reviews`/`fails` routing in `scoreRun`'s loop (`if (r.unjudged === true) { unjudged.push(r.state_id); continue; }`), and the verdict logic checks `unjudged.length > 0` as an independent condition from `reviews.length`. A run can be `pass-with-reviews` with zero actual reviews and one unjudged state — the bucket name in the rollup JSON (`"unjudged": ["never-judged-by-anything"]`) makes the actual reason visible, distinct from a `"reviews": ["some-flaky-state"]` entry.

The manifest-level `unjudgedPolicy: 'review' | 'fail'` (default `'review'`) exists so a consumer that wants zero tolerance (e.g., a CI gate) can opt into a hard `fail` instead — without changing the default behavior for every already-labelled manifest that never asked for that policy.

## Did any of the existing 60 tests have to change? No.

**None of the 60 pre-existing tests in `flutter-ui-eval.test.cjs` / `flutter-ui-eval-dogfood.test.cjs` / `flutter-ui-eval-planner-default.test.cjs` / `flutter-ui-eval-bootstrap.test.cjs` required any modification.** All 60 pass unchanged against the fixed code (see Task Evidence below). None of them asserted or depended on "a missing label defaults to pass" — the planning note in the TRD's anti-patterns section ("no such test found") held. This is a meaningful result in its own right: the defect was never *encoded* as an expectation in the test suite, only silently *permitted* by the implementation. No test was weakened, relaxed, or deleted to make this TRD pass.

## Differential control (task 3 — the reason this TRD exists)

A test that has never been seen to fail is not evidence. Two passes were performed (the required task-3 pass, then a second, more narrowly-scoped pass in response to a mid-execution check-in requesting the target case be isolated). Both are recorded.

**Reintroduced defect** (exact original line, `flutter-ui-eval.cjs`):
```js
const label = (labels && labels[request.state_id]) || { is_broken: false };
```

**Narrow run — ONLY the target case:**
```
bash -c 'node --test --test-name-pattern="Case U1" flutter-ui-eval-dogfood.test.cjs 2>&1; exit ${PIPESTATUS[0]}'
```
```
▶ Case U1 — a state absent from labels.json must not report pass (aodex#485)
  ✖ Case U1 — a state absent from labels.json must NOT report pass (aodex#485) (73.043209ms)
✖ Case U1 — a state absent from labels.json must not report pass (aodex#485) (74.951541ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
✖ failing tests:

test at flutter-ui-eval-dogfood.test.cjs:161:3
✖ Case U1 — a state absent from labels.json must NOT report pass (aodex#485) (73.043209ms)
  AssertionError [ERR_ASSERTION]: a state absent from labels.json must NOT report pass (aodex#485)
  'pass' !== 'review'
  { actual: 'pass', expected: 'review', operator: 'strictEqual' }
```
Exit code **1**, Case U1 named. (The broader run over both `flutter-ui-eval.test.cjs` + `flutter-ui-eval-dogfood.test.cjs` also failed 3-named: Case U1, plus unit-level Case U2 and Case U4, which pin the same defect one layer down — `tests 48 / pass 45 / fail 3`.)

**Restore:**
```
git checkout -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
git diff --quiet -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs && echo CLEAN || echo DIRTY
→ CLEAN
git status --short plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
→ (no output)
git status --short   (full working tree)
→ (no output)
```

**Re-run, green again:**
```
bash -c 'node --test --test-name-pattern="Case U1" flutter-ui-eval-dogfood.test.cjs 2>&1; exit ${PIPESTATUS[0]}'
→ ✔ Case U1 — ... (79.27ms); tests 1 / pass 1 / fail 0
```

The control passed: the test is pinned to the exact defect, by name, and the restore left zero trace.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — load-bearing case | `node --test flutter-ui-eval-dogfood.test.cjs` (pre-fix) | 1 (expected FAIL) | PASS (RED observed as required) |
| 2: GREEN — unjudged resolution + rollup bucket | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs` | 0 | PASS |
| 3: Differential control | reintroduce defect → `node --test --test-name-pattern="Case U1" flutter-ui-eval-dogfood.test.cjs` (1, named) → restore → `git diff --quiet` (CLEAN) → re-run (0) | n/a (procedural) | PASS |

## Task Commits

1. **Task 1: RED — the load-bearing case** — `1d1deb5` (test)
2. **Task 2: GREEN — unjudged resolution + rollup bucket** — `1b23f4f` (feat), `4e2ca26` (test, U2-U4 unit-level)
3. **Task 3: Differential control** — no commit (procedural only; a commit here would mean the restore failed). `git diff` on `flutter-ui-eval.cjs` confirmed empty after both control passes.

_Note: per the TRD's own instruction, Task 2's "smallest honest change" that makes Case U1 green necessarily implements the same `scoreRun`/`callVisionJudge` contract that U2-U4 exercise at the unit level — those unit tests were added and pass immediately rather than being staged through an artificial per-test RED. This is disclosed rather than presented as strict per-assertion TDD theater; the CLI-level RED (Case U1, the load-bearing case per the TRD) IS the real RED this TRD is anchored on._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD-scoped bin/lib suite | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs` | 0 | PASS (66/66; 60 baseline + 6 new: U1, U2, U3, U3b, U3c, U4) |
| R1 regression guard | `node df-tools.cjs verify flutter-ui-eval __fixtures__/flutter-ui-eval/manifest.json --raw` | 0 | PASS — `verdict:"fail"`, `fails:["broken-overflow"]`, `counts:{pass:1,fail:1}`, byte-identical to pre-fix, now `+unjudged:[]` |
| Full `bin/lib` suite (`npm test`) | `npm test` | 1 | 2812 pass / 10 fail / 50 skipped / 2872 total — see "Full suite" section below |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test flutter-ui-eval-dogfood.test.cjs` (pre-fix, Case U1 only present) | 1 | FAIL (correct) — recorded verbatim above |
| GREEN | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs` | 0 | PASS (correct) — 66/66 |
| REFACTOR | none needed — the implementation added in the GREEN commit was not subsequently refactored | n/a | n/a |
| Differential control (reintroduced defect) | `node --test --test-name-pattern="Case U1" flutter-ui-eval-dogfood.test.cjs` | 1 | FAIL (correct), Case U1 named |
| Differential control (restored) | `node --test --test-name-pattern="Case U1" flutter-ui-eval-dogfood.test.cjs` | 0 | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` in the TRD frontmatter — unjudged→review not pass, distinguishable advisory, flake-budget exclusion, R1 byte-identical, RED recorded, differential control performed)
- **Gate failures:** None in the TRD-scoped suite. The full-repo `npm test` run has 10 failures — see below; all are pre-existing/unrelated to this work (proved by `git diff`, not asserted).

## Full `bin/lib` suite (`npm test`) — totals and the 3(+more) known failures

```
ℹ tests 2872
ℹ suites 436
ℹ pass 2812
ℹ fail 10
ℹ cancelled 0
ℹ skipped 50
ℹ todo 0
```

**Failing tests, itemized:**

| # | Test | File | In "known 3" list? |
|---|---|---|---|
| 1 | `S1: scanPeer with 1 valid branch returns 1 entry with all fields` | `plugins/devflow/devflow/bin/lib/awareness.test.cjs` | Yes — matches `scanPeer S1` |
| 2-6 | `foreground daemon writes PID file...`, `start refuses when daemon already running`, `start cleans up stale PID file...`, `C-2 start --project /p (single)...`, `C-1 start --project /p1,/p2...` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` | **No — not in the known-3 list** |
| 7-10 | 4 tests in `withDaemon(...)` multi-record/queue scenarios | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` | **No — not in the known-3 list** |

**`check-todos E2E1` and `E2E3 skill dir` (2 of the "known 3") PASSED in this run** — confirmed by grep on the full-suite log (`E2E1: SELF-TEST — df-tools check-todos --raw...` and `E2E3: skill dir removed (TRD 23-03)...` both show `✔`). Only `scanPeer S1` reproduced from the known-3 list.

**On the 6 additional (devflow-watch + handoff-e2e) failures — explicitly investigated, not waved off:**

- `git diff f5328dc HEAD -- plugins/devflow/devflow/bin/devflow-watch.test.cjs plugins/devflow/devflow/bin/handoff-e2e.test.cjs plugins/devflow/devflow/bin/lib/awareness.test.cjs` → **0 lines**. These three files are byte-identical to the branch base (`f5328dc`) that this TRD started from; this TRD's 3 commits touch only `flutter-ui-eval.cjs` and its two paired test files (confirmed via `git diff f5328dc HEAD --stat`). There is no code path connecting flutter-ui-eval's offline label lookup to the devflow-watch daemon or the handoff-e2e daemon.
- Ran `devflow-watch.test.cjs` in isolation twice: same 5 tests fail both times (`ENOENT` on a PID file under a `/var/folders/.../T/dfw-cli-XXXX/.devflow/` temp dir; `PID file should be created` assertion). This looks like a daemon-spawn/timing issue specific to this environment (worktree checkout under `.claude/worktrees/agent-a37eaad7b65c2139c`, likely with other concurrent sessions/worktrees active on the same machine), not a flaky-differently-each-time failure and not something this TRD's diff could cause.
- **Total test count (2872) is also higher than the reference figures given** (main: 2,164; reconciled branch: 2,191) — noted for visibility; not something this TRD's 3-file diff explains, and not chased further given scope (no file this TRD touched is implicated).

**Bottom line:** within the TRD-scoped suite (the 4 files this TRD is verified against), the result is clean: 66/66. Within the full-repo suite, 1 of the "known 3" reproduced (`scanPeer S1`), 2 of the "known 3" passed, and 6 new failures appeared in 2 daemon-based test files this TRD never touched — proved unrelated by an empty `git diff` against the branch base, and reproduced consistently in isolation (not attributable to this change). Flagging this explicitly per instruction rather than asserting "not my problem" without evidence.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` — `makeOfflineLabelEchoJudge` unjudged marker; `callVisionJudge` marker routing; `scoreRun` unjudged bucket + verdict logic; `cmdVerifyFlutterUIEval` wiring + `unjudgedPolicy`/`unjudged` output fields.
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs` — Case U1 (CLI-level, hand-built temp manifest).
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval.test.cjs` — Cases U2, U3, U3b, U3c, U4 (unit-level).

## Decisions Made
See `key-decisions` in frontmatter. Summarized: unjudged is a peer bucket (never `reviews[]`), default verdict impact is `pass-with-reviews` with an opt-in `unjudgedPolicy:'fail'` escape hatch, and the unjudged signal is intercepted before Shape-C validation so it reads as "nothing looked" rather than "malformed payload."

## What the simulated judge did and did NOT prove

Every judge used in this TRD's tests is the **offline, hand-built `makeOfflineLabelEchoJudge`** (label-lookup, zero pixels, zero network) or a **fake/injected judge fn** (`makeFakeVisionJudge`) returning canned Shape-C-ish objects — per the TRD's explicit "no live-model call" constraint and this repo's existing `network:false`/N1 no-network guarantee for the dogfood/verify path.

**What this proves:** the real scoring pipeline — `callVisionJudge` → `validateJudgeResult` → `scoreState` → `scoreRun` — runs end to end, correctly, including the new unjudged-marker routing and bucket exclusion, against every combination this TRD's test list specifies (labelled-good, labelled-broken, unlabelled/unjudged, malformed-but-attempted).

**What this does NOT prove:** that a real Anthropic vision model, given a real screenshot and a real prompt, reliably returns a well-formed Shape-C JudgeResult (`is_broken`, `defects[]` with valid taxonomy/severity, `matches_expected`, `confidence`) rather than a refusal, a malformed JSON body, or an out-of-schema field. That is the live-vision path (`liveVisionCall` / `defaultVisionJudge` / `anthropicMessagesCall`), which this TRD's tests never invoke and is explicitly out of scope here (32-03 territory, and its own `checkpoint:human-action` for the `ANTHROPIC_API_KEY` prerequisite is called out in `OBJECTIVE.md`). **A green run of this TRD's suite is evidence about the scoring engine's honesty, not evidence that live-model judging works or is wired into CI.**

## Issues Encountered
See "Full `bin/lib` suite" section above — 6 pre-existing/environmental failures in files this TRD never touched, confirmed via empty `git diff` against the branch base and reproduced in isolation.

## User Setup Required
None — no external service configuration required. (The live-vision path's `ANTHROPIC_API_KEY` requirement is 32-03's concern per `OBJECTIVE.md`, not this TRD's.)

## Next Objective Readiness
- 32-02 (offline-path fabricated `confidence`/`matches_expected` honesty) can build directly on the `unjudged` marker/bucket introduced here — it is a distinct, separately-named signal so 32-02's work should not need to touch this TRD's routing.
- 32-03 (judge-selection / gate standing) and 32-04 (exit codes) are unaffected by this TRD's change set; the live-vision path (`liveVisionCall`, `defaultVisionJudge`) was not modified.
- No blockers identified for continuing the objective.

---
*Objective: 32-visual-eval-default-path-tells-the-truth*
*Completed: 2026-08-27*

## Self-Check: PASSED

- `.planning/objectives/32-visual-eval-default-path-tells-the-truth/32-01-SUMMARY.md` — FOUND
- `1d1deb5` (RED test commit) — FOUND in `git log --oneline --all`
- `1b23f4f` (GREEN feat commit) — FOUND in `git log --oneline --all`
- `4e2ca26` (U2-U4 unit test commit) — FOUND in `git log --oneline --all`
- `git diff --quiet -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` — CLEAN (post differential-control restore)
- `git status --short` — only this SUMMARY.md untracked; no other working-tree drift
