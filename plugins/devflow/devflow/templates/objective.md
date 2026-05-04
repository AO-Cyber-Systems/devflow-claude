# OBJECTIVE.md Template

Template for `.planning/objectives/XX-name/OBJECTIVE.md` — per-objective metadata that supplements the parent ROADMAP.md entry.

This file is **optional**. When absent, the planner reads PROJECT.md `default_work` (or falls back to `work: feature`). When present, it overrides the project default for this objective.

<template>

```markdown
---
work: feature              # OPTIONAL — what this objective DOES. One of:
                           #   feature    — net-new behavior
                           #   port       — re-implement existing behavior on new substrate
                           #              (the source IS the spec)
                           #   refactor   — restructure without changing user-facing behavior
                           #   foundation — infrastructure scaffolding the rest depends on
                           #   bugfix     — fix specific known issues, list-driven
                           #   prototype  — exploratory throwaway code
                           #   spike      — research; output is learning, not code
                           #
                           # If absent, inherits PROJECT.md's `default_work`, then falls
                           # back to `feature`. The planner is LOUDER about inherited
                           # values, so omission is fine when the inheritance is right.

overrides:                 # OPTIONAL — explicit per-objective overrides for the
                           # (kind, work) defaults. Use when this objective genuinely
                           # differs from what its (kind, work) cell prescribes.
  tdd: strict              #   strict | per-feature | skip
  depth: comprehensive     #   quick | standard | comprehensive
  model_profile: quality   #   quality | balanced | budget

github_issue: AO-Cyber-Systems/devflow-claude#20    # OPTIONAL — full owner/repo#NN ref OR
                                                     #   shorthand #NN (resolved against
                                                     #   PROJECT.md github_repo).
                                                     # The GH issue tracking this objective.
parent_issue: #9                                     # OPTIONAL — same format as github_issue.
                                                     # The repo's [Roadmap] parent issue
                                                     # (or org-level epic for cross-repo work).
org_initiative: devflow-internal-alpha               # OPTIONAL — filename in
                                                     #   ~/.claude/devflow/initiatives/<name>.md
                                                     # Read by planner for strategic context;
                                                     # NOT synced to GitHub in v1.1.
org_project: PVT_kwDODwqLrc4BRsOP                   # OPTIONAL — overrides PROJECT.md default.
                                                     # Use when this objective belongs to a
                                                     # different org Project than the project's
                                                     # default.
---

# [Objective Name]

## Goal

[One-sentence statement of what this objective achieves. Mirror the parent ROADMAP entry's Goal field.]

## Why This Objective

[Optional context not captured in the ROADMAP — why now, what it unblocks, what it depends on conceptually.]

## Notes

[Optional free-form notes: spike learnings, open questions, things the planner should know but that don't fit elsewhere.]

---
*Created: [date]*
```

</template>

<guidelines>

**`work` (frontmatter, optional):**
- What the objective does
- Drives the (kind, work) lookup in the defaults table
- Omit to inherit PROJECT.md's `default_work`
- The planner prints the resolved `work` before TRD generation; inherited values get a louder message inviting override

**`overrides` (frontmatter, optional):**
- Per-knob overrides when this objective's situation doesn't match its (kind, work) cell
- Example: `(api, feature)` defaults to `tdd: strict + multi-tenancy assertion`, but a feature with no multi-tenancy implications could set `overrides.tdd: strict` to drop the multi-tenancy clause
- Each field is independent — set only what differs from the default
- TRD-level frontmatter still wins over OBJECTIVE.md `overrides`

**GitHub coordination fields (optional):**

All four fields are optional and back-compat — existing OBJECTIVE.md files without them parse and resolve cleanly. The resolver populates `provenance: 'absent'` for missing fields.

- `github_issue`: Links the objective to its GH issue. Set when manually planning; auto-populated by `df:gh-sync` when missing (v1.2 — for now, set manually). Accepts full ref (`AO-Cyber-Systems/devflow-claude#20`) or shorthand (`#20`) resolved against PROJECT.md `github_repo`.
- `parent_issue`: Walked by `df-tools gh resolve` to find the repo's `[Roadmap]` issue. If absent, the resolver falls back to searching the repo for an issue titled `[Roadmap]`. Same format as `github_issue`.
- `org_initiative`: Filename (no extension, no path) of an initiatives file in `~/.claude/devflow/initiatives/<name>.md`. Reserved field for v1.1 — planner reads it for strategic context but does not sync it to GitHub.
- `org_project`: GitHub Project v2 ID (starts with `PVT_`). Inherited from PROJECT.md unless overridden here. Use when this objective belongs to a different org Project than the project's default.

**Goal:**
- One sentence — same as the parent ROADMAP entry
- Repeated here for self-containment so the executor reading TRDs has the goal in context

**Why / Notes:**
- Free-form context not captured by frontmatter or ROADMAP
- Use Notes for anything the planner should consider when generating TRDs (e.g., "the regression test in TRD 03 must use the same fixture as the legacy Rails suite")

</guidelines>

<resolution_chain>

When the planner runs `df-tools intent resolve --objective <id>`, it walks this precedence chain (highest wins):

1. **TRD frontmatter explicit override** (`type: tdd`, `confidence: high`, etc.)
2. **OBJECTIVE.md `overrides` block** (this file)
3. **CLAUDE.md user playbook directives** (extracted from `~/.claude/CLAUDE.md` and `./CLAUDE.md`)
4. **`(kind, work)` defaults table** (`~/.claude/devflow/references/defaults-table.md`)
5. **Built-in fallback** (current planner behavior — preserved for backward compat)

The planner prints which level supplied each field of the resolved configuration, so users can see exactly where each value came from.

**Note:** The GitHub-link fields (`github_issue`, `parent_issue`, `org_initiative`, `org_project`) follow a separate resolution chain documented in `df-tools gh resolve` output's `provenance` map. Sources: `frontmatter` (this file) → `inherited_from_project` (PROJECT.md) → `walked_from_parent` (GraphQL walk to org Project). The kind/work resolver and the GH resolver run independently; the planner merges both outputs.

</resolution_chain>

<absent_file>

OBJECTIVE.md is optional. Resolution still works without it:

- `work` defaults to PROJECT.md's `default_work`, then `feature`
- `overrides` defaults to empty
- The planner emits a slightly louder resolved-configuration message noting the file is absent

Create OBJECTIVE.md when you need to:
1. Override the project's `default_work` for this objective
2. Override a specific knob (`tdd`, `depth`, `model_profile`)
3. Capture per-objective notes the planner should consider

</absent_file>
