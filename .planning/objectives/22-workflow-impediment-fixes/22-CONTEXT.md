---
objective: 22-workflow-impediment-fixes
milestone: v1.2
status: planned
kind: plugin
work: feature
---

# Context — Workflow-Impediment Fixes (Objective 22, v1.2 final)

## What this objective ships

Two distinct workflow-friction fixes that surfaced during v1.1/v1.2 planning sessions:

**Feature A — Explicit `--branch` flag for `df-tools init *`**
Currently, `df-tools init plan-objective`, `init execute-objective`, etc. read `.planning/STATE.md`, `ROADMAP.md`, and objective dirs directly from the working tree (via `fs.readFileSync`). On its face this should always reflect the checked-out branch, but during v1.1 planning a session reported state from a stale/wrong branch context — caused by a combination of (a) cached awareness data from peer branches (`.planning/.awareness-cache.json`) bleeding into the init preview, and (b) silent fallback when expected state files are missing. This TRD adds explicit branch resolution: `--branch=<name>` opt-in to read from a named branch via `git show <branch>:.planning/...`; default behavior is "current branch only, error if state missing".

**Feature B — Project-hygiene tooling**
Helpers to detect and fix two recurring repo-management problems:
1. **Misfiled objectives** — an objective sits in repo A's `.planning/objectives/` but its `parent_issue` points to repo B. v1.1 obj 3 already detects this advisory-only via `_detectMisfiling` in `lib/org-awareness.cjs`. This TRD adds a dedicated CLI surface (`df-tools project-hygiene check`) and a mover (`df-tools project-hygiene move`).
2. **Retired repos** — a repo whose last commit is >6 months old AND has no in-flight objectives is a candidate for archival. `df-tools project-hygiene archive` flags candidates; `--apply <name>` moves `.planning/` to a top-level `archived-projects/` dir AND emits the `gh repo archive` command for the user to run manually (preserves user authority over GH-side state changes).

## Why now

Last objective in v1.2. Both items are workflow papercuts that compound: misleading init state burns 5-10 minutes per session debugging "why did init report stale data?"; misfiled objectives accumulate silently and become harder to fix later (more cross-repo references to update); retired repos with stale `.planning/` dirs clutter the awareness scan results.

## Locked decisions (non-negotiable)

1. **`--branch` flag scope:** all `df-tools init *` commands (`init plan-objective`, `init execute-objective`, `init research-objective`, `init new-project`, `init new-milestone`, `init complete-objective`, `init verify-work`, `init discuss-objective`, `init objective-op`, `init quick`, `init resume`, `init todos`, `init milestone-op`, `init map-codebase`, `init security-audit`, `init progress`). Implementation via shared helper `_resolveBranch(args)` returning current branch by default.

2. **No silent history walking:** removing any `git show <branch>:.planning/...` fallback path that init.cjs's dependencies might exercise (audit `findObjectiveInternal`, `getMilestoneInfo`, `getRoadmapObjectiveInternal`, `bootstrapProjectMd`). If state is missing on the current branch, error with a clear message that hints at the `--branch` flag.

3. **Project-hygiene check is read-only by default.** Mutation requires explicit subcommand + flag (`move`, `archive --apply <name>`).

4. **Move operation atomicity:** `cp -r` + verify (filesystem walk diff between source and dest) + `rm -r`. NOT a git operation — let user commit on both sides. Failure during verify aborts before `rm -r` (worst case: dup dirs in two repos, no data loss).

5. **Archive heuristic:** repo flagged when last commit > 6 months OR explicit `archived: true` in PROJECT.md frontmatter. Auto-detection only — actual archive requires `--apply` flag and confirmation prompt.

6. **New CLI surface:** `df-tools project-hygiene <check|move|archive> [args]`. Module: `plugins/devflow/devflow/bin/lib/project-hygiene.cjs`.

7. **`--branch` flag implementation contract:**
   - Default: read from working tree (current branch). Calls `git rev-parse --abbrev-ref HEAD` for context only, NOT for file reads.
   - `--branch=<name>`: read from `git show <name>:.planning/STATE.md` etc. If branch doesn't exist, error.
   - `--branch=current` (or `--branch=HEAD`): explicit alias for default behavior.
   - Validation: if user passes `--branch=X` and current HEAD ≠ X, emit a one-line note (not an error) — informational only.

8. **Archive mover behavior (locked):** `archive --apply <name>` does TWO things: (a) `mv <repo>/.planning <workspace>/archived-projects/<name>-planning/` (workspace-level dir), (b) emits `gh repo archive <owner>/<name>` to stdout for user to run. Does NOT execute the gh command.

## Deferred (NOT in scope)

- Auto-archive based on PR activity (deferred — requires gh API rate-limit handling)
- Linear/Jira backend hygiene tooling (v1.3+ — pm-backend seam exists but no production callers)
- Bulk move (move 5 objectives at once) — single-objective only for v1.2
- Undo for move/archive — let user use git revert + manual filesystem ops
- Automatic cleanup of `.gh-mapping.json`, `.gh-sync-state.json` after move (deferred — they're per-repo and the move-source repo's stale entries are harmless)

## Dependencies

- **22-02 → 22-03:** move CLI uses misfiling detection (or at least the `_extractRepoFromRef` + `resolveChain` machinery exposed through `lib/project-hygiene.cjs`).
- **22-02 → 22-04:** archive CLI shares `lib/project-hygiene.cjs` module surface (PROJECT.md frontmatter parser, common JSON output shape).
- **22-01 independent of 22-02/03/04:** different file (`lib/init.cjs`).

## Wave structure

| Wave | TRDs | Notes |
|------|------|-------|
| 1 | 22-01, 22-02 | Independent — `lib/init.cjs` and `lib/project-hygiene.cjs` are disjoint. |
| 2 | 22-03, 22-04 | Both extend `lib/project-hygiene.cjs` and wire CLI subcommands; serialize within wave to avoid same-file conflict. (Run 22-03 first, then 22-04.) |

NOTE on Wave 2: 22-03 and 22-04 BOTH modify `lib/project-hygiene.cjs` and the `case 'project-hygiene':` arm in `df-tools.cjs`. Per devflow convention (file ownership prevents parallelism), they must run sequentially within Wave 2. Executor will detect this and serialize.

## Pre-existing test baseline

2149 tests pass on branch `feature/v1.2-obj-12-bidirectional-gh-sync` (post-obj-21). Allow E2E1 + novel-domain skips per project convention.

## TDD playbook directives (per `~/.claude/CLAUDE.md`)

- **All TRDs `type: tdd`** — small, well-scoped, lots of edge cases (branch resolution, file move atomicity, archive heuristics).
- **Test list first per TRD** — checklist of behavior cases before any test code.
- **Fixture builders, not LLM-generated test data** — hand-built factories for: temp git repos with multi-branch state, mock OBJECTIVE.md frontmatter, mock retired-repo file structures.
- **No multi-tenant assertion** (single-tenant project).
- **Anti-patterns:** no LLM test data, no property-based default, no Gherkin layer.
- **Move/archive operations:** hand-build temp dirs in tests; do NOT use real-repo paths.

## Required reading for executors

- `plugins/devflow/devflow/bin/lib/init.cjs` (current init implementation — Feature A target)
- `plugins/devflow/devflow/bin/lib/init.test.cjs` (existing init test patterns — `buildProject()` + `runInit()` helpers)
- `plugins/devflow/devflow/bin/lib/awareness.cjs` lines 220-330 (`_runGit` + `_setRunGit` injection pattern, `runGit` semantics)
- `plugins/devflow/devflow/bin/lib/dup-detect.cjs` lines 80-170 (existing `_readPeerFilesModified` pattern using `git show <branch>:...` — analogous to what 22-01 needs for explicit `--branch`)
- `plugins/devflow/devflow/bin/lib/org-awareness.cjs` lines 800-840 (`_extractRepoFromRef` + `_detectMisfiling` — Feature B leverages these)
- `plugins/devflow/devflow/bin/df-tools.cjs` lines 671-720 (init router — where `case 'init':` lives; pattern for adding `case 'project-hygiene':`)
