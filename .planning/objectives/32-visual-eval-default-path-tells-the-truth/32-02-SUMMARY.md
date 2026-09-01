# TRD 32-02 — SUMMARY

**Title:** The offline path stops fabricating a score, and every state is nameable
**Branch:** `exec/32-02` (base `89e5fcf`, on `fix/ui-eval-default-honesty`)
**Status:** COMPLETE

## Commits

| Hash | Kind | What |
|---|---|---|
| `422cdf9` | test (RED) | C1–C4, C2b — evidence-tagged judge results |
| `18f62df` | feat | evidence-tagged results + evidence-aware validation |
| `1d70a8f` | test (RED) | C5 (evidence surfaced per-state), A1 (attribution) |
| `d104c0a` | test (RED) | A2, A2b — `buildManifestStub` must emit `state_id` |
| `da24222` | feat | `buildManifestStub` emits `state_id` (was `id`) |
| `3bfb96d` | feat | surface evidence per state; resolve `id` fallback loudly |

## What changed

**Defect 2 of aodex#485 — fabricated confidence.** `makeOfflineLabelEchoJudge` returned
`confidence: 0.99` + `matches_expected` for every state, having read only the `state_id`.
It now emits neither, and tags its result `evidence: 'label'` instead.
`parseVisionResponse` tags live results `evidence: 'vision'`.

`confidence` could not simply be deleted: `validateJudgeResult` **requires** it, so removal
would have failed every offline state into `review` — wrong for a genuinely labelled state.
Validation is therefore evidence-aware:

- `evidence: 'vision'` → `confidence` + `matches_expected` REQUIRED
- `evidence: 'label'` → both FORBIDDEN (no comparison was performed)
- absent → legacy path, the original unconditional checks, byte-for-byte

**The `id` / `state_id` mismatch (TRD task 3).** `buildManifestStub` emitted a seed state
keyed `id`; the engine reads `st.state_id` everywhere. Fixed at the root (stub now emits
`state_id`) AND with a compensating fallback for manifests already written from the old
stub — the engine accepts `id` but records an advisory naming the non-canonical key, so
the mismatch stays visible rather than becoming a second permanent shape.

Why 66 green tests never caught it: the hand-built fixture `manifest.json` was written
using `state_id` — matching the **engine**, not the **generator**. The suite could not
see a generator/consumer disagreement because no test ever fed generator output to the
consumer. `A2b` closes that hole: it runs `buildManifestStub()` output through the real
`df-tools verify flutter-ui-eval` CLI path and requires attribution with NO fallback
advisory — so the two cannot drift apart again without a test failing.

Plausible mechanism behind #485's headline count: pre-32-01, that same `undefined` key
missed the label lookup and fell through `|| { is_broken: false }` straight to a
fabricated **pass**.

## Test deliberately changed (not weakened)

`P4: REQUIRED_STATE_KEYS` was `['id', ...]` → `['state_id', ...]`. That literal encoded
the mismatch — it asserted the generator kept emitting the key the engine cannot read.
Changed deliberately per the TRD's explicit instruction; reasoning recorded inline and here.
No other existing test was modified.

## Evidence

- **ui-eval suite: 67/67** across the three ui-eval test files.
- **Whole `bin/lib` suite: 2206 tests, 2165 pass, 3 fail** — the 3 are the documented
  pre-existing environment failures (`scanPeer S1`, `check-todos E2E1`, `E2E3 skill dir`).
  No new failures.
- **R2 regression guard:** the checked-in fixture manifest still rolls up
  `verdict: "fail"`, `fails: ["broken-overflow"]`, every state carrying `evidence: "label"`
  and no fabricated confidence. Real detection is intact.

### Differential controls (performed and verified by the orchestrator, not self-reported)

1. **Stub fix reverted** (`state_id:` → `id:`) → **P4**, **Case A2**, **Case A2b** all
   failed by name (3 fail / 9 pass). Restored → `git diff --quiet` clean, 12/12 green.
2. **Fabricated confidence reinstated** (`evidence: 'label'` → `matches_expected`/
   `confidence: 0.99`) → **Case C1** and **Case C5** failed by name (2 fail / 53 pass).
   Restored → `git diff --quiet` clean, 55/55 green.

Legacy no-`evidence` path: covered by **C4**, and the code path is literally the original
two checks moved into the `else` branch unchanged.

## What the simulated judge proves — and does not

All judging in these tests is a deterministic fake injected through the `callVisionJudge`
boundary. No network call was made and no model credentials were used.

This proves the **validate → scoreState → scoreRun pipeline end to end**: shape rules,
evidence gating, per-state detail, rollup bucketing, and exit behaviour.

It does **NOT** prove that a real vision model returns well-formed Shape-C. That remains
unproven until the live path runs against real credentials — objective 33's concern.

## Known-live, out of scope here

`verdict: "fail"` still exits **0** (audit defect 4). Measured directly this run. Assigned
to TRD 32-04, which is severable.
