---
created: 2026-05-23T02:37:40.935Z
title: Clean up devflow-claude dual install + slash command naming inconsistency
area: tooling
files:
  - ~/.claude/skills/df-build/SKILL.md
  - ~/.claude/skills/df-*/SKILL.md (34 files)
  - ~/.claude/agents/df-*.md (12 files)
  - ~/.claude/devflow/VERSION
  - ~/.claude/plugins/cache/aocyber/devflow/2.1.2/
---

## Problem

User reports slash commands and `--parameters` aren't being recognized reliably. Investigation on 2026-05-22 found three concurrent issues:

### Problem A — Dual install of devflow

Two devflow installations register simultaneously in Claude Code:

- **Plugin** at `~/.claude/plugins/cache/aocyber/devflow/2.1.2/` (current, slash form `/devflow:*`)
- **User-global** at `~/.claude/skills/df-*/` + `~/.claude/agents/df-*.md` + `~/.claude/devflow/` mirror (**v1.22.0** per `~/.claude/devflow/VERSION`, four majors stale)

System prompt at session start lists BOTH `df-build`/`devflow:build`, `df-planner`/`devflow:planner`, etc. — every agent and skill is registered twice with different prefixes.

### Problem B — Inconsistent `df:` vs `df-` prefix in user-global

Across 35 user-global `SKILL.md` files:

- **34 declare `name: df:<command>`** (colon form) → slash invocation is `/df:plan-objective`
- **1 outlier** (`~/.claude/skills/df-build/SKILL.md`) declares `name: df-build` (hyphen form) → slash invocation is `/df-build`

Mismatch breaks muscle memory: typing `/df:build` doesn't resolve (its registered name is `df-build`), and typing `/df-plan-objective` doesn't resolve (its registered name is `df:plan-objective`).

### Problem C — Missing skills in user-global

`~/.claude/skills/df-micro/` doesn't exist (only plugin has `/devflow:micro`). Likely also missing: `gh-sync`, `initiatives`, `discuss-objective`, others added in v2.x. Typing `/df:micro` etc. silently fails.

### Why `--parameters` are dropped

User-global skills' `argument-hint:` fields are v1.22.0 schema. They don't list newer params (`--work`, `--depth`, `--tdd`, `--gaps`). When user types `/df:plan-objective 18 --gaps`, args reach the skill body but the v1.22.0 workflow doesn't know what to do with them — silently dropped. Plugin's `/devflow:plan-objective` handles them correctly.

## Solution

Three options in increasing thoroughness:

1. **Quickest (zero-edit):** Stop using `/df:*` commands. Use `/devflow:*` exclusively. The plugin install is current at 2.1.2 and handles all v2.x params.

2. **Better (nuke user-global):**
   ```bash
   rm -rf ~/.claude/skills/df-* ~/.claude/agents/df-*.md ~/.claude/devflow/
   ```
   Mirror gets recreated by `sync-runtime.js` on next session. Settles ambiguity. Only the plugin namespace remains.

3. **If keeping user-global** (e.g., for non-plugin use): run `/df:update` skill and verify the `name:` field normalizes to a consistent prefix across all skills. Manually fix `df-build/SKILL.md` `name:` field (change `df-build` → `df:build`) regardless. Audit which v2.x skills are missing and copy them in.

Recommend option 2 unless there's a reason to keep the user-global install.

## Related follow-ups

- Also add as findings F7 (dual install + version skew) and F8 (name-field prefix inconsistency) to the handoff doc at `~/.claude/devflow-efficiency-handoff.md` — that doc tracks devflow-claude maintenance findings from the 2026-05-08 session (F1-F6 already present).
- Investigate why `sync-runtime.js` didn't update `~/.claude/devflow/VERSION` past 1.22.0 (mirror's `.plugin-version` says 2.1.2 but `VERSION` file says 1.22.0 — divergent metadata).
