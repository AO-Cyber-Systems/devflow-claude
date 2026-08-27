# TRD 32-04 — SUMMARY

**Title:** A failing run exits non-zero (severable)
**Branch:** `exec/32-04` (base `65365db`)
**Status:** COMPLETE

## Commits

| Hash | Kind | What |
|---|---|---|
| `9e96279` | test (RED) | a failing run must exit non-zero |
| `cf6879f` | feat | `outputRollup()` sets exit code from verdict |

## The defect

`verdict: "fail"` with `fails: ["broken-overflow"]` exited **0**. A CI step calling the
gate saw success no matter what it found. Audit defect 4 of aodex#485.

## Exit-code matrix (measured directly at integration, not self-reported)

| Case | Verdict | Exit |
|---|---|---|
| pass-only manifest | `pass` | **0** |
| checked-in fixture (contains a deliberately-broken state) | `fail` | **1** |
| missing / invalid manifest | `{ error: ... }` | **0** |
| unrecognised `--judge` value | usage error | **1** |

Measured with `cmd > /dev/null 2>&1; echo $?` — never through a pipe, since `$?` after a
pipe reports the LAST stage's status, not the command's.

## Design decisions

**`process.exitCode`, not `process.exit()`.** `process.exit()` can truncate a buffered
stdout write; setting `exitCode` lets Node exit naturally once the rollup JSON has fully
flushed. A failing run's report stays readable — which matters, because that report is the
only thing explaining the failure.

**`output()` deliberately NOT reused.** It is shared by ~40 other df-tools commands and
calls `process.exit(0)` unconditionally. `outputRollup()` mirrors its serialize +
50KB-tmpfile-fallback behaviour exactly, without touching the shared path.

**Error/not-found paths keep exiting 0.** `verifier.md` Step 8c routes `{ error: ... }` to
SKIPPED, never a hard fail. Preserved.

**Exit 1 on `verdict: fail` REGARDLESS of gate — recorded deliberately.** An `advisory`
run (offline label-echo) that scores `fail` now exits non-zero, so an advisory run can fail
a build even though 32-03 established it may never RETIRE a human check. That asymmetry is
intentional: a label asserting a state is broken is positive evidence of a defect, whereas
an advisory pass is merely absence of evidence. Trusted to raise an alarm, not to grant
all-clear. **This is a behaviour change for any pipeline invoking the default path** — see
"Not yet load-bearing" below for why nothing is affected today.

## Test helper changed (deliberately, not weakened)

`runJSON()` in the dogfood suite previously relied on bare `execSync`, which throws on a
non-zero exit. The checked-in fixture manifest scores `fail` BY DESIGN, so every case
driving it would have crashed on the exit code instead of asserting on rollup content. The
helper now catches and parses `err.stdout` (execSync still attaches the child's stdout).
**Only how a non-zero exit is tolerated changed — no assertion about any rollup was
altered.** D2/DF1/DF2/DF3/N1/C5/G1/G2 all still assert exactly what they did before.

## Evidence

- **ui-eval suite: 80/80** before this TRD; full `bin/lib` suite after it:
  **2215 tests, 2173 pass, 4 fail** — the 4 being `scanPeer S1`, `check-todos E2E1`,
  `E2E3 skill dir` and their group wrapper, all pre-existing and flaky between runs.
  No new failures.
- Exit-code matrix above, re-measured independently at integration.

## Not yet load-bearing — the gate still never runs

`verifier.md:553` invokes the engine as
`verify flutter-ui-eval "$OBJECTIVE" --raw` — an objective **id** where a manifest
**path** is expected. Verified live on this tree:

```
$ node df-tools.cjs verify flutter-ui-eval "32-visual-eval-..." --raw
{ "error": "manifest/captureResults not found", "ok": false }   EXIT=0
```

So Step 8c still routes to SKIPPED and the visual gate does not execute in production.
Objective 32 has made the engine honest; it has NOT made it reachable. Until
objective 33 lands (33-01 id→manifest resolution, 33-02 the invocation Step 8c actually
contains, 33-03 the empty case + `verifier.md`), this exit code changes nothing in
practice — including the advisory-fails-CI decision above.

## What the simulated judge proves — and does not

All judging is a deterministic fake injected at `callVisionJudge`; no network call, no
credentials. This proves the **validate → scoreState → scoreRun → exit-code pipeline end
to end**. It does **NOT** prove a real vision model returns well-formed Shape-C, nor that
`gate: 'binding'` is reachable anywhere but a credentialed machine.
