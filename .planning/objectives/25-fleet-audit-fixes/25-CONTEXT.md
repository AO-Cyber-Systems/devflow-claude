# Objective 25 Context — Fleet Audit Fixes

Source: fleet-wide DevFlow usage audit run 2026-07-22 in-session across 180 top-level session
transcripts (June–July 2026, ~1.5 GB, 57 project dirs in `~/.claude/projects/`). All numbers
below were measured, not estimated.

## Decisions (LOCKED — implement exactly, do not revisit)

1. **Prune `join-discord` ONLY.** Remove `plugins/devflow/skills/join-discord/` and any
   references to it. Keep `tui` and `awareness` as manual-only skills — do NOT prune them.
2. **Drive adoption of exactly four skills:** `milestone`, `todo`, `gh-sync`,
   `discuss-objective`. Each gets (a) realistic router rules in `route-intent.js` INTENT_MAP
   and (b) a mention in the global `~/.claude/CLAUDE.md` DevFlow Routing table.
3. **TDD posture for the new global `## TDD & Quality` playbook section: BY KIND.**
   TDD strict for `library | api | cli` kinds; pragmatic tests-with-code for `app | ui-lib`
   kinds. This section must use headings the intent-model level-3 scan matches
   (`^##.*TDD`, `^##.*Test`, `^##.*Quality`, `^##.*Scope`).
4. **Edit-gate config knob:** if investigation supports it, add
   `.planning/config.json` → `gates.editGate: "warn" | "strict" | "off"` to
   `gate-edits.js`. Default remains `strict`. eden-press gets the value the
   investigation supports.
5. **Phantom skill names correct to consolidated forms:**
   `/devflow:new-milestone` → `/devflow:milestone new`, `/devflow:add-todo` → `/devflow:todo add`,
   `/devflow:check-todos` → `/devflow:todo list`, `/devflow:audit-milestone` → `/devflow:milestone audit`.

## The 7 items

| # | Where | What |
|---|---|---|
| 1 | this repo | Fix 4 phantom skill names in `plugins/devflow/hooks/route-intent.js` (~lines 147, 203, 209, 231) + unit tests |
| 2 | `~/.claude/CLAUDE.md` | Routing table: replace retired `/devflow:resume-work` + `/devflow:progress` with `/devflow:status`; add missing `/devflow:micro` tier |
| 3 | global + 6 repos | (a) Add `## TDD & Quality` by-kind section to `~/.claude/CLAUDE.md`; (b) set `kind:` in `.planning/PROJECT.md` for aocore, aodex, eden-circle, eden-libs, eden-biz, devflowops (infer from stack) |
| 4 | 2 repos | Create `CLAUDE.md` for `~/dev/opsCluster` and `~/dev/eden-press` from repo inspection (stack, conventions, DevFlow routing) |
| 5 | this repo | Tighten VERIFY trigger regexes — fired 15×, followed 0× |
| 6 | this repo + global | Prune join-discord; adoption rules for milestone/todo/gh-sync/discuss-objective |
| 7 | this repo + eden-press | Investigate eden-press gate friction (52 denials vs 3 skill uses); add gates.editGate knob per decision 4 |

## Audit evidence (for planner/researcher reference)

- Router fired 98 directives; suggestion→follow rates: build 21/42 sessions, verify-work **0/8**,
  execute-objective 5/9, research-objective 0/3, debug 0/3, status 3/4.
- 16 of 31 skills never invoked; 11 of those have no router rule at all.
- Rules for awareness/gh-sync/discuss-objective/milestone/todo exist but matched zero prompts
  in two months — trigger phrases too narrow (`what'd I miss`, `sync to github`,
  `discuss the objective`).
- gate-edits denied 511 edit attempts fleet-wide; user-typed override phrases ~140×
  ("bypass devflow" ~77, "skip devflow" ~43, "force edit" ~20).
- eden-press: 52 denials, 3 skill invocations, 1 session with any devflow skill —
  transcripts at `~/.claude/projects/-Users-justin-dev-eden-press/`.
- Fleet CLAUDE.md audit: no CLAUDE.md in opsCluster, eden-circle, eden-press,
  recycling-oracle, eden-docs, devflowops; only aofamily has a playbook-scannable
  section; `kind:` unset in 6 repos (item 3b list).
- User stack (memory): Flutter apps, Go APIs, Hugo sites, Tailwind; NO Rails/ERB/Stimulus.

## Cross-repo execution constraints

- Items 1, 5, 6a, 6b(router), 7(gate-edits) are code in THIS repo → normal atomic commits.
- Items 2, 3a (global `~/.claude/CLAUDE.md`), 3b, 4 touch files OUTSIDE this repo.
  `~/.claude/CLAUDE.md` is not in a git repo — edit in place, verify by re-reading, no commit.
  Fleet repos (aocore, aodex, eden-circle, eden-libs, eden-biz, devflowops, opsCluster,
  eden-press) are their own git repos — edits there are committed IN the target repo
  with a conventional `docs(...)` / `chore(...)` commit, never in devflow-claude.
- The plugin mirrors to `~/.claude/devflow/` via sync-runtime on version change — hook code
  under `plugins/devflow/hooks/` runs from `${CLAUDE_PLUGIN_ROOT}` (no mirror needed), but
  df-tools/bin changes require the mirror to refresh before live verification.
- **Port 8080 is forbidden in any verification step; use 8091 if a server is needed.**

## Out of scope

- Pruning tui or awareness.
- Changing the defaults table or intent-model resolution order.
- Any deploy/release/tag; version bump happens in a later release objective.
- Rewriting gate-edits default behavior — strict stays the default.
