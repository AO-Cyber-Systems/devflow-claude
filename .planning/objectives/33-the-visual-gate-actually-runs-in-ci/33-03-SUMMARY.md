# TRD 33-03 — SUMMARY

**Title:** What the gate does when it runs and finds nothing
**Branch:** `exec/33-03` (base `00b19cd`)
**Status:** COMPLETE — final TRD of objective 33

## Commits

| Hash | Kind | What |
|---|---|---|
| `dc092a2` | test (RED) | `classifyUIEvalOutcome` C1–C6, the four-route policy |
| `ef44c64` | feat | `classifyUIEvalOutcome` — absent is MISSING, not skipped, not gapped |
| `464e6e8` | test (RED) | Step 8c must route the four resolutions distinctly |
| `4e2fc38` | feat | Step 8c routes the four resolutions distinctly |
| `de7e08b` | docs | `workflows/ui-eval.md` prose — JSON manifests, four-resolution routing |

## Routing policy

| Resolution | Meaning | Route |
|---|---|---|
| `not_applicable` | no `type:ui + stack:flutter` TRD | skip silently, exit 0 |
| `absent` | UI TRDs exist, no manifest anywhere | **`? MISSING`** + `notes:` naming `searched[]`; **surface STAYS on the Step 9 human list**; escalates to `gaps:` when the objective declares `visual_gate: true` |
| `invalid` | manifest found but unloadable | **`gaps:`** with the parse reason — a broken gate is a DEFECT, not an absence |
| `resolved` | loaded and scored | route per the 32-03/32-04 verdict rules |

**Never a hard fail on `not_applicable` or `absent`.** Only `invalid` and a judged `fail`
produce gaps.

The load-bearing distinction: **a gate that ran and found nothing must never read as a gate
that ran and approved.** `absent` keeps the human check queued; `invalid` is reported as a
defect rather than quietly downgraded to "no manifest here."

## Documentation drift corrected

`workflows/ui-eval.md` documented `flutter/ui_eval/manifests/*.yaml` while the engine
`JSON.parse`s and bootstrap writes `*.manifest.json`. Corrected, and the prose now states
plainly: **the engine reads JSON, not YAML; a `.yaml` manifest resolves to `invalid`, not
absent — it is reported, not ignored.** The stale `SKIPPED (no ui-eval manifest)` collapse
language is gone; the agent is told to pass the objective id and read `resolution` rather
than re-implement the lookup.

## Objective 32's ratchet survived this file's edits

`verifier.md` was edited in the same region as 32-03's central fix. Re-verified after:

    578: `gate: 'binding'` AND `verdict: pass` (...) → REMOVE that surface ...
         **This is the ONLY route that may retire a human visual check.**

Still conditional on `binding`, never unconditional. The `advisory` never-removes rule and
the `unjudged[]` stays-queued rule are both intact.

## Evidence

- **ui-eval suite: 119/119** across all six ui-eval test files.
- **Differential control** (orchestrator, at integration): collapsed `absent` into
  `not_applicable` — i.e. made a gate that found nothing skip silently:

      ✖ Case A2 — one TRD with type:ui + stack:flutter -> NOT not_applicable
      ✖ Case M5 — applicable objective, no manifest anywhere -> absent, searched[] lists every location
      ✖ Case M8 — manifest is present on every resolved result and undefined on every non-resolved one
      ✖ verifier-ui-eval-invocation (TRD 33-02, aodex#485 defect 5)
      tests 35 / pass 31 / fail 4

  Four failures BY NAME. Restored → `git diff --quiet` on the production file **CLEAN**.

## Scope of the claim — do not overstate

No objective in devflow-claude carries a `type:ui + stack:flutter` TRD, so on THIS repo the
gate resolves `not_applicable` everywhere, correctly and by design.

- TRUE: the gate executes and returns one of four honest statuses instead of dead-ending in
  `{ error: 'manifest/captureResults not found' }` → SKIPPED.
- FALSE: "the gate scores manifests in this repo's CI." It reaches `resolved` only against a
  Flutter repo (eden-biz) or a synthetic fixture.

`visual_gate` is dormant across every current TRD here — its ratchet is specified but
not yet exercised in production.

## Credential checkpoint — HUMAN ACTION, still open

`gate: 'binding'` requires `--judge live`, which requires `ANTHROPIC_API_KEY` (or
`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`).

- No **repository** secret exists on `AO-Cyber-Systems/devflow-claude`.
- `gh secret list --org AO-Cyber-Systems` returns **HTTP 403** — org-level secrets are
  invisible to this account, so their absence **cannot be concluded** from a developer
  machine. This must be checked from inside a CI run, where org secrets are injected.

Until then every run is `advisory`, and no run can retire a human visual check.

## What the simulated judge proves — and does not

All judging is a deterministic fake injected at `callVisionJudge`; no network call, no
credentials. This proves the **resolve → load → score → route → exit-code pipeline end to
end**. It does **NOT** prove a real vision model returns well-formed Shape-C, nor that
`gate: 'binding'` is reachable anywhere but a credentialed environment.
