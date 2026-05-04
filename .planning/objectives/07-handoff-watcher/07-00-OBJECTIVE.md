# Objective 07: Seamless Handoff Watcher

> **Status:** ✅ shipped via PR #19 (2026-05-04). Renumbered from 01 → 07 on 2026-05-04 to match its v1.1 ROADMAP slot. Originally planned and executed before the v1.1 milestone was seeded as a numbered scope; retroactively absorbed as v1.1 obj 7. v1.2 PTY backend will close the remaining TTY-interactive gap (tracked separately).

Bring `feature/seamless-handoff` from Approach A (paste-`!`) to Approach B (daemon-driven, zero-paste) while preserving Approach A as a fallback when the daemon isn't running.

## Why

The user's stated goal is for Claude to keep executing without `!`-paste interruptions for interactive and shell-flow commands. Approach A only relocates the friction. Approach B removes it.

## TRD index

| TRD | Title | Type | Why TDD |
|---|---|---|---|
| 01-01 | Watcher state library (PID file + done-record contracts) | tdd | pure logic, easy to fixture |
| 01-02 | Allowlist validation | tdd | pure logic, security-relevant |
| 01-03 | `devflow-watch` daemon scaffold (CLI: start/stop/status/logs) | tdd | start/stop with PID-file lifecycle is testable; shell-spawn is integration |
| 01-04 | Interactive shell session (sentinel protocol, exit-code capture) | tdd | well-bounded protocol; `echo` round-trip exercises 100% |
| 01-05 | Result-injection hook (`route-results.js`) | tdd | content shape, idempotency (consumed flag) |
| 01-06 | `gate-interactive.js` daemon-aware deny + shell-flow patterns | tdd | regression risk in existing 41 tests; new patterns need coverage |
| 01-07 | End-to-end integration test (daemon → done → injection) | tdd | guards the whole pipeline |
| 01-08 | Skill + docs update | docs/config | not test-eligible |

## Out of scope (deferred)

- OS notifications
- launchd / systemd auto-start
- node-pty integration
- Non-zsh/non-bash shells

## Success criteria

- `npm test` passes (162 existing + new tests)
- All TRDs landed with green tests
- Demo: with daemon running, `gh auth login` (mocked via test fixtures) is queued, run by daemon, result injected on simulated next turn — Claude never says "paste `!`"
- Fallback: with no daemon, behaviour identical to today
- Branch is mergeable
