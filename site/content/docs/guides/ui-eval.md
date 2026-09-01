---
title: "UI evaluation"
weight: 40
lede: "Machine-judged visual correctness — capture each declared UI state, score it offline, gate verification on the result."
---

Screenshots that a human glances at are not evidence. The UI eval pipeline captures
each declared UI state, scores it through an offline visual-eval engine, and writes
machine-readable evidence the `verifier` consumes and gates on.

## Running it

```text
/devflow:ui-eval 6
/devflow:ui-eval path/to/manifest.json
```

## The pipeline

```text
declare surfaces  →  capture each state  →  score offline  →  evidence  →  verifier gates
   (manifest)        (Maestro / Playwright)   (visual-eval)     (JSON)      (pass / fail)
```

The `ui-evaluator` agent drives it. Backend selection is automatic: Flutter
surfaces go through Maestro, web through Playwright.

## Setup

One command handles adoption — it detects missing system tools, builds an install
plan, dispatches it through the handoff daemon (or prints it when the daemon is
down), and chains the bootstrap:

```bash
df-tools flutter-ui setup
df-tools flutter-ui setup --print-only    # just show the plan
df-tools flutter-ui setup --auto
```

Then:

```bash
df-tools flutter-ui bootstrap [project-dir]
df-tools flutter-ui eval <manifest|captureResults>
```

## Verification hooks

The verifier consumes eval output through dedicated `verify` subcommands:

```bash
df-tools verify flutter-ui-bootstrap <project-dir>     # is the project set up for eval?
df-tools verify flutter-ui-eval <manifest>             # did the captured states score green?
df-tools verify flutter-state-coverage <trd-path>      # are all declared states covered by tests?
```

`flutter-state-coverage` catches the common gap: a widget test that exercises the
happy path and silently ignores loading, empty and error states.

## Scoping

```bash
df-tools detect flutter-ui-scope <objective>
```

Determines whether an objective has UI surfaces worth evaluating. The planner uses
this to decide whether to include a UI-eval step at all — running the pipeline on
an objective with no UI is pure cost.

## Why offline scoring

The evaluation engine runs locally against captured images rather than asking a
model to look at a screenshot and opine. Two reasons:

1. **Determinism.** The same capture scores the same way every run, so a
   regression is a real change and not model variance.
2. **Gate-ability.** A numeric score can be a pass/fail threshold the verifier
   enforces. "Looks fine to me" cannot.

The concrete model id used for the vision judge comes from the `models{}` map in
`references/model-profiles.json`. That map is live — sent to the Messages API at
runtime — so a stale id there is a runtime defect, not a documentation slip.
