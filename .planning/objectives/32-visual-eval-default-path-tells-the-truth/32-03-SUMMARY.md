---
objective: 32-visual-eval-default-path-tells-the-truth
trd: "03"
subsystem: testing
tags: [flutter-ui-eval, visual-eval, vlm-judge, tdd, aodex-485, verifier]

requires:
  - objective: 32-02
    provides: "evidence-tagged JudgeResults (evidence:'label'|'vision'), buildManifestStub emitting state_id"
provides:
  - "Explicit --judge selection: absent -> 'labels' (default, unchanged behaviour), 'live' or 'labels' accepted, anything else rejected with a usage error (stderr + exit 1) instead of a silent offline fallthrough"
  - "A new rollup field gate:'binding'|'advisory' — the run's STANDING (what authority its verdict carries), independent of outcome. 'binding' ONLY on --judge live; 'advisory' everywhere else"
  - "verifier.md Step 8c: only gate:'binding' AND verdict:pass (no fails/reviews/unjudged) may REMOVE a surface from the Step 9 human_verification list — the fix for the causal chain that retired aodex#485's 34 unjudged states from human review"
  - "SKILL.md corrected to stop describing the default (offline) path as machine-judging visual correctness"
affects: [32-04]

tech-stack:
  added: []
  patterns:
    - "gate as STANDING, not outcome: a field answering 'what authority does this verdict carry' is orthogonal to verdict/judge/network — a live run that fails is still gate:'binding'; an offline run that passes cleanly is still gate:'advisory'. Conflating standing with outcome is exactly how a labels lookup can impersonate a gate."
    - "Explicit-enum flag validation over boolean flag sniffing: --judge is parsed into exactly {'labels','live'} or rejected outright, replacing the old 'anything other than the literal string live silently means offline' behaviour — a typo can no longer be misread as an intentional default."

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/skills/ui-eval/SKILL.md

key-decisions:
  - "The default judge stays offline-labels (rejected: live-by-default, rejected: live-when-credentials-present — both recorded and rejected in OBJECTIVE.md/this TRD's <objective> before execution). The default instead stops claiming gate authority: it now emits gate:'advisory' and Step 8c can never retire a human check from it, whatever its verdict."
  - "gate is a NEW, additive field alongside judge/network — it does not replace them. judge/network answer 'what ran / did it touch the network'; gate answers 'what authority does the verdict carry'. Keeping them distinct means a live run that happens to fail is still gate:'binding' (correctly), not silently downgraded."
  - "G3 (--judge live declares gate:'binding') is asserted with ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN/ANTHROPIC_BASE_URL stripped from the child process env, so the test is free, deterministic, and CI-safe even if a developer has a key exported in their shell. The credential-less run downgrades every state to 'review' (verdict:'fail', 2 reviews > flakeBudget 1 on the 2-state fixture) but gate still reads 'binding' — proving gate reflects the requested path, not the outcome."
  - "Step 8c's own CLI invocation (verify flutter-ui-eval \"$OBJECTIVE\" --raw) was NOT changed to add --judge live, conditionally or otherwise — that is exactly the rejected 'live-when-credentials-present' alternative in different clothes. Until a human explicitly wires --judge live into that call site (which itself needs the CI credential — see Task 3 below), Step 8c's own runs remain gate:'advisory' and will never retire a surface. That is the correct, honest state of the world today, not a bug."

patterns-established:
  - "Differential control as a required step for any bug-fix TRD claiming a regression test (continued from 32-01/32-02): reintroduce the exact pre-fix file, prove the new tests fail BY NAME, restore, prove git diff is empty."

requirements-completed:
  - "UIEVAL-32-07"
  - "UIEVAL-32-08"
  - "UIEVAL-32-09"

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~70min (across a resumed continuation after a maxTurns ceiling)
completed: 2026-08-27
---

# Objective 32 TRD 03: Judge selection is explicit, and the default stops claiming gate authority Summary

**`--judge` is now a validated three-way flag (absent -> `labels`, `labels`, `live`, anything else rejected with a usage error) and the `flutter-ui-eval` rollup carries a new `gate: 'binding'|'advisory'` field — the run's STANDING, not its outcome — that verifier.md Step 8c now requires to be `'binding'` before it will ever retire a surface from the Step 9 human-verification list. A `gate: 'advisory'` clean pass (the default offline label-echo path) can no longer silently impersonate a visual gate.**

## Performance

- **Duration:** ~70 min total, executed across a maxTurns-ceiling resumption (Task 1 RED+GREEN+differential-control committed before the ceiling; Task 2 completed on resume)
- **Tasks:** 2/3 complete (Task 3 is `checkpoint:human-action` — recorded below as a pending human action, not attempted, per explicit instruction)
- **Files modified:** 4 (`flutter-ui-eval.cjs`, `flutter-ui-eval-dogfood.test.cjs`, `verifier.md`, `SKILL.md`)

## Accomplishments

- **Task 1 (TDD):** G1-G5 written first, observed to fail (RED) against the pre-fix `cmdVerifyFlutterUIEval`, committed at `9e34922`. Implementation (GREEN) added explicit `--judge` validation + the `gate` field, committed at `a10630b`. Differential control performed: reintroduced the exact pre-fix file, all 5 cases failed **by name**, restored, `git diff` came back **empty**, re-ran green.
- **Task 2:** verifier.md Step 8c routing amended so `REMOVE that surface` is now conditional on `gate: 'binding'` (was unconditional on `verdict: pass`) — this is the actual fix for the causal chain that retired aodex#485's 34 unjudged states from human review. `unjudged[]` states (32-01) are now explicitly named as staying on the human queue regardless of gate. SKILL.md's description and engine-contract section corrected to stop implying the default (offline) path machine-judges visual correctness.
- **Task 3 (checkpoint:human-action, NOT performed):** verified via `gh secret list --repo AO-Cyber-Systems/devflow-claude` (exit 0, empty output) that `ANTHROPIC_API_KEY` is **not** currently provisioned as a repository secret. Recorded as **DEFERRED / UNMET** below, per the checkpoint's own instruction not to claim CI enforcement on the strength of a local run.
- ui-eval suite: **72/72** across the three ui-eval test files (`flutter-ui-eval.test.cjs`, `flutter-ui-eval-dogfood.test.cjs`, `flutter-ui-eval-planner-default.test.cjs`) — was 67/67 after 32-02, +5 new (G1-G5). **80/80** including `flutter-ui-eval-bootstrap.test.cjs`.

## The RED (recorded verbatim — G1 and G4 against the pre-fix `flutter-ui-eval.cjs`)

Command:
```
node --test --test-name-pattern="Case G1 |Case G4 " flutter-ui-eval-dogfood.test.cjs
```

Output:
```
▶ Case G1-G5 — judge selection is explicit; the rollup declares its own gate standing (32-03)
  ✖ Case G1 — default invocation (no --judge) declares gate:"advisory"; still network:false + offline judge (105.352625ms)
  ✖ Case G4 — an unrecognised --judge value is rejected with a usage error, not a silent offline fallthrough (88.801042ms)
✖ Case G1-G5 — judge selection is explicit; the rollup declares its own gate standing (32-03) (194.968833ms)
ℹ tests 2
ℹ suites 1
ℹ pass 0
ℹ fail 2

✖ failing tests:

test at flutter-ui-eval-dogfood.test.cjs:296:3
✖ Case G1 — default invocation (no --judge) declares gate:"advisory"; still network:false + offline judge (105.352625ms)
  AssertionError [ERR_ASSERTION]: a labels lookup must not present itself as a gate
  + actual - expected

  + undefined
  - 'advisory'

      at TestContext.<anonymous> (flutter-ui-eval-dogfood.test.cjs:298:12)
  {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 'advisory',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at flutter-ui-eval-dogfood.test.cjs:330:3
✖ Case G4 — an unrecognised --judge value is rejected with a usage error, not a silent offline fallthrough (88.801042ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (flutter-ui-eval-dogfood.test.cjs:331:12)
  {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'throws',
    diff: 'simple'
  }
```
Exit code **1** on both. (The full G1-G5 RED run — captured before the original commit `9e34922` — failed all 5 by name: `tests 5 / pass 0 / fail 5`, with G2/G3/G5 failing on the same shape of assertion: `gate` / usage-error expectations unmet against code that had neither concept yet.)

## Differential control (Task 1)

**Reintroduced defect:** the exact pre-fix `flutter-ui-eval.cjs` (the version at `a10630b~1`, i.e. before the GREEN commit) was restored over the working file.

**Narrow run — the full G1-G5 suite:**
```
node --test --test-name-pattern="Case G" flutter-ui-eval-dogfood.test.cjs
```
```
ℹ tests 5
ℹ pass 0
ℹ fail 5
✖ Case G1 — default invocation (no --judge) declares gate:"advisory"; still network:false + offline judge
✖ Case G2 — --judge labels selects the offline path explicitly: same rollup shape, gate:"advisory"
✖ Case G3 — --judge live declares gate:"binding" (the run's STANDING, asserted credential-less)
✖ Case G4 — an unrecognised --judge value is rejected with a usage error, not a silent offline fallthrough
✖ Case G5 — --help usage text states the default is advisory and the gate requires --judge live
```
All 5 failed **by name**, 0 passed.

**Restore:**
```
git checkout -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
git diff --quiet -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs && echo CLEAN || echo DIRTY
→ CLEAN
git status --short
→ (no output)
```

**Re-run, green again:**
```
node --test --test-name-pattern="Case G" flutter-ui-eval-dogfood.test.cjs
→ ℹ tests 5 / ℹ pass 5 / ℹ fail 0
```

The control is sound: every G-case is pinned to the exact defect it targets, by name, and the restore left zero trace.

## No test issued a network call — how G3 guarantees it

Every judge in this TRD's tests is either the offline `makeOfflineLabelEchoJudge` (label lookup, zero pixels) or the real `liveVisionCall` boundary invoked **with credentials deliberately stripped**. G3 copies `process.env`, deletes `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`, and passes that as the child process `env`. `anthropicMessagesCall` throws *before* constructing the `curl` invocation when neither credential is present (`flutter-ui-eval.cjs`, `if (!apiKey && !authToken) throw new Error('no credential...')`) — so the live code path is exercised (proving `gate` routes correctly on `--judge live`) without ever reaching the network boundary, regardless of what a developer happens to have exported in their own shell. Verified directly: a manual credential-stripped run of `--judge live` against the fixture manifest returns `network: true, judge: 'live-vision', verdict: 'fail', reviews: ['good-dashboard','broken-overflow']` with per-state `errors: ["no credential — set ANTHROPIC_API_KEY ..."]` and zero `usage` tokens — exactly the deterministic, cost-free downgrade the TRD's gotcha section described.

## verifier.md Step 8c — before/after routing text

**Before:**
```
Rollup shape: `{ verdict: 'pass'|'pass-with-reviews'|'fail', counts, reviews[], fails[], states[] }` from
the OFFLINE label-echo judge (network:false). Each `states[]` entry: `{ state_id, verdict:
'pass'|'review'|'fail', is_broken, defects[], errors[] }`.

**Route per verdict (the load-bearing contract):**

- Any state in `fails[]` (verdict `fail`) → append a `gaps:` entry: ...
- `verdict: pass-with-reviews` OR any state in `reviews[]` → append `notes:` entries + a partial
  section; that surface STAYS on the Step 9 human-verification list.
- `verdict: pass` (no fails, no reviews) → REMOVE that surface from the Step 9 `human_verification:`
  list. This is the payoff: machine-judged visual correctness drops off the human queue.
```

**After:**
```
Rollup shape: `{ verdict: 'pass'|'pass-with-reviews'|'fail', gate: 'binding'|'advisory', counts,
reviews[], fails[], unjudged[], states[] }`. `gate` is the run's STANDING — what authority its
verdict carries, independent of outcome. `gate: 'binding'` ONLY when the engine ran with `--judge
live` (a real vision comparison per state). `gate: 'advisory'` on the default invocation (no
`--judge`, or `--judge labels`) — the offline label-echo judge (network:false), which is a labels
LOOKUP, not a visual gate, and must never be treated as one regardless of how clean its verdict is.
Each `states[]` entry: `{ state_id, verdict: 'pass'|'review'|'fail', is_broken, defects[], errors[],
evidence: 'vision'|'label' }`.

**Route per verdict (the load-bearing contract):**

- Any state in `fails[]` (verdict `fail`) → append a `gaps:` entry: ...
- `verdict: pass-with-reviews` OR any state in `reviews[]` → append `notes:` entries + a partial
  section; that surface STAYS on the Step 9 human-verification list.
- Any state in `unjudged[]` (aodex#485 — nothing examined it, distinct from a genuine judge
  disagreement) → append a `notes:` entry naming it as never judged; that surface STAYS on the
  Step 9 human-verification list regardless of `gate` or the run's overall verdict.
- `gate: 'binding'` AND `verdict: pass` (no fails, no reviews, no unjudged) → REMOVE that surface
  from the Step 9 `human_verification:` list. **This is the ONLY route that may retire a human
  visual check.** The payoff — machine-judged visual correctness drops off the human queue —
  requires a binding gate; an offline pass alone never earns it.
- `gate: 'advisory'` → NEVER removes a surface from the Step 9 list, whatever the verdict. Even a
  clean `verdict: pass` on the default (offline label-echo) path is a labels lookup, not a machine
  judgment of the pixels — append a `notes:` entry (e.g. "advisory pass — offline label-echo judge,
  not machine-verified against a binding gate") and leave the surface queued for human visual
  verification.
```

Confirmed via `grep -n "REMOVE that surface" plugins/devflow/agents/verifier.md`: exactly one match, now qualified by `gate: 'binding' AND verdict: pass ...`, not unconditional. The Step 9 summary line was also corrected in the same commit (`Surfaces that Step 8c scored pass UNDER gate:'binding' ... MUST NOT appear`; an advisory `pass` STAYS on the list).

## Did any existing test change? No.

**No existing test was modified or weakened.** D2/N1 (the `network:false`/`judge:'offline-label-echo'` regression net) and all 67 prior ui-eval cases pass unchanged — confirmed by the 72/72 full-suite run below. G1-G5 are five new cases; nothing pre-existing encoded "the default path is a gate," so there was no defect-encoding test to change (same finding pattern as 32-02's note on 32-01).

## Task 3 — CI credential prerequisite: **DEFERRED / UNMET** (not performed, per instruction)

This TRD carries `autonomous: false` and a `checkpoint:human-action` for provisioning `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`) wherever the gate runs. **This was NOT attempted** — an executor cannot create a repository secret, and per the explicit resume instruction this checkpoint is recorded, not performed.

Checked (read-only, does not constitute performing the action):
```
gh secret list --repo AO-Cyber-Systems/devflow-claude
→ (exit 0, empty output — no repository secrets configured)
```

**Consequence, stated plainly:** `gate: 'binding'` is reachable **only on a machine with a credential exported locally** (as demonstrated manually during this TRD, minus the credential). It is **not** reachable in CI today, and Step 8c's own invocation in verifier.md was deliberately left calling the default (advisory) path — so no CI run of this verifier currently produces, or could produce, a `gate: 'binding'` pass. Every CI ui-eval run remains `advisory`-only until a human either (a) provisions the secret with `gh secret set ANTHROPIC_API_KEY --repo AO-Cyber-Systems/devflow-claude` and confirms which workflow exposes it to the ui-eval step, or (b) explicitly accepts the deferral recorded here.

## What the simulated judge did and did NOT prove

Every judge exercised by this TRD's tests is either the offline `makeOfflineLabelEchoJudge` (label lookup, zero pixels, zero network) or the real `liveVisionCall`/`anthropicMessagesCall` boundary invoked **with credentials deliberately stripped**, so it throws before ever constructing a network request. No test in this TRD made a network call, and none used a real model credential.

**What this proves:** the full `--judge` selection/validation logic, the `gate` field's derivation, and the routing consequence documented in verifier.md were exercised against the real `cmdVerifyFlutterUIEval` → `callVisionJudge` → `scoreState` → `scoreRun` pipeline end to end, for all three paths (default/labels, explicit labels, live) plus the rejection path (invalid `--judge` value) — with G3 specifically proving that `gate` reflects the caller's request, not the run's outcome, even under the harshest available condition (a live request that cannot even reach the network).

**What this does NOT prove:** that a real Anthropic vision model, given a real screenshot and a real prompt, returns a well-formed Shape-C `JudgeResult` in production, or that `gate: 'binding'` is reachable anywhere except a developer's own credentialed machine. That remains unproven — by design, this TRD's decision was to keep the offline default and make judge selection explicit, not to exercise the live model. The CI-reachability gap is recorded above as the Task 3 deferral, not assumed away.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — G1-G5 | `node --test --test-name-pattern="Case G" flutter-ui-eval-dogfood.test.cjs` (pre-fix) | 1 (expected FAIL) | PASS (RED observed as required) |
| 1: GREEN — explicit --judge + gate field | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs` | 0 | PASS (80/80) |
| 1: Differential control | reintroduce pre-fix file → 5 named fails → restore → `git diff --quiet` CLEAN → re-run 5/5 green | n/a (procedural) | PASS |
| 2: verifier.md + SKILL.md wiring | `grep -n "binding\|advisory\|unjudged" plugins/devflow/agents/verifier.md plugins/devflow/skills/ui-eval/SKILL.md` + `grep -n "REMOVE that surface" plugins/devflow/agents/verifier.md` | 0 | PASS (both files match; rule now conditional) |
| 3: CI credential checkpoint | `gh secret list --repo AO-Cyber-Systems/devflow-claude` | 0 (empty — unmet) | DEFERRED, recorded above |

## Task Commits

1. **Task 1 RED** — `9e34922` (test)
2. **Task 1 GREEN** — `a10630b` (feat)
3. **Task 1 differential control** — no commit (procedural only; `git diff` confirmed empty after restore)
4. **Task 2** — `b590b97` (docs)
5. **Task 3** — not performed; no commit (checkpoint:human-action, recorded above as pending)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD-scoped ui-eval suite (3 files) | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs` | 0 | PASS (72/72) |
| TRD-scoped ui-eval suite (4 files, incl. bootstrap) | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs` | 0 | PASS (80/80) |
| Manual probe (default path) | `node df-tools.cjs verify flutter-ui-eval __fixtures__/flutter-ui-eval/manifest.json --raw \| grep gate\|network\|judge` | 0 | PASS — `"network": false, "judge": "offline-label-echo", "gate": "advisory"` |
| Full `bin/lib`+`bin` suite (`npm test`) | `npm test` | 1 | 2886 total / 2827 pass / 9 fail — all 9 confirmed pre-existing/environmental (below), none in files this TRD touched |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-name-pattern="Case G" flutter-ui-eval-dogfood.test.cjs` (pre-fix) | 1 | FAIL (correct) — 5/5, recorded verbatim above (G1, G4 in full; G2/G3/G5 summarized) |
| GREEN | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs` | 0 | PASS (correct) — 80/80 |
| REFACTOR | none needed — GREEN implementation not subsequently refactored | n/a | n/a |
| Differential control (reintroduced) | `node --test --test-name-pattern="Case G" flutter-ui-eval-dogfood.test.cjs` | 1 | FAIL (correct), 5/5 named |
| Differential control (restored) | same command | 0 | PASS (correct), 5/5 |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/6 automatically (default advisory; explicit labels/live selection; usage-error rejection; help text; network:false/judge unchanged). The 6th ("CI credential prerequisite... resolved and evidenced, or recorded as unmet") is satisfied via the **recorded-as-unmet** branch, not the resolved branch — see Task 3 above.
- **Gate failures:** None in the TRD-scoped suite (80/80). Full-repo `npm test`: 9 pre-existing/environmental failures (below), 0 new.

## Full `bin`+`bin/lib` suite (`npm test`) — totals and the known failures

```
ℹ tests 2886
ℹ pass 2827
ℹ fail 9
```

**Failing tests, itemized (all in files this TRD never touched):**

| # | Test | File |
|---|---|---|
| 1 | `devflow-watch start (foreground) + stop` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` |
| 2 | `devflow-watch multi-project CLI (TRD 20-03)` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` |
| 3 | `foreground daemon writes PID file, status reports running, stop kills it` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` |
| 4 | `start refuses when daemon already running` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` |
| 5 | `start cleans up stale PID file and starts fresh` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` |
| 6 | `C-2 start --project /p (single) writes watching:[/p] (back-compat)` | `plugins/devflow/devflow/bin/devflow-watch.test.cjs` |
| 7 | `handoff pipeline — end-to-end` (+ 3 named sub-scenarios: write-pending/route-results, disallowed-command, idempotency, multi-record) | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs` |
| 8 | `S1: scanPeer with 1 valid branch returns 1 entry with all fields` | `plugins/devflow/devflow/bin/lib/awareness.test.cjs` |

These match, byte-for-byte, the "known environment noise — do not chase" list given for this run (devflow-watch daemon/PID-file `ENOENT` under worktree temp dirs, handoff-e2e daemon timing, `scanPeer S1` flakiness). Confirmed unrelated to this TRD's diff:

```
git diff fcea515 HEAD --stat
→ 4 files changed: flutter-ui-eval.cjs, flutter-ui-eval-dogfood.test.cjs, verifier.md, SKILL.md

git diff fcea515 HEAD -- devflow-watch.test.cjs handoff-e2e.test.cjs awareness.test.cjs
→ 0 lines (byte-identical to the branch base)
```

The full-suite total (2886/2827/9) is higher than the reference baseline given (2206/2165/3) — noted for visibility, consistent with the same divergence 32-01 (2872) and 32-02 (2206, matching baseline that time) each independently observed and did not chase; not explained by this TRD's 4-file diff and not pursued further given scope.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` — explicit `--judge` validation (`labels`/`live`/reject), `gate` field on the rollup, corrected `--help` text.
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs` — Cases G1-G5.
- `plugins/devflow/agents/verifier.md` — Step 8c routing conditioned on `gate`; Step 9 summary line corrected.
- `plugins/devflow/skills/ui-eval/SKILL.md` — description, engine-contract, and process sections corrected to state the binding/advisory distinction.

## Decisions Made

See `key-decisions` in frontmatter. Summarized: default stays offline/advisory (both rejected alternatives — live-by-default, live-when-credentials-present — recorded, not re-litigated); `gate` is additive, not a replacement for `judge`/`network`; G3 is asserted credential-less by design; Step 8c's own invocation was deliberately left unchanged (still calls the advisory path) so it does not become the rejected "live-when-credentials-present" pattern by another name.

## Deviations from Plan

None — TRD executed as written, including honoring the checkpoint by NOT attempting Task 3.

## Issues Encountered

Execution hit a `maxTurns: 50` ceiling after Task 1 was fully committed (RED + GREEN + differential control, tree clean). Resumed per the coordinator's instruction; Task 2 completed and committed without re-running the full engine suite (per explicit budget guidance), verified instead via the TRD's own targeted grep checks.

## User Setup Required

**Yes — Task 3's checkpoint is unresolved.** `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`) is not provisioned as a repository secret on `AO-Cyber-Systems/devflow-claude` (confirmed via `gh secret list`, empty). Until a human provisions it and wires `--judge live` into whichever workflow calls the ui-eval verifier step, `gate: 'binding'` remains a local-only capability. See "Task 3" section above for the two explicit options (provision, or accept the deferral).

## Next Objective Readiness

- 32-04 (exit-code behavior for `verdict: 'fail'`, currently exits 0 — measured, untouched here) is unaffected by this TRD's change set and remains open, severable work.
- The `gate` field is additive and stable for 32-04 or any future consumer to read without further changes here.
- Task 3 (CI credential) is an explicit, recorded blocker for reaching `gate: 'binding'` in CI — not silently assumed resolved.

---
*Objective: 32-visual-eval-default-path-tells-the-truth*
*Completed: 2026-08-27*
