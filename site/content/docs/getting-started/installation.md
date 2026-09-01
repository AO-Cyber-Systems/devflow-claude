---
title: "Installation"
weight: 10
lede: "DevFlow ships as a Claude Code plugin. Two lines, no build step, works on macOS, Windows and Linux."
---

## Install

In Claude Code, add the marketplace and install the plugin:

```text
/plugin marketplace add AO-Cyber-Systems/devflow-claude
/plugin install devflow@aocyber
```

You can do the same thing through the Claude Desktop plugin UI: open the plugins
panel, add the `AO-Cyber-Systems/devflow-claude` marketplace, then install
`devflow`.

Verify it took:

```text
/devflow:help
```

## What installation registers

Enabling the plugin wires up four things automatically. You do not edit
`settings.json` by hand.

| Thing | Count | Where it lives |
|---|---|---|
| Skills (slash commands) | {{< count skills >}} | `plugins/devflow/skills/<name>/SKILL.md` |
| Subagents | {{< count agents >}} | `plugins/devflow/agents/*.md` |
| Hooks | {{< count hooks >}} files, 12 registered | `plugins/devflow/hooks/hooks.json` |
| Status line | 1 | declared in `plugin.json` |

## The runtime mirror

Skills and agents reference shared files with `@~/.claude/devflow/...` paths.
Those `@path` references are resolved by Claude Code and **do not** interpolate
`${CLAUDE_PLUGIN_ROOT}`, so the plugin cannot reference its own bundled runtime
directly.

The `sync-runtime.js` SessionStart hook closes that gap: on every session start it
compares the bundled plugin version against the cached `.plugin-version` marker in
`~/.claude/devflow/` and mirrors the runtime across when they differ.

```text
plugins/devflow/devflow/   →   ~/.claude/devflow/
  bin/                           bin/          df-tools.cjs and its lib
  workflows/                     workflows/    workflow bodies
  references/                    references/   docs agents read at runtime
  templates/                     templates/    files copied into your .planning/
```

The mirror is atomic per subdirectory (temp dir plus `renameSync`), skips test
files and fixtures, and only writes `.plugin-version` after all four swaps
succeed. If it fails it warns on stderr and exits cleanly, retrying next session.

{{< callout title="Nothing to do here" >}}
You never run the mirror yourself. It is listed because when a skill mysteriously
references a file you cannot find, `~/.claude/devflow/` is where to look.
{{< /callout >}}

## Staying updated

```text
/plugin update devflow@aocyber
```

The next session start re-mirrors the runtime automatically.

## Recommended: skip-permissions mode

DevFlow is built for frictionless automation, and its own gates are what keep that
safe. Running Claude Code with permission prompts disabled lets agents work
without stopping every few tool calls:

```bash
claude --dangerously-skip-permissions
```

{{< callout title="Read this before you use that flag" type="warn" >}}
This disables Claude Code's own permission prompts for **every** tool call in the
session, not just DevFlow's. Use it in repositories you trust, on a machine where a
bad command is recoverable. DevFlow's hooks still apply — they are a separate layer
— but they are scoped to commits, edits, tags and interactive commands, not to
arbitrary shell.
{{< /callout >}}

## Recommended: a routing hint in CLAUDE.md

Adding a routing block to your project's `CLAUDE.md` makes Claude reach for the
right skill instead of editing files directly:

```markdown
# DevFlow Routing

The DevFlow plugin (`devflow@aocyber`) is installed. When the request fits a
DevFlow workflow, invoke the matching skill instead of editing files directly.

- Building a feature end-to-end → `/devflow:build`
- Planning before building → `/devflow:plan-objective`
- Executing a planned objective → `/devflow:execute-objective`
- Verifying / UAT → `/devflow:verify-work`
- Debugging a bug → `/devflow:debug`
- Quick ad-hoc task → `/devflow:quick`
- Trivial single-token change → `/devflow:micro`
- Resume / status → `/devflow:status`
```

This is belt and braces: the `route-intent` hook already injects a routing
directive when it detects a DevFlow project. The `CLAUDE.md` block reinforces it
and lets you add project-specific routing.

## Migrating from the old npm install

If you previously installed DevFlow with `npx @ao-cyber-systems/devflow-cc`, the
legacy hook files and `settings.json` registrations conflict with the
plugin-managed install. Clean them up first:

```bash
rm -f ~/.claude/hooks/df-*.js ~/.claude/hooks/check-update.js \
      ~/.claude/hooks/statusline.js ~/.claude/hooks/verify-completion.js \
      ~/.claude/hooks/verify-commits.js ~/.claude/hooks/route-intent.js \
      ~/.claude/hooks/gate-commits.js ~/.claude/hooks/gate-edits.js \
      ~/.claude/hooks/changelog-on-tag.js
```

Then open `~/.claude/settings.json` and remove any `hooks` entries pointing at
those paths, plus the `statusLine` block if it references one. The plugin
re-registers everything on the next session start.

Leave `~/.claude/devflow/` alone — it gets refreshed by the runtime mirror.

## Development install

To work on DevFlow itself, clone the repo and add it as a local marketplace:

```bash
git clone https://github.com/AO-Cyber-Systems/devflow-claude.git
```

```text
/plugin marketplace add /absolute/path/to/devflow-claude
/plugin install devflow@aocyber
```

## Uninstalling

```text
/plugin uninstall devflow@aocyber
```

That removes the skills, agents, hooks and status line. Your `.planning/`
directories are project data and are left untouched — delete them per-project if
you want them gone.
