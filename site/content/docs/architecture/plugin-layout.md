---
title: "Plugin layout"
weight: 30
lede: "Where everything lives in the repository, and how the pieces reference each other."
---

```text
plugins/devflow/
├── .claude-plugin/plugin.json    manifest — name, version, statusLine
├── skills/<name>/SKILL.md        user-invocable slash commands
├── agents/<agent>.md             subagent prompts
├── hooks/
│   ├── hooks.json                event registrations, auto-loaded
│   ├── sync-runtime.js           SessionStart: mirrors devflow/ → ~/.claude/devflow/
│   └── *.js                      the rest of the hooks
└── devflow/                      runtime, mirrored to ~/.claude/devflow/
    ├── bin/df-tools.cjs          the central CLI
    ├── bin/lib/*.cjs             df-tools internals
    ├── workflows/<name>.md       workflow bodies, referenced via @~/.claude/devflow/...
    ├── references/<name>.md      static docs agents read at runtime
    └── templates/<name>.md       files copied into user projects' .planning/
```

## Skills

A skill is a directory containing exactly one `SKILL.md`:

```markdown
---
name: build
description: |
  Build a feature from start to finish...
  Triggers on: "build this", "implement this", ...
argument-hint: "<objective-number-or-description> [--pause] ..."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task, ...
---

<objective>...</objective>
<execution_context>
  @~/.claude/devflow/workflows/build.md
</execution_context>
<process>...</process>
```

Skills are deliberately thin. They load state through `df-tools`, then dispatch
agents with the `Task` tool. Keeping the orchestrating session small is what lets
it stay coherent across a long build.

The `description` field does double duty: it is what a human reads, and its
`Triggers on:` line is what routes natural language to the skill.

## The @path convention

Skills and agents reference shared files with `@~/.claude/devflow/...`. Those
references are resolved by Claude Code and **do not** interpolate
`${CLAUDE_PLUGIN_ROOT}` — which is why the runtime mirror exists.

{{< callout title="The rule that follows" type="warn" >}}
In `@path` references, always use `@~/.claude/devflow/...`. Never
`${CLAUDE_PLUGIN_ROOT}` — it does not interpolate there and the reference silently
resolves to nothing.

In `hooks.json` commands, always use `${CLAUDE_PLUGIN_ROOT}` — hooks run from the
plugin directory, not the mirror.
{{< /callout >}}

## Workflows, references, templates

**Workflows** (`devflow/workflows/`) are the executable bodies skills pull in.
Every one carries a `status` on frontmatter:

| Status | Meaning |
|---|---|
| `active` | in use by a skill or agent |
| `legacy` | superseded, kept for cross-reference |
| `stub` | placeholder, not yet implemented |

**References** (`devflow/references/`) are static documents agents read during
execution — TDD posture, git conventions, checkpoint handling, verification
patterns, anti-patterns, the defaults table.

**Templates** (`devflow/templates/`) are copied into user projects' `.planning/`
directories by `df-tools`.

## The marketplace

`/.claude-plugin/marketplace.json` at the repository root declares the marketplace
and every plugin it ships. Users add it by repo slug:

```text
/plugin marketplace add AO-Cyber-Systems/devflow-claude
```

## Conventions

| Area | Convention |
|---|---|
| Module format | CommonJS (`.cjs`) — `df-tools` is a CLI, not a library |
| File I/O | Synchronous throughout `df-tools` |
| Naming | Skills `<name>/SKILL.md`, agents `<agent-name>.md`, hooks `<purpose>.js` |
| Prompt structure | YAML frontmatter plus XML-like semantic tags |
| Commits | `{type}({scope}): {description}` — feat, fix, test, refactor, perf, chore, docs |
| Tests | Node native test runner, `.test.cjs` adjacent to source |

### Version sync

Three files must carry matching versions on every release:

```text
package.json
plugins/devflow/.claude-plugin/plugin.json
.claude-plugin/marketplace.json
```

The `changelog-on-tag` hook enforces this — it blocks `git tag -a vX.Y.Z` when the
three disagree, or when `CHANGELOG.md` has no entry for that version.
