'use strict';

/**
 * flutter-ui-eval-planner-default.cjs — P5 planner auto-emit default (UI-VISUAL-EVAL-DEVFLOW-03).
 *
 * Pure decision: given a flutter-ui-scope detection result, decide whether the planner
 * should auto-emit a ui-eval state-matrix manifest STUB (Shape-A) + declare the verifier
 * VISUAL GATE (verifier Step 8c runs `df-tools verify flutter-ui-eval`). This is exactly
 * parallel to how flutter-state-coverage (REQ-10-05) is auto-required in the planner's
 * Flutter UI scope sub-procedure.
 *
 * Contract: visual eval is opt-OUT, not opt-in. A detected Flutter UI objective is born
 * with the gate; a non-ui objective gets neither stub nor gate.
 *
 * Pure logic — no fs, no network, no LLM. Failsafe-permissive: a `{ detected:false, error }`
 * scope (or a missing/garbage scope) returns `{ emit:false, visual_gate:false }` and NEVER throws.
 * Mirrors flutter-ui-scope.cjs module style (node:test-driven, hand-built fixtures).
 */

/**
 * Build a Shape-A manifest STUB skeleton with exactly one example/seed state.
 * The planner authors the real states from the objective later — the stub proves the
 * shape (a `states` array; each state carries id/route/data_state/expected), not the content.
 * Mirrors the engine fixture manifest.json + the TRD-02 bootstrap scaffold.
 *
 * @param {string} objective
 * @returns {{ objective: string, samples: number, flakeBudget: number, states: object[] }}
 */
function buildManifestStub(objective) {
  return {
    objective: objective || '<TODO: objective>',
    samples: 3,
    flakeBudget: 1,
    states: [
      {
        id: '<state-id>',
        route: '/<route>',
        data_state: 'populated',
        expected: '<describe the correct appearance for this state>',
      },
    ],
  };
}

/**
 * Pure decision fn — does the planner auto-emit the ui-eval gate for this objective?
 *
 * @param {{ scope?: object, objective?: string }} [input]
 *   scope — a flutter-ui-scope detectFlutterUIScope result:
 *           { detected: boolean, signals?, platform?, state_management?, error? }
 *   objective — objective id (flows into the stub; defaults to a placeholder).
 * @returns {{ emit: boolean, visual_gate: boolean, manifest_stub?: object, callout?: string, tasks?: object[] }}
 *   Emit iff `scope.detected === true`. Non-ui / failsafe → { emit:false, visual_gate:false }.
 */
function decideUIEvalDefault(input) {
  const { scope, objective } = input || {};

  // Gate: emit ONLY when flutter-ui scope was positively detected.
  // Anything else (detected:false, failsafe error, missing/garbage scope) → no emit, no throw.
  if (!scope || scope.detected !== true) {
    return { emit: false, visual_gate: false };
  }

  const obj = objective || "<TODO: objective>";
  return {
    emit: true,
    visual_gate: true, // verifier Step 8c runs `df-tools verify flutter-ui-eval` on this objective
    manifest_stub: buildManifestStub(objective),
    // CALLOUT-01: make the auto-required gate VISIBLE. A terse, factual line for the
    // user-facing plan output + the Next Up block (one marker only — ui-brand restraint).
    callout:
      "\u{1F441} Visual-eval gate auto-required for " +
      obj +
      " (type:ui/stack:flutter detected): a ui_eval state-matrix manifest + the verifier " +
      "visual step (df-tools verify flutter-ui-eval). Run /devflow:ui-eval after build to judge the rendered UI.",
    // Session-task descriptors the skills (plan-objective/build) turn into TaskCreate entries.
    tasks: [
      {
        subject: "Author ui_eval state-matrix manifest for " + obj,
        description:
          "Fill flutter/ui_eval/manifests/*.manifest.json states (route x data_state) with expected " +
          "prose — the visual-eval anchor.",
      },
      {
        subject: "Run /devflow:ui-eval visual gate for " + obj,
        description:
          "Capture + golden-diff + VLM-judge the rendered UI; fail/review surfaces as gaps/notes.",
      },
    ],
  };
}

module.exports = {
  decideUIEvalDefault,
  buildManifestStub,
};
