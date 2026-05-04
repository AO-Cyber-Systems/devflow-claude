# Roadmap

## Milestone v1.1 — DevFlow Coordination Layer (planning)

**Goal:** Bring devflow-claude from a per-repo planning helper to a program-aware coordination layer for AI-assisted work across the AO-Cyber-Systems org. Planning becomes org-aware (surveys sibling repos, eden-libs reuse, org Product Roadmap to surface overlap, shared-service opportunities, and misfile risk). Execution stays repo-focused with thin async preamble. Cross-session telemetry, duplicate detection, initiative context, unified todo aggregation, and structured user-handoff complete the runtime layer.

**Status:** Awaiting `/df:new-milestone` formalization. Research and architectural principles captured in:
- `.planning/research/github-coordination-layer.md` — structural layer (GitHub Issues + Projects v2 + sub-issues)
- `.planning/research/cross-session-coordination.md` — runtime layer (heartbeat, duplicate detection, initiatives, unified check-todos, df:handoff)

**Provisional objective scope** (to be refined by `/df:new-milestone` planner):

0. **TDD scope research** (prerequisite — `.planning/research/tdd-scope-by-kind-work.md`) — validate the merged kind/work defaults table's `tdd` column against real AOCyber codebases; resolve open questions 6 (kind-axis signal per work type) and 7 (missing dimensions). Output: refined defaults table proposal + decisions on whether to add structured columns for performance/property-based/RBAC/back-compat. Gates objectives 3 and 4.
1. **GitHub coordination layer** — frontmatter conventions (parent_issue, github_issue, org_milestone), resolver service walking objective → repo [Roadmap] → org Product milestone, gh CLI helpers, df:gh-sync command. Foundation for everything else. **Tracks: devflow-claude#10**
2. **Cross-worktree session telemetry + heartbeat** — hook-driven heartbeat schema (session_id, project, branch, github_issue, objective, job, files_touched, files_planned, state, blocked_on_user). Storage choice TBD (recommend dedicated lightweight git repo). **Tracks: devflow-claude#11**
3. **Planning-time org awareness** — extend df:research-objective + df:plan-objective to consult sibling repos, eden-libs, org Project. Output as Cross-Repo Considerations in CONTEXT.md. **Tracks: devflow-claude#12** (depends on 0)
4. **Duplicate-work detection + resolution flow** — plan-time + execute-time checks against active heartbeats. Strong/hard matches block; weak matches advise. 4-option resolution: Merge / Defer / Coordinate / Proceed-anyway. **Tracks: devflow-claude#13** (depends on 0)
5. **Initiative context layer** — disk projection of GitHub Epics at `~/.claude/devflow/initiatives/` with planner-readable Why + Open questions. Planner reads matching initiatives by key_repos at plan time. df:initiatives sync command. **Tracks: devflow-claude#14**
6. **Unified df:check-todos** — morning-standup view across local todos + GH issues (assigned/mentioned/review-requested) across all repos + active heartbeats + initiative open questions. Output grouped by urgency lane. **Tracks: devflow-claude#15**
7. **df:handoff watcher daemon** — ✅ shipped via PR #19 (2026-05-04). v1.2 PTY backend will close the TTY-interactive gap. **Tracks: devflow-claude#16**
8. **Program-aware TUI viewer** — renders parallel sessions + their position in the org tree (parent epic, milestone, sibling progress). Read-only viewer doesn't gate execution. tmux-pane friendly. **Tracks: devflow-claude#17**
9. **Roadmap ↔ disk reconciliation** — df:sync-roadmap reconciles ROADMAP.md checkboxes ↔ on-disk SUMMARY.md presence. **Tracks: devflow-claude#18**

Dependency order:

```
0 (TDD-scope research) ──┬──> 3 (planning awareness)
                         └──> 4 (dup-detect — depends on resolver shape)

1 (GitHub layer) ──┬──> 2 (heartbeat) ──┬──> 4 (dup-detect) ──> 6 (check-todos)
                   │                    │
                   │                    └──> 8 (TUI)
                   │
                   └──> 5 (initiatives — independent, can land in parallel)

7 (df:handoff watcher) — ✅ shipped (PR #19); v1.2 PTY upgrade tracked separately
9 (roadmap-disk reconcile) — independent of runtime layer; can land any time
```

**Out of scope for v1.1** (deferred):
- PTY support for the handoff watcher (v1.2 — see below)
- OS notifications for handoff (v1.2)
- Auto-start of watcher daemon via launchd/systemd (v1.2 polish)
- Org rollup adoption work (promoting drafts, backfilling sub-issues, standardizing templates/labels) — ongoing program work, not a feature objective

**Prerequisites for v1.1 execution:** ✅ both met
- ~~`proposal/kind-and-work` merged to main~~ — done (PR #8, 2026-05-04)
- ~~`feature/seamless-handoff` successor (watcher daemon variant) merged to main~~ — done (PR #19, 2026-05-04)

---

## Milestone v1.2 — Handoff Watcher PTY + Coordination-Layer Polish (next)

**Goal:** Close the "Claude continues executing" promise for **TTY-interactive auth** (today's v1.1 limitation), plus polish the coordination layer with the items deferred from v1.1.

**Status:** Open. Plan after v1.1 ships and dogfood data accumulates.

### Headline objective: PTY support for the handoff watcher

v1.1's `devflow-watch` daemon dispatches commands via stdio pipes — that works for shell-flow tools (mise, nvm, conda, direnv) which only need a `bash -i` / `zsh -i` env, but **fails for genuinely TTY-required commands** (`doctl auth init`, `gh auth login`, `sudo`, `gpg --decrypt`). Verified end-to-end: doctl reports "Error: Unable to read DigitalOcean access token: unknown terminal" when dispatched through pipes.

The fix: swap `child_process.spawn` for `node-pty` in `plugins/devflow/devflow/bin/lib/watcher-shell.cjs`. With a real PTY:
- `isatty(stdin)` succeeds → doctl/gh/etc. proceed past their TTY check
- Token-paste prompts work — daemon can either route the prompt to a notification UI or accept tokens via per-handoff metadata
- `sudo` becomes runnable (still allowlist-gated; deny-list keeps `sudo` excluded by default for safety)

**Trade-offs to design through:**
- node-pty is a native dependency with a compile step. Either ship prebuilt binaries (`node-pty` does for major platforms) or document the build requirement.
- macOS-first; Linux works out of the box; Windows needs `winpty-agent` and is best-effort.
- The current sentinel-based output capture stays — PTY just changes the dispatch backend, not the output-parsing protocol.

**Provisional TRD outline** (refine when v1.2 plans):
1. Replace `spawn` with node-pty in `watcher-shell.cjs`. Update `interactive: true` path to use PTY; keep an `interactive: false` non-PTY mode for tests.
2. Token-passing for handoff records — extend pending record schema with optional `inputs: { secrets: [...] }` so the daemon can answer prompts from the user's keyring or a one-shot stash.
3. Update `gate-interactive.js`: TTY-interactive patterns now route to daemon when watcher is live (deny message reflects "PTY-backed daemon"); deny-list still blocks `sudo`/`su -` from the curated path.
4. Update `handoff-watcher-guide.md` with PTY caveats and platform notes.
5. Update e2e tests with mock auth servers (test-mode against `gh`'s test backend, doctl's --access-token flag) to validate the full flow without real credentials.

### Deferred polish (also v1.2)

- **OS desktop notifications** — daemon emits via `osascript` (macOS) / `notify-send` (Linux) when a command starts requiring user attention (e.g. browser auth flow needs a click) or completes. Surfaced through a small notification helper module behind a feature flag.
- **Auto-launch of watcher** — `launchctl` plist for macOS, `systemd --user` unit for Linux. `devflow-watch start --install-service` generates and registers; `devflow-watch stop --uninstall-service` removes.
- **Multi-project watching** — single daemon watches multiple `.devflow-handoff/pending/` dirs concurrently. PID file's `watching: []` array (already present in the schema) holds multiple project paths.
- **Status-line indicator** — `statusline.js` shows `⏸ N pending` when the watcher has un-dispatched records, `▶ running` when actively dispatching.
- **Cross-shell support** — fish (different syntax for env), nushell, PowerShell. Each gets its own sentinel/wrapper module behind a `shell` argument.
- **Bidirectional GitHub sync** — v1.1 pushes objective state to GH issues one-way. v1.2 adds the inbound path: GH label/state changes pull down into objective frontmatter via webhook or periodic poll. Requires conflict-resolution UX when both sides edit.
- **Configurable kind/work defaults table** — open question from `proposal/kind-and-work`. Currently the 42-cell defaults table is hardcoded; v1.2 lets orgs override globally via `~/.claude/devflow/defaults-table.md` (file format already supports it; just need to expose the override path).

### Workflow-impediment improvements (also v1.2)

Items flagged during v1.1 development that earn dedicated TRDs:

- **`df-tools init` reads from current branch only** — currently falls back to other branches via `git show`, which produced misleading state during v1.1 planning (init reported a misfiled-objective ROADMAP that didn't exist on the working branch). Fix: explicit `--branch` arg defaulting to current branch, error if state is missing rather than walking history.
- **Project-hygiene tooling** — helpers to detect/move objectives that don't belong in their current repo. Surfaces "this objective's `parent_issue` lives in a different repo than the objective directory; move it?" warnings. Auto-archive support for retired repos (e.g. aosentry-rails).

### Out of scope for v1.2

- Replacing the per-process daemon with a system-wide service (defer to v1.3+ if multi-user / shared-machine demand emerges)
- Web/UI dashboard for the daemon (Hub Flutter app territory, owned by aodex-flutter)
- Rewriting the daemon in Go for distribution (Node version is fine; revisit only if startup latency hits user pain)
