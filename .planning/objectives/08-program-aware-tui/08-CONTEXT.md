---
objective: 08-program-aware-tui
github_issue: 17
parent_issue: 9
org_project: PVT_kwDODwqLrc4BRsOP
github_repo: AO-Cyber-Systems/devflow-claude
work: feature
kind: plugin
---

# Objective 08 — Program-aware TUI viewer (CONTEXT)

This is the **final v1.1 deliverable**. Read-only terminal UI that composes obj 1+2+5+6 into a 3-panel stacked view. ~3-4h Claude execution budget; biggest unknown is ANSI render details.

## 1. Goal restated (outcome shape)

A user runs `/devflow:tui` (or `df-tools tui`) in a terminal and sees three vertically-stacked panels:

- **Top:** Org tree (Product × Quarter, fed by obj 2 `aggregateOrgByProductQuarter` over cached org scan)
- **Middle:** Peer awareness (obj 2 `scanPeer` cached output — branches with author + objective + last commit)
- **Bottom:** Active initiatives (obj 5 `loadInitiatives` — slug + truncated Why + open question count)

`r` refreshes (re-runs cached data load). `q` (or SIGINT, or EOF) exits cleanly: cursor restored, alternate screen torn down, raw mode released. Narrow terminals (< 80 cols) reflow rather than crash. No mutation. No auto-poll.

## 2. Locked decisions (verbatim from ROADMAP)

1. **Hand-rolled ANSI rendering — no TUI library dependency.** Pure stdout escape codes + cursor positioning + key handling via `readline` raw mode.
2. **Read-only.** No mutation ops surfaced via TUI.
3. **Three panels (vertically stacked, 80×24 default):**
   - Top: Org tree (Product × Quarter)
   - Middle: Peer awareness
   - Bottom: Active initiatives
4. **Refresh model:** initial render + manual `r` key refresh. `q` quits. No auto-refresh poll.
5. **tmux-pane safe.** Detects narrow terminals (< 80 cols) and re-flows. Restores cursor + screen on exit (handles SIGINT cleanly).
6. **No keystroke side effects beyond r/q.** Selection / drill-down is v1.2+.
7. **Reuses every existing data source.** No new fetchers; just composes obj 2 scanPeer + obj 5 loadInitiatives + obj 6 aggregate (cached path) + obj 1 resolveChain.
8. **Token-bounded.** TUI render code stays under ~600 lines; pure logic + ANSI helpers.

## 3. Success Criteria (the 10 — mapped to TRDs)

| SC | Description | TRD |
|----|-------------|-----|
| SC-1 | `lib/tui.cjs` exports `render({ awareness, initiatives, todos, orgChain, opts })` — pure, returns ANSI string | 08-01 |
| SC-2 | `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel` — three sub-renderers, independently tested | 08-01 |
| SC-3 | `_layoutPanels(rows, cols, panels)` — terminal-size-aware; reflows < 80 cols → single-column | 08-01 |
| SC-4 | `df-tools tui` CLI — raw stdin, alternate screen, hides cursor, `r` refreshes, `q` exits | 08-02 |
| SC-5 | Clean exit handling: SIGINT, EOF, `q` all restore terminal state via `process.on('exit')` cleanup | 08-02 |
| SC-6 | `/devflow:tui` skill invokes the CLI | 08-03 |
| SC-7 | Snapshot tests against `__fixtures__/tui-snapshots/<scenario>.txt` — exact ANSI assertion | 08-01 |
| SC-8 | Resilience: missing data source → empty panel with "(no initiatives)" placeholder; never crashes | 08-01 |
| SC-9 | `lib/tui.cjs` export surface LOCKED: `render`, `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel`, `_layoutPanels`, `_setRunStdout`, `_resetMocks` | 08-03 |
| SC-10 | Self-test: `df-tools tui --once --raw` emits this repo's actual state to stdout; exits 0; clean exit even when piped to non-TTY | 08-03 |

## 4. Out of scope (v1.1 — explicit)

- Interactive selection / drill-down (just r/q)
- Auto-refresh poll
- Mouse support
- Multi-pane layouts beyond 3 stacked
- Detailed initiative view / sub-issue expansion
- TUI-driven mutations

## 5. Module surface (LOCKED at 08-03)

7 entries. Asserted by snapshot test (deepStrictEqual).

```
{
  // Public API:
  render,

  // Sub-renderers (exposed for tests):
  _renderOrgPanel,
  _renderPeerPanel,
  _renderInitiativesPanel,

  // Layout helper:
  _layoutPanels,

  // Test hooks:
  _setRunStdout,
  _resetMocks,
}
```

The CLI entry point (`runTui`, `cmdTuiRoute`) lives in a sibling file `lib/tui-cli.cjs` (mirroring obj 5's pattern: `initiatives.cjs` + `initiatives-cli.cjs`). Keeps the renderer module pure and snapshot-stable.

## 6. Hand-rolled ANSI cheatsheet (for executors)

| Action | Sequence |
|---|---|
| Enter alternate screen | `\x1b[?1049h` |
| Leave alternate screen | `\x1b[?1049l` |
| Hide cursor | `\x1b[?25l` |
| Show cursor | `\x1b[?25h` |
| Clear screen | `\x1b[2J` |
| Cursor home (1,1) | `\x1b[H` |
| Move to (row, col) | `\x1b[{row};{col}H` (1-indexed) |
| Reset attributes | `\x1b[0m` |
| Bold | `\x1b[1m` |
| Dim | `\x1b[2m` |
| Underline | `\x1b[4m` |
| FG colors | `\x1b[3{0..7}m` (black=0, red=1, green=2, yellow=3, blue=4, magenta=5, cyan=6, white=7) |
| Box drawing | `─` `│` `┌` `┐` `└` `┘` `├` `┤` `┬` `┴` `┼` (unicode; U+2500 range) |

Snapshot tests pin exact byte sequences. To regenerate after intentional change: write the test with an empty `expected`, run, copy stdout, paste into snapshot file. Don't auto-regenerate on test runs (anti-pattern; mirrors obj 1 cassette discipline).

## 7. Data shapes consumed by `render`

`render` is pure — no fetchers. Caller assembles the object below and passes it in.

```js
{
  awareness: {                                    // from obj 2 scanPeer (cache or live)
    branches: [
      { branch, objective, trd, github_issue, last_commit: { sha, timestamp, subject }, developer }
    ],
    fetched_at: '2026-05-04T...',
    warnings: [],
    current_branch: 'feature/v1.1-obj-8-tui',
  },
  initiatives: [                                  // from obj 5 loadInitiatives
    { slug, github_issue, key_repos, why, questions, sub_issues, updated_at }
  ],
  orgChain: {                                     // from obj 2 aggregateOrgByProductQuarter (over cached scanOrg)
    'devflow-claude': {
      'Q2 2026': [{ title, github_issue, status, sub_issues_source, ... }],
      'Q3 2026': [...],
    },
    // ...
  },
  todos: null,                                    // RESERVED — not surfaced in v1.1 panels (see decision #3); render ignores. Caller may pass null.
  opts: {
    rows: 24,                                     // terminal rows
    cols: 80,                                     // terminal cols
    no_color: false,                              // disables \x1b[3..m sequences when true (snapshot determinism + NO_COLOR env)
    current_repo: 'AO-Cyber-Systems/devflow-claude',
  }
}
```

`render` MUST NOT throw on missing/null branches. Each sub-renderer treats its slice as best-effort:
- `awareness == null` or `awareness.branches.length === 0` → middle panel renders `_(no peer sessions)_`
- `initiatives == null` or `[]` → bottom panel renders `_(no initiatives)_`
- `orgChain == null` or empty → top panel renders `_(no org context — run /devflow:awareness)_`

This is **SC-8 resilience** — non-throwing degradation is the locked contract.

## 8. Composition orchestration (08-03)

The CLI loads data BEFORE calling `render`:

```
1. const aw = require('./awareness.cjs');
2. const initiatives = require('./initiatives.cjs');
3. const fs = require('fs');
4. peer = aw.readCache(cwd)?.peer ?? aw.scanPeer({cwd, no_fetch: true})        // prefer cache; fallback to fast local scan
5. org  = aw.readCache(cwd)?.org  ?? null                                       // org section is GH-auth-gated; null if cache absent
6. orgChain = org ? aw.aggregateOrgByProductQuarter(org.items) : null
7. inits = initiatives.loadInitiatives({})                                      // global home, never throws
8. opts = { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80, no_color: !!process.env.NO_COLOR, current_repo: <from PROJECT.md> }
9. const ansi = tui.render({ awareness: peer, initiatives: inits, orgChain, todos: null, opts });
10. process.stdout.write(ansi);
```

`obj 6 aggregate` is intentionally NOT loaded by the TUI in v1.1 (decision #3 lists 3 panels, not 4). The `todos` slot is reserved for v1.2.

`obj 1 resolveChain` is invoked indirectly: `current_repo` is read from PROJECT.md frontmatter. If a user wants the parent-issue chain rendered, that's a v1.2 panel addition.

## 9. Snapshot test discipline

Snapshots live at `lib/__fixtures__/tui-snapshots/`. Naming: `{scenario}.txt`. Each scenario has an exact ANSI byte string committed to git.

**Required scenarios (test list — see TRD 08-01):**
1. `default-80x24.txt` — happy-path 3-panel render at default terminal size
2. `narrow-60x24.txt` — narrow reflow (single-column stack)
3. `empty-org.txt` — orgChain null/empty → "(no org context)" placeholder in top panel
4. `empty-initiatives.txt` — initiatives === [] → "(no initiatives)" placeholder
5. `empty-peer.txt` — awareness.branches === [] → "(no peer sessions)" placeholder
6. `all-empty.txt` — all 3 sources empty (still renders frame with placeholders; never crashes)
7. `no-color.txt` — `opts.no_color: true` strips all `\x1b[3..m` color sequences (frame + cursor positioning preserved)
8. `tall-data.txt` — more entries than fit; per-panel truncation with "[N more]" footer
9. `unicode-text.txt` — branch names / initiative slugs containing emoji + non-ASCII; no off-by-one column math errors

Snapshots are **hand-built fixtures** (per playbook) — write the expected ANSI literal in the test, not LLM-generated. Initial RED test fails because `render` doesn't exist; GREEN implementation makes one snapshot pass at a time.

**Determinism contract:** `render` MUST be a pure function. No `Date.now()`, no `Math.random()`, no env reads outside `opts`. Timestamps come in via `opts` or via the awareness/initiatives shape (`last_commit.timestamp`, `updated_at`); they're rendered as-is.

## 10. Terminal control (08-02)

The CLI runs the renderer inside a tightly-scoped raw-mode session:

```
ENTER:
  process.stdout.write('\x1b[?1049h');     // alternate screen
  process.stdout.write('\x1b[?25l');       // hide cursor
  process.stdin.setRawMode(true);
  process.stdin.resume();

RENDER:
  process.stdout.write('\x1b[H\x1b[2J');   // home + clear
  process.stdout.write(tui.render({...}));

KEYS (process.stdin 'data' handler):
  byte 0x71 ('q') → cleanup() + process.exit(0)
  byte 0x72 ('r') → re-fetch + re-render
  byte 0x03 (Ctrl-C) → cleanup() + process.exit(130)

EXIT (cleanup, idempotent, called from):
  - process.on('exit', cleanup)
  - process.on('SIGINT', cleanup)
  - process.on('SIGTERM', cleanup)
  - 'q' keypress
  - stdin 'end' event (EOF)

  cleanup():
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    process.stdout.write('\x1b[?25h');     // show cursor
    process.stdout.write('\x1b[?1049l');   // leave alternate screen
```

`cleanup` MUST be idempotent (multiple signals can fire; double-write of `\x1b[?1049l` is harmless but the raw-mode toggle on a paused stream throws — guard with `stdin.isTTY` check).

`--once --raw` mode (SC-10): no alternate screen, no raw mode. Just call `render`, write to stdout, exit. The test surface for the CLI without TTY interactivity. When stdout is a pipe (`!isTTY`), this is the default.

**Non-TTY guard:** if `process.stdout.isTTY === false`, the CLI auto-switches to `--once --raw` (warns to stderr if the user asked for interactive mode). This makes `df-tools tui | head` not hang.

## 11. Test fixtures (TDD playbook discipline)

Hand-built fixture aggregates only. NO LLM-generated test data. Builders live in `lib/__fixtures__/tui-fixtures.cjs`:

- `buildTuiAggregate(opts)` — full {awareness, initiatives, orgChain, todos, opts} object with sensible defaults
- `buildPanelOpts({ rows, cols, no_color, current_repo })` — opts subobject builder
- `buildOrgChainSimple()` — small Product×Quarter map for happy-path snapshot
- `buildOrgChainEmpty()` — empty {} for resilience snapshot
- `buildAwarenessSimple()` — 2-3 peer branches with known timestamps
- `buildAwarenessEmpty()` — { branches: [], warnings: [], fetched_at: <fixed>, current_branch: null }
- `buildInitiativesSimple()` — 2 initiatives with truncated Why
- `buildInitiativesEmpty()` — []
- `buildAdversarialAggregate()` — embedded ANSI in branch name, very long initiative slugs, multibyte chars

Reuse builders across snapshot tests. Multitenancy guard does not apply (single-user CLI; no tenant boundary).

## 12. TRD breakdown (3 plans, 4 waves logical / 3 waves physical)

| TRD | Title | Type | Wave | SC | Files |
|---|---|---|---|---|---|
| 08-01 | Renderer + fixtures + snapshot infrastructure | tdd | 1 | SC-1, SC-2, SC-3, SC-7, SC-8 | lib/tui.cjs, lib/tui.test.cjs, lib/__fixtures__/tui-fixtures.cjs, lib/__fixtures__/tui-snapshots/*.txt |
| 08-02 | CLI + terminal control + raw mode | standard | 2 | SC-4, SC-5 | lib/tui.cjs (MODIFY — only adds the `runTui` orchestration; render unchanged), lib/tui-cli.cjs (CREATE), bin/df-tools.cjs (MODIFY) |
| 08-03 | Skill + composition + export-lock + e2e self-test | tdd | 3 | SC-6, SC-9, SC-10 | lib/tui.cjs (MODIFY — finalize export-lock banner + locked surface), lib/tui.test.cjs (MODIFY — EX1/E2E1-3), skills/tui/SKILL.md (CREATE) |

`lib/tui.cjs` is **serialized across all 3 TRDs** (mentioned in the planning context). The renderer body is written once in 08-01; 08-02 adds nothing to its surface; 08-03 finalizes the module.exports lock. No write conflict because the waves are physical-sequential.

## 13. References (read by executors)

- `lib/awareness.cjs` — scanPeer, readCache, aggregateOrgByProductQuarter
- `lib/initiatives.cjs` — loadInitiatives, formatInitiativeForPlanner (truncation pattern)
- `lib/check-todos.cjs` — formatCheckTodosMarkdown (renderer composition pattern)
- `lib/dup-detect.cjs` — formatDetectionMarkdown (sub-renderer composition pattern)
- `lib/awareness-cli.cjs` — _parseFlags + cmd*Route pattern (CLI surface)
- `lib/__fixtures__/awareness-fixtures.cjs` — fixture-builder naming + hand-built data discipline
