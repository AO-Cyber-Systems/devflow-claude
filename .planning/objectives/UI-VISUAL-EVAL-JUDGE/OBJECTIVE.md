---
objective: UI-VISUAL-EVAL-JUDGE
status: planning
roadmap: ad-hoc (not on devflow-claude ROADMAP.md — net-new; Track A Phase 2 of the
  UI visual-eval initiative; the engine's DevFlow-integration wiring is Track B, later)
branch: feat/ui-visual-eval
worktree: /Users/markemerson/Source/devflow-claude-ui-eval
overrides:
  work: foundation
  tdd: strict
---

# Objective: UI Visual-Evaluation Layer — Track A / Phase 2 "VLM Judge Engine (standalone)"

## Goal

Build the perceptual **Layer-2** of the UI visual-eval contract: a pure,
unit-testable scoring engine (`flutter-ui-eval.cjs`) that takes CaptureResult
records (Shape B, produced by the Phase-1 web adapter — each carries
`metadata.expected`) and, via a Claude vision model anchored on that `expected`
prose, returns structured JudgeResults (Shape C) and a gating scoreRun rollup.
Run STANDALONE via `node` for now; the DevFlow agent/skill/verifier-gate/bootstrap
wiring is Track B (out of scope).

Authoritative design: `/Users/markemerson/.claude/plans/temporal-gliding-wave.md`
§ "1. VLM judge engine" + the anti-flake/determinism section + the GO/NO-GO gate.

## Why this layer

Golden diffs (Phase 1) catch DRIFT but never a defect baked into the baseline.
The judge catches FIRST-time defects (overflow, blank-when-data-expected,
misalignment, contrast) — the class that slips manual testing — without baseline
churn. It is the answer to "baselines are constant noise" (why flutter Obj 12
deferred visual regression).

## Scope (Phase 2 — engine only)

1. `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` — MODEL ON the existing
   `flutter-state-coverage.cjs` (mirror module shape, export style, and the
   HIGH-severity-only-gates confidence model). Pure functions + ONE impure,
   injectable boundary:
   - `loadManifest(path)` — JSON (no YAML dep).
   - `validateJudgeResult(obj)` — Shape-C schema guard. Defect taxonomy enum:
     overflow|blank_empty|misalignment|contrast_legibility|broken_layout|
     overlap_zindex|loading_stuck. Severity ∈ low|medium|high.
   - `aggregateVotes(samples[])` — majority vote over N samples/state.
   - `scoreState({judgeResult, thresholds})` → pass|fail|review. HIGH gates;
     medium/low → advisories. Fail only on majority is_broken AND ≥1 high;
     single dissent → review.
   - `scoreRun(results[])` → rollup + flake-budget verdict.
   - `callVisionJudge(...)` — THE ONLY impure fn; wraps the Claude vision API
     behind an INJECTABLE interface (tests pass a fake). Prompt: strict
     UI-defect detector; screenshot + CaptureResult.metadata.expected + the
     taxonomy; "return ONLY Shape-C JSON; matches expected → is_broken:false".
     Anchor on `expected` (score DEVIATION, not open-ended aesthetics).
2. `df-tools.cjs` wiring: `verify flutter-ui-eval <captureResults|manifest> [--raw]`
   beside the flutter-state-coverage arm; `flutter-ui eval` under `flutter-ui`.
3. `ui-evaluator` row in the `MODEL_PROFILES` table (points at the vision model).
4. Dogfood harness `plugins/devflow/devflow/bin/lib/fixtures/ui-eval/` —
   synthetic known-good + known-broken CaptureResult JSON + placeholder PNGs +
   expected is_broken labels, exercised with a FAKE vision judge.

## Vision model — do NOT hardcode from memory

Read the `claude-api` skill reference (under ~/.claude or plugins cache) for the
CURRENT vision model id + image-input message format before implementing
`callVisionJudge`. Resolve via the repo's MODEL_PROFILES/resolve-model. Keep the
network call behind `callVisionJudge` so everything else is offline-testable.

## Out of scope

- DevFlow integration: ui-evaluator agent, /devflow:ui-eval skill, verifier Step
  8c, bootstrap scaffolder, planner defaults — all Track B.
- Mobile/POS adapters.
- Any change to the eden-biz worktree or the installed plugin cache.
- New npm deps.

## TDD posture (strict; per global CLAUDE.md playbook)

- type=tdd. Test-list-first (happy/edge/failure) BEFORE code. node --test,
  zero-dep, FAKE injected vision judge — NO real API calls in tests/verification.
- Test list:
  - validateJudgeResult: valid; missing field; bad defect.type enum; bad severity
    enum; non-bool is_broken.
  - aggregateVotes: unanimous broken; unanimous ok; split→review; tie-break.
  - scoreState: high→fail; medium/low→advisory/pass; majority+high→fail; single
    dissent→review.
  - scoreRun: all pass→pass; within flake budget→pass-with-reviews; persistent
    fail→fail.
  - loadManifest: valid JSON; invalid JSON throws; bad shape throws.
  - callVisionJudge: injected fake returns canned Shape-C → engine parses +
    validates; fake returns malformed → validateJudgeResult rejects.
- Fixture GENERATORS not LLM data: makeJudgeResult()/makeCaptureResult()/
  makeFakeVisionJudge() builders.
- Atomic commits: test: → feat: per TRD.

## Verification (offline; NO network, NO Docker)

- `node --test` over the engine's test file → exit 0, all cases green (fake judge).
- `node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval --help`
  (or a --raw dry-run over the checked-in dogfood fixtures with the fake judge)
  → exits cleanly, emits a scoreRun rollup.
- NO real Claude API call anywhere in tests/verification.

## Deferred — the GO/NO-GO gate

The real-screenshot dogfood gate (judge run against ACTUAL eden-biz baselines)
is DEFERRED until Phase-1 baselines exist (currently blocked: the
local-integration demo squats :8091 with a different JWT seed). Document it; do
not block. That gate decides whether Track B (generalization) proceeds.
