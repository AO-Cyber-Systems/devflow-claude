---
title: "The intent model"
weight: 40
lede: "kind × work → TDD posture, planning depth, model profile and verification rigor. A spike is not tested like a payments API."
---

Uniform rigor is wrong in both directions: it over-tests throwaway spikes and
under-tests payment paths. DevFlow's intent model derives the right posture from
two declarations.

## The two axes

{{< intent >}}

**`kind`** is declared once, on `PROJECT.md` frontmatter. It says what sort of
software this is.

**`work`** is declared per objective, on `OBJECTIVE.md` frontmatter, or inherited
from `PROJECT.md`'s `default_work`. It says what sort of change this objective is.

## What gets derived

The planner looks up the `(kind, work)` cell in the defaults table and reads nine
fields:

| Field | Values | What it controls |
|---|---|---|
| `tdd` | prose posture | How tests relate to implementation |
| `depth` | `quick` / `standard` / `comprehensive` | How much planning the objective gets |
| `model_profile` | `quality` / `balanced` / `budget` | Which model tier the agents run at |
| `verification` | prose | What the verifier must demonstrate |
| `security_isolation` | `multi_tenant_required` / `single_tenant` / `n/a` | Whether tenant-isolation assertions are required |
| `back_compat` | `api_parity`, `ui_parity`, `behavioral`, … | Parity target for ports and refactors |
| `tdd_default` | `strict` / `auto` / `skip` | Default posture absent a user playbook |
| `test_list_first` | `required` / `optional` | Whether the planner emits a behavior-cases checklist |
| `fixture_strategy` | `generators` / `cassettes` / `inline` / `n/a` | Test data approach |
| `outside_in` | boolean | Whether tests must be ordered E2E → integration → unit |

An `(api, feature)` cell demands strict outside-in TDD, comprehensive planning, the
quality profile, and tenant-isolation assertions. An `(api, spike)` cell asks for
none of it.

## Resolution chain

Five levels. Highest wins.

1. **TRD frontmatter** — explicit override on the job spec (`type: tdd`, `confidence: high`)
2. **`OBJECTIVE.md` overrides block** — `tdd`, `depth`, `model_profile`
3. **CLAUDE.md user playbook** — the planner reads `~/.claude/CLAUDE.md` and
   `./CLAUDE.md` for headings matching `^##.*TDD`, `^##.*Test`, `^##.*Quality`,
   `^##.*Scope` and applies what it finds
4. **The `(kind, work)` defaults table**
5. **Built-in fallback** — preserves pre-intent-model planner behaviour

Level 3 is the interesting one: a "TDD & Quality" section in your `CLAUDE.md` is
not decoration. The planner reads it and it outranks the defaults table.

## Inspecting a resolution

```bash
df-tools intent resolve --objective 4
```

Every resolved field carries provenance, so you can see exactly which level
supplied it. Two parallel maps come back:

**`provenance`** — the *effective* source per field after all overrides:

| Value | Meaning |
|---|---|
| `table` | the defaults cell supplied it |
| `user_playbook` | promoted by a CLAUDE.md playbook section |
| `objective_override` | set in `OBJECTIVE.md` |
| `trd_override` | set in TRD frontmatter |

**`cell_provenance`** — which *tier* of the table the cell came from:

| Value | Meaning |
|---|---|
| `project_table` | `.planning/defaults-table.md` |
| `org_table` | `~/.claude/devflow/defaults-table.md` |
| `bundled_table` | the plugin's own reference copy |

Read together: if `provenance.tdd` is `trd_override` and `cell_provenance.tdd` is
`project_table`, your TRD won — but had it not, your project's own table would
have supplied the value.

## Overriding the table

You do not need to fork the plugin. The loader merges cell-by-cell across three
tiers (project beats org beats bundled), so an override file only needs the cells
you actually want to change.

```bash
# Org-wide, applies to every project on this machine
df-tools defaults-table init --scope=org      # → ~/.claude/devflow/defaults-table.md

# Just this project
df-tools defaults-table init --scope=project  # → .planning/defaults-table.md
```

Omitted cells fall through to the next tier.

## Migrating older projects

Projects created before the intent model have no `kind` and no `work`. Run
`/devflow:status check`; if it reports missing intent frontmatter it offers a
migration, which always backs up to `.planning/.migrate-backup-{timestamp}/`
first.
