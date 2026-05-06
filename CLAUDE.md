# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

DevFlow is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`devflow@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Fork of GSD v1.20.4, maintained by AO Cyber Systems.

## Commands

```bash
npm test                # Run tests (Node native test runner)
```

There is no lint command. Tests use `node --test` against `plugins/devflow/devflow/bin/df-tools.test.cjs`.

## Publishing

Distribution is via the Claude Code plugin marketplace. The repo's `.claude-plugin/marketplace.json` and `plugins/devflow/.claude-plugin/plugin.json` declare the plugin; users add the marketplace by repo slug (`AO-Cyber-Systems/devflow-claude`) and install it. There is no npm publish step. Tag and release cadence still follow the `v*` convention so the changelog gate continues to work.

## Architecture

### Plugin Layout (`plugins/devflow/`)

The plugin is the single source of truth for distribution. Layout:

```
plugins/devflow/
├── .claude-plugin/plugin.json    # plugin manifest (name, version, statusLine)
├── skills/<name>/SKILL.md        # 32 user-invocable slash commands
├── agents/<agent>.md             # 12 subagent prompts
├── hooks/
│   ├── hooks.json                # event registrations (auto-loaded)
│   ├── sync-runtime.js           # SessionStart: mirrors devflow/ → ~/.claude/devflow/
│   └── *.js                      # 7 other hooks (statusline, gates, verifiers)
└── devflow/                      # runtime mirrored to ~/.claude/devflow/ on session start
    ├── bin/df-tools.cjs          # central CLI invoked by skills/agents
    ├── bin/lib/*.cjs             # df-tools internals
    ├── workflows/<name>.md       # workflow bodies referenced via @~/.claude/devflow/workflows/...
    ├── references/<name>.md      # static reference docs read during execution
    └── templates/<name>.md       # files copied into user projects' .planning/ dirs
```

Skill `@path` references (`@~/.claude/devflow/...`) do not interpolate `${CLAUDE_PLUGIN_ROOT}`, so the `sync-runtime` SessionStart hook mirrors `${CLAUDE_PLUGIN_ROOT}/devflow/` to `~/.claude/devflow/` whenever the version differs. The `.plugin-version` marker file prevents redundant copies.

### Core Tool: `plugins/devflow/devflow/bin/df-tools.cjs`

The central CLI utility used by ~50 skill and agent files. CommonJS module invoked as `node ~/.claude/devflow/bin/df-tools.cjs <command> [args]` (skills resolve the path via the home mirror). Provides:

- **State operations** — `state load`, `state update`, `state get`, `state patch`, `state-snapshot`
- **Objective operations** — `objective next-decimal`, `objective add/insert/remove/complete`
- **Roadmap operations** — `roadmap get-objective`, `roadmap analyze`, `roadmap update-job-progress`
- **Compound init commands** — `init execute-objective`, `init plan-objective`, `init new-project`, etc.
- **Model resolution** — `resolve-model <agent-type>` returns the model for an agent based on the active profile (quality/balanced/budget)
- **Validation** — `validate consistency`, `validate health [--repair]`
- **GitHub integration** (1.29+, opt-in via `.planning/config.json` `github` block) — `gh status`, `gh sync-objectives`, `gh comment`, `gh close-issue`, `gh sync-release`. Implemented in `lib/gh.cjs`; one-way push to GitHub via the `gh` CLI; planning files remain authoritative.
- **Changelog** (1.30+) — `changelog update --version vX.Y.Z [--from <ref> --to <ref>] [--dry-run]`, `changelog check <version>`. Implemented in `lib/changelog.cjs`; generates Keep-a-Changelog entries from conventional-commit history.

Model profiles are hard-coded in a `MODEL_PROFILES` table mapping each agent to its opus/sonnet/haiku assignment per profile tier.

### Skills (`plugins/devflow/skills/<name>/SKILL.md`)

User-invocable slash commands (e.g., `/devflow:new-project`). Each skill is a directory containing a single `SKILL.md` with:

- **YAML frontmatter** — `name`, `description`, `argument-hint`, `allowed-tools`
- **XML-structured body** — `<objective>`, `<execution_context>` (with `@path` file references), `<process>`, `<context>`
- Skills are thin orchestrators — they load state via df-tools, then spawn agents via the Task tool

### Agents (`plugins/devflow/agents/*.md`)

Subagent prompt files (12 agents: planner, executor, verifier, debugger, etc.). Each has:

- **YAML frontmatter** — `name`, `description`, `tools`, `color`
- **XML-structured body** — `<role>`, `<philosophy>`, `<execution_flow>` with named `<step>` elements
- Agents are spawned by skills with specific model assignments from the profile table

### Templates (`plugins/devflow/devflow/templates/`)

Markdown and JSON templates that get copied into user projects' `.planning/` directories by df-tools. Key files:

- `config.json` — workflow settings (mode, depth, parallelization, gates, safety)
- `state.md` — living project memory (position, metrics, decisions, blockers)
- `project.md` — project context (what, why, constraints, decisions)
- `roadmap.md`, `requirements.md`, `milestone.md` — planning documents
- `job-prompt.md` — JOB.md structure for execution
- `summary*.md` — post-execution summary templates

### References (`plugins/devflow/devflow/references/`)

Static reference documents that agents read during execution: model profiles, verification patterns, TDD workflow, git conventions, checkpoint handling, UI branding.

### Hooks (`plugins/devflow/hooks/`)

Node.js hooks declared in `plugins/devflow/hooks/hooks.json` and auto-registered when the plugin is enabled. All hook commands use `${CLAUDE_PLUGIN_ROOT}` for path resolution.

**Runtime sync:**
- `sync-runtime.js` — SessionStart; mirrors `${CLAUDE_PLUGIN_ROOT}/devflow/` to `~/.claude/devflow/` when the bundled plugin version differs from the cached `.plugin-version`

**Observability (warn-only):**
- `statusline.js` — StatusLine (declared in plugin.json `statusLine`); renders model, task, context usage
- `verify-completion.js` — Stop; checks SUMMARY.md evidence
- `verify-commits.js` — SubagentStop; warns on no commits in last 10min

**Enforcement (active gates):**
- `route-intent.js` — UserPromptSubmit; injects skill-routing reminders when DevFlow project is detected
- `gate-commits.js` — PreToolUse(Bash); blocks raw `git commit`. Escape: `DEVFLOW_ALLOW_RAW_COMMIT=1`
- `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); **strict DENY by default** in ambient mode (DevFlow project + no skill active). Allows edits when `.planning/.skill-active` marker exists (set by executor), user prompt contains an override phrase (`skip devflow`, `just edit`, `bypass devflow`, `force edit`), or `DEVFLOW_SKIP_EDIT_GATE=1` env var. (Prior `DEVFLOW_STRICT_EDITS=1` behavior is now the default; escape hatch inverted to `DEVFLOW_SKIP_EDIT_GATE=1`.)
- `changelog-on-tag.js` — PreToolUse(Bash); blocks `git tag -a vX.Y.Z` if `CHANGELOG.md` lacks `## [X.Y.Z]`. Escape: `DEVFLOW_SKIP_CHANGELOG_GATE=1`

### Marketplace (`/.claude-plugin/marketplace.json`)

Declares the marketplace and the plugins it ships. Users add the marketplace via `/plugin marketplace add AO-Cyber-Systems/devflow-claude` (or by absolute path for development).

## Conventions

- **Module format**: CommonJS (`.cjs`). The tool is designed to work as a CLI, not a library.
- **File I/O**: Synchronous (`fs.readFileSync`/`fs.writeFileSync`) throughout df-tools.
- **Naming**: Skills are `<name>/SKILL.md`, agents are `<agent-name>.md`, hooks are `<purpose>.js`.
- **Markdown structure**: YAML frontmatter + XML-like tags (`<objective>`, `<step name="...">`, `<execution_context>`) for semantic sections within prompts.
- **File references**: Use `@path` syntax in skill/agent markdown (e.g., `@~/.claude/devflow/templates/state.md`). The home path is populated by the `sync-runtime` hook — do not use `${CLAUDE_PLUGIN_ROOT}` in `@path` references; it does not interpolate.
- **Workflow status**: Every `plugins/devflow/devflow/workflows/*.md` file carries YAML frontmatter with `status: active | legacy`. `active` = in use by skills/agents. `legacy` = superseded but kept for cross-reference.
- **Version sync**: Three files must have matching versions on every release: `package.json`, `plugins/devflow/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
- **Git commits**: `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, chore, docs.
- **Tests**: Node native test runner, test files adjacent to source with `.test.cjs` suffix.

## User-Facing Workflow

The system drives a structured development loop: **new-project** → **discuss-objective** → **plan-objective** → **execute-objective** → **verify-work** → **complete-milestone**. Each step produces files in `.planning/` that feed the next step. Execution uses wave-based parallelism where independent jobs run concurrently, each in a fresh context window.

## Intent Model: `kind` and `work`

Every project declares a `kind` (`api | app | library | ui-lib | cli | plugin`) on PROJECT.md frontmatter. Every objective declares a `work` type (`feature | port | refactor | foundation | bugfix | prototype | spike`) on OBJECTIVE.md frontmatter, or inherits PROJECT.md `default_work`. The planner reads both and applies the `(kind, work)` defaults table at `plugins/devflow/devflow/references/defaults-table.md` to derive TDD posture, planning depth, model profile, and verification rigor.

**Resolution chain (highest wins):**
1. TRD frontmatter explicit override (`type: tdd`, `confidence: high`, etc.)
2. OBJECTIVE.md `overrides` block (`tdd`, `depth`, `model_profile`)
3. CLAUDE.md user playbook directives — the planner reads `~/.claude/CLAUDE.md` and `./CLAUDE.md` for sections matching `^##.*TDD`, `^##.*Test`, `^##.*Quality`, `^##.*Scope` and applies extracted directives
4. `(kind, work)` defaults table
5. Built-in fallback (preserves pre-intent-model planner behavior)

**Resolution is exposed via `df-tools intent resolve --objective <id>`** — used by the planner agent, available for inspection. Each resolved field carries provenance metadata so users see exactly which level supplied each value.

**Migration** for projects created before this model: `/devflow:health --migrate`. Always backs up to `.planning/.migrate-backup-{timestamp}/` before writing.

See `docs/PROPOSAL-kind-and-work.md` for the full design rationale.
