# Proposal: `kind` and `work` — Project- and Objective-Level Intent for DevFlow

**Status:** Draft for review
**Author:** Mark Emerson (with Claude Opus 4.7)
**Date:** 2026-04-27

---

## Summary

Add two new enumerated fields to DevFlow's planning model:

- **`kind`** on `PROJECT.md` — what the project *is* and how it's consumed.
- **`work`** on `OBJECTIVE.md` — what the objective *does*.

The planner reads both and derives defaults for TDD posture, test strategy, planning depth, model profile, and verification rigor from a fixed `(kind, work) → defaults` lookup table. Defaults are **visible** to the user (printed during planning) but **not gated** (no per-objective confirmation prompts). Per-objective overrides are available via frontmatter or skill flag. User-authored CLAUDE.md playbooks override the defaults table where they conflict.

This replaces today's silent TDD-detection heuristic with deterministic, transparent, user-controllable routing — without adding repetitive intake prompts after one-time setup.

---

## Problem

DevFlow v2 (commit `52d21b0`, Feb 27 2026) shipped strong TDD enforcement (Iron Law, RED→GREEN→REFACTOR with command-and-exit-code evidence, `<!-- TDD-EXCEPTION -->` opt-out, verification hooks). The mechanism is sound. The **routing** is not.

The audit (separate document) identified six gaps:

1. **TDD type decision is silent.** Planner heuristic at `plugins/devflow/agents/planner.md:200-209` decides `type: tdd|standard` and writes it to TRD frontmatter without surfacing the decision or the reasoning.
2. **No production-vs-prototype distinction.** Every objective is treated as production-grade.
3. **CLAUDE.md user playbooks are never read by the planner.** A user's TDD Playbook in `~/.claude/CLAUDE.md` has no path into planning decisions.
4. **Config keys exist but cannot be overridden per objective.** `depth`, `mode`, `model_profile` are read at project init only.
5. **TDD heuristic has no documented tiebreaker** for ambiguous cases.
6. **Confidence scoring is opaque.**

The deeper issue underneath all six: DevFlow has knobs for *how* to do work (`type`, `confidence`, `depth`, `model_profile`) but no field that captures *what* the work is or what it's part of. Without that, every routing decision is either silent guessing or repeated user prompting.

---

## Proposal: Two-Axis Model

### Axis 1: `kind` (project-level)

Set in `PROJECT.md` frontmatter. Describes what the project is and who consumes it. Six values:

| `kind` | Consumed by | Default test surface |
|---|---|---|
| `api` | Clients via HTTP/RPC | API contract, multi-tenancy isolation, integration |
| `app` | Humans via UI | Integration + golden-path E2E + system tests |
| `library` | Other code via API | Public-API contract tests, edge-case coverage |
| `ui-lib` | Other apps, visually + via API | Visual regression + a11y + API contract |
| `cli` | Humans via terminal | I/O snapshots, argument parsing, exit-code contracts |
| `plugin` | Host system via plugin contract | Contract tests against host's plugin API |

**Validation against real projects:**

| Project | `kind` |
|---|---|
| aodex-go, aosentry, aohealth-go, eden-platform-go | `api` |
| aodex-flutter, aodex-dev | `app` |
| eden-ai-go, eden-ai-dart, aosentry-rails gems | `library` |
| eden-ui | `ui-lib` |
| devflow-claude, aosentry-mcp | `plugin` |

All projects classify cleanly. `cli` reserved for future.

### Axis 2: `work` (objective-level)

Set in `OBJECTIVE.md` frontmatter. Describes what an individual objective does. Seven values:

| `work` | Definition | Implied test posture |
|---|---|---|
| `feature` | Net-new behavior | TDD strict; behavior tests + multi-tenancy assertions |
| `port` | Re-implement existing behavior on new substrate; source IS the spec | Spec-matching contract tests using source's behavior as fixtures |
| `refactor` | Restructure implementation without changing user-facing behavior | Characterization tests first, then refactor under test |
| `foundation` | Infrastructure scaffolding (the rest of the project depends on it) | Integration over unit; config-heavy, hard to unit-test in isolation |
| `bugfix` | Fix specific known issues, list-driven | Regression test required per bug; fix verified |
| `prototype` | Exploratory throwaway code | TDD optional/skipped; output is signal, not shippable code |
| `spike` | Research, output is learning | No tests; deliverable is a writeup |

**Validation against ~33 real objectives** across aodex, aosentry, aodex-flutter, aodex-dev: every objective classified cleanly. Distribution skewed heavily toward `feature` and `port`, with `bugfix` covering Flutter's GitHub-issue triage objectives.

---

## Field Schemas

### PROJECT.md frontmatter

Add `kind` to the existing PROJECT.md frontmatter (currently free-form prose).

```yaml
---
kind: api                  # api | app | library | ui-lib | cli | plugin
default_work: feature      # OPTIONAL — sets the default `work` value for objectives in this project
---
```

`default_work` lets a project that's predominantly one type of work (e.g., aodex-go is mostly `port` during the Rails→Go migration) skip the per-objective decision in the common case.

### OBJECTIVE.md frontmatter

Add `work` to OBJECTIVE.md frontmatter.

```yaml
---
work: feature              # feature | port | refactor | foundation | bugfix | prototype | spike
                           # If absent, inherits PROJECT.md's `default_work`, then falls back to `feature`
overrides:                 # OPTIONAL — explicit overrides for the (kind, work) defaults
  tdd: strict              #   strict | per-feature | skip
  depth: comprehensive     #   quick | standard | comprehensive
  model_profile: quality   #   quality | balanced | budget
---
```

### TRD inheritance

TRDs inherit `(kind, work)` from their parent OBJECTIVE.md and apply the defaults table. TRDs can override individual knobs (`type: tdd`, `confidence: high`) just as they do today — the table only changes the *defaults*, not the override mechanism.

---

## Defaults Table: `(kind, work) → defaults`

Six kinds × seven works = 42 cells. Most collapse to a small set of recurring postures. Default values for each cell:

| (kind, work) | tdd | depth | model | verification |
|---|---|---|---|---|
| `(api, feature)` | strict + multi-tenancy assertion | comprehensive | quality | full integration + contract |
| `(api, port)` | spec-match (source's tests as fixtures) | comprehensive | quality | API contract parity |
| `(api, refactor)` | characterization first | standard | balanced | regression suite |
| `(api, foundation)` | integration > unit | comprehensive | balanced | smoke + connectivity |
| `(api, bugfix)` | regression test required | quick | balanced | bug-specific verification |
| `(api, prototype)` | skip | quick | budget | smoke only |
| `(api, spike)` | none | quick | budget | none — writeup deliverable |
| `(app, feature)` | strict; integration > unit | comprehensive | quality | golden-path E2E + system |
| `(app, port)` | spec-match | comprehensive | quality | UI parity tests |
| `(app, refactor)` | characterization (visual + behavioral) | standard | balanced | regression suite |
| `(app, foundation)` | integration > unit | comprehensive | balanced | navigation + auth smoke |
| `(app, bugfix)` | regression per bug | quick | balanced | reproduce + verify fix |
| `(app, prototype)` | skip | quick | budget | manual smoke |
| `(app, spike)` | none | quick | budget | none |
| `(library, feature)` | strict; comprehensive edge cases | comprehensive | quality | API contract + edges |
| `(library, port)` | spec-match | comprehensive | quality | API contract parity |
| `(library, refactor)` | characterization first | standard | balanced | regression suite |
| `(library, foundation)` | unit > integration | comprehensive | balanced | API contract + dependency injection |
| `(library, bugfix)` | regression test on API surface | quick | balanced | bug-specific |
| `(library, prototype)` | skip | quick | budget | smoke |
| `(library, spike)` | none | quick | budget | none |
| `(ui-lib, feature)` | strict; visual + a11y + API | comprehensive | quality | visual regression + a11y + contract |
| `(ui-lib, port)` | spec-match (visual diff vs. source) | comprehensive | quality | visual parity |
| `(ui-lib, refactor)` | visual characterization first | standard | balanced | visual regression |
| `(ui-lib, foundation)` | unit + visual | standard | balanced | base components render |
| `(ui-lib, bugfix)` | visual regression for bug | quick | balanced | visual diff verification |
| `(ui-lib, prototype)` | skip | quick | budget | manual smoke |
| `(ui-lib, spike)` | none | quick | budget | none |
| `(cli, feature)` | strict; I/O snapshot + exit codes | comprehensive | quality | argument parsing + I/O |
| `(cli, port)` | spec-match (I/O parity) | comprehensive | quality | output diff vs. source |
| `(cli, refactor)` | characterization first | standard | balanced | regression suite |
| `(cli, foundation)` | unit + integration | standard | balanced | command tree + parsing |
| `(cli, bugfix)` | regression per bug | quick | balanced | bug-specific |
| `(cli, prototype)` | skip | quick | budget | manual smoke |
| `(cli, spike)` | none | quick | budget | none |
| `(plugin, feature)` | strict; host contract + mocked host | comprehensive | quality | contract + host integration |
| `(plugin, port)` | spec-match | comprehensive | quality | contract parity |
| `(plugin, refactor)` | characterization first | standard | balanced | regression suite |
| `(plugin, foundation)` | unit + contract | standard | balanced | plugin loads + minimal contract |
| `(plugin, bugfix)` | regression per bug | quick | balanced | bug-specific |
| `(plugin, prototype)` | minimal contract test (host load + init only) | quick | budget | plugin loads + host init contract |
| `(plugin, spike)` | none | quick | budget | none |

The table lives in a new reference doc: `plugins/devflow/devflow/references/defaults-table.md`.

---

## CLAUDE.md Absorption

Today the planner does not read `~/.claude/CLAUDE.md` or project `CLAUDE.md` for planning guidance. This proposal changes that.

**New behavior:**

1. Planner reads `~/.claude/CLAUDE.md` (user-global) and project `./CLAUDE.md` at planning start.
2. Planner extracts directives that look like TDD/test/scope policy (heuristic: scan for sections matching `^##.*TDD`, `^##.*Test`, `^##.*Quality`, `^##.*Scope`).
3. Extracted directives override the defaults table where they conflict. Example: if `~/.claude/CLAUDE.md` says "all features default to TDD," that wins over `(api, prototype)`'s `tdd: skip`.
4. Planner shows the user *which* directives applied: `Applied: ~/.claude/CLAUDE.md "TDD Playbook" — overrides tdd=skip → tdd=strict`.

This makes the user's playbook the **highest-precedence default source** below explicit overrides.

**Precedence (highest wins):**

1. TRD frontmatter explicit override (`type: tdd`, `confidence: high`)
2. OBJECTIVE.md `overrides` block
3. CLAUDE.md user playbook directives
4. `(kind, work)` defaults table
5. Built-in fallback (current planner behavior)

---

## UX: Defaults Visible, Autopilot After Setup

Per [user feedback memory](../../../.claude/projects/-Users-markemerson-Source/memory/feedback_autopilot_after_setup.md): set guidelines once, run silently with current defaults shown but not gated.

**At project init (`/devflow:new-project`):**
- Asks `kind` once. (Required — drives every subsequent default.)
- Optionally asks `default_work`. (Skippable; falls back to `feature`.)
- Both stored in PROJECT.md frontmatter.

**At objective planning (`/devflow:plan-objective`):**
- Reads `kind` from PROJECT.md, `work` from OBJECTIVE.md (or `default_work` from PROJECT.md, or fallback `feature`).
- **Prints** the resolved configuration before generating TRDs. When `work` is *explicitly* set on OBJECTIVE.md, the message is terse:
  ```
  Planning objective 04-rest-api-core
  Kind: api (from PROJECT.md)
  Work: port (from OBJECTIVE.md)
  Applied defaults: tdd=spec-match, depth=comprehensive, model=quality, verification=API contract parity
  Applied user playbook: ~/.claude/CLAUDE.md "TDD Playbook" — multi-tenancy assertion required
  Override? (Enter to accept, or specify --work, --tdd, --depth, --model)
  ```
  When `work` is **inherited** from PROJECT.md's `default_work` (i.e., OBJECTIVE.md doesn't declare it explicitly), the message is **louder** — it surfaces the inheritance source and explicitly invites override so silent inheritance can't mask a wrong default:
  ```
  Planning objective 04-rest-api-core
  Kind: api (from PROJECT.md)
  Work: port  ← INHERITED from PROJECT.md default_work
              If this objective is actually a refactor, bugfix, or feature,
              pass --work <type> now or add `work: <type>` to OBJECTIVE.md.
  Applied defaults: tdd=spec-match, depth=comprehensive, model=quality, verification=API contract parity
  Applied user playbook: ~/.claude/CLAUDE.md "TDD Playbook" — multi-tenancy assertion required
  Override? (Enter to accept, or specify --work, --tdd, --depth, --model)
  ```
- **Does not gate.** User pressing Enter (or running non-interactively) accepts the resolved configuration. The louder inheritance message is informational, not a confirmation prompt.
- Override flags accepted: `--work`, `--tdd`, `--depth`, `--model` (all optional).

**At objective execution (`/devflow:build`, `/devflow:execute-objective`):**
- Resolved configuration is read from OBJECTIVE.md / TRD frontmatter only. No re-prompting.

**At quick (`/devflow:quick`):**
- Defaults to `work: bugfix` (smallest TDD posture commensurate with quick's purpose).
- Skips both `kind` lookup and CLAUDE.md absorption — keeps the no-ceremony promise.

---

## Override Semantics

Three override mechanisms, in increasing precedence:

1. **Per-objective (`OBJECTIVE.md overrides:` block)** — set when planning a specific objective with non-default characteristics.
2. **Per-TRD (TRD frontmatter)** — set when one TRD inside an objective needs different treatment (e.g., the verification TRD of a `port` objective gets `type: standard` because it's checking parity rather than building behavior).
3. **Skill flags (`/devflow:plan-objective --work prototype`)** — one-shot override at invocation time.

All three override the defaults table and CLAUDE.md absorption.

---

## Workflow Changes

### `plugins/devflow/devflow/templates/project-md.md`

Add `kind` and `default_work` to the PROJECT.md template.

### `plugins/devflow/devflow/templates/objective-md.md`

Add `work` and `overrides` block to the OBJECTIVE.md template (currently this template doesn't exist — objective metadata is implicit; this proposal makes it explicit).

### `plugins/devflow/devflow/references/defaults-table.md` (new)

The 42-cell defaults table, machine-readable enough that the planner can lookup `(kind, work) → defaults`.

### `plugins/devflow/agents/planner.md`

- Read `kind` from PROJECT.md, `work` from OBJECTIVE.md.
- Read CLAUDE.md (user-global + project) and extract TDD/test/scope directives.
- Apply precedence chain to resolve configuration.
- Print resolved configuration to user before generating TRDs.
- Replace today's silent TDD-detection heuristic with the defaults table.

### `plugins/devflow/devflow/workflows/new-project.md`

- Add `kind` intake at project creation (required).
- Add optional `default_work` intake.
- Write both to PROJECT.md.

### `plugins/devflow/devflow/workflows/plan-objective.md`

- Resolve configuration before TRD generation.
- Print resolution to user.
- Accept `--work`, `--tdd`, `--depth`, `--model` flags as overrides.

### `plugins/devflow/devflow/workflows/build.md`

- Same as plan-objective.md (build is plan + execute + verify).

### `plugins/devflow/skills/df-quick/SKILL.md`

- Default `work: bugfix`.
- Skip CLAUDE.md absorption.

---

## Migration Plan

Existing projects don't have `kind` or `work`. Three-tier fallback:

1. **PROJECT.md without `kind`:** Planner prints a warning: `PROJECT.md missing 'kind' — defaulting to 'api'. Run /devflow:health --migrate to set it.` Behavior continues with `kind: api` (the most common kind in practice).
2. **OBJECTIVE.md without `work`:** Falls back to PROJECT.md's `default_work`, then `feature`. No warning (silent fallback is fine for a low-stakes default).
3. **`/devflow:health --migrate`:** New skill flag that walks the user through setting `kind` for the project and `work` for any in-progress objectives. One-time migration, then autopilot resumes.

---

## Validation Strategy

**Pre-implementation:**
- The 6-value `kind` enum and 7-value `work` enum are validated against ~33 real objectives across 4 projects (see "Validation against real projects" sections above). All classify cleanly.

**Post-implementation:**
- Dogfood: use the new flow to plan and build follow-up objectives in devflow-claude itself.
- Regression: every existing devflow-claude objective should classify cleanly under the new model without behavioral change. The `--migrate` flow proves this.
- Field validation: planner refuses unknown `kind` / `work` values with a helpful error listing valid options.

---

## Open Questions

1. ~~**Does `default_work` belong on PROJECT.md?**~~ **Resolved.** Keep `default_work` (it absorbs the long-runs-of-same-work-type pattern that aodex-go and similar projects exhibit), but the planner is **louder** when `work` is inherited from `default_work` rather than set explicitly on OBJECTIVE.md — surfacing the inheritance source and explicitly inviting override at planning time. This mitigates the masking risk without removing the convenience. See "UX" section above for the louder message format.
2. **Should `kind` ever change after project init?** Probably not, but a project could legitimately evolve (e.g., a `library` that grows a CLI wrapper might want to be a `cli` for some objectives). Current proposal: `kind` is fixed per project; if it needs to change, fork the project or add a sub-project.
3. **Should the defaults table be configurable?** I.e., can a user override the global `(api, port) → tdd: spec-match` for their organization? Current proposal: not yet. Configurable defaults add complexity (where do they live? how do they propagate?). Defer until there's evidence the built-in defaults don't fit.
4. **What about objectives that span multiple `work` types?** E.g., an objective that ports legacy code AND adds new features. Current proposal: split into multiple objectives. The planner can suggest a split if it detects mixed signals during research.
5. **Do we need a `work: documentation` value?** None of the surveyed objectives are pure-docs, but it's plausible. Current proposal: defer; treat docs as part of `feature` or as a TRD-level concern, not an objective-level one.

6. **`kind` axis is weaker than intended for ~40% of cells.** Validation showed `refactor`, `bugfix`, `prototype`, and `spike` rows are nearly identical across all 6 kinds — only `ui-lib` introduces meaningful variance (visual instead of textual characterization). The `kind` axis carries real signal for `feature`, `port`, and `foundation` (where verification strategy genuinely differs by what's being shipped) but degrades to noise for the other four work types. Two options: (a) keep the full 42-cell table for symmetry and leave the redundancy; (b) collapse `refactor`/`bugfix`/`prototype`/`spike` to single rows with `kind` only affecting verification approach, cutting to ~28 cells. Defer until implementation reveals which is friendlier to the planner's lookup logic.

7. **Missing test-strategy dimensions.** Current `verification` column smooshes three things: post-implementation verification, deployment smoke, and ongoing regression cadence. Also absent from the table: performance baselines (relevant for `(api, feature)` and `(api, foundation)`), property-based testing (relevant for `(library, feature)` — Hypothesis/QuickCheck-style), explicit security/RBAC testing (currently buried in "multi-tenancy assertion"), and backward-compatibility testing for `port`/`refactor`. Proposal: leave them off the table for v1, document them as TRD-level concerns the planner can call out per-task. Revisit if real objectives reveal the omission causes problems.

---

## Out of Scope

- Replacing the TDD enforcement mechanism itself (Iron Law, RED→GREEN→REFACTOR with evidence). That stays. This proposal only changes how the *decision to apply* TDD is made.
- Configurable defaults table (deferred — see Open Question 3).
- New TRD types or new task types. Existing `type: standard | tdd | auto` continues to work; the defaults table just makes the choice deterministic.

---

## Implementation Checklist (for the follow-up planning)

- [ ] PROJECT.md template adds `kind` + optional `default_work` frontmatter
- [ ] OBJECTIVE.md template (new) with `work` + `overrides` block
- [ ] `defaults-table.md` reference doc (machine-readable 42-cell lookup)
- [ ] Planner agent: read `kind`/`work`, apply defaults table, read CLAUDE.md, print resolution
- [ ] CLAUDE.md absorption module: scan for TDD/test/scope directives, return as overrides
- [ ] new-project workflow: ask `kind`, optionally `default_work`
- [ ] plan-objective workflow: resolve and print configuration; accept override flags
- [ ] build workflow: inherit from plan-objective
- [ ] quick skill: default `work: bugfix`, skip CLAUDE.md absorption
- [ ] `/devflow:health --migrate`: one-time migration for existing projects
- [ ] Tests: unit tests for the defaults lookup, integration test for the full planner flow
- [ ] Docs: README + CLAUDE.md update with new fields and usage examples
