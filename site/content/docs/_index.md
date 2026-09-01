---
title: "Documentation"
weight: 0
lede: "Everything DevFlow does, why it does it that way, and how to drive it."
---

DevFlow is a Claude Code plugin that turns a description of what you want into
shipped, verified code. It does that by keeping the *system* complicated so your
workflow doesn't have to be: context engineering, XML-structured prompts,
subagent orchestration and durable state all sit behind a handful of commands.

## Where to start

If you have never used DevFlow, read these three in order. Twenty minutes total.

1. **[Installation](/docs/getting-started/installation/)** — the two-line install and what it registers.
2. **[Quickstart](/docs/getting-started/quickstart/)** — build something small, end to end.
3. **[Context rot](/docs/concepts/context-rot/)** — the problem the whole design answers.

## How this site is organised

- **Getting started** — install, first project, adopting an existing codebase.
- **Concepts** — the ideas you need to predict what DevFlow will do.
- **Commands** — all {{< version >}}-era skills, grouped by what you're trying to accomplish.
- **Architecture** — the agents, hooks and plugin layout underneath.
- **Configuration** — `config.json`, model profiles, gates, environment variables.
- **Guides** — task-shaped walkthroughs for GitHub sync, workstreams, UI eval and releases.
- **Reference** — the `df-tools` CLI, the `.planning/` file structure, the defaults table, a glossary.

{{< callout title="Generated from source" >}}
The command, agent, hook and CLI tables on this site are generated from the plugin
source at build time by `scripts/gen-docs-data.cjs`. If a table here disagrees with
your installed version, check which version you have — the tables cannot drift from
the release they were built against.
{{< /callout >}}
