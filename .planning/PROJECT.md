---
kind: plugin
default_work: feature
---

# DevFlow Claude

## What This Is

DevFlow is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`devflow@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Maintained by AO Cyber Systems.

**Core value:** AI workflow orchestration for Claude Code sessions — skills, hooks, MCP integration, planning state, and program-aware coordination across the AO-Cyber-Systems org.

## Scope

devflow-claude owns:

- **Skills** (`/devflow:*` slash commands): planning, building, debugging, verification, todos, intent resolution
- **Subagents**: planner, executor, verifier, debugger, etc.
- **Hooks**: SessionStart sync, gate-commits, gate-edits, gate-interactive, route-intent, statusline, verifiers
- **Templates** for `.planning/` artifacts (PROJECT, OBJECTIVE, ROADMAP, JOB, SUMMARY, STATE)
- **`df-tools.cjs`**: central CLI used by skills/agents for state ops, objective ops, model resolution, GitHub integration, changelog generation, intent resolution
- **Program-aware coordination layer** (v1.1+): cross-repo awareness via GitHub Issues + Projects v2 substrate

## Out of Scope

- Local development platform (project registry, baseline stack, secrets, toolchain orchestration) — that's `devflow` (Go CLI/daemon)
- AI gateway, routing rules, model catalog — that's `aosentry`
- Identity, teams, projects, knowledge, agent control plane backend — that's `aodex`
- Native macOS UI — that's `aodex-flutter`

## Architectural Principles

### Plan org-aware, execute repo-focused

Planning consults the org's broader state (sibling repos, eden-libs reuse opportunities, the org Product Roadmap) to surface overlap, duplication risk, and shared-service opportunities. Execution stays a local heads-down loop with at most an async preamble pulling thin context.

The brains go at plan time where overlap/duplication/shared-service decisions actually matter; execution stays a local heads-down loop with at most a thin context preamble.

### Continue executing — no manual paste

When Claude hits a command it can't run itself (TTY-interactive, shell-flow, password-prompt), the system queues the handoff and Claude continues with parallel work. A daemon (Approach B, in flight) executes queued commands in the user's interactive shell and injects results back. The user never has to manually paste `! cmd`.

### Foundation first; adoption follows

devflow-claude provides the *mechanics* for coordination. Adopting those mechanics across the org's repos (issue templates, label taxonomy, sub-issue backfilling, draft-milestone promotion) is parallel program work, not part of devflow-claude's roadmap.

## Distribution

- Source of truth: `plugins/devflow/` (skills, agents, hooks, runtime)
- Marketplace: `.claude-plugin/marketplace.json`
- Installation: `/plugin marketplace add AO-Cyber-Systems/devflow-claude` then enable `devflow@aocyber`
- Version sync: `package.json`, `plugins/devflow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` must match on every release
- Releases: `v*` tag triggers changelog gate

## Org Context

- Organization: `AO-Cyber-Systems`
- Master roadmap: GitHub Project ID `PVT_kwDODwqLrc4BRsOP` ("Product Roadmap")
  - Custom fields: Status (Todo/In Progress/Done), Product (8 product lines), Quarter (Q1 2026 → Q4 2027)
- Repos in the AO-Cyber-Systems org devflow-claude coordinates with:
  - `aodex` (Rails API + Go port — agent control plane, knowledge, MCP)
  - `aosentry` (Go — AI gateway, routing rules, local model catalog)
  - `aodex-flutter` (Flutter macOS app — Hub UI)
  - `eden-libs` (shared SDK across products)
  - `devflow` (Go CLI/daemon — local dev platform; sibling, not subordinate)
  - `eden-biz`, `aocyber-cloud`, `eden-ui`, etc.

## Repo Layout

```
devflow-claude/
├── .planning/                   # planning state (this directory tree)
├── .claude-plugin/              # marketplace metadata
├── plugins/devflow/             # plugin source — single source of truth for distribution
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md
│   ├── agents/<agent>.md
│   ├── hooks/{hooks.json,*.js}
│   └── devflow/                 # runtime mirrored to ~/.claude/devflow/ on session start
│       ├── bin/df-tools.cjs
│       ├── workflows/<name>.md
│       ├── references/<name>.md
│       └── templates/<name>.md
├── docs/                        # design proposals, implementation plans
├── CHANGELOG.md
└── package.json
```

## Constraints

- All hooks must be idempotent and fast (<200ms typical) — they run on every relevant tool call
- Distribution is via Claude Code plugin marketplace; no npm publish
- Three version files must stay in sync on every release
- Plugin must work with both interactive Claude Code sessions and background subagent execution
