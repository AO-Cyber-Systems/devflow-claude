---
objective: 19-pty-handoff-watcher
trd: "02"
subsystem: watcher-daemon
tags: [pty, token-passing, secrets, tdd, watcher, redaction]
type: tdd
requires:
  - 19-01 (ShellSession PTY backend)
  - lib/handoff.cjs (existing)
  - lib/watcher-daemon.cjs (existing)
  - lib/watcher-shell.cjs (existing)
provides:
  - validateInputsSchema(inputs) — handoff.cjs export
  - cmdHandoffCreate({inputsJson}) — extended signature
  - ShellSession.attachDataListener / detachDataListener / injectInput — public API
  - processOnce token-passing wiring (prompt detection + secret resolution + redaction)
affects:
  - .devflow-handoff/pending/<id>.json schema (new optional `inputs.secrets[]` field)
  - .devflow-handoff/done/<id>.json (stdout/stderr redacted when secrets present)
tech-stack:
  added: []
  patterns:
    - prompt-detector pattern (regex over accumulated buffer; `consumed` flag; lastInjectionIdx re-match guard)
    - secret-resolver pattern (env first-class, stash injectable, keyring deferred)
    - redaction-at-end (full buffers, not streaming) — avoids cross-chunk split
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/handoff.cjs (+ validateInputsSchema, cmdHandoffCreate inputs)
    - plugins/devflow/devflow/bin/lib/handoff.test.cjs (+ 16 VS/HC tests)
    - plugins/devflow/devflow/bin/lib/watcher-shell.cjs (+ data-listener API)
    - plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs (+ 8 DL-* tests)
    - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs (+ prompt detector + redaction)
    - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs (+ 10 TP-* tests)
    - plugins/devflow/devflow/bin/df-tools.cjs (+ --inputs-json flag plumbing)
decisions:
  - keyring deferred to v1.3+ (locked at plan time per CONTEXT.md decision 5)
  - MIN_REDACT_LEN=8 — short tokens not redacted to avoid collapsing unrelated substrings
  - stash CLI deferred (no `devflow-watch stash add` in v1.2); `value_source:'stash'` schema accepted but runtime fails-empty
  - data-listener wiring runs BEFORE _tryComplete so detector sees chunks before END sentinel resolves dispatch
  - redact-at-end (full buffers) not redact-as-you-go — avoids secret-split-across-chunks problem
metrics:
  duration: ~18 minutes
  completed: 2026-05-06
---

# Objective 19 TRD 02: Token Passing for Interactive Prompts Summary

Implements the daemon-side answer-loop for prompts: the pending-record schema gains an optional `inputs.secrets[]` array; the daemon detects each prompt regex against the accumulated PTY buffer, writes the resolved secret + CR via `session.injectInput()`, and redacts the value from `done.stdout` / `done.stderr` before persistence.

## Wire Format (final)

```jsonc
{
  "id": "h-abc123",
  "cmd": "doctl auth init",
  "inputs": {
    "secrets": [
      {
        "prompt_match": "Enter your access token:",
        "value_source": "env",        // "stash" | "env"  (keyring deferred to v1.3+)
        "value_ref": "DO_TOKEN"
      }
    ]
  }
}
```

`inputs` field is optional; absent or empty → daemon dispatches byte-identical to v1.1 (no listener attached, no redaction). `keyring` rejected at validation time with the v1.3+ deferral message.

## MIN_REDACT_LEN Choice

Set to **8 characters** in `watcher-daemon.cjs`. Rationale:

- Below 8 chars, false-positive collisions become likely (`Login flow short-circuited` would collapse if the secret is the literal `short`).
- 8 is the minimum for any modern API token format (GitHub PATs are 40+, DigitalOcean tokens are 64, AWS access keys are 20).
- Keeps redaction "obvious" — short user passwords (which would never reach the daemon anyway in v1.2 since stash CLI is deferred) are documented as a partial-leak risk in the 19-04 doc update.

## Stash CLI Deferral

v1.2 ships the schema (`value_source: 'stash'` accepted by `validateInputsSchema`) but **no** stash CLI surface. Runtime behavior when a record has `value_source: 'stash'`:

- `deps.stashGetter` is `null` in production daemon (no provider wired).
- `_resolveSecrets` returns `{ err: 'stash empty for ref "<ref>" (handoff <id>)' }`.
- On first prompt match the detector injects Ctrl+C and emits `secret resolution failed for "<ref>" (stash empty for handoff <id>)` on the done record.

The `env` source is the working v1.2 path. `devflow-watch stash add <handoff-id> <key> <value>` lands in v1.3+ alongside keyring.

## Commit Hashes

| Phase    | Commit    | Subject                                                               |
| -------- | --------- | --------------------------------------------------------------------- |
| RED      | `348dd91` | test(19-02): add failing tests for validateInputsSchema and cmdHandoffCreate inputs extension |
| GREEN-A  | `ead5811` | feat(19-02): add validateInputsSchema and inputs field to cmdHandoffCreate |
| GREEN-B  | `69397d6` | feat(19-02): expose data-listener API on ShellSession for prompt detection |
| GREEN-C  | `998b42e` | feat(19-02): wire processOnce with prompt-answer + redaction for token passing |

REFACTOR phase skipped — implementation was already factored into named helpers (`_resolveSecrets`, `_makePromptDetector`, `_redactSecrets`) on first GREEN pass.

## Test Count Delta

| File                     | Before | After | Delta |
| ------------------------ | ------ | ----- | ----- |
| handoff.test.cjs         | 19     | 34    | **+15** (12 VS + 3 HC; HC-1 already passed against existing back-compat) |
| watcher-shell.test.cjs   | 20     | 28    | **+8** (DL-1..DL-8) |
| watcher-daemon.test.cjs  | 12     | 22    | **+10** (TP-1..TP-10) |
| **Project total**        | 1864 pass | **1898 pass** | **+34** new tests, 2 pre-existing failures unchanged |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking] Empty `inputs.secrets:[]` was treated as listener-required**

- **Found during:** TP-7 test design
- **Issue:** Initial pass attached the listener whenever `pending.inputs` was present, even when `secrets:[]` was empty. This wired a useless listener that never fired but still incurred the ext-listener iteration cost.
- **Fix:** `secrets.length > 0` guard before `_resolveSecrets` and `attachDataListener`. TP-7 now asserts no listener is attached for empty array.
- **Files modified:** `plugins/devflow/devflow/bin/lib/watcher-daemon.cjs`
- **Commit:** `998b42e`

No other deviations — TRD executed as written. Stash CLI was correctly deferred per CONTEXT.md §4 discretion (planner already locked this); no scope creep.

## Auth Gates

None encountered. All work was unit-test-driven against mock sessions; no live tool authentication required.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
| ---- | -------------- | --------- | ------ |
| 1: RED tests | `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs` | 1 (15 fails expected) | PASS (RED) |
| 2 (GREEN-A): handoff schema | `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs` | 0 (34/34 pass) | PASS |
| 2 (GREEN-B): data-listener API | `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | 0 (28/28 pass) | PASS |
| 2 (GREEN-C): processOnce wiring | `node --test plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs` | 0 (22/22 pass) | PASS |

## Validation Gate Results

| Gate  | Command    | Exit Code | Status |
| ----- | ---------- | --------- | ------ |
| test  | `npm test` | 1 (2 pre-existing failures unchanged) | PASS (per-baseline) |

The 2 pre-existing failures (E2E1 check-todos 64KB truncation + novel-domain test 22) are unrelated to this TRD and remain unchanged from Wave 1 baseline (1864 pass + 2 fail). Effective new-test pass rate: 34/34 = 100%.

## TDD Evidence

| Phase    | Command | Exit Code | Expected |
| -------- | ------- | --------- | -------- |
| RED      | `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs` | 1 (15 fails) | FAIL (correct — VS-1..VS-12, HC-2..HC-4 fail; HC-1 passes by back-compat) |
| GREEN-A  | `node --test plugins/devflow/devflow/bin/lib/handoff.test.cjs` | 0 | PASS (correct — 34/34) |
| GREEN-B  | `node --test plugins/devflow/devflow/bin/lib/watcher-shell.test.cjs` | 0 | PASS (correct — 28/28) |
| GREEN-C  | `node --test plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs` | 0 | PASS (correct — 22/22) |
| (full)   | `npm test` | 1 (2 pre-existing failures only) | PASS-baseline |

REFACTOR phase: skipped — implementation was already factored into named helpers on first GREEN.

## Post-TRD Verification

- Auto-fix cycles used: 1 (Rule 3 — empty-secrets guard, caught by TP-7)
- Must-haves verified: 11/11 truths from TRD frontmatter
  - ✅ Pending record schema accepts optional `inputs.secrets[]` (HC-2)
  - ✅ validateInputsSchema accepts stash + env, rejects keyring (VS-2, VS-8, VS-9)
  - ✅ Rejects entries missing prompt_match or value_ref (VS-5, VS-6, VS-12)
  - ✅ Rejects malformed regex (VS-4)
  - ✅ env resolution at dispatch time from process.env (TP-1)
  - ✅ env unset/empty → status:'failed' with clear stderr (TP-3)
  - ✅ stash empty → status:'failed' with clear stderr (TP-2)
  - ✅ Writes value + CR on prompt match (TP-1)
  - ✅ Duplicate match → status:'failed' with 'duplicate prompt match' (TP-4)
  - ✅ Resolved values redacted in done.stdout/stderr (TP-5, TP-10)
  - ✅ Records without inputs dispatch byte-identical to v1.1 (TP-6, TP-7)
- Gate failures: None (2 pre-existing test failures unchanged from Wave 1 baseline)

## Self-Check: PASSED

- SUMMARY.md created at `.planning/objectives/19-pty-handoff-watcher/19-02-token-passing-SUMMARY.md`
- All 4 commit hashes (348dd91, ead5811, 69397d6, 998b42e) exist in git log
- `npm test`: 1898 pass / 2 known pre-existing failures (E2E1, novel-domain test 22)
- Test count delta: +34 (15 handoff + 8 watcher-shell + 10 daemon + 1 HC-1 already passing)
- All 11 must_haves truths from TRD frontmatter verified (see Post-TRD Verification)
