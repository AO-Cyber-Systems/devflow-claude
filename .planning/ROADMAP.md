# Roadmap

## Milestone v1.1 — DevFlow Coordination Layer (in flight)

**Goal:** Bring devflow-claude from a per-repo planning helper to a program-aware coordination layer for AI-assisted work across the AO-Cyber-Systems org. Planning becomes org-aware (surveys sibling repos, eden-libs reuse, org Product Roadmap to surface overlap, shared-service opportunities, and misfile risk). Execution stays repo-focused with thin async preamble. Cross-session telemetry, duplicate detection, initiative context, unified todo aggregation, and structured user-handoff complete the runtime layer.

**Status:** Objective 0 formalized 2026-05-04 (planning underway via `/df:plan-objective 0`). Other objectives formalize when they're up. Research and architectural principles captured in:
- `.planning/research/github-coordination-layer.md` — structural layer (GitHub Issues + Projects v2 + sub-issues)
- `.planning/research/cross-session-coordination.md` — runtime layer (heartbeat, duplicate detection, initiatives, unified check-todos, df:handoff)
- `.planning/research/tdd-scope-{summary,refined-defaults,codebase-survey}.md` — TDD scope research synthesis (objective 0 input)

**Objective scope:**

0. **Refine (kind, work) defaults table from codebase evidence** — refine the 42-cell defaults table to match observed AOCyber codebase reality, codify the user's CLAUDE.md TDD Playbook as structured resolver fields, and add a `references/testing-strategy.md` testing-levels matrix (folds in #7). Gates objectives 3 and 4. **Tracks: devflow-claude#20** (research complete; implementation in plan)
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

### Objective 0: Refine (kind, work) defaults table from codebase evidence

**Goal:** Refine the 42-cell `(kind, work)` defaults table at `plugins/devflow/devflow/references/defaults-table.md` to match observed AOCyber codebase reality, codify the user's CLAUDE.md TDD Playbook as structured fields in the `intent.cjs` resolver, and add a parallel `references/testing-strategy.md` testing-levels matrix (folds in #7). The resolver becomes the enforcement mechanism for the TDD Playbook, not a parallel set of guidelines.

**Tracks:** devflow-claude#20 (closes #7 in same PR)

**Inputs (research complete):**
- `.planning/research/tdd-scope-summary.md` — executive summary, top 5 deltas
- `.planning/research/tdd-scope-refined-defaults.md` — proposed 42-cell table + per-cell deltas
- `.planning/research/tdd-scope-codebase-survey.md` — raw findings across 6 sibling repos

**Locked decisions (from research synthesis + user calls):**
1. **Port cells:** drop "spec-match (source's tests as fixtures)" everywhere; replace with contract-list-first (derive parity checklist from source's *behavior*, not its test files).
2. **ui-lib cells:** drop "visual regression" from defaults; behavioral + a11y only; visual moves to TRD-level opt-in.
3. **Resolver schema:** emit 5 new structured fields (`security_isolation`, `back_compat`, `tdd_default`, `test_list_first`, `fixture_strategy`) + 3 anti-pattern constraints (`no_llm_test_data`, `no_property_based_default`, `no_gherkin_layer`).
4. **Multitenancy hard-enforcement:** when `security_isolation: multi_tenant_required`, the verification commands array must require a wrong-tenant assertion test (not advisory).
5. **Testing-strategy matrix soft-bundled:** ships as separate reference doc the planner reads after the resolver returns. No resolver coupling.

**Success Criteria**:
1. `defaults-table.md` reflects 27 changed cells + 5 new column headers; the file format remains valid YAML reference doc parseable by the planner.
2. `intent.cjs` resolver emits the 5 new structured fields + 3 anti-pattern constraints; provenance is reported per field (`table` / `user_playbook` / `trd_override` / `objective_override`).
3. Planner agent reads new fields and emits corresponding TRD sections (test-list checklist, fixture-builder task, wrong-tenant assertion in test list, outside-in TRD ordering when applicable).
4. CLAUDE.md absorption maps all 6 TDD Playbook habits cleanly to 5 structured fields + 1 freeform directive.
5. `references/testing-strategy.md` exists with the layer×tool×stack matrix from #7 (unit → integration → AI exploratory → Maestro → visual) plus the Flutter-web semantics gotcha, codegen discipline, and platform routing paragraphs.
6. Planner consults testing-strategy.md when emitting verification commands; layer→tool routing reflects detected stack.
7. Existing PROJECT.md / OBJECTIVE.md / TRD.md files don't break — migration path documented and validated against the existing `01-handoff-watcher` objective directory.
8. Critical sequencing constraint honored: TRD 01 (table) and TRD 02 (resolver schema) ship in different waves/commits so the schema has soak time before #12 / #13 lock onto it.
9. `df-tools intent resolve --objective <fixture>` round-trip succeeds on a fixture project containing all 6 kinds × 7 work types and exercises the `multi_tenant_required` path.
10. `npm test` (Node native test runner) passes; new TDD-tagged TRDs (02, 04, 05) ship `test:` commits preceding their `feat:` commits per the user's TDD Playbook.

**Out of scope:**
- Chromatic / Percy / Flutter golden-file rollout (revisit when tooling lands as separate objective)
- Property-based testing infrastructure beyond the constraint flag
- Bidirectional planner ↔ resolver round-tripping (one-way only)
- Org-wide rollout of the testing-strategy matrix to other repos' CLAUDE.md (ongoing program work, not a TRD)

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
