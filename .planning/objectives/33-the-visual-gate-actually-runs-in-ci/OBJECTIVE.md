---
objective: 33-the-visual-gate-actually-runs-in-ci
status: planning
roadmap: ".planning/ROADMAP.md — ### Objective 33: The visual gate actually runs in CI"
source: "Found while planning objective 32; carried out of 32's OBJECTIVE.md as item 2"
umbrella_issue: AO-Cyber-Systems/eden-biz#683
related_issue: AO-Cyber-Systems/aodex#485
depends_on_objective: 32-visual-eval-default-path-tells-the-truth
depends_on_pr: AO-Cyber-Systems/devflow-claude#68
branch: fix/ui-eval-gate-runs
branch_base: fix/ui-eval-default-honesty
worktree: /Users/markemerson/Source/devflow-claude-ui-eval
overrides:
  work: bugfix
  tdd: strict
---

# Objective 33: The visual gate actually runs in CI

## Goal

Verifier Step 8c invokes the visual-eval engine with something the engine can load, so the
gate executes instead of routing to SKIPPED — and every outcome it can reach is
distinguishable from every other one. Today the gate is structurally unreachable and has
judged nothing, ever.

## The defect, reproduced (not assumed)

`plugins/devflow/agents/verifier.md:553` (Step 8c):

```bash
UI_EVAL=$(node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval "$OBJECTIVE" --raw)
```

It passes an objective **id**. The handler's first positional argument is a **manifest
path**: `cmdVerifyFlutterUIEval` (`flutter-ui-eval.cjs:529`) → `loadManifest(manifestPath)`
(`:57`) → `fs.readFileSync(manifestPath, 'utf-8')`.

Reproduced live against this tree during planning:

```
$ node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval 32 --raw
{ "error": "manifest/captureResults not found", "path": "32", "ok": false }
EXIT=0
```

Step 8c's own contract (line 564) then reads: *"On `{ error: ... }` (no manifest found /
invalid): record `? SKIPPED (no ui-eval manifest)` and fall through to Step 9 unchanged.
NEVER a hard fail."*

So the gate is **structurally unreachable**. It always errors, always routes to SKIPPED,
and has never judged anything. It reports skipped rather than false-green — which is why
aodex#485's audit did not catch it — but **CI coverage of the visual gate is currently
zero**.

Two further drifts found while planning, both of the same family (prose describing a
lookup that the code does not implement):

- `workflows/ui-eval.md:33` documents the objective manifest as `manifest.yaml`. The
  engine `JSON.parse`s. A `.yaml` manifest is a second, independent unreachability.
- `workflows/ui-eval.md:34` documents the repo manifests as `flutter/ui_eval/manifests/*.yaml`.
  What `flutter-ui-eval-bootstrap.cjs:34` actually writes is
  `ui_eval/manifests/web.manifest.json` — different extension, different prefix.

## Decision: who owns manifest resolution

The brief posed three options. **Chosen: (c) — both, implemented as (b) plus its
consequence.** Resolution lives in ONE place, in code: a new `resolveUIEvalTarget()` in
`flutter-ui-eval-resolve.cjs`, called by the handler. The verifier keeps passing
`"$OBJECTIVE"`, which stops being broken. The `/devflow:ui-eval` workflow keeps its
capture-side directory resolution (it needs the directory to write screenshots into) but
its **score** step stops hand-rolling the lookup and delegates to the handler.

Reasoning, including what was rejected and why:

1. **The bug is a contract split across prose documents.** `ui-eval.md` implements the
   lookup order in prose; `verifier.md` does not implement it at all; the handler
   implements neither. Option (a) — teach the verifier to resolve — makes that *three*
   prose copies of one lookup. The side that owns resolution is the side that cannot
   drift, and prose has already demonstrated twice in this file pair that it drifts. That
   side must be the code.
2. **Two callers of one engine; today one works.** Under (b) both work by construction,
   and so does every future caller — a CI step, a hand-typed `df-tools` invocation, the
   design-review arm at Step 8d. Under (a), only the document you edited works.
3. **Testability is decisive.** A prose lookup can only be pinned by string-grep, and a
   grep passes happily while the lookup it is grepping for is wrong (exactly today's
   state: the string is there, the behaviour is not). A code lookup gets unit tests on
   every branch. More importantly, moving resolution into the handler makes the
   load-bearing test *executable*: extract Step 8c's actual command out of `verifier.md`,
   run it against a hermetic fixture objective, assert the engine loads something. That
   test pins the **behaviour of whatever string Step 8c contains** — so prose drift is
   caught no matter what the prose drifts to. That is strictly stronger than pinning the
   string, and it is only possible if the handler accepts what the verifier sends.
4. **Back-compat is free.** An argument that exists on disk as a file is still treated as
   a path. The dogfood suite, `workflows/ui-eval.md`, PR #68 and objective 32's callers
   are untouched.
5. **Rejected: (a) alone.** Fixes one caller, adds a third prose copy of the lookup, and
   its only available test is the string-grep that today's bug already slips past.
6. **Rejected: (b) alone.** The invocation would start working, but Step 8c's *routing*
   still collapses "no manifest", "malformed manifest" and "not a UI objective" into one
   `{error}` → SKIPPED branch. That is the second-order problem below, and it lives in the
   verifier. Hence (c).

## Decision: what a manifest-less objective does

Fixing the argument alone converts "always SKIPPED" into "runs, and now what?" for every
objective that has no manifest — which is most of them. Replacing a gate that never runs
with a gate that always gaps is worse, because people disable it. So the outcomes are
made distinguishable and each is routed deliberately.

Status vocabulary mirrors the existing `flutter-state-coverage.cjs:240`
(`status: 'not_applicable'`) rather than inventing a parallel one.

| `resolution` | Condition | Step 8c routing |
|---|---|---|
| `not_applicable` | Objective has **zero** TRDs with `type: ui` + `stack: flutter` | **Silent skip, exit 0.** Unchanged from today. This preserves the existing Step 8c gate — do not break it. |
| `absent` | UI TRDs exist; no manifest at any lookup location | **`MISSING`, not skipped.** A `notes:` entry, the surface **stays** on the Step 9 `human_verification:` list, and a todo to author the manifest is recorded. **Escalates to a `gaps:` entry when the objective declares the gate** (`visual_gate: true`). |
| `invalid` | A manifest was found but is unparseable / wrong shape / a `.yaml` the JSON engine cannot read | **`gaps:` entry.** Loud. A broken gate is a defect, not an absence. |
| `resolved` | Manifest loaded | Score it. Existing routing, made honest by objective 32. |

Two things carry the weight here:

- **`absent` is never a silent skip.** Nothing judged the surface, so the human must — the
  surface stays on the human queue and the missing manifest is recorded as debt. This is
  the honest middle between today's silent no-op and a blanket gap. Objective 221's claim
  that a UI objective without the visual gate is not done is honoured by the *ratchet*,
  not by retroactively failing the backlog.
- **The ratchet.** `visual_gate: true` is the field the planner's `decideUIEvalDefault()`
  already returns for a detected Flutter UI objective (P5, opt-out not opt-in). An
  objective planned **after** the gate became auto-required carries it and therefore has
  no excuse: `absent` becomes a gap. Objectives planned before it do not carry the field
  and get `MISSING` + a todo. The gate becomes binding going forward without gapping
  everything that already shipped.
- **`invalid` can never masquerade as `absent`.** Today both collapse to the same
  `{error}`. After this objective they are different statuses with different routing, and
  a test asserts they are distinguishable.

## Branch decision

**`fix/ui-eval-gate-runs`, cut from `fix/ui-eval-default-honesty` (objective 32's branch)
at its tip once 32's TRDs are complete; PR'd into `feat/ui-visual-eval`.**

- Objective 32 modifies `flutter-ui-eval.cjs` in all four of its TRDs, **and modifies
  `agents/verifier.md` in 32-03**. Objective 33 modifies both files too (33-02 the
  handler, 33-03 Step 8c). Cutting 33 from `feat/ui-visual-eval` in parallel with 32
  guarantees a textual conflict inside `cmdVerifyFlutterUIEval` and inside Step 8c.
- The conflict would also be **semantic, not just textual**. 32-03 rewrites Step 8c so
  that *only a `binding` pass may clear a surface from human verification*. 33-03 rewrites
  the same routing block to add the four-status table. 33 is therefore the **last writer**
  of Step 8c and must compose with 32's rule, not overwrite it. Per the Merge Runbook
  Stage B check 3, last-writer is exactly the check that catches this class — so it is
  carried as an explicit success criterion (SC-9) and a grep assertion in 33-03, not left
  to review attention.
- **If objective 32 has already merged into `feat/ui-visual-eval` when 33 starts,** cut
  from `feat/ui-visual-eval` instead. Same result, one hop fewer. **Never cut from `main`**
  — `main` has neither the judge (#68) nor the honest default path (32).
- Merge Runbook Stage A applies before merging: re-verify `baseRefOid` matches the current
  base tip and re-run the gates on the merged tree. The same-subsystem window is guaranteed
  here by construction (32 and 33 are the same subsystem), so Stage B is not optional.

## Differential control — the brief's form is inverted by decision (c)

The brief specified: restore the `"$OBJECTIVE"` form, watch the new test fail by name,
restore again, confirm `git diff` is empty.

Under decision (c), **`"$OBJECTIVE"` is the correct form** — the whole point is that the
handler learns to accept it. So the control is performed on the side that now owns the
behaviour:

> Revert `cmdVerifyFlutterUIEval` to path-only resolution (drop the `resolveUIEvalTarget`
> call), run the suite, confirm the extracted-invocation case fails **by name** with the
> exact legacy payload `{"error":"manifest/captureResults not found","path":"33"}`, restore
> the fix, and confirm `git diff` on `flutter-ui-eval.cjs` is empty.

This is the faithful analogue: reintroduce the defect on the side that now owns it, watch
the named test catch it, restore, prove nothing was left behind. Carried as TRD 33-02
task 3 and as SC-8.

## What pins a markdown instruction

Step 8c is agent prose, and the brief is right that a prose-only change would drift
straight back. Two mechanisms, in order of strength:

1. **The executable extraction test (primary).** `verifier-ui-eval-invocation.test.cjs`
   reads `agents/verifier.md`, extracts the `df-tools.cjs verify flutter-ui-eval …`
   command line from Step 8c's bash block, substitutes `$OBJECTIVE` with a hermetic
   fixture objective id, executes it, and asserts the engine loaded something. It pins
   *behaviour*, not a string. If someone changes the invocation to anything the engine
   cannot consume, this fails — whatever they changed it to.
2. **Grep-structural assertions (secondary, and legitimate here).** The repo already does
   this: `flutter-ui-scope.test.cjs:192-228` (`planner.md gate content (REQ-10-03)`,
   Cases P1–P5) asserts on `agents/planner.md` content with `assert.match`. 33-03 adds the
   same shape for Step 8c's routing table — the four statuses named, the silent-skip
   branch preserved, and 32-03's `binding`-only clearance rule still present (the
   last-writer guard). Grep is the right tool for "this paragraph still says the thing";
   it is the wrong tool for "the command works", which is why mechanism 1 exists.

## Out of scope (explicit)

- **The judge itself** — PR #68.
- **The default-path honesty fixes** — objective 32 (`unjudged` bucket, fabricated
  `confidence`, `gate: advisory|binding`, non-zero exit on fail). 33 makes the gate RUN;
  32 makes what it says true. Both are required before "the visual gate works" is true.
- **Authoring manifests for existing objectives.** This objective makes the gate
  *runnable*, not *populated*. `absent` is the designed, honest outcome for an objective
  with no manifest.
- **Re-judging historical manifests.** Carried out of objective 32 as item 1 and
  explicitly NOT absorbed here.
- **Any eden-biz change.**
- **A YAML parser.** No new dependencies. A `.yaml` manifest resolves to `invalid` with an
  explicit reason, which is honest and testable; adding YAML support is a separate
  decision.

## Carried out (recorded so it does not become nobody's)

1. **Multiple repo manifests are not all scored.** Lookup tier 3 can match more than one
   `ui_eval/manifests/*.manifest.json`. This objective sorts them, scores the first, and
   reports the rest in `additional_candidates[]` so a multi-manifest repo is *visible*
   rather than silently half-judged. Scoring all of them and merging the rollups is a real
   feature; it is not this objective. Owner: unassigned.
2. **The `visual_gate: true` frontmatter field is read but never written by the planner.**
   `decideUIEvalDefault()` returns it in its decision object; nothing persists it into TRD
   frontmatter. Until it does, the ratchet in the `absent` policy is dormant — correct and
   harmless (everything gets `MISSING`), but the escalation half is untested against a
   real planner output. Owner: unassigned. Recommended: a follow-up that has the planner's
   Flutter UI scope sub-procedure write `visual_gate: true` into the TRDs it marks
   `type: ui`.

## Success criteria

- **SC-1** `df-tools verify flutter-ui-eval <objective-id>` resolves and loads a manifest
  when one exists. The `{"error":"manifest/captureResults not found","path":"33"}` payload
  is unreachable for a valid objective id.
- **SC-2** A manifest **path** argument still behaves exactly as before — the dogfood suite
  and every #68 / objective-32 caller are untouched.
- **SC-3** Four distinguishable outcomes exist and are named in the output:
  `not_applicable`, `absent`, `invalid`, `resolved`.
- **SC-4** An objective with no `type: ui` + `stack: flutter` TRD still skips silently and
  exits 0. The existing Step 8c gate is preserved, not replaced.
- **SC-5** An objective with UI TRDs and no manifest reports `absent` → `MISSING`: never a
  silent skip, the surface stays on the human-verification list, a todo is recorded, and it
  escalates to a `gaps:` entry only when `visual_gate: true` is declared.
- **SC-6** A malformed manifest reports `invalid` and routes to `gaps:`, and a test asserts
  it is distinguishable from `absent`.
- **SC-7** The load-bearing test executes the invocation **extracted from `verifier.md`
  itself**, so it pins behaviour rather than a string. It was OBSERVED to fail against the
  current form and the RED output is recorded in the SUMMARY.
- **SC-8** The differential control (inverted form, above) was performed: the defect was
  reintroduced on the handler, the named case failed with the legacy payload, the fix was
  restored, and `git diff` on the file is empty.
- **SC-9** Step 8c still carries objective 32-03's rule that only a `binding` pass may
  clear a surface from human verification. 33 is the last writer of that block and must
  compose with it, not overwrite it. A grep assertion enforces this.
- **SC-10** The `bin/lib` suite is green apart from the three known pre-existing failures
  (`scanPeer S1`, `check-todos E2E1`, `E2E3 skill dir`), which are neither fixed by nor
  attributed to this work.

## Baseline (measured during planning, this tree)

```
$ cd plugins/devflow/devflow/bin/lib
$ node --test flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs \
      flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs \
      flutter-ui-scope.test.cjs
tests 85 / pass 85 / fail 0
```
(60 in the four ui-eval files, 25 in `flutter-ui-scope.test.cjs`. Objective 32 adds to the
first four before 33 starts — re-baseline at 33's start rather than asserting 85.)
