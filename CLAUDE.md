# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

DevFlow is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It's an npm package (`@ao-cyber-systems/devflow-cc`) that installs skills, agents, hooks, and templates into a user's `.claude/` directory. Fork of GSD v1.20.4, maintained by AO Cyber Systems.

## Commands

```bash
npm test                # Run tests (Node native test runner)
npm run build:hooks     # Copy hooks to hooks/dist/ for publishing
```

There is no lint command. Tests use `node --test` against `devflow/bin/df-tools.test.cjs`.

## Publishing

Publishing happens via CI on version tags (`v*`). The workflow runs tests, builds hooks, validates the tag matches `package.json` version, then publishes to GitHub Packages and creates a GitHub release.

## Architecture

### Core Tool: `devflow/bin/df-tools.cjs`

The central CLI utility used by ~50 skill and agent files. CommonJS module invoked via `node df-tools.cjs <command> [args]`. Provides:

- **State operations** — `state load`, `state update`, `state get`, `state patch`, `state-snapshot`
- **Objective operations** — `objective next-decimal`, `objective add/insert/remove/complete`
- **Roadmap operations** — `roadmap get-objective`, `roadmap analyze`, `roadmap update-job-progress`
- **Compound init commands** — `init execute-objective`, `init plan-objective`, `init new-project`, etc.
- **Model resolution** — `resolve-model <agent-type>` returns the model for an agent based on the active profile (quality/balanced/budget)
- **Validation** — `validate consistency`, `validate health [--repair]`

Model profiles are hard-coded in a `MODEL_PROFILES` table mapping each agent to its opus/sonnet/haiku assignment per profile tier.

### Skills (`skills/df-*/SKILL.md`)

User-invocable slash commands (e.g., `/df:new-project`). Each skill is a directory containing a single `SKILL.md` with:

- **YAML frontmatter** — `name`, `description`, `argument-hint`, `allowed-tools`
- **XML-structured body** — `<objective>`, `<execution_context>` (with `@path` file references), `<process>`, `<context>`
- Skills are thin orchestrators — they load state via df-tools, then spawn agents via the Task tool

### Agents (`agents/df-*.md`)

Subagent prompt files (11 agents: planner, executor, verifier, debugger, etc.). Each has:

- **YAML frontmatter** — `name`, `description`, `tools`, `color`
- **XML-structured body** — `<role>`, `<philosophy>`, `<execution_flow>` with named `<step>` elements
- Agents are spawned by skills with specific model assignments from the profile table

### Templates (`devflow/templates/`)

Markdown and JSON templates that get copied into user projects' `.planning/` directories. Key files:

- `config.json` — workflow settings (mode, depth, parallelization, gates, safety)
- `state.md` — living project memory (position, metrics, decisions, blockers)
- `project.md` — project context (what, why, constraints, decisions)
- `roadmap.md`, `requirements.md`, `milestone.md` — planning documents
- `job-prompt.md` — JOB.md structure for execution
- `summary*.md` — post-execution summary templates

### References (`devflow/references/`)

Static reference documents that agents read during execution: model profiles, verification patterns, TDD workflow, git conventions, checkpoint handling, UI branding.

### Hooks (`hooks/`)

Two Node.js hooks installed into Claude Code:

- `df-check-update.js` — SessionStart hook; spawns background process to check npm registry for updates
- `df-statusline.js` — StatusLine hook; renders model, current task, context usage (color-coded), update indicator

Source files are in `hooks/`, build copies them to `hooks/dist/` (which is what gets published).

### Installer (`bin/install.js`)

The `npx` entry point. Copies skills, agents, hooks, templates into `.claude/` (global or local). Handles:

- Path replacement in markdown (`~/.claude/` vs `./.claude/`)
- Local patch persistence (SHA256 hashing to detect user modifications, backs up to `df-local-patches/`)
- Settings.json configuration for hooks
- Legacy file cleanup from previous versions
- Uninstall support (`--uninstall`)

## Conventions

- **Module format**: CommonJS (`.cjs`). The tool is designed to work as a CLI, not a library.
- **File I/O**: Synchronous (`fs.readFileSync`/`fs.writeFileSync`) throughout df-tools.
- **Naming**: Skills are `df-<name>/SKILL.md`, agents are `df-<agent-name>.md`, hooks are `df-<purpose>.js`.
- **Markdown structure**: YAML frontmatter + XML-like tags (`<objective>`, `<step name="...">`, `<execution_context>`) for semantic sections within prompts.
- **File references**: Use `@path` syntax in skill/agent markdown (e.g., `@~/.claude/devflow/templates/state.md`).
- **Git commits**: `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, chore, docs.
- **Tests**: Node native test runner, test files adjacent to source with `.test.cjs` suffix.

## User-Facing Workflow

The system drives a structured development loop: **new-project** → **discuss-objective** → **plan-objective** → **execute-objective** → **verify-work** → **complete-milestone**. Each step produces files in `.planning/` that feed the next step. Execution uses wave-based parallelism where independent jobs run concurrently, each in a fresh context window.
