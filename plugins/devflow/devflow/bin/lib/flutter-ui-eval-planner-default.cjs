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
        // 32-02: was `id`, while the engine (flutter-ui-eval.cjs cmdVerifyFlutterUIEval)
        // reads `st.state_id` everywhere -- the generator and the consumer disagreed
        // (aodex#485 defect #6, a plausible mechanism behind the headline unjudged count).
        // Emit the key the engine actually reads.
        state_id: '<state-id>',
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

/**
 * Pure decision fn — does the planner auto-note the ADVISORY design-review pass for this objective?
 *
 * Phase B of the UI design-review layer. PARALLEL to decideUIEvalDefault's visual gate, but
 * crucially DIFFERENT in contract: the design-review pass is ADVISORY and NEVER gates. Where the
 * ui-eval visual gate (Step 8c) can FAIL an objective on a broken surface, the design-review pass
 * (Step 8d) only ever records advisory notes / candidate todos for FUTURE UI objectives — it can
 * never change the current objective's verdict.
 *
 * Emit iff `scope.detected === true`. Non-ui / failsafe / missing scope → disabled, never throws.
 *
 * @param {{ scope?: object, objective?: string }} [input]
 *   scope — a flutter-ui-scope detectFlutterUIScope result.
 *   objective — objective id (flows into the callout; defaults to a placeholder).
 * @returns {{ enabled: boolean, advisory: boolean, gating: boolean, callout?: string, tasks?: object[] }}
 *   On emit: { enabled:true, advisory:true, gating:false, callout, tasks }.
 *   Otherwise: { enabled:false, advisory:true, gating:false } — advisory:true/gating:false are
 *   INVARIANT (the design-review pass can never gate, whether enabled or not).
 */
function decideDesignReviewDefault(input) {
  const { scope, objective } = input || {};

  // INVARIANT: the design-review pass is advisory & non-gating regardless of emit.
  // Gate: enable ONLY when flutter-ui scope was positively detected. Failsafe-permissive.
  if (!scope || scope.detected !== true) {
    return { enabled: false, advisory: true, gating: false };
  }

  const obj = objective || "<TODO: objective>";
  return {
    enabled: true,
    advisory: true, // design critique is qualitative — it NEVER gates
    gating: false,  // EXPLICIT: distinct from the defect judge at Step 8c, which DOES gate
    // A terse, factual line for the user-facing plan output. Mirrors the visual-gate callout but
    // makes the ADVISORY / never-gates contract explicit so a reviewer can't confuse it with 8c.
    callout:
      "\u{1F3A8} Advisory design-review pass noted for " +
      obj +
      " (type:ui/stack:flutter detected): the verifier runs df-tools flutter-ui design-review " +
      "(Step 8d) on this objective's surfaces. ADVISORY ONLY — it never gates/fails the objective; " +
      "high-priority design debt becomes candidate todos for future UI work. Heavy first-run sweep " +
      "via /devflow:design-review; thereafter a lightweight advisory pass per UI objective.",
    tasks: [
      {
        subject: "Author design-review manifest for " + obj,
        description:
          "Fill the design-review manifest states (state_id/surface/screenshot_path/design_intent) + " +
          "design_system_path anchor — the advisory critique reuses the ui_eval screenshots.",
      },
      {
        subject: "Run /devflow:design-review advisory sweep for " + obj,
        description:
          "Heavy first-run design-debt sweep; high-priority debt → candidate todos for future UI " +
          "objectives. ADVISORY — never gates this objective.",
      },
    ],
  };
}

module.exports = {
  decideUIEvalDefault,
  decideDesignReviewDefault,
  buildManifestStub,
};
