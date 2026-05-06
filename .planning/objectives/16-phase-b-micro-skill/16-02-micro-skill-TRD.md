---
objective: 16-phase-b-micro-skill
trd: "02"
type: standard
confidence: high
wave: 2
depends_on:
  - 16-01
files_modified:
  - plugins/devflow/skills/micro/SKILL.md
  - plugins/devflow/devflow/workflows/micro.md
  - plugins/devflow/devflow/templates/state.md
autonomous: true
requirements:
  - PHASE-B1

must_haves:
  truths:
    - "/devflow:micro skill exists in plugins/devflow/skills/micro/SKILL.md and is loadable by Claude Code"
    - "Skill body is ~30 lines (≤35), workflow body is ≤80 lines"
    - "The workflow runs end-to-end: start → user-edit (allowed by gate-edits because marker exists) → commit"
    - "Skill spawns NO agents (no Task tool calls), creates NO SUMMARY.md, performs NO planning"
    - "STATE.md template documentation acknowledges micro entries land in 'Quick Tasks Completed' table"
  artifacts:
    - path: plugins/devflow/skills/micro/SKILL.md
      provides: "Thin orchestrator skill that delegates to workflows/micro.md"
      min_lines: 20
    - path: plugins/devflow/devflow/workflows/micro.md
      provides: "Workflow body: parse description, df-tools micro start, prompt user to edit, df-tools micro commit"
      min_lines: 30
    - path: plugins/devflow/devflow/templates/state.md
      provides: "Documentation note that micro entries share the Quick Tasks Completed table"
  key_links:
    - from: plugins/devflow/skills/micro/SKILL.md
      to: plugins/devflow/devflow/workflows/micro.md
      via: "@~/.claude/devflow/workflows/micro.md reference in <execution_context>"
      pattern: "@~/.claude/devflow/workflows/micro.md"
    - from: plugins/devflow/devflow/workflows/micro.md
      to: "df-tools micro start/commit/abort (16-01)"
      via: "Bash invocations: node ~/.claude/devflow/bin/df-tools.cjs micro <op>"
      pattern: "df-tools\\.cjs micro"
    - from: plugins/devflow/devflow/workflows/micro.md
      to: ".planning/.skill-active marker"
      via: "df-tools micro start writes it; gate-edits.js reads it; df-tools micro commit/abort removes it"
      pattern: "skill-active|\\.skill-active"
---

<objective>
Build the user-facing `/devflow:micro` skill: a ~30-line SKILL.md and a small workflow body that orchestrate `df-tools micro start → edit → commit` with a ~2k token budget.

Purpose: Issue #27's adoption thesis is that ambient routing only works if the routed-to skill costs less than the work itself. `/devflow:quick` at ~5k is too heavy for a typo fix. Micro at ~2k makes routing painless for the floor case. This TRD ships the skill body, workflow body, and a one-line note in the STATE.md template documenting that micro entries share the Quick Tasks Completed table.

Output: `/devflow:micro` invocable from Claude Code, performing the full start-edit-commit dance without spawning agents or creating SUMMARY/JOB/TRD artefacts.
</objective>

<file_tree>
plugins/devflow/
├── skills/
│   └── micro/
│       └── SKILL.md                    ← CREATE
└── devflow/
    ├── workflows/
    │   └── micro.md                    ← CREATE
    └── templates/
        └── state.md                    ← MODIFY (one-line note)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**Pattern A — thin skill body (mirror plugins/devflow/skills/quick/SKILL.md, lines 1-46):**

```markdown
---
name: quick
description: |
  Do a small task quickly with clean git commits and progress tracking, without full project ceremony.
  Use when the user wants to do something small, quick, or ad-hoc without full objective ceremony.
  Triggers on: "quickly do", "just do this", "small task", "quick change", "quick fix", "can you just"
argument-hint: "[--full]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Execute small, ad-hoc tasks with DevFlow guarantees (atomic commits, STATE.md tracking).
...
</objective>

<execution_context>
@~/.claude/devflow/workflows/quick.md
</execution_context>

<context>
@.planning/STATE.md
$ARGUMENTS
</context>

<process>
Execute the quick workflow from @~/.claude/devflow/workflows/quick.md end-to-end.
</process>
```

Key shape constants:
- YAML frontmatter: `name`, `description`, `argument-hint`, `allowed-tools`.
- XML body: `<objective>`, `<execution_context>` with `@~/.claude/devflow/workflows/<name>.md`, `<context>` with `@.planning/STATE.md` and `$ARGUMENTS`, `<process>` that says "execute the workflow end-to-end".

**Pattern B — short workflow body (mirror skills/help/SKILL.md and workflows/help.md):**

`plugins/devflow/skills/help/SKILL.md` (25 lines) — proof that ~30 lines is achievable for a thin skill.

**Pattern C — STATE.md template (current shape, plugins/devflow/devflow/templates/state.md):**

The template currently has a top "File Template" code block that defines the user-facing shape, then `<purpose>`, `<lifecycle>`, `<sections>`, `<size_constraint>` documentation. To document that micro entries share the Quick Tasks table, we add ONE LINE in the `<sections>` section under "Accumulated Context" — no schema change.
</codebase_examples>

<anti_patterns>
- **Do NOT** spawn Task() / agents from the skill or workflow. The whole point of micro is no agent spawn. Issue #27 is explicit. If the editor needs context, the user (or Claude in the same context) handles it inline.
- **Do NOT** create JOB.md, TRD.md, or SUMMARY.md from the workflow. Micro is single-context. Locked decision 5 in CONTEXT.md.
- **Do NOT** call CLAUDE.md absorption / playbook directives. Quick mode already opts out of this (see plugins/devflow/skills/quick/SKILL.md:30 — "CLAUDE.md absorption is **skipped**"); micro inherits the same posture. Locked decision 6.
- **Do NOT** add a new column to STATE.md "Quick Tasks Completed" table. Micro entries are differentiable by commit prefix `chore(micro):`. Locked decision 3.
- **Do NOT** exceed ~35 lines in SKILL.md or ~80 lines in workflow.md. The token budget is the whole feature.
- **Do NOT** include `--full` flag or any of `/devflow:quick`'s mode-switching logic. Micro has no modes — it's the floor.
- **Do NOT** require the user to confirm before each step. Friction defeats the floor-cost goal.
</anti_patterns>

<error_recovery>
**`df-tools micro start` fails (no `.planning/`, missing description):**
- Workflow surfaces the error to the user verbatim and aborts. Do not attempt to retry or auto-init.

**`df-tools micro commit` fails (commit error, marker missing):**
- Workflow surfaces the error and offers two recovery paths in the message:
  1. Fix the cause (e.g., resolve a dirty tree) and run `df-tools micro commit` again — the marker is still active.
  2. Run `df-tools micro abort` to clear the marker without committing.

**User wants to cancel mid-flow:**
- Document `df-tools micro abort` in workflow.md `<process>` as the cancellation path. Marker cleared, no commit, no STATE.md row.

**Marker exists from a different skill:**
- `df-tools micro commit` returns `no-active-micro` (16-01 contract: marker.skill must equal 'micro'). Workflow surfaces this and tells the user to run that other skill's commit/abort, NOT to use micro abort (which would clear the wrong skill's marker — though abort itself is skill-agnostic and that's a documented edge).
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/16-phase-b-micro-skill/16-CONTEXT.md
@.planning/objectives/16-phase-b-micro-skill/16-RESEARCH.md
@.planning/objectives/16-phase-b-micro-skill/16-01-SUMMARY.md

@plugins/devflow/skills/quick/SKILL.md
@plugins/devflow/skills/help/SKILL.md
@plugins/devflow/devflow/workflows/quick.md
@plugins/devflow/devflow/templates/state.md
</context>

<gotchas>
1. **`@~/.claude/devflow/workflows/micro.md` does NOT interpolate `${CLAUDE_PLUGIN_ROOT}`.** From CLAUDE.md: "Skill `@path` references (`@~/.claude/devflow/...`) do not interpolate `${CLAUDE_PLUGIN_ROOT}`, so the `sync-runtime` SessionStart hook mirrors `${CLAUDE_PLUGIN_ROOT}/devflow/` to `~/.claude/devflow/` whenever the version differs." The SOURCE of the workflow file is `plugins/devflow/devflow/workflows/micro.md`; the `@~/.claude/devflow/workflows/micro.md` reference resolves at runtime via the home-mirror.
2. **Workflow needs `status: active` frontmatter.** Per CLAUDE.md conventions: "Every `plugins/devflow/devflow/workflows/*.md` file carries YAML frontmatter with `status: active | legacy`."
3. **`gate-edits.js` allows the user's edit because `df-tools micro start` writes the marker.** The workflow does NOT need to manually write `.planning/.skill-active`; that's handled inside `df-tools micro start` (16-01 delegates to `skill-active --start micro`).
4. **`AskUserQuestion` should be used MINIMALLY.** Quick's workflow uses it once to prompt for a description if `$ARGUMENTS` is empty. Micro should mirror that pattern — one prompt max, only when description is missing.
5. **The SlashCommand tool is NOT in micro's allowed-tools** unless we want micro to forward to another skill (it doesn't). Only Bash + AskUserQuestion + Edit/Read/Write are needed.
6. **Sub-30-LOC target excludes YAML frontmatter and triple-backtick code fences.** Count the meaningful body lines. The 35-line cap is a hard ceiling; aim for ~30.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Create /devflow:micro SKILL.md (~30 lines)</name>
  <files>plugins/devflow/skills/micro/SKILL.md</files>
  <action>
Create `plugins/devflow/skills/micro/SKILL.md`. Target ≤35 body lines, aim for ~30.

Required structure (mirror `plugins/devflow/skills/quick/SKILL.md`):

```markdown
---
name: micro
description: |
  Sub-30-LOC, single-file changes. The cheapest DevFlow path (~2k tokens). Use for typo fixes, single-line bug fixes, prop renames, dependency bumps, missing semicolons.
  Triggers on: "fix typo", "rename X to Y", "1-line fix", "single-file change", "tiny", "trivial"
argument-hint: "<description>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---
<objective>
Execute sub-30-LOC, single-file changes with atomic-commit guarantees and STATE.md tracking, in a single context window.

Micro is the FLOOR of the DevFlow ladder:
- No planner, no executor, no verifier, no job-checker — Claude makes the edit inline
- No JOB.md, no TRD.md, no SUMMARY.md
- No CLAUDE.md / playbook absorption (mirrors /devflow:quick's no-ceremony posture)
- Commit format: `chore(micro): {description}`
- STATE.md "Quick Tasks Completed" table receives an entry on commit

Cost target: ~2k tokens (skill body + df-tools output). For changes that exceed sub-30-LOC or touch multiple files, prefer /devflow:quick (<5 files, <200 LOC) or /devflow:build (multi-file features).
</objective>

<execution_context>
@~/.claude/devflow/workflows/micro.md
</execution_context>

<context>
@.planning/STATE.md
$ARGUMENTS
</context>

<process>
Execute the micro workflow from @~/.claude/devflow/workflows/micro.md end-to-end.
Honour the no-ceremony promise: no agent spawns, no SUMMARY.md, no planning artefacts.
</process>
```

Adjust wording for naturalness if needed but preserve:
- `name: micro`
- `argument-hint: "<description>"`
- `allowed-tools` set (Read, Write, Edit, Bash, AskUserQuestion — no Task, no SlashCommand)
- `@~/.claude/devflow/workflows/micro.md` execution_context reference
- The "no agent spawn" / "no SUMMARY.md" language in the objective

# CRITICAL: ≤35 body lines (excluding YAML frontmatter delimiters). Use `wc -l plugins/devflow/skills/micro/SKILL.md` to verify.
# GOTCHA: Do NOT add Task to allowed-tools. The whole point is no agent spawn.
# PATTERN: Mirror skills/quick/SKILL.md structure but strip --full mode and Task tool.
  </action>
  <verify>
    test -f plugins/devflow/skills/micro/SKILL.md
    wc -l plugins/devflow/skills/micro/SKILL.md  # expect ≤35
    grep -c "^name: micro$" plugins/devflow/skills/micro/SKILL.md  # expect 1
    grep -c "Task" plugins/devflow/skills/micro/SKILL.md  # expect 0 (no Task tool, no agent spawn language)
    grep -c "@~/.claude/devflow/workflows/micro.md" plugins/devflow/skills/micro/SKILL.md  # expect ≥1
  </verify>
  <done>
    SKILL.md exists at plugins/devflow/skills/micro/SKILL.md, ≤35 lines, references the workflow, lists no Task tool, frontmatter has `name: micro`, body explicitly states "no agent spawn / no SUMMARY.md".
  </done>
  <recovery>
    If line count exceeds 35: trim the objective body. The execution_context + process blocks are non-negotiable; the description and objective can be tightened.
    If you accidentally include `Task` in allowed-tools: remove it. Verify with grep.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Create workflows/micro.md and update STATE.md template note</name>
  <files>
    plugins/devflow/devflow/workflows/micro.md
    plugins/devflow/devflow/templates/state.md
  </files>
  <action>
**Part A — Create `plugins/devflow/devflow/workflows/micro.md`** (≤80 lines).

Required structure:

```markdown
---
status: active
---
<purpose>
Execute sub-30-LOC, single-file changes with atomic-commit guarantees, in a single context window. Micro is the FLOOR of the DevFlow ladder: no planner, no executor, no SUMMARY.md, no agent spawn.

Cost target: ~2k tokens (skill body + df-tools output combined).
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting. STATE.md is loaded; $ARGUMENTS contains the user's intent.
</required_reading>

<process>
**Step 1: Get the description**

Parse `$ARGUMENTS` as `$DESCRIPTION`. If empty, prompt:

```
AskUserQuestion(
  header: "Micro Task",
  question: "One-line description of the change?",
  followUp: null
)
```

Re-prompt if still empty. Strip leading/trailing whitespace.

---

**Step 2: Start the micro task**

```bash
node ~/.claude/devflow/bin/df-tools.cjs micro start "$DESCRIPTION" --raw
```

Parse JSON for: `next_num`, `slug`, `task_dir`. The marker (`.planning/.skill-active`) is written by this command — gate-edits.js will now allow Edit/Write/MultiEdit in this session.

If the command fails (`ok:false`), surface the error and abort. Do not retry.

Display:
```
DF ► MICRO #${next_num}: ${DESCRIPTION}
Marker active. You may now make the edit.
```

---

**Step 3: Make the edit (inline, no agent spawn)**

The user (or Claude, in the same context) makes the change directly using Edit/Write/Read/Bash. No Task spawn. No JOB.md. No SUMMARY.md.

Constraints (enforced by convention, not code):
- ≤30 LOC changed
- Single file (rare exception: same logical change spread across ≤2 closely-related files)
- No new abstractions, no new modules, no architectural decisions

If the work turns out to be larger than micro's scope mid-flow, run `df-tools micro abort` and re-route to `/devflow:quick` or `/devflow:build`.

---

**Step 4: Commit**

```bash
node ~/.claude/devflow/bin/df-tools.cjs micro commit --raw
```

This produces an atomic commit `chore(micro): ${DESCRIPTION}`, removes the marker, and appends a row to STATE.md "Quick Tasks Completed" table.

If commit fails:
- Marker stays active (so the user can retry).
- Surface the error.
- Offer recovery: fix the cause and run `df-tools micro commit` again, OR run `df-tools micro abort` to discard.

---

**Step 5: Done**

Display:
```
DF ► MICRO COMPLETE
${commit_hash} chore(micro): ${DESCRIPTION}
STATE.md updated.
```

No SUMMARY.md. No verification step. No further ceremony.
</process>

<success_criteria>
- [ ] User provides (or is prompted for) a description
- [ ] `df-tools micro start` succeeds and writes the marker
- [ ] User makes a single-file, sub-30-LOC edit using Edit/Write/Read/Bash
- [ ] `df-tools micro commit` produces a `chore(micro): ${DESCRIPTION}` commit
- [ ] Marker is removed (commit success path) or remains (commit failure path with explicit retry instructions)
- [ ] STATE.md "Quick Tasks Completed" table has a new row
- [ ] No SUMMARY.md, JOB.md, or TRD.md was created during the flow
- [ ] No Task() / agent spawn occurred during the flow
</success_criteria>
```

**Part B — Update `plugins/devflow/devflow/templates/state.md`** (one-line addition).

Find the `<sections>` block, locate the "Accumulated Context" subsection. Add ONE LINE after the existing "Pending Todos" / "Blockers/Concerns" descriptions, in the same paragraph style:

```markdown
**Quick Tasks Completed:** From `/devflow:quick` and `/devflow:micro` — atomic-commit history. Both skills append to the same table. Differentiable by commit prefix: `chore(micro): ...` vs `docs(quick-NN): ...`.
```

Place it as a new bullet/paragraph after `**Blockers/Concerns:**` and before the closing of the section. Do NOT modify the "File Template" code block at the top — that's the user-facing template shape, which already accommodates the table without a schema change.

# CRITICAL: workflows/micro.md MUST have `status: active` frontmatter (CLAUDE.md convention).
# CRITICAL: ≤80 body lines for workflows/micro.md. Aim for ~50-60. Trim verbose explanations if needed.
# CRITICAL: No Task() invocations anywhere in workflows/micro.md. No `subagent_type=`. No agent spawns.
# GOTCHA: The `df-tools micro start` command writes the marker — workflows/micro.md does NOT directly call `skill-active --start`. That's already handled inside the CLI (see 16-01-SUMMARY.md).
# GOTCHA: state.md template change is documentation-only. Do NOT change the user-facing "File Template" code block — STATE.md instances on disk in user projects must remain compatible.
  </action>
  <verify>
    test -f plugins/devflow/devflow/workflows/micro.md
    head -3 plugins/devflow/devflow/workflows/micro.md | grep -c "^status: active$"  # expect 1
    wc -l plugins/devflow/devflow/workflows/micro.md  # expect ≤80
    grep -c "Task(" plugins/devflow/devflow/workflows/micro.md  # expect 0 (no agent spawn)
    grep -c "df-tools.cjs micro" plugins/devflow/devflow/workflows/micro.md  # expect ≥3 (start, commit, abort references)
    grep -c "Quick Tasks Completed" plugins/devflow/devflow/templates/state.md  # expect ≥2 (existing + new note)
    grep -c "chore(micro)" plugins/devflow/devflow/templates/state.md  # expect ≥1 (in the new note)
    npm test 2>&1 | grep -E "^ℹ pass|^ℹ fail" | head -3  # expect pass count unchanged from end of 16-01
  </verify>
  <done>
    workflows/micro.md exists with status:active frontmatter, ≤80 lines, no Task() spawns, references df-tools micro three times (start/commit/abort). state.md template has a new note documenting that micro entries land in the Quick Tasks Completed table. npm test still passes (no regressions — these are markdown-only edits, but state.md template is read by some tests so confirm).
  </done>
  <recovery>
    If line count exceeds 80: trim the verbose explanations in step 3 and step 4. The bash invocations and the success_criteria block are non-negotiable.
    If state.md template change accidentally breaks a test: the test is asserting on template text. Inspect which test failed (likely `templates.test.cjs` or similar), update the test if the new wording is correct, or revert the state.md change and place the note differently.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
End-state checks:

1. **Skill is loadable** — `cat plugins/devflow/skills/micro/SKILL.md | head -1` returns `---` (proof of valid frontmatter delimiter). The plugin loader enumerates skills/* at session start; the new directory will be picked up.

2. **Skill ≤35 lines, workflow ≤80 lines:**
   - `wc -l plugins/devflow/skills/micro/SKILL.md` — should be ≤35.
   - `wc -l plugins/devflow/devflow/workflows/micro.md` — should be ≤80.

3. **No agent spawn language:**
   - `grep -c "Task(" plugins/devflow/devflow/workflows/micro.md` — must be 0.
   - `grep -c "subagent_type" plugins/devflow/devflow/workflows/micro.md` — must be 0.

4. **CLI references match 16-01 contract:**
   - workflows/micro.md references `df-tools.cjs micro start`, `df-tools.cjs micro commit`, `df-tools.cjs micro abort`. Each at least once. (Abort can be in a recovery comment rather than the happy path.)

5. **STATE.md template note lands:**
   - `grep -c "Quick Tasks Completed" plugins/devflow/devflow/templates/state.md` — at least 2 (the existing reference + the new note).
   - `grep -c "chore(micro)" plugins/devflow/devflow/templates/state.md` — at least 1.

6. **No regression:** `npm test` test count and pass count match end-of-16-01 exactly. (This TRD touches only markdown; if anything fails, it's a template-test breakage and must be addressed in this TRD before commit.)
</verification>

<success_criteria>
- [ ] `plugins/devflow/skills/micro/SKILL.md` exists, ≤35 body lines, frontmatter has `name: micro`, allowed-tools excludes Task and SlashCommand.
- [ ] `plugins/devflow/devflow/workflows/micro.md` exists with `status: active` frontmatter, ≤80 lines, references df-tools micro start/commit/abort, contains zero `Task(` invocations.
- [ ] `plugins/devflow/devflow/templates/state.md` has a new note documenting that micro entries share the Quick Tasks Completed table.
- [ ] At least 1 atomic commit lands: `feat(16-02): add /devflow:micro skill + workflow + STATE template note`.
- [ ] `npm test` shows no regression vs end-of-16-01 (1714+ tests passing, 0 fails).
- [ ] Manual smoke test (run after both 16-01 and 16-02 land): from a `.planning/` project root, `df-tools micro start "smoke test"` writes the marker, an Edit/Write succeeds (gate-edits permits), `df-tools micro commit` completes the round-trip with `chore(micro): smoke test` on the log.
</success_criteria>

<output>
After completion, create `.planning/objectives/16-phase-b-micro-skill/16-02-SUMMARY.md` summarising:
- Final line counts (SKILL.md, workflow.md)
- Smoke-test result (manually run after this TRD lands)
- Token-cost estimate (skill load + df-tools start + df-tools commit output sizes)
- Anything 16-04 (classifier routing) needs to know about the skill being available now
</output>
