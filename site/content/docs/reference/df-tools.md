---
title: "df-tools CLI"
weight: 10
lede: "The central CLI that skills and agents drive. 66 commands, invoked from the runtime mirror."
---

`df-tools` is a CommonJS CLI, not a library. Roughly fifty skill and agent files
call it. Skills resolve it through the home mirror:

```bash
node ~/.claude/devflow/bin/df-tools.cjs <command> [args] [--raw]
```

`--raw` emits compact JSON instead of pretty-printed — use it when piping.

Throughout this site the command is written `df-tools <command>` for brevity.

## Complete command surface

{{< dftools >}}

## The commands you will use directly

### State

```bash
df-tools state                                  # load and print
df-tools state get <key>
df-tools state patch --key value
df-tools state advance-job
df-tools state update-progress
df-tools state add-decision --objective 4 --summary "..." --rationale "..."
df-tools state add-blocker --text "..."
df-tools state resolve-blocker --text "..."
df-tools state record-metric --objective 4 --job 02 --duration 620 --tasks 3 --files 7
df-tools state record-session --stopped-at "..." --resume-file <path>
df-tools state-snapshot
```

### Commits

```bash
df-tools commit "feat(api): add rate limiting"
df-tools commit "..." --files src/a.go src/b.go
df-tools commit "..." --amend
```

This is what `gate-commits` redirects raw `git commit` to. It preserves objective
scope and task IDs and updates `STATE.md`.

### Validation and health

```bash
df-tools validate consistency
df-tools validate health              # --repair to fix what it safely can
df-tools verify-summary <path> --check-count 2
df-tools verify job-structure <path>
df-tools verify objective-completeness <objective>
df-tools verify references <path>
df-tools verify commits <args>
df-tools verify artifacts <path>
df-tools verify key-links <path>
df-tools verify trd-pre <path>
df-tools verify api-contract <trd-path>
```

### Objectives and roadmap

```bash
df-tools find-objective <query>
df-tools objectives list
df-tools objective add|remove|complete|next-decimal
df-tools roadmap get-objective <n>
df-tools roadmap analyze
df-tools roadmap update-job-progress
df-tools requirements mark-complete <id>
df-tools milestone complete
df-tools objective-job-index
df-tools summary-extract <path>
```

{{< callout title="objective remove renumbers" type="danger" >}}
`objective remove` cascade-renumbers every objective above the one removed,
including directory names. `objective add` slugifies the entire description into
the directory name. Both are why `/devflow:objective` is user-typed only.
{{< /callout >}}

### Intent model

```bash
df-tools intent resolve --objective 4
df-tools defaults-table init --scope=org|project
df-tools resolve-model <agent-type>
```

### Telemetry

```bash
df-tools context --limit 150
df-tools session-audit --limit 150 --since YYYY-MM-DD
df-tools telemetry --scan --limit 150
df-tools transcript-export --out <file> --full <dir> --limit N
df-tools override --gate <name> --reason "<why>"
df-tools override --list --limit 20
```

### GitHub

```bash
df-tools gh status
df-tools gh sync-objectives
df-tools gh sync <objectiveId>
df-tools gh pull <objectiveId> [--apply]
df-tools gh resolve <objectiveId>
df-tools gh comment <issue|objective> <body|@file:path>
df-tools gh close-issue <issue|objective> [comment]
df-tools gh sync-release <tag>
```

### Changelog

```bash
df-tools changelog update --version vX.Y.Z [--from <ref> --to <ref>] [--dry-run]
df-tools changelog check <version>
```

### Skill and micro lifecycle

```bash
df-tools skill-active --start <name>    # writes the marker gate-edits checks for
df-tools skill-active --end
df-tools skill-active --status

df-tools micro start "<description>"
df-tools micro commit [--files <path>...]
df-tools micro abort
```

### Config

```bash
df-tools config-get <key>
df-tools config-set <key> <value>
df-tools config-ensure-section <section>
df-tools global-config get|set <key> [value]
```

### Project classification

```bash
df-tools project-state [<cwd>]
df-tools project-decline [<cwd>] [--duration-days N]
df-tools project-accept [<cwd>]
df-tools detect novel-domain <objective>
df-tools detect brownfield-map [<cwd>]
df-tools detect flutter-ui-scope <objective>
```

### Awareness and coordination

```bash
df-tools awareness <subcommand>
df-tools org-awareness <subcommand>
df-tools initiatives <subcommand>
df-tools check-todos
df-tools tui
df-tools decision-queue
df-tools handoff create|complete|list|get
df-tools planning sibling-trd-scan <objective-num>
```

### Templates and scaffolding

```bash
df-tools template select <type>
df-tools template fill <type> --objective N --job YY --name "..." --fields '{"k":"v"}'
df-tools frontmatter get|set|merge|validate <file> [--field <f>] [--value <v>]
df-tools scaffold <args>
df-tools generate uat <objective>
df-tools generate-slug "<text>"
df-tools current-timestamp
```

### Compound init

`init` bundles the state loading a skill needs into one call, so a skill costs one
`df-tools` invocation rather than six:

```bash
df-tools init execute-objective
df-tools init plan-objective
df-tools init new-project
df-tools init new-milestone
df-tools init quick
df-tools init resume
df-tools init verify-work
df-tools init objective-op
df-tools init todos
df-tools init milestone-op
df-tools init map-codebase
df-tools init security-audit
df-tools init progress
```
