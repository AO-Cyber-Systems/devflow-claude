---
objective: 08-program-aware-tui
type: pointer
research_status: not_required
---

# Objective 08 — Research (pointer)

**No dedicated research run.** Discovery Level 0 — pure internal work; all data sources already shipped (obj 1, 2, 5, 6 complete). All technical decisions locked in ROADMAP.md §"Objective 8".

## Why no DISCOVERY.md / RESEARCH.md

- **No new external dependencies.** Locked decision #1 mandates hand-rolled ANSI; no `blessed` / `ink` / `node-pty` / `term-kit` evaluation needed.
- **No new data fetchers.** Locked decision #7: TUI composes existing scanPeer + loadInitiatives + aggregateOrgByProductQuarter. Each of those was researched + shipped in obj 2 / obj 5.
- **No architecture choices open.** Three panels stacked, read-only, manual refresh — all locked.
- **Depth indicator check:** No "choose/select/evaluate" in objective scope; no architectural decision; no novel problem domain.

## Pointer references (existing research artifacts)

- `.planning/research/cross-session-coordination.md` — passing reference to TUI as v1.1 deliverable; informs the "manual refresh / read-only" stance.
- `.planning/objectives/02-cross-repo-awareness/02-SUMMARY.md` — scanPeer + readCache + aggregateOrgByProductQuarter shapes (consumed verbatim by 08-01).
- `.planning/objectives/05-initiative-context/05-SUMMARY.md` — loadInitiatives + formatInitiativeForPlanner truncation pattern (the per-panel truncation idiom).
- `.planning/objectives/06-check-todos/06-SUMMARY.md` — formatCheckTodosMarkdown sub-renderer composition (the renderer pattern this TRD reuses).

## ANSI escape sequence references (cheap external)

If executors need to verify any of the locked sequences in the cheatsheet:

- ECMA-48 / VT100 escape codes — `man 4 console_codes` (Linux) or `man 5 terminfo`
- `\x1b[?1049h` (alternate screen) is widely supported (xterm 1989, all modern terminals + tmux + screen)
- `setRawMode(true)` is Node-builtin (`process.stdin.setRawMode`) — no module needed
- `\x1b[2J` clears the entire alternate screen; combined with `\x1b[H` for cursor home this gives a clean re-render between `r` keypresses

If a specific escape produces broken output during 08-01 implementation, log a `# GOTCHA:` in the TRD's task action and the executor surfaces it back here on completion.

## Risk register (the 3 things most likely to bite)

1. **Cursor restoration on abnormal exit.** SIGKILL (kill -9) cannot be trapped — terminal stays in alternate-screen + hidden-cursor state. Mitigation: document `reset` / `tput reset` as the user-side recovery; cleanup is best-effort, not guaranteed.
2. **Snapshot drift from terminal-width assumptions.** Tests run in CI without a TTY; `process.stdout.columns` is undefined. Fix: always pass `cols` via `opts`, never read from `process.stdout` inside `render`.
3. **Multibyte character width math.** Emoji and CJK characters take 2 columns each in most terminals; ASCII length math gets it wrong. v1.1 mitigation: just truncate by code-point count and accept some terminals will see truncation 1-2 cols early on multibyte-heavy lines. Snapshot `unicode-text.txt` pins this behavior; deferring proper east-asian-width math to v1.2 if anyone complains.

## TDD playbook directives applied (from planning context)

- Renderer + sub-renderers + layout helpers — `type: tdd`; pure-function tests with snapshot comparison ✓ (TRD 08-01)
- Terminal control / raw-mode CLI — `type: standard` ✓ (TRD 08-02)
- Composition (data load + render) — `type: tdd` ✓ (TRD 08-03 composition tests)
- Export lock + e2e — `type: tdd` ✓ (TRD 08-03 EX1 + E2E1-3)
- Anti-patterns: no LLM-generated test data, no property-based tests, no Gherkin layer ✓
- Snapshot tests use hand-built fixture aggregates ✓
