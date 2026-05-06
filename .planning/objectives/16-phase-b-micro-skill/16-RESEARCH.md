---
objective: 16-phase-b-micro-skill
type: research
version: 1
created: 2026-05-04
discovery_level: 0
---

# Phase B — `/devflow:micro` skill — Research

## Discovery level

**Level 0 — Skip new-library / new-pattern research.** All four sub-tasks follow established codebase patterns:

- **Skill body shape** — pattern locked by Phase G consolidation (obj 12). Pause-work, resume-work, add-todo redirects are 33–34 lines. Help skill is 25 lines. Micro at ~30 LOC is in the right band.
- **Workflow body shape** — `quick.md` (462 lines) and other workflows already use the `<purpose><process><success_criteria>` XML structure. Micro's workflow is a reduction of that.
- **df-tools subcommand pattern** — `skill-active.cjs` (just shipped 15-04) is the exact pattern micro will mirror: pure functions for unit testing, a `cmdMicro(cwd, args, raw)` wrapper, switch arm in `df-tools.cjs`, paired `.test.cjs` file using node native test runner.
- **Hook regex update pattern** — `INTENT_MAP` in `route-intent.js` is a flat array of `{rx, skill, label}` rows. Adding a row is mechanical; the test pattern in `route-intent.test.js` consumes fixtures from `intent-fixtures.cjs`.
- **Classifier preamble update** — `AMBIENT_PREAMBLE` is a locked string constant. Editing it is a literal text edit; the test (`classifier.test.cjs` case 9) is the gate.

No external libraries. No new dependencies. No architectural decisions. Estimated research time: 0 minutes (covered above).

## Standard stack (existing, in use)

- Node native test runner (`node --test`) — see `npm test` in `CLAUDE.md`
- `node:test`, `node:assert/strict` — pattern in `skill-active.test.cjs`
- `child_process.spawnSync` for subprocess e2e tests — pattern in `route-intent.test.js`
- `fs.mkdtempSync` + `os.tmpdir()` for ambient fixtures — pattern in `skill-active.test.cjs:mkAmbient()`
- CommonJS modules (`.cjs` extension) — locked by repo convention

## Architecture patterns (observed)

**Pattern A — df-tools subcommand library:**
```
plugins/devflow/devflow/bin/lib/<name>.cjs         // pure functions + cmdX(cwd, args, raw) entry point
plugins/devflow/devflow/bin/lib/<name>.test.cjs    // node:test suites, fixture helpers
plugins/devflow/devflow/bin/df-tools.cjs           // require + case '<name>' switch arm
```

Reference: `skill-active.cjs` lines 1–243 (TRD 15-04).

**Pattern B — Skill body (post-Phase G):**
```yaml
---
name: <name>
description: |
  <one-line trigger phrase + 1-2 lines of WHEN to use>
argument-hint: "[--flag] <required-arg>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - SlashCommand   # only when the skill forwards to another
---
<objective>One-paragraph statement of what this skill is for.</objective>
<execution_context>
@~/.claude/devflow/workflows/<name>.md
</execution_context>
<context>
@.planning/STATE.md
$ARGUMENTS
</context>
<process>
Execute the <name> workflow from @~/.claude/devflow/workflows/<name>.md end-to-end.
</process>
```

Reference: `plugins/devflow/skills/quick/SKILL.md`, `plugins/devflow/skills/help/SKILL.md`.

**Pattern C — Workflow body:**
```markdown
---
status: active
---
<purpose>...</purpose>
<required_reading>Read all files referenced by the invoking prompt's execution_context before starting.</required_reading>
<process>
**Step 1: ...**
**Step 2: ...**
</process>
<success_criteria>
- [ ] ...
</success_criteria>
```

Reference: `plugins/devflow/devflow/workflows/quick.md` lines 1–462.

## Don't hand-roll (use existing helpers)

- **Slug generation** — use `generateSlugInternal(description)` from `init.cjs`. Already produces lowercase-hyphen slugs ≤40 chars. Don't reimplement.
- **Next quick task number** — use the same `readdirSync(.planning/quick/) → max+1` pattern from `cmdInitQuick`. Micro tasks live in the SAME `.planning/quick/` numbering namespace (locked decision 3 in CONTEXT.md), so micro `next_num` reuses this counter.
- **Skill marker writes/removes** — use `df-tools skill-active --start micro` and `df-tools skill-active --end` (15-04). Do NOT directly write `.planning/.skill-active` from `micro.cjs`; shell out to `skill-active`'s programmatic API (`startSkill({ planningDir, skillName, pid, now })`) by importing from `./skill-active.cjs`.
- **Atomic commit** — use `cmdCommit(cwd, message, files, raw, amend)` from df-tools' existing commit subcommand. Don't shell out to raw `git commit`; gate-commits.js will block it.
- **Find planning dir** — use `findPlanningDir(start)` from `skill-active.cjs` (already exported). Don't reimplement walk-up.

## Common pitfalls (from related work)

1. **Forgetting to remove the skill-active marker** — if `micro commit` succeeds but the marker stays, gate-edits.js will continue allowing edits. `endSkill({ planningDir })` is idempotent (returns `ok:true, removed:false` if absent), so always call it. Same for `micro abort`.
2. **STATE.md table column drift** — `quick.md` has a runtime branch where `--full` mode adds a Status column. Micro should match the *existing* table format on disk (NOT introduce a new column). When the table doesn't exist yet, create it WITHOUT the Status column (matching the no-`--full` shape).
3. **Test fixtures must be hand-built** — per playbook, no LLM-generated fixtures. The micro CLI tests should mirror `skill-active.test.cjs`'s `mkAmbient()` helper exactly: `fs.mkdtempSync` + `fs.mkdirSync('.planning')`. No factories needed beyond that.
4. **Subprocess e2e tests are slow** — `skill-active.test.cjs` includes a couple of `spawnSync` cases. Keep micro's subprocess coverage to ≤2 cases (one happy-path round-trip, one no-planning-dir failure). Unit-test the rest via direct function calls.
5. **gate-commits.js will block raw `git commit`** — in `micro.cjs`, when calling commit logic, route through `cmdCommit` which sets the env bypass internally. Don't `child_process.execSync('git commit ...')`.
6. **Classifier preamble is asserted by classifier.test.cjs** — when removing the "(in development" parenthetical from `AMBIENT_PREAMBLE`, the existing case 9 test will fail (it asserts the string IS present). The TRD must invert that assertion as part of the SAME commit, or wave 1 will land with broken tests.
7. **route-intent.js skip-rule for interrogatives** — the regex `^\s*(?:why|how|can|could|would|should|is|are|does|did|do)\b` skips Q&A prompts BEFORE matching INTENT_MAP. Micro fixtures must not start with these words ("fix typo X" works; "how do I fix typo X" is silent by design).
8. **Existing INTENT_MAP rules require article+noun** — bare verbs don't fire. Micro's regex must follow suit (e.g., `\bfix\s+(?:a|the|this|that)\s+typo\b` not `\bfix\s+typo\b`). This prevents false positives on compound prompts ("we should fix typos in the docs eventually" should NOT fire).

## Error recovery patterns

- **Marker stale after a crashed micro session** — user can run `df-tools skill-active --end` manually (15-04 exposed this). `micro abort` is the canonical recovery path; document it in workflow.md's `<process>`.
- **Commit fails (pre-commit hook, dirty tree, etc.)** — `cmdCommit` returns the failure to caller. `micro commit` should NOT remove the skill-active marker on commit failure (so the user can retry without losing the marker). Only remove on success.
- **Concurrent micro starts** — `skill-active --start micro` is last-write-wins (per `skill-active.test.cjs` test 4). If a stale marker is left from a previous skill, `micro start` overwrites it. Acceptable for solo-developer workflow per `philosophy` section in df-planner.

## Multitenancy

**Not applicable** — devflow-claude is a single-tenant CLI plugin. No tenant scoping required. (The TDD playbook flags multitenancy assertions only for multi-tenant codebases.)

## Property-based testing

**Skipped** per playbook. The CLI surface is small (3 subcommands), I/O is well-defined (marker file, commit, STATE.md row), and there are no high-cardinality math operations.

## Outside-in starting point

Per playbook: "Pure-logic features start at unit level." Both the CLI logic and the regex/preamble updates are pure logic. Outside-in (e.g., spawning a real Claude session and observing micro end-to-end) is not feasible inside the test runner. Subprocess e2e tests via `spawnSync` are the highest-level layer the test suite can drive.

**Test-list checklist (TRD 16-01 must include this):**

For `df-tools micro start <description>`:
- happy: writes marker, returns `{ok:true, next_num, slug, task_dir}`
- edge: empty description → fails with `missing-description`
- edge: no `.planning/` → fails with `no-planning-dir`
- edge: existing marker (overwrite) — last-write-wins
- edge: existing `.planning/quick/NNN-...` dirs — `next_num` is max+1
- edge: description with special chars — slug generation strips them

For `df-tools micro commit [--files <paths>]`:
- happy: commits with `chore(micro): {description}` message, removes marker, appends STATE.md row
- happy with --files: only stages provided files
- edge: no marker present → fails with `no-active-micro`
- edge: empty `--files` (default) — stages all changes (delegates to git-add behaviour through cmdCommit)
- edge: commit fails (e.g., pre-commit hook denied) — marker remains, error returned
- edge: STATE.md missing → creates "Quick Tasks Completed" section
- edge: existing STATE.md table without Status column — appends matching shape (no Status column)

For `df-tools micro abort`:
- happy: removes marker, returns `{ok:true, removed:true}`
- happy: no marker → idempotent `{ok:true, removed:false}`
- edge: no `.planning/` → fails with `no-planning-dir`
