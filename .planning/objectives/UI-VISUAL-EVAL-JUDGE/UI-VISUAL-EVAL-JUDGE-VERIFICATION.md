---
objective: UI-VISUAL-EVAL-JUDGE
status: passed
verified_by: orchestrator (in-loop, real command output)
verified_at: 2026-06-16
scope: offline engine + synthetic dogfood gate (real-screenshot GO/NO-GO deferred)
---

# Verification — UI-VISUAL-EVAL-JUDGE (Track A / Phase 2 "VLM judge engine, standalone")

## must_haves — verified in the worktree

| Truth | Status | Evidence |
|---|---|---|
| Engine suite green with FAKE injected judge, no network | ✅ | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs` → tests 33 / pass 33 / fail 0 |
| validateJudgeResult guards Shape-C (enum/required/bool) | ✅ | cases G1-G5 green |
| aggregateVotes majority + tie→review | ✅ | V1-V4 green |
| scoreState HIGH-only gating (high→fail; med/low→advisory; dissent→review) | ✅ | S1-S4 green |
| scoreRun flake-budget rollup (pass / pass-with-reviews / fail) | ✅ | R1-R3 green |
| callVisionJudge injectable boundary (fake valid→parsed; malformed→rejected) | ✅ | C1/C2 green; no-network grep clean |
| df-tools `verify flutter-ui-eval [--raw]` + `flutter-ui eval` arms | ✅ | `--help` exit 0; `--raw` over dogfood emits scoreRun rollup |
| df-ui-evaluator model-profile row (vision-capable) | ✅ | `resolve-model df-ui-evaluator` → sonnet (balanced); opus tier = real id copied from models map |
| Default real vision call wired but NEVER invoked in tests | ✅ | `// TDD-EXCEPTION` boundary; guard test d3811fc; no-network grep clean |

## Synthetic dogfood GATE (offline proxy for GO/NO-GO)

`node df-tools.cjs verify flutter-ui-eval __fixtures__/flutter-ui-eval/manifest.json --raw`:
- `good-dashboard` → pass (is_broken:false)
- `broken-overflow` → **fail** (is_broken:true, defect type=overflow severity=high)
- run verdict = `fail`, exit reflects verdict, `network:false`, `judge:offline-label-echo`

This proves the scoring PIPELINE (callVisionJudge → validate → scoreState → scoreRun)
correctly gates a known-broken state and passes a known-good one — end-to-end, offline.

## Commits (feat/ui-visual-eval)

```
c5d8b40 feat(ui-eval): wire df-tools verify flutter-ui-eval + flutter-ui eval arms
d3811fc test(ui-eval): default-judge-wired-but-not-invoked guard
43ca41f feat(ui-eval): cmdVerifyFlutterUIEval offline scoring handler + offline label-echo judge
a098a22 test(ui-eval): RED dogfood + CLI handler cases
6a62f6e feat(ui-eval): add df-ui-evaluator model profile + dogfood fixtures
3b6ba8c test(ui-eval): callVisionJudge fake-judge cases (C1/C2)
5598028 feat(ui-eval): pure scoring engine
cf62572 test(ui-eval): RED scoring-engine test list
ace2eef test(ui-eval): add flutter-ui-eval fixture generators
```
(TRDs committed at 2799f05 by the planner.)

## GO/NO-GO gate status

The SYNTHETIC dogfood gate PASSES — the judge logic + scoring pipeline are sound,
so Track B (generalization) proceeds (autonomous decision). The stronger
**real-VLM-precision gate** (judge run against actual eden-biz baseline screenshots
at acceptable precision/recall) remains DEFERRED — blocked on Phase-1 baselines,
which are blocked on the local-integration demo squatting :8091 with a different
JWT seed. One-command path once :8091 is free:

```
cd /Users/markemerson/Source/eden-biz-ui-eval
make e2e-stack-up && make e2e-build-web
# activate the ui_eval live cases (un-fixme) and run --project=ui_eval to write baselines
# then: node <devflow>/df-tools.cjs verify flutter-ui-eval <captureResults> --raw  (real judge)
```

## Deferred (documented, not a gap)

- Real-screenshot GO/NO-GO precision/recall gate (above).
- The real `defaultVisionJudge` network path is exercised only when baselines exist.
