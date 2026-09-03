---
quick_task: 15-fix-changelog-on-tag-gate-to-validate-th
subsystem: hooks
tags: [git-hooks, pretooluse, changelog, release-gate, execFileSync]

# Dependency graph
requires:
  - quick_task: 2-extend-tag-gate-to-verify-three-manifest
    provides: the three-manifest version-sync check this task adds commit-ish awareness to
provides:
  - "changelog-on-tag.js reads the four gated files from a named commit-ish's tree (git show) instead of the working tree, when the gated `git tag -a` command names one"
  - "invocation-aware detection ported from gate-commits.js (TRD 27-04): a command that only mentions a tag command in quotes no longer fires the gate"
  - "changelog-on-tag.js's first test file (22 cases), closing the last hook without adjacent test coverage"
affects: [release tooling, retroactive/backfill tagging workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tree-reader seam: makeTreeReader(repoRoot, commitish) returns { read } backed by either fs (no commitish) or `git show <c>:<path>` (resolved commitish) — one seam, both checks (changelog + manifest) flow through it"
    - "Unresolvable-ref-as-fallback: `git rev-parse --verify <c>^{commit}` failure silently degrades to working-tree behavior, never denies/throws on a bad ref"

key-files:
  created:
    - plugins/devflow/hooks/changelog-on-tag.test.js
  modified:
    - plugins/devflow/hooks/changelog-on-tag.js

key-decisions:
  - "Regex applied to the CLEANED command (stripHeredocs + stripQuoted from gate-commits.js), not the raw one — pure narrowing, kills the quoted-mention false positive without widening what fires."
  - "CHANGELOG.md absent at the resolved tree returns from main() entirely (both checks skipped), mirroring today's `if (!fs.existsSync(clPath)) return;` exactly — skipping only the changelog check would have made the gate stricter, which was explicitly out of scope."
  - "556f8d3 still denies post-fix, now correctly on the marketplace [devflow] entry (2.5.0) alone — the fix changes which tree is inspected, not the strictness of the rule."

requirements-completed: []

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~25min
completed: 2026-09-02
---

# Quick Task 15: Fix changelog-on-tag gate to validate the named commit-ish's tree

**`git tag -a vX.Y.Z <commit-ish>` now validates CHANGELOG.md and the three release manifests against THAT COMMIT's tree via `git show`, not the working tree — closing the bug that made retroactive/backfill tagging of a historical commit impossible without the escape hatch.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-02
- **Tasks:** 3/3 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `git tag -a v2.6.0 556f8d3` now denies for the RIGHT reason: `.claude-plugin/marketplace.json [devflow]: 2.5.0 (expected 2.6.0)` only — no mention of `package.json` or the working tree's `2.7.0`, confirmed against real repo history.
- Commit-ish resolution (`parseTagCommand` + `resolveCommit` + `makeTreeReader`) added without reimplementing TRD 27-04's `stripHeredocs`/`stripQuoted` — required from `gate-commits.js`.
- Ported invocation-aware detection to this hook: `echo "git tag -a v9.9.9 -m x"` no longer fires the gate (the same false-positive class TRD 27-04 fixed for `gate-commits.js`, reproduced live during planning, never backported here until now).
- `changelog-on-tag.js` gained its first test file — 22 cases, the last of 15 hooks without adjacent coverage.
- Fixed `main()`'s missing `require.main === module` guard as part of the same change (it was unconditionally invoked, which also meant simply `require()`-ing the module could hang reading fd 0 under some test harnesses — observed live in this session under `node --test`'s per-file child-process isolation, resolved by the same guard the JOB asked for anyway).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — create changelog-on-tag.test.js | `node plugins/devflow/hooks/changelog-on-tag.test.js` | 1 | PASS (RED confirmed: 12 fail for expected pre-fix reasons incl. cases 18-22 `parseTagCommand is not a function`, 11 parity cases already pass) |
| 2: GREEN — commit-ish-aware tree resolution | `node --test plugins/devflow/hooks/changelog-on-tag.test.js` | 0 | PASS (23/23 tests pass) |
| 3: Verify — full-suite regression + live repro | `npm test`; live repro against 556f8d3 and HEAD | 0 / 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node plugins/devflow/hooks/changelog-on-tag.test.js` | 1 | FAIL (correct — 12/23 cases fail for the intended pre-fix reasons) |
| GREEN | `node --test plugins/devflow/hooks/changelog-on-tag.test.js` | 0 | PASS (23/23 cases pass) |

Note on harness: the RED-phase run had to be invoked as a direct `node <file>` process
(not `node --test <file>`) with the parent's own stdin set to `ignore`. Node's test
runner forks a per-file child process for `node --test` whose own stdin is a `pipe`
that nothing writes to or closes; combined with the hook's then-unguarded `main()`
(no `require.main === module` check), simply `require()`-ing the module during test
file loading called `fs.readFileSync(0)` synchronously and hung indefinitely inside
that child. This is the exact failure mode the JOB's own gotchas section warned about
("`main()` is currently unguarded... requiring the module in a test would execute it
against fd 0") — this session's environment made it a hang rather than an
empty-string read. Task 2's `require.main` guard fixes it structurally; post-fix,
`node --test` runs the full suite normally with no special invocation needed.

## Post-Quick-Task Verification

- **Full-suite regression:** `npm test` — 2958 tests (2935 baseline + 23 new), 2898 pass,
  **10 fail (unchanged from baseline)**, 50 skipped. The 10 failures are exactly the
  known-flaky set: `devflow-watch start (foreground) + stop`, `devflow-watch
  multi-project CLI (TRD 20-03)` + its 2 sub-cases (C-1/C-2), `foreground daemon writes
  PID file...`, `start refuses when daemon already running`, `start cleans up stale PID
  file and starts fresh`, `handoff pipeline — end-to-end` + its 3 sub-cases, and `S1:
  scanPeer with 1 valid branch returns 1 entry with all fields`. No new failures.
- **Live repro (556f8d3):** `git tag -a v2.6.0 556f8d3 -m "release"` → **DENY**, reason:
  `Manifest versions out of sync for tag v2.6.0 (at commit 556f8d3):\n
  .claude-plugin/marketplace.json [devflow]: 2.5.0 (expected 2.6.0)` — no `package.json`
  line, no `2.7.0` anywhere. Matches `<important_subtlety>` exactly: the fix changes
  which tree is inspected, not the strictness of the rule; 556f8d3 really was
  internally inconsistent on the marketplace entry alone.
- **Positive control (HEAD):** same command with `HEAD` in place of `556f8d3` → DENY
  citing `package.json`, `plugin.json`, and `marketplace.json [devflow]`, all `2.7.0`
  (the actual current working-tree state) — confirms the gate still fires normally on
  the ordinary path and only the *inspected tree* changed, not the strictness.
- **No-commit-ish parity:** `git tag -a v2.6.0 -m "release"` (no commit-ish) against the
  real working tree → DENY citing the same three `2.7.0` mismatches with **no** `(at
  commit ...)` suffix — byte-for-byte the same shape as the hook's behavior before this
  change.
- **Auto-fix cycles used:** 0
- **Must-haves verified:** 14/14 (all `must_haves` from the JOB frontmatter — commit-ish
  resolution in both positions, value-consuming-flag exclusion, stripHeredocs/stripQuoted
  reuse, unresolvable-ref fallback, absent-CHANGELOG full-return, absent-manifest silent
  skip, execFileSync-only git invocation, escape hatch preserved, commit-cited deny
  messages, `require.main` guard + exported parser, and the test file itself)
- **Gate failures:** None

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixtures masked their own assertions (found while confirming RED, before touching the hook)**
- **Found during:** Task 1, verifying RED failures
- **Issue:** Cases 2, 9, 10, and 12 used `manifests(version)` for both the CHANGELOG
  entry and the three manifest files. Since the CHANGELOG check runs before the
  manifest check and the fixtures gave both the *same* off-tag version, the CHANGELOG
  deny fired first and masked the manifest-mismatch assertion the test actually wanted
  to exercise — a fixture design bug, not a hook bug.
- **Fix:** Added `manifestsForTag(tagVersion, manifestVersion, marketEntryVersion)` —
  builds a CHANGELOG entry that matches the *tag* while the three manifest files carry
  a *different* version — and applied it to the four affected fixtures.
- **Files modified:** `plugins/devflow/hooks/changelog-on-tag.test.js` (same commit as
  Task 1; caught and fixed before the RED commit, not a follow-up commit)
- **Commit:** 14f159d

**2. [Rule 3 - Blocking] `.planning/.skill-active` marker had expired mid-session**
- **Found during:** start of Task 1, first `Write` call
- **Issue:** `gate-edits.js` denied the write — the marker written by the orchestrator's
  `/devflow:quick` invocation carried an 8h TTL and had expired before this executor
  turn resumed (the session spanned past that window).
- **Fix:** Ran `df-tools skill-active --start quick` to refresh the marker (writes to
  both this worktree's and the main checkout's `.planning/`, per TRD 27-01). No code
  change; not a hook bug, a session-duration edge case.
- **Files modified:** none (marker file only, gitignored)
- **Commit:** n/a

### Out-of-scope items noted (per JOB, not implemented)

- `DEVFLOW_*` escape hatches (including `DEVFLOW_SKIP_CHANGELOG_GATE=1`) do not reach
  hooks from an inline shell assignment — `DEVFLOW_SKIP_CHANGELOG_GATE=1 git tag ...`
  does **not** disable the gate, because the hook reads Claude Code's own process env,
  not the invoking shell's. The escape hatch only works when the variable is set in the
  environment Claude Code itself was launched with. This bit the planning session twice
  per the JOB's own notes; left untouched here as explicitly out of scope.
- Firing-regex breadth (`git tag -s`, `git tag -f`, `git -C <path> tag ...`) intentionally
  left unwidened — would make the gate stricter, out of scope for this fix.
- `CLAUDE.md`'s one-line hook description and the `changelog-on-tag.js` filename both
  left as-is, per the JOB's stated 2-file footprint.

## Self-Check: PASSED

- `plugins/devflow/hooks/changelog-on-tag.js` — FOUND
- `plugins/devflow/hooks/changelog-on-tag.test.js` — FOUND
- Commit `14f159d` (test: RED suite) — FOUND in `git log`
- Commit `0264d3e` (feat: GREEN implementation) — FOUND in `git log`
