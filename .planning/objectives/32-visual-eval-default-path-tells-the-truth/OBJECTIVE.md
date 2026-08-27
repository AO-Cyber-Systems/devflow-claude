---
objective: 32-visual-eval-default-path-tells-the-truth
status: planning
roadmap: ".planning/ROADMAP.md — ### Objective 32: Visual-eval default path tells the truth"
source_issue: AO-Cyber-Systems/aodex#485
umbrella_issue: AO-Cyber-Systems/eden-biz#683
depends_on_pr: AO-Cyber-Systems/devflow-claude#68
branch: fix/ui-eval-default-honesty
branch_base: feat/ui-visual-eval
worktree: /Users/markemerson/Source/devflow-claude-ui-eval
overrides:
  work: bugfix
  tdd: strict
---

# Objective 32: Visual-eval default path tells the truth

## Goal

The default `df-tools verify flutter-ui-eval` invocation stops reporting green for
states nothing judged. A `state_id` absent from `labels.json` must resolve to review
or fail — never pass — and the offline path must stop emitting a fabricated
`confidence` for a comparison it never performed.

## Why (AO-Cyber-Systems/aodex#485)

#485 audited the SHIPPED visual-eval gate and found it does not judge anything:
**40 states reported passing, 34 of which had never been judged by anything.**

The cause is one line in `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs:328`:

    const label = (labels && labels[request.state_id]) || { is_broken: false };

A state absent from `labels.json` falls through to `{ is_broken: false }` — the
judge's default answer to a question it was never asked is "looks fine."

### The causal chain, traced end to end

The damage is not confined to a misleading JSON field. `plugins/devflow/agents/verifier.md`
Step 8c (line 562) reads:

> `verdict: pass` (no fails, no reviews) → REMOVE that surface from the Step 9
> `human_verification:` list. This is the payoff: machine-judged visual correctness
> drops off the human queue.

So an unjudged state is scored `pass`, and that `pass` **removes the surface from the
human-verification queue**. This is how 34 states escaped both the machine and the human:
the machine never looked, then told the human it had.

### Reproduced, not assumed

Ground truth captured during planning against the current tree (temp manifest, one
labelled state, one unlabelled state, one stub-shaped state):

    "state_id": "never-judged-by-anything",
    "verdict": "pass",
    "is_broken": false,
    "defects": [],
    "advisories": []

and the run rollup: `"verdict": "pass-with-reviews"`, `"counts": {"pass": 2, ...}`.

Confirmed in the same run: the stub-shaped state (the shape the planner's own
`buildManifestStub` emits) produces `"reviews": [null]` — an unattributable review.

Also confirmed: **`verdict: "fail"` exits 0.** The checked-in fixture manifest scores
`fail` and `echo $?` reports `0`. A CI step running this command is green regardless
of what it found.

## What each TRD discharges

| TRD | #485 defect discharged |
|-----|------------------------|
| 32-01 | **Defect 1** — `:328`, a missing `state_id` silently becomes PASS. The headline finding. |
| 32-02 | **Defect 2** — `:343`, fabricated `confidence: 0.99` + `matches_expected` for a comparison that never happened. Plus the unattributable-state (`reviews: [null]`) corollary found during planning. |
| 32-03 | **Defect 3** — `--judge live` is opt-in, so the default is a labels lookup wearing a gate's clothing. Decision + reasoning recorded below. |
| 32-04 | **Discovered during planning, not in #485** — `verdict: fail` exits 0, so no CI step can gate on this command. Severable; see below. |

## Branch decision

**Stack on `feat/ui-visual-eval`, do not wait for #68 to merge.**

- PR #68 is OPEN (`headRefName: feat/ui-visual-eval`, `baseRefName: main`,
  `mergeStateStatus: CLEAN`) and edits the same file this objective edits.
- The live judge #68 adds (`liveVisionCall`, `--judge live`, the
  refusal/credential/network → `review` downgrade) is a **direct dependency** of this
  work: TRD 32-01 reuses that downgrade mechanism rather than inventing a parallel one,
  and TRD 32-03 makes the `live`-vs-default distinction load-bearing. Sequencing after
  #68 merges would idle this work behind a review queue for no benefit.
- Therefore: create `fix/ui-eval-default-honesty` **from `feat/ui-visual-eval`**, PR it
  **into `feat/ui-visual-eval`** (not `main`), so #68 ships as one coherent change:
  the judge and the honest default path together.
- Per the Merge Runbook Stage A: before merging the stacked PR, re-verify its
  `baseRefOid` matches the current `feat/ui-visual-eval` tip and re-run the gates on the
  merged tree. Same-subsystem window applies — #68 and this objective are the same
  subsystem by construction.

## Decision: what the default judge does (Defect 3)

The brief required this decision be made deliberately and its reasoning recorded.

**Decision: the default stays offline-labels, and stops claiming to be a gate.**
Judge selection becomes explicit (`--judge live` | `--judge labels`), and the rollup
declares its own standing: `gate: 'binding'` on the live path, `gate: 'advisory'` on
the labels path. The verifier's Step 8c contract changes so that **only a `binding`
pass may clear a surface from the human-verification list.**

Reasoning, including what was rejected and why:

1. **Rejected: make `live` the unconditional default.** The dogfood suite drives the
   real CLI through `execSync`. An unconditional live default would make
   `node --test flutter-ui-eval-dogfood.test.cjs` issue real, billed, nondeterministic
   vision calls, breaking the module's stated no-network test contract
   (`network: false` is asserted by Case D2 and Case N1 today).
2. **Rejected: `live` when credentials are present, offline when they are not.** This
   reproduces the very defect this objective closes — a run whose meaning you cannot
   read off the command. A developer with `ANTHROPIC_API_KEY` exported and CI without
   one would get different verdicts from identical input. Ambient environment silently
   deciding whether anything was judged is exactly the #485 failure mode wearing
   different clothes.
3. **Chosen.** Verified during planning: `--judge live` with no credential downgrades
   every state to `review` and rolls the run up to `fail` — loud and honest, but only
   because the caller asked for live. The honest fix for the default is not to secretly
   upgrade it; it is to stop the default from *claiming* gate authority it does not
   have. "The gate is real" then becomes a claim that requires `--judge live`, and the
   verifier can no longer retire a human check on the strength of a labels lookup.

## Environmental prerequisite

The live path needs `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`)
wherever the gate runs. Until that secret exists in CI, "the gate is real" is a
**local-only claim**. TRD 32-03 carries this as an explicit `checkpoint:human-action` —
it is not assumed, and the objective does not claim CI enforcement without it.

## Out of scope (explicit)

- **Building a different judge.** PR #68's live vision judge IS the judge.
- **The advisory design-review layer** — also #68.
- **Any eden-biz change.** The manufacturing/stockorders UI is Phase 3 of eden-biz#683
  and depends on this objective, not the reverse.
- **Re-running historical manifests to re-judge past objectives.** Worth doing; not done
  here. **Carried out in writing** so it does not become nobody's — see below.

## Carried out (recorded so it does not become nobody's)

1. **Re-judge historical manifests.** Every manifest scored before this objective was
   scored by the defective default. Their green verdicts are unreliable and, per the
   traced causal chain, some of them retired human verification that never happened.
   Owner: unassigned. Recommended: a follow-up objective that re-runs every manifest
   under `.planning/objectives/*/evidence/ui_eval/` with `--judge live` and diffs the
   verdicts against the recorded ones. Explicitly NOT closed by this objective.
2. **Verifier Step 8c invokes the command with an objective id, not a manifest path.**
   `verifier.md:553` runs `df-tools verify flutter-ui-eval "$OBJECTIVE" --raw`, but the
   handler resolves its positional arg as a filesystem path. Verified during planning:
   `verify flutter-ui-eval 32 --raw` returns
   `{"error":"manifest/captureResults not found","path":"32","ok":false}`, which Step 8c
   routes to `? SKIPPED (no ui-eval manifest)`. **The shipped verifier gate therefore
   never runs at all.** This does not report false green (it reports skipped), so it is
   out of scope for an honesty objective — but it means the gate's CI coverage is zero
   today. Owner: unassigned. Recommended: a follow-up that teaches the handler to
   resolve an objective id to its manifest, or corrects Step 8c to pass a path.

## Success criteria

- SC-1 A manifest state absent from `labels.json` never scores `pass` on any path.
- SC-2 The run rollup can never report a clean `pass` while any state went unjudged.
- SC-3 The offline path emits no `confidence` and no `matches_expected` for a
  comparison it did not perform, and declares its evidence basis instead.
- SC-4 Every state in the rollup is attributable by name — no `null` entries.
- SC-5 The default invocation declares `gate: 'advisory'`; only `--judge live` yields
  `gate: 'binding'`, and only `binding` may clear a surface from human verification.
- SC-6 A run whose verdict is `fail` exits non-zero (TRD 32-04; severable).
- SC-7 Each fix carries a test that was observed to FAIL against the pre-fix behaviour,
  with the RED output recorded in the SUMMARY.
- SC-8 The `bin/lib` suite is green apart from the three known pre-existing failures
  (`scanPeer S1`, `check-todos E2E1`, `E2E3 skill dir`), which are not attributed to or
  fixed by this work.
