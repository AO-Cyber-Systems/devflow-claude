---
title: "Contributing"
weight: 90
lede: "Working on DevFlow itself: layout, tests, conventions and the release gate."
---

DevFlow is MIT licensed and developed in the open at
[AO-Cyber-Systems/devflow-claude](https://github.com/AO-Cyber-Systems/devflow-claude).

## Development install

```bash
git clone https://github.com/AO-Cyber-Systems/devflow-claude.git
```

```text
/plugin marketplace add /absolute/path/to/devflow-claude
/plugin install devflow@aocyber
```

The plugin directory is the source of truth for distribution; there is no npm
publish step.

## Tests

```bash
npm test
```

Node's native test runner against `.test.cjs` and `.test.js` files adjacent to
their source. There is no lint command.

```text
plugins/devflow/devflow/bin/df-tools.test.cjs
plugins/devflow/devflow/bin/lib/*.test.cjs
plugins/devflow/hooks/*.test.js
```

Hooks are tested like any other module — they are plain Node scripts reading JSON
on stdin.

## Where things go

| Adding | Goes in |
|---|---|
| A slash command | `plugins/devflow/skills/<name>/SKILL.md` |
| A subagent | `plugins/devflow/agents/<name>.md` |
| A hook | `plugins/devflow/hooks/<purpose>.js` + registration in `hooks.json` |
| CLI functionality | `plugins/devflow/devflow/bin/lib/<module>.cjs` + a dispatch case |
| A runtime doc agents read | `plugins/devflow/devflow/references/<name>.md` |
| A file copied into user projects | `plugins/devflow/devflow/templates/` |

See [plugin layout](/docs/architecture/plugin-layout/) for the full structure.

## Conventions

- **CommonJS `.cjs`** throughout `df-tools`. It is a CLI, not a library.
- **Synchronous file I/O** — `readFileSync` / `writeFileSync`.
- **Prompt structure** is YAML frontmatter plus XML-like semantic tags
  (`<objective>`, `<step name="...">`, `<execution_context>`).
- **`@path` references** always use `@~/.claude/devflow/...`, never
  `${CLAUDE_PLUGIN_ROOT}` — it does not interpolate there.
- **`hooks.json` commands** always use `${CLAUDE_PLUGIN_ROOT}`.
- **Workflow frontmatter** carries `status: active | legacy | stub`.
- **Commits:** `{type}({scope}): {description}` — feat, fix, test, refactor, perf,
  chore, docs.

## The documentation site

This site is a Hugo project under `site/`. Its reference tables — commands, agents,
hooks, CLI surface, model profiles — are **generated from the plugin source**
rather than hand-written, so they cannot drift:

```bash
node scripts/gen-docs-data.cjs     # → site/data/devflow.json
cd site && hugo server             # local preview
```

Run the generator before building. CI does this automatically. If you add a skill,
agent or hook, the tables pick it up with no documentation edit — but a new hook
needs a one-line entry in the `HOOK_DOCS` map in the generator to get a
description.

## Releasing

Three files must carry matching versions:

```text
package.json
plugins/devflow/.claude-plugin/plugin.json
.claude-plugin/marketplace.json
```

Then generate the changelog entry and tag. The `changelog-on-tag` hook verifies
both the changelog entry and the three-file version match before allowing the tag.
Full walkthrough: [changelog and releases](/docs/guides/releases/).

## Reporting problems

Issues and feature requests:
[github.com/AO-Cyber-Systems/devflow-claude/issues](https://github.com/AO-Cyber-Systems/devflow-claude/issues).

For a gate that misfires, include the output of:

```bash
df-tools session-audit --limit 50
```

A false-positive rate is far more actionable than a description of one occurrence.
