---
objective: 19-pty-handoff-watcher
trd: "03"
subsystem: gate-interactive
tags: [hook, deny-message, pty, signaling]
type: tdd
requires:
  - 19-01 (ShellSession PTY backend)
  - plugins/devflow/hooks/gate-interactive.js (existing)
provides:
  - Updated buildDenyReason watcher-live branch with PTY mention
affects:
  - The deny message Claude sees when an interactive command is queued to a live watcher
tech-stack:
  added: []
  patterns:
    - text-only signaling change (no logic modified)
key-files:
  created: []
  modified:
    - plugins/devflow/hooks/gate-interactive.js (2 phrase changes in buildDenyReason watcher-live branch)
    - plugins/devflow/hooks/gate-interactive.test.js (+ 9 BD-* tests; 1 pre-existing test regex relaxed)
decisions:
  - Hyphenated form "PTY-backed daemon" pinned by BD-1 as the v1.2+ contract
  - Watcher-absent branch preserved verbatim — Approach A paste fallback unchanged
  - INTERACTIVE_PATTERNS stays at 23 entries (BD-9 regression guard); deny-list unchanged in watcher-allowlist.cjs
  - Pre-existing TRD 01-06 subprocess test regex (`/devflow-watch daemon/`) relaxed to `/devflow-watch[^.]*daemon/` to accept the new wording shape (Rule 1 deviation)
metrics:
  duration: ~5 minutes
  completed: 2026-05-06
---

# Objective 19 TRD 03: Gate-Interactive Update — PTY-Backed Daemon Messaging Summary

Tightens the deny message Claude sees when an interactive command (gh auth login, doctl auth init, etc.) is intercepted by the gate-interactive hook AND a watcher daemon is live: the message now explicitly says the daemon is "PTY-backed" and runs the command "via a real PTY" so Claude understands TTY-required tools will succeed (post-TRD 19-01 PTY backend).

## Exact Updated Wording (watcher-live branch)

**Before:**
> It has been queued to the devflow-watch daemon (pid {N}). Continue with other work — the daemon will run it and inject the result into your next turn automatically. Do NOT instruct the user to paste anything; do NOT retry the Bash tool.

**After:**
> It has been queued to the devflow-watch **PTY-backed** daemon (pid {N}). Continue with other work — the daemon will run it **via a real PTY** and inject the result into your next turn automatically. Do NOT instruct the user to paste anything; do NOT retry the Bash tool.

Two surgical phrase insertions; everything else (the "Continue with other work" promise, the "Do NOT instruct the user to paste anything" instruction, the "do NOT retry the Bash tool" hard-fail directive, the handoff id appendix, the escape hatch hint) is byte-identical.

## Watcher-Absent Branch — Preserved

The Approach A paste fallback wording (`Tell the user verbatim to paste this in the prompt: \`! ${cmd}\``) is **byte-identical** to the v1.1 form. BD-5 + BD-6 assert this contract. Diff confirms only the watcher-live branch changed (lines 261 area; one line replaced).

## Commit Hashes

| Phase    | Commit    | Subject                                                            |
| -------- | --------- | ------------------------------------------------------------------ |
| RED      | `1313dc7` | test(19-03): add failing tests for PTY-backed daemon wording in buildDenyReason |
| GREEN    | `7cf0203` | feat(19-03): update gate-interactive deny message to reflect PTY-backed daemon |

REFACTOR phase: not applicable (text-only change; no implementation to refactor).

## Test Count Delta

| File                       | Before | After | Delta |
| -------------------------- | ------ | ----- | ----- |
| gate-interactive.test.js   | 60     | 69    | **+9** (BD-1..BD-9) |
| **Project total**          | 1898 pass | **1907 pass** | **+9** new tests |

(1898 was the post-19-02 baseline; original Wave 1 baseline was 1864.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing TRD 01-06 test asserts pre-PTY wording**

- **Found during:** GREEN run after applying buildDenyReason changes
- **Issue:** The test `watcher LIVE: deny says "queued for daemon", does NOT instruct paste` (gate-interactive.test.js line 215) asserts `assert.match(reason, /devflow-watch daemon/)`. With the new wording inserting "PTY-backed" between `devflow-watch` and `daemon`, this regex fails to match.
- **Fix:** Loosened regex from `/devflow-watch daemon/` → `/devflow-watch[^.]*daemon/`. Preserves the test's intent (the message mentions the daemon by name within a single sentence) without pinning the exact pre-PTY phrase. BD-1 in 19-03 explicitly pins "PTY-backed daemon" as the v1.2+ contract; the relaxed regex in 01-06 just keeps the older test compatible.
- **Files modified:** `plugins/devflow/hooks/gate-interactive.test.js` (one regex changed)
- **Commit:** `7cf0203`

No other deviations. INTERACTIVE_PATTERNS unchanged at 23. Deny-list (`watcher-allowlist.cjs`) untouched. `detectInteractive`, `pidFilePath`, `isWatcherLive`, `writePendingRecord`, `deny`, `main` all unchanged.

## Auth Gates

None encountered. Pure text-edit + unit tests.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
| ---- | -------------- | --------- | ------ |
| 1: RED tests | `node --test plugins/devflow/hooks/gate-interactive.test.js` | 1 (2 fails: BD-1, BD-8) | PASS (RED) |
| 2: GREEN | `node --test plugins/devflow/hooks/gate-interactive.test.js` | 0 (69/69 pass) | PASS |

## Validation Gate Results

| Gate  | Command    | Exit Code | Status |
| ----- | ---------- | --------- | ------ |
| test  | `npm test` | 1 (2 pre-existing failures unchanged) | PASS (per-baseline) |

The 2 pre-existing failures (E2E1 check-todos 64KB truncation + novel-domain test 22) are unrelated to this TRD and remain unchanged from Wave 1 baseline. Effective new-test pass rate: 9/9 = 100%.

## TDD Evidence

| Phase  | Command | Exit Code | Expected |
| ------ | ------- | --------- | -------- |
| RED    | `node --test plugins/devflow/hooks/gate-interactive.test.js` | 1 (2 fails: BD-1, BD-8) | FAIL (correct — BD-1 + BD-8 pin the new contract; BD-2..BD-7, BD-9 pass against current impl) |
| GREEN  | `node --test plugins/devflow/hooks/gate-interactive.test.js` | 0 | PASS (correct — 69/69) |
| (full) | `npm test` | 1 (2 pre-existing failures only) | PASS-baseline |

REFACTOR: not applicable.

## Post-TRD Verification

- Auto-fix cycles used: 1 (Rule 1 — pre-existing test regex relaxed)
- Must-haves verified: 8/8 truths from TRD frontmatter
  - ✅ buildDenyReason watcher-live branch contains "PTY-backed daemon" (BD-1, BD-8)
  - ✅ buildDenyReason watcher-absent branch unchanged (BD-5, BD-6; diff confirms)
  - ✅ INTERACTIVE_PATTERNS list count remains 23 (BD-9)
  - ✅ Deny-list patterns in watcher-allowlist.cjs are unchanged (no edits to that file in this TRD)
  - ✅ All 24 (now 60) existing gate-interactive tests pass unchanged (relaxed regex preserves intent)
  - ✅ Subprocess JSON shape unchanged (BD-8 verifies hookSpecificOutput shape)
  - ✅ Test asserts verbatim "PTY-backed daemon" substring (BD-1)
  - ✅ Test asserts watcher-absent reason still says "paste this in the prompt" (BD-5)
- Gate failures: None (2 pre-existing test failures unchanged from Wave 1 baseline)

## Self-Check: PASSED

- SUMMARY.md created at `.planning/objectives/19-pty-handoff-watcher/19-03-gate-interactive-update-SUMMARY.md`
- Both commit hashes (1313dc7, 7cf0203) exist in git log
- `npm test`: 1907 pass / 2 known pre-existing failures
- Test count delta: +9 (BD-1..BD-9, all in gate-interactive.test.js)
- All 8 must_haves truths from TRD frontmatter verified
