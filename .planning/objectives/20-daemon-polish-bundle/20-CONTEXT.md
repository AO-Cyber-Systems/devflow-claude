# Objective 20 — Daemon polish bundle (CONTEXT)

**Milestone:** v1.2 (objective 11 within v1.2; numbered 20 globally)
**Branch:** `feature/v1.2-obj-11-daemon-polish`
**Tracks:** ROADMAP §"Milestone v1.2" item 11 + preserved-as-scope §"Deferred polish (also v1.2)"

## 1. Why This Objective Exists

Objective 19 closed the headline TTY gap (PTY dispatch + token-passing). The daemon now reliably runs `gh auth login`, `doctl auth init`, `gcloud auth login`, etc. What's left from the v1.2 plan is the *polish* that makes the watcher feel like a first-class part of the workflow rather than a gadget you remember to start:

1. **OS notifications** — when the daemon picks up a handoff that requires user attention (browser auth click) or completes a long-running command, the user sees a desktop notification instead of having to glance at logs.
2. **Auto-launch** — `launchctl` on macOS, `systemd --user` on Linux. The watcher survives logout and starts on login automatically. Today the user manually runs `devflow-watch start` per session.
3. **Multi-project watching** — one daemon, many `.devflow-handoff/pending/` dirs. Today's daemon is single-project; users with multiple checkouts have to start a daemon per worktree (or remember to switch).
4. **Status-line indicator** — `statusline.js` shows watcher state (`▶ running` / `⏸ N pending` / hidden if no daemon). Closes the "is the watcher actually doing anything?" feedback gap.
5. **Cross-shell support** — fish + PowerShell sentinel/wrapper modules. Today only bash/zsh work; fish and pwsh users hit "shell-flow" failure even with the daemon running.

Together these are the difference between "an experimental daemon" and "a daemon that's invisible until you need it, then helpful when you do."

## 2. Locked Decisions (NON-NEGOTIABLE)

These come from the planning context + user preferences. Do not revisit:

1. **macOS-first for OS notifications + auto-launch; Linux out-of-box; Windows best-effort or deferred.** Test/CI matrix is darwin + linux. Windows path documented-only for v1.2; `notify-send` and `osascript` are the supported dispatches.

2. **Feature flags: each polish feature gated by `.planning/config.json` `daemon` block; defaults OFF.** Schema:
   ```json
   {
     "daemon": {
       "notifications": false,
       "auto_launch": false,
       "multi_project": false,
       "status_line": false,
       "cross_shell": []
     }
   }
   ```
   Users opt in per feature. Existing v1.1 + obj 19 watcher behavior is the "all flags off" default — byte-identical when no daemon block is present.

3. **PID file schema is additive — no breaking changes.** Current shape: `{ pid, version, shell, watching: [], started_at }`. We extend `watching: []` to actually hold multiple paths (the array existed in v1.1 but only ever held one entry). NO field renames. NO field removals. Old PID files still readable.

4. **Cross-shell scope: fish + PowerShell.** Nushell deferred unless trivial (low usage in target audience; fish has the most demand). bash/zsh path is preserved verbatim; new shells get their own wrapper modules.

5. **Status-line: extend existing `hooks/statusline.js`, do NOT create a parallel render path.** New code reads PID file via `lib/watcher-state.cjs` (already imports cleanly from a non-handoff hook context). One render path, gated on `daemon.status_line` flag.

6. **OS-notification dispatch via subprocess shim, not native binding.** `osascript -e 'display notification ...'` (macOS) and `notify-send` (Linux) cover 99% of need with zero native deps. No `node-notifier` (extra dep + reliability issues per common pitfall lists). Subprocess shim is testable via PATH override (executable shim drops a marker file that tests assert against — see test fixture pattern below).

7. **Auto-launch service files installed under user scope only.** `~/Library/LaunchAgents/com.aocyber.devflow-watch.plist` (macOS), `~/.config/systemd/user/devflow-watch.service` (Linux). NEVER `/Library/LaunchDaemons/` or `/etc/systemd/system/`. Privilege elevation is a v1.3+ concern (explicit user opt-in, separate UI).

8. **Multi-project watching keeps the existing daemon process model.** One Node process, one `runLoop`, but the loop iterates `watching: []` paths in turn. NO worker pool. NO concurrent dispatch (still serial — one command at a time across all projects). Adds CLI: `devflow-watch add-project <path>` / `remove-project <path>` mutate the live PID file atomically (read → modify → atomic-write).

9. **All 5 TRDs are `type: tdd`.** Per TDD playbook, every feature gets a test list first, fixture builders (not LLM-generated test data), and one-test-at-a-time RED→GREEN→REFACTOR. Multitenancy assertion N/A (single-tenant project).

10. **Cross-shell tests use real binaries when present, `t.skip` when not.** Mirrors obj 19 TRD 19-01's pattern for `node-pty` availability gating. CI never fails for "fish not installed"; CI never silently succeeds without exercising fish either.

11. **Documentation updates folded into each TRD, not split into a standalone doc TRD.** Obj 19 had a dedicated 19-04 doc TRD because the PTY shift was a single coherent doc rewrite. Obj 20's polish features touch the guide in disjoint sections; each TRD owns its section.

## 3. Out of Scope

Strictly deferred. Per ROADMAP §"Out of scope for v1.2":

- **Privilege-elevated auto-launch** (`launchd` system domain, `systemctl --system`) — v1.3+.
- **Nushell wrapper** — deferred unless trivial; not blocking v1.2 ship.
- **Web/UI dashboard for daemon state** — Hub Flutter app territory.
- **Daemon Go rewrite** — v1.3+.
- **Bidirectional GitHub sync** — separate v1.2 objective (12 within v1.2 / future obj #).
- **Configurable kind/work defaults table override** — separate v1.2 objective.
- **Concurrent multi-project dispatch** (parallel commands across watched projects) — v1.3+. Serial-across-projects is fine for v1.2.
- **Cross-platform notification UX polish** (icons, action buttons, sound) — v1.2 ships text-only notifications.

## 4. Discretion Areas

The planner picks within these guard rails:

- **Notification module name** — `lib/notifier.cjs` is the obvious choice. Alternative: `lib/watcher-notifier.cjs` for namespace consistency with `watcher-state.cjs` / `watcher-daemon.cjs`. Planner picks; not load-bearing.

- **Service-installer module structure** — single `lib/service-installer.cjs` exposing `installLaunchd()` / `installSystemd()` / `uninstallLaunchd()` / `uninstallSystemd()`, OR split into `lib/launchd-installer.cjs` + `lib/systemd-installer.cjs`. Planner picks; symmetric injection points for `_setRunFs` / `_setRunExec` mocks either way.

- **Wrapper module shape for cross-shell** — `lib/wrappers/{bash,fish,powershell}.cjs` as separate files vs. `lib/watcher-shell.cjs` exporting a `getWrapper(shellName)` factory. Planner picks. Existing `watcher-shell.cjs` is large enough that splitting feels natural.

- **Status-line gating** — read `daemon.status_line` flag per render call (always-fresh) vs. cache the flag at session start. Always-fresh is cheap (config.json parse <1ms); planner picks based on existing statusline.js performance discipline (sub-200ms hook target).

- **Notification trigger points in daemon** — fire on `dispatch-start` only (when handoff detected and dispatch begins) vs. fire on `dispatch-complete` only vs. fire on both with separate flags. Planner picks. Recommend: both, gated by separate sub-flags (`notify_on_start`, `notify_on_complete`) inside the `notifications` config block — but keep config simple if a single boolean works for the dominant use case.

- **Multi-project CLI shape** — `devflow-watch add-project <path>` / `remove-project <path>` (path is the argument) vs. `devflow-watch start --project a,b,c` (comma-separated list). Planner picks. Recommend: both — `start --project` for first-time setup, `add-project` for live additions without restart.

- **Test fixture pattern for OS-notification subprocess** — write executable shim that drops marker file, prepend its dir to `$PATH`, assert marker file present after dispatch. This is the proven pattern from obj 19 TRD 19-05 (mock-auth-servers). Planner picks the exact shim format (Node `#!/usr/bin/env node` shim is portable; bash shim is shorter but darwin-only).

## 5. Test Posture

`kind: plugin, work: feature` per defaults table. **TDD strict.** Per CLAUDE.md TDD Playbook:

1. **All 5 TRDs are `type: tdd`.** Test list first, fixture builders, one test at a time, RED→GREEN→REFACTOR.
2. **Test list first.** Each TDD TRD includes an explicit checklist of behavior cases — happy path, edge cases, failure modes — before any test code.
3. **Fixture generators, not LLM-generated test data.** Build factory functions in `lib/__fixtures__/daemon-polish-fixtures.cjs` (new file) for: mock launchd/systemd write+read, fixture PID files (single-project + multi-project shapes), fake pending dirs (per project), mock `$SHELL` envs, mock notification dispatches.
4. **No multitenancy assertion** — devflow-claude is single-tenant.
5. **Anti-patterns:** `no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`. Skip property-based testing entirely (no high-cardinality math).
6. **Outside-in:** start at user-observable surface (CLI subcommand, statusline render, notification dispatch effect) and drill down to unit tests on individual modules. Each TRD's test list orders cases outside-in.
7. **Cross-shell binary gating:** `t.skip()` when fish/pwsh not on PATH. Mirror obj 19 TRD 19-01's `node-pty` availability check pattern.
8. **OS-notification subprocess gating:** use executable shim + PATH override (NOT real `osascript` / `notify-send` invocation) so CI never depends on a real desktop session.

## 6. Pre-existing Test Posture

Total: 1911 tests on the branch entry point (per STATE.md L177). Pre-existing failures: 2 (E2E1 + 1 novel-domain) — both unrelated to obj 20 surface. Pre-existing skips: 27 (3 of which are obj 19 architectural-gap skips).

Obj 20's quality gate: **1911 tests still pass after each TRD ships**, plus per-TRD new tests pass. New skips OK if documented per TRD (cross-shell binary unavailable, OS-notification shim path issues on rare host configs).

## 7. Wave Structure

Per the planning context's wave-design guidance:

- **TRD 20-01 (notifier)** — independent of all others. New `lib/notifier.cjs` + daemon hook (single-line wire-up at `dispatch-start` / `dispatch-complete`). **Wave 1.**
- **TRD 20-02 (auto-launch)** — independent. New `lib/service-installer.cjs` + `devflow-watch --install-service` / `--uninstall-service` CLI flags. Touches `bin/devflow-watch.cjs` argv parsing only (additive subcommand). **Wave 1.**
- **TRD 20-03 (multi-project)** — modifies `lib/watcher-daemon.cjs` (loop iterates `watching: []`) + `bin/devflow-watch.cjs` (`add-project` / `remove-project` subcommands) + uses existing PID file schema's `watching: []` array. PID schema additive (no breaking changes per locked decision 3). **Wave 1.**
- **TRD 20-04 (status-line)** — extends `hooks/statusline.js` to read PID file via `lib/watcher-state.cjs`. Reads multi-project info if present. Depends on 20-03 PID schema update (multi-entry `watching: []`). **Wave 2.**
- **TRD 20-05 (cross-shell)** — independent. New `lib/wrappers/{fish,powershell}.cjs` + extends `lib/watcher-shell.cjs` to dispatch via per-shell wrapper. Bash/zsh wrapper extracted into `lib/wrappers/bash.cjs` to keep symmetry; preserved byte-identical so existing tests pass. **Wave 1.**

**Final assignment:**

| Wave | TRDs | Rationale |
|------|------|-----------|
| 1 | 20-01, 20-02, 20-03, 20-05 | All four touch disjoint files. 20-03 owns daemon loop + CLI's add/remove subcommands; 20-01 only adds dispatch hooks (one-line additive); 20-02 only adds CLI flags + new module; 20-05 owns wrapper modules. |
| 2 | 20-04 | Reads PID file shape after 20-03's `watching: []` extension. Could ship Wave 1 if it only handles single-project shape, but Wave 2 placement gives it cleaner test coverage of the multi-project case. |

**File ownership (no overlap within a wave):**

- 20-01: `plugins/devflow/devflow/bin/lib/notifier.cjs` (new) + `lib/notifier.test.cjs` (new) + `lib/watcher-daemon.cjs` (additive 1-3 lines around `dispatching` log) + `templates/config.json` (add daemon.notifications field)
- 20-02: `plugins/devflow/devflow/bin/lib/service-installer.cjs` (new) + `lib/service-installer.test.cjs` (new) + `bin/devflow-watch.cjs` (additive `install-service` / `uninstall-service` subcommands) + `templates/config.json` (add daemon.auto_launch field)
- 20-03: `plugins/devflow/devflow/bin/lib/watcher-daemon.cjs` (loop iterates watching[]) + `bin/devflow-watch.cjs` (add-project/remove-project subcommands + PID mutation) + `lib/watcher-state.cjs` (atomic mutation helpers — additive) + `lib/watcher-daemon.test.cjs` (additive tests) + `bin/devflow-watch.test.cjs` (additive tests) + `templates/config.json` (add daemon.multi_project field)
- 20-04: `plugins/devflow/hooks/statusline.js` (additive watcher status block) + `hooks/statusline.test.js` (NEW — test file doesn't exist today) + `templates/config.json` (add daemon.status_line field)
- 20-05: `plugins/devflow/devflow/bin/lib/wrappers/bash.cjs` (extracted from existing watcher-shell.cjs, byte-identical) + `wrappers/fish.cjs` (NEW) + `wrappers/powershell.cjs` (NEW) + `wrappers/{bash,fish,powershell}.test.cjs` + `lib/watcher-shell.cjs` (dispatch via per-shell wrapper factory; existing tests pass byte-identical) + `templates/config.json` (add daemon.cross_shell field)

20-03 and 20-01 both touch `templates/config.json` (additive fields, different keys) — no merge conflict but the executor agents will need to merge the additions. Pattern from prior objectives: each TRD's task adds its specific key; final merge happens automatically since keys are disjoint.

`bin/devflow-watch.cjs` is touched by 20-02 (install-service/uninstall-service subcommands) and 20-03 (add-project/remove-project subcommands). Both are additive — separate `if (sub === 'X')` branches in the `main()` dispatcher. No overlap; no shared lines modified.

## 8. TRD Sequencing Within an Objective

Per CONTEXT.md decision precedent: TRDs in the same wave can run in parallel as long as files are disjoint. Wave-2 TRDs run after all Wave-1 TRDs complete (per execute-objective workflow). 20-04 depends on the PID schema change in 20-03, but the schema change is additive — even if 20-03 ships an empty `watching: []` array (single-project equivalent), 20-04 still works. The Wave-2 placement is for clean test coverage, not a hard-blocking dependency.

## 9. Documentation Touchpoints

`docs/handoff-watcher-guide.md` (currently 334 lines from obj 19 TRD 19-04):

- 20-01 adds new `### OS notifications` subsection under `## Configuration`.
- 20-02 adds new `### Auto-launch (launchd / systemd)` subsection under `## Configuration`.
- 20-03 extends `## Subcommands` (add `add-project` / `remove-project`) and adds new `### Multi-project watching` subsection under `## Configuration`.
- 20-04 adds new `### Status-line indicator` subsection (brief).
- 20-05 adds new `### Cross-shell support` subsection.

Each TRD owns its section addition. No TRD touches another's text.

## 10. Quality Gate

Per the planning context:

- All 5 polish features functionally working with feature-flag gating.
- 1911 pre-existing tests still pass (allow E2E1 + novel-domain known failures unchanged).
- Per-feature smoke test or e2e validates the wire-up.
- Documentation updates folded into TRDs (handoff-watcher-guide.md sections per TRD).
- Output ends with `## PLANNING COMPLETE`.
