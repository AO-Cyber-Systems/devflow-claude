---
title: Cross-Session Coordination & Active Work Telemetry
date: 2026-04-29
purpose: Companion to github-coordination-layer.md — designs the live-session, duplicate-detection, and unified-todo layers that sit on top of the GitHub substrate for v1.1 milestone planning
status: research
related: github-coordination-layer.md
---

# Cross-Session Coordination & Active Work Telemetry

## Relationship to `github-coordination-layer.md`

That doc establishes the **structural** layer: GitHub Issues + Projects v2 + sub-issues become the cross-repo task store. This doc designs the **runtime** layer that sits on top of it:

- *What is being worked on right now, by whom, on what branch*
- *Will this planned work duplicate work already in flight*
- *What does Mark see when he sits down and runs `df:check-todos` in the morning*
- *What happens when Claude is blocked on a command only the user can run*

The two together describe the v1.1 "DevFlow Coordination Layer" milestone end-to-end.

## Problem

Three concrete pain points surfaced in design discussion:

1. **No cross-session visibility.** A developer can have multiple Claude sessions across repos and worktrees; teammates have their own. None of those sessions know what the others are doing. Two devs can independently plan overlapping objectives or two sessions on one machine can edit adjacent files without either knowing.
2. **No initiative-level context for the planner.** `df:plan-objective` plans inside a single repo. Strategic context — "this work belongs to the Eden Biz launch initiative; that work supports the Grok integration push" — isn't anywhere the planner can read it. The planner sees the trees, not the forest.
3. **No structured handoff for user-only commands.** Claude regularly needs the user to run `gcloud auth login`, `sudo`, an interactive `psql`, or paste a value from a UI. Today this is ad-hoc — Claude prints `! cmd` text and the human-Claude protocol relies on the user noticing. There's no record that a session is *blocked on user*, no auto-resume, and no way for `df:activity` to show "3 sessions waiting on you."

## Design summary

Three composable mechanisms, all anchored on the GitHub substrate from the companion doc:

| Mechanism | Storage | Purpose |
|---|---|---|
| Active-session heartbeat | Lightweight shared git store (or comment thread on a tracking issue) | Tells everyone what every session is currently doing |
| Initiative context layer | Planner-readable initiative files; map 1:1 to GitHub Epics | Gives `df:plan-objective` the strategic context it lacks |
| User-handoff markers | Per-session marker file + status-line indicator | Structured pause/resume for commands Claude can't run |

These build on each other. The heartbeat tells the duplicate detector who else is touching what. The duplicate detector reads initiative metadata to bias its similarity scoring. The handoff marker is just a heartbeat with a `blocked_on_user:` field.

## Active-session heartbeat

### Schema

Each running Claude session writes a heartbeat to a shared store at most every ~5 minutes (debounced — only writes when something material changed):

```yaml
session_id: 7c3a-...
developer: mark
project: aosentry
worktree_path: /Users/mark/Source/aosentry
branch: mark/grok-fix
github_issue: AO-Cyber-Systems/aosentry#42  # if linked
objective: 04-grok-admin-keys                # local .planning ref
job: 02-controller-shape                     # current JOB.md
intent: "wire AdminKeysController to Grok credentials"
files_touched: [app/controllers/admin/keys_controller.rb, ...]
files_planned: [app/views/admin/keys/index.html.erb, ...]
started_at: 2026-04-29T08:14:22Z
last_heartbeat: 2026-04-29T08:31:00Z
state: active        # active | blocked_on_user | paused | done
blocked_on_user:     # populated only when state=blocked_on_user
  command: "gcloud auth login"
  reason: "need GCP creds to run migration"
  since: 2026-04-29T08:29:11Z
```

Switching branches mid-session updates the heartbeat — no special handling needed; `git branch --show-current` at heartbeat time is the source of truth. Worktrees are tracked by path so two worktrees of the same repo on different branches are distinct sessions.

### Storage options (choose at planning time)

1. **Dedicated lightweight git repo** (`AO-Cyber-Systems/devflow-state` or similar) — one file per active session, pruned after 7 days. Pro: clean separation, GitHub already auth'd. Con: high commit frequency on a separate repo to clone/maintain.
2. **Comments on a single "session log" issue per dev** — leverages existing GH primitives. Pro: zero new infra. Con: noisy issue, edit-rate-limit risk.
3. **Org-level Project custom field** — heartbeat updates a single "Active Sessions" Project entry. Pro: visible in the same Project the rest of v1.1 uses. Con: Projects v2 mutation API is heavier.

Recommend **option 1** — it's the lowest-coupling choice and the prune cron keeps the repo small. Option 3 can replace it later without breaking anything.

### Lifecycle hooks (where heartbeats fire)

- `SessionStart` hook → write initial heartbeat (state=active, no objective yet)
- `df:plan-objective`, `df:execute-objective`, `df:build` skill entry → update objective/job/files_planned
- During execution → debounced update on file edits (files_touched, last_heartbeat)
- Before any interactive user prompt for a forbidden command → state=blocked_on_user
- `SessionEnd` / `Stop` hook → state=done; auto-prune entry after 24h

## Duplicate detection

Fires at two checkpoints. **Plan-time** is the primary line of defense; **execute-time** rechecks because plans can sit in the queue for hours.

### Plan-time check (in `df:plan-objective`)

After the planner drafts JOB.md but **before** committing, compare against every active session's heartbeat:

| Signal | Match condition | Weight |
|---|---|---|
| Files | ≥2 paths in `files_planned` overlap with another session's `files_planned` or `files_touched` | strong |
| Module/class names | Symbol mentioned in this TRD's interfaces matches a symbol in another session's TRDs | strong |
| GitHub issue | Same `github_issue` ref | hard match |
| Objective summary | LLM semantic compare across active session intents below threshold | weak (advisory only) |

Strong/hard matches block; weak matches surface as advisory ("FYI: Justin's session looks adjacent — different files, similar intent — worth a 5-min sync"). Start the threshold tight; loosen as override-rate data comes in.

### Execute-time check (in `df:execute-objective`)

Before each job in the wave starts, re-run the same comparison against current active sessions. If a duplicate emerged while waiting in queue, hand off to the resolution flow before launching the executor agent.

### Resolution flow

When detection fires, the orchestrating skill pauses and offers:

1. **Merge** — fold this work into the other session as a dependency. Writes `blocked_by: <session_id>` into local JOB.md frontmatter and leaves a coordination note in the other session's heartbeat. This session continues with the next non-blocked job.
2. **Defer** — pause this objective; auto-detect when the other session reaches `state=done` and prompt to resume (with a rebase nudge if branches diverged).
3. **Coordinate** — write a coordination note to the shared store visible to both sessions; neither auto-changes; you go talk to your teammate. Used when the work is genuinely parallel but the boundary needs a human conversation.
4. **Proceed anyway** — false positive. Logs the override with a one-line reason so the detector's signal weights can be tuned over time. Both sessions continue; both get a "merge conflict likely" warning at commit time.

The choice is recorded in **both** sessions' heartbeats so when the other dev opens their next session, they see "Mark hit a duplicate against you on 04-29, picked Defer" without needing to ask.

### Honoring autopilot-after-setup

Per `feedback_autopilot_after_setup`: the detector should **not** gate every plan on confirmation. Only when a *strong* match fires does it block; weak matches print an advisory and keep going. Override frequency feeds the tuning loop.

## Initiative context layer

Initiatives are the strategic-context layer the planner currently lacks. They map 1:1 to **GitHub Epics** (the parent issues from `github-coordination-layer.md`'s issue hierarchy). The disk projection lives at `~/.claude/devflow/initiatives/` (or under each repo's `.planning/initiatives/` if scoped to one repo) and is editable by hand.

### Schema

```yaml
---
name: Eden Biz launch
github_epic: AO-Cyber-Systems/devflow-claude#NN
status: active
started: 2026-03-01
summary: Get Eden Biz to commercial-launch parity with Mango Mint by end of Q2
key_repos: [eden-biz, eden-biz-flutter, eden-libs]
---

## Why
Stakeholder ask from Bobby; demo target on 2026-05-06; feature-comparison
work flagged 2026-04-23 as the gating activity.

## Open questions
- Stripe Terminal integration timeline
- Customer portal scope vs companion-app scope

## Recent context
- 2026-04-23: Mark assigned feature-comparison; Justin owns prototype demo
- ...
```

### How the planner consumes it

`df:plan-objective` and `df:new-project` get one extra read: the active initiatives. When planning an objective in a repo, the planner:

1. Loads matching initiatives by `key_repos`
2. Includes their Why + Open questions in the planning context
3. Populates `parent_epic:` in the new objective's frontmatter (which the GitHub sync from the companion doc then turns into a sub-issue link)

Initiatives are never required — an objective without one still plans fine. They're additive context.

### Why disk-projected from GitHub Epics rather than disk-only

So the same source of truth as the structural layer. The Epic on GitHub is canonical; the disk file is a planner-readable cache. A `df:initiatives sync` command pulls Epic body → disk file (one-way to start; same trade-off as the JOB.md → Issue sync from the companion doc).

## Unified `df:check-todos`

The current `df:check-todos` skill reads only `.planning/todos/{pending,done}/` in the current repo. The v1.1 vision: when Mark sits down in the morning and runs it, he sees one merged view across:

| Source | What it surfaces |
|---|---|
| `.planning/todos/` (current repo) | Local notes-to-self for this codebase |
| `.planning/todos/` (other repos he's worked in recently) | Notes from yesterday's other sessions |
| GitHub Issues (assigned to him, across all 5 repos) | New bug reports, requests, sub-issues he's been pulled into |
| GitHub Issues (`mentioned:@me`, `review-requested:@me`) | Things teammates need from him |
| Active heartbeat store | His own paused/blocked sessions waiting to resume |
| Active heartbeat store | Teammates' sessions where he's listed as blocker (e.g. Justin chose `Coordinate` against Mark yesterday) |
| Initiative open-questions | Strategic items flagged across active initiatives |

Output is grouped by **urgency lane**, not source: *Blocked on me / Resume in flight / New since yesterday / Reminders / Background*. Each item carries provenance (where it came from) so a click takes you to the right place.

This is what was meant by "Claude desktop coupled to DevFlow + GitHub." The skill is the morning standup screen.

### Implementation notes

- Cache the GH query results for the session (single `gh` call at skill start; subsequent operations read cache)
- Recently-touched repos come from heartbeat history, not a hard-coded list
- "New since" tracked by storing the last `df:check-todos` invocation timestamp per dev in the heartbeat store

## User-handoff mechanism

The pop-in/pop-out scenario: Claude needs `gcloud auth login` (or `sudo`, or paste a UI value) and can't run it. Today: prints `! cmd` and hopes. Proposed primitive: `df:handoff`.

### What it does

When Claude calls `df:handoff <command> "<reason>"`:

1. Writes `state: blocked_on_user` to the session heartbeat with `command:` and `reason:`
2. Renders the requested command in a status-line indicator visible to the user (and in `df:activity` views for teammates)
3. Stops Claude's current step; the session sits idle until the user returns
4. On the user's next turn, Claude reads the captured output, validates success, and continues — or re-handoffs if a follow-up is needed

For multi-step blockers ("auth, then run migration, then paste the connection string") the handoff can chain: each step gets its own marker, the user runs them in order, Claude continues after each.

### When NOT to use it

For single one-off commands, the existing `! cmd` inline-shell pattern is lighter and fine. Handoff is for *load-bearing* user-side work where the structured pause matters — anything where the session is genuinely stuck without it, or where another teammate looking at `df:activity` should see "Mark's session is waiting on him" rather than a misleading "active" marker.

### Status-line and activity surface

The plugin's existing `statusline.js` hook already renders task state — extend it with a `⏸ blocked: gcloud auth login` indicator when `state=blocked_on_user`. `df:activity` (the cross-session view from heartbeat data) gets a "waiting on user" column populated from the same field.

## Mapping to v1.1 milestone objectives

The companion doc named four candidate objectives. This doc's contribution slots in as follows:

| Companion-doc objective | This doc's contribution |
|---|---|
| 1. GitHub coordination layer (Project, templates, `df:gh-sync`) | unchanged — this doc builds on top of it |
| 2. Cross-worktree session telemetry + visualization | **expanded**: heartbeat schema, lifecycle hooks, `df:activity` view design |
| 3. Roadmap ↔ disk reconciliation | unchanged |
| 4. Project hygiene | unchanged |
| **5. (new) Duplicate-work detection + resolution flow** | this doc — plan-time + execute-time checks, four-option resolution flow |
| **6. (new) Initiative context layer for planner** | this doc — disk projection of GitHub Epics, planner reads as context |
| **7. (new) Unified `df:check-todos`** | this doc — morning-standup view across local + GH + heartbeat + initiatives |
| **8. (new) `df:handoff` user-pause primitive** | this doc — structured pop-in/pop-out for user-only commands |

Objectives 5 and 8 are small (single skill + heartbeat field changes). Objective 6 is medium (new disk schema + planner context-loading change + `df:initiatives sync`). Objective 7 is medium (multi-source aggregation + caching + new output format).

Objectives 5–8 all depend on objective 2's heartbeat being live. Objectives 5 and 7 also depend on objective 1's GitHub Issue sync being live. Suggests build order:

```
1 ──┬──> 2 ──┬──> 5 ──> 7
    │        │
    │        └──> 8
    │
    └──> 6 (independent, can land in parallel)

3, 4 are independent of the runtime layer; can land any time.
```

## Open questions for planning

1. **Heartbeat storage choice** — dedicated git repo vs issue-comment vs Project field (recommendation: dedicated repo).
2. **Heartbeat cadence** — 5-minute debounce vs event-driven only? Trade-off between staleness and commit volume.
3. **Initiative scope** — strictly cross-repo (1:1 with Epics), or also single-repo strategic items? Companion doc currently treats Epic as cross-repo only.
4. **`df:check-todos` scope creep** — does it replace the existing skill or live alongside it (`df:check-todos` local, `df:check-everything` global)?
5. **Handoff status-line UX** — does it page the user (notification) or only show passively in the status bar?
6. **Duplicate-detection feedback loop** — where do `Proceed anyway` overrides log to so detector weights can be tuned?

## Cross-references

- Companion doc: `github-coordination-layer.md`
- Memory feedback: `feedback_autopilot_after_setup` — duplicate detection should not gate every plan on user confirmation, only on strong matches
- Memory feedback: `feedback_workflow_impediments` — the friction patterns this layer addresses are exactly the kind to flag in real time
- Live example of the duplicate-work scenario this doc designs for: this research session and the github-coordination-layer spike both arrived at v1.1 milestone candidates independently on 2026-04-29 — would have been caught by the plan-time detector specified above
