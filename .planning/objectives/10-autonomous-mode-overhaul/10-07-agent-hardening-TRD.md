---
objective: 10-autonomous-mode-overhaul
trd: 07
type: standard
confidence: medium
wave: 4
depends_on: ["10-04"]
files_modified:
  - plugins/devflow/agents/executor.md
  - plugins/devflow/agents/verifier.md
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "executor.md frontmatter carries maxTurns: 50 and isolation: worktree; verifier.md carries maxTurns: 30 and memory: project"
    - "Neither agent file contains permissionMode or hooks frontmatter fields (silently ignored for plugin agents — documented as a comment instead)"
    - "Wave-parallel executor spawn prompts embed the FULL TRD content inline (worktree clones cannot rely on reading uncommitted .planning/ files from the parent tree)"
    - "execute-objective.md has a post-wave merge step: worktree executor branches are merged back into the current branch BEFORE spot-checks read SUMMARY/files from disk"
    - "A documented branching guard exists: worktree isolation assumes branching_strategy 'none' (research Pitfall 5)"
  artifacts:
    - path: "plugins/devflow/agents/executor.md"
      provides: "hardened frontmatter (maxTurns: 50, isolation: worktree) + permissionMode omission comment"
      contains: "maxTurns"
    - path: "plugins/devflow/agents/verifier.md"
      provides: "hardened frontmatter (maxTurns: 30, memory: project)"
      contains: "maxTurns"
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "TRD-content-embedded spawn prompt for wave-parallel executors + post-wave worktree merge step"
      contains: "worktree"
  key_links:
    - from: "execute-objective.md spawn step 4"
      to: "executor worktree clone"
      via: "full TRD content embedded in prompt (replaces path-only reference for parallel waves)"
      pattern: "trd_content|TRD content"
    - from: "execute-objective.md post-wave step"
      to: "spot-checks (step 6)"
      via: "merge worktree branches before reading SUMMARY/files from disk"
      pattern: "merge"
---

<objective>
Harden agent frontmatter with the platform fields the June 2026 audit found unused (locked work item 4): `isolation: worktree` on the wave-parallel executor (removes same-tree commit races), `maxTurns` runaway protection on executor and verifier, `memory: project` on the verifier (accumulates codebase verification patterns across runs). Adapt the orchestrator for worktree reality: TRD content passed via spawn prompt, worktree branches merged back before spot-checks.

Purpose: Parallel executors in one working tree race on `git commit`; runaway agents burn unbounded turns. The platform now solves both declaratively — research bindings confirm field support, and confirm `permissionMode` is silently IGNORED for plugin agents (session-level flag instead, documented in the 10-09 runbook).

Output: Frontmatter updates on two agents + worktree-aware spawn/merge protocol in execute-objective.md.
</objective>

<file_tree>
plugins/devflow/agents/
├── executor.md                                 ← MODIFY (frontmatter only + 1 comment)
└── verifier.md                                 ← MODIFY (frontmatter only + 1 comment)
plugins/devflow/devflow/workflows/
└── execute-objective.md                        ← MODIFY (step 4 spawn prompt; new post-wave merge sub-step before step 6 spot-checks)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Target executor frontmatter (research Pattern 6 — exact shape):**

```markdown
---
name: executor
description: Executes planned tasks with atomic git commits, handles deviations, and manages checkpoints during builds.
tools: Read, Write, Edit, Bash, Grep, Glob, mcp__plugin_playwright_playwright__browser_navigate, ... (existing list unchanged)
color: yellow
maxTurns: 50
isolation: worktree
# NOTE: permissionMode and hooks are intentionally omitted — plugin agents silently
# ignore them. Permission mode is set at session launch instead:
#   claude -p "..." --permission-mode acceptEdits
# (see references/unattended-operation.md)
---
```

**Target verifier frontmatter additions:** `maxTurns: 30` and `memory: project` (verifier benefits from persistent memory of codebase patterns at .claude/agent-memory/verifier/; executor does NOT get memory — fresh context per plan is the design).

**Current spawn pattern to adapt (execute-objective.md:262-300):** "Pass paths only — executors read files themselves with their fresh 200k context." With `isolation: worktree` the executor gets a clone branched from the default branch — uncommitted planning files and feature-branch TRDs may be invisible there. Target spawn shape for wave-parallel executors:

```
Task(
  subagent_type="executor",
  ...
  prompt="
    <objective>...unchanged...</objective>
    <execution_context>...unchanged @refs (synced home mirror is visible from any worktree)...</execution_context>

    <plan_content>
    The full TRD content is embedded below because you may be running in an isolated
    worktree where .planning/ files from the parent tree are not visible.
    --- BEGIN TRD ---
    {full text of {objective_dir}/{plan_file}}
    --- END TRD ---
    </plan_content>

    <worktree_protocol>
    - You may be in an isolated git worktree. Commit to your current branch as normal.
    - Write SUMMARY.md at the path given in the TRD output section and COMMIT it —
      the orchestrator reads it from your branch after merging.
    - STATE.md/ROADMAP.md updates: include them in your commits; conflicts are resolved
      at merge time by the orchestrator.
    </worktree_protocol>
  "
)
```

**Post-wave merge step (insert between step 5 wait-for-completion and step 6 spot-checks):**

```markdown
5b. **Merge worktree branches (when executors run with isolation: worktree):**
   - Snapshot branches before spawning the wave: `git branch --format='%(refname:short)' > /tmp/df-branches-before`
   - After completion, diff against current branches to find agent-created branches.
   - For each new branch: `git merge --no-ff {branch}` into the current branch
     (commits are per-plan and file-ownership is exclusive per wave — conflicts indicate
     a planning error; on conflict, abort the merge and route to the failure handler).
   - Spot-checks (step 6) and `git log --all --grep` then see all wave commits.
```

**workstreams.cjs provisioning is the model** (research binding): it already provisions worktrees with `worktree_prefix: "../{project}-ws-"` and `merge_strategy: "squash"` in config — reference it in the workflow text as prior art, but platform-managed worktrees (isolation: worktree) are created/cleaned by Claude Code itself; the orchestrator only merges resulting branches.
</codebase_examples>

<anti_patterns>
- Do NOT add `permissionMode`, `hooks`, or `mcpServers` to any plugin agent frontmatter — silently ignored (research Pitfall 1); the omission comment is the deliverable.
- Do NOT add `memory` to the executor — verifier only ("where useful", locked item 4; executor freshness is by design).
- Do NOT add `isolation: worktree` to the verifier — it must see the merged tree it is verifying.
- Do NOT switch the sequential-execution path to embedded-content prompts unnecessarily — embed TRD content for ALL executor spawns for consistency (worktree applies to every spawn since frontmatter is static), but keep @-references for the execution_context (home-mirror paths resolve from any cwd).
- Port 8080 never appears; 8091 in any example.
</anti_patterns>

<error_recovery>
- If worktree isolation proves incompatible at execution time (e.g., SUMMARY.md not found even after the merge step, or the platform rejects the frontmatter field), REVERT the `isolation: worktree` line only (keep maxTurns/memory), note the deviation in SUMMARY.md, and leave the merge step in place guarded by "when executors run with isolation: worktree".
- maxTurns too low (executor legitimately hits 50 on complex plans): the orchestrator's failure handler (10-04 retry-once) catches it; do not raise the cap speculatively.
</error_recovery>

</embedded_context>

<gotchas>
- Worktrees branch from the DEFAULT branch, not parent HEAD (research Pitfall 5) — on feature branches, wave commits from prior waves may be missing in a fresh worktree. The embedded TRD content + committed-SUMMARY protocol covers planning files; for code dependencies across waves this is a real limitation — add a one-line caution in the workflow: "worktree isolation is safest when executing on the default branch or with branching_strategy 'none' where prior waves' commits are merged back before the next wave spawns" (the 5b merge step guarantees exactly this).
- `git log --all --grep` (step 6 spot-check) already sees unmerged branch commits — but file-existence spot-checks read the working tree, hence merge-before-spot-check ordering is mandatory.
- LOW research confidence on worktree/.planning interaction — that is why the recovery clause exists. Keep the frontmatter change and orchestrator change in SEPARATE commits so a revert is surgical.
</gotchas>

<tasks>

<task type="auto">
  <name>Agent frontmatter hardening</name>
  <files>plugins/devflow/agents/executor.md, plugins/devflow/agents/verifier.md</files>
  <action>
executor.md frontmatter: add `maxTurns: 50` and `isolation: worktree` after `color: yellow`, plus the permissionMode-omission comment block from codebase_examples. verifier.md frontmatter: add `maxTurns: 30` and `memory: project` after `color: green`, plus a one-line comment "# memory: project — accumulates verification patterns at .claude/agent-memory/verifier/". Change NOTHING else in either file (frontmatter + comments only). Commit `feat(10-07): harden executor/verifier frontmatter (maxTurns, worktree isolation, memory)`.
  </action>
  <verify>head -20 of both files shows the new fields; grep -n 'permissionMode' plugins/devflow/agents/*.md matches only inside comments; npm test no regressions</verify>
  <done>Both agents carry the hardened fields; ignored fields documented, not set</done>
</task>

<task type="auto">
  <name>Worktree-aware spawn + post-wave merge in execute-objective.md</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
Step 4 (Spawn executor agents): replace "Pass paths only" guidance with the embedded-TRD-content spawn shape from codebase_examples (orchestrator Reads the plan file and inlines it in `<plan_content>`; keep @-references for execution_context; add the `<worktree_protocol>` block including "commit SUMMARY.md"). Update the context-budget note honestly: embedding costs orchestrator context (~plan size per spawn); acceptable because plans are 2-3 tasks.

Insert sub-step 5b (post-wave worktree branch merge) exactly per codebase_examples, including the branch-snapshot technique, --no-ff merge, conflict-aborts-to-failure-handler rule, and the default-branch caution line from gotchas. Note step 6 spot-checks now run AFTER 5b.

Commit `feat(10-07): worktree-aware executor spawning and post-wave merge`.
  </action>
  <verify>grep -n 'plan_content\|worktree_protocol' plugins/devflow/devflow/workflows/execute-objective.md ≥2; grep -n '5b' ≥1; grep -c 8080 = 0; 10-02/10-04 blocks untouched (grep 'Verifier-approved' and 'decision-queue add' still present)</verify>
  <done>Orchestrator provisions worktree executors with self-contained prompts and merges their branches before any disk-based verification</done>
</task>

</tasks>

<verification>
- `npm test` → no regressions (markdown/frontmatter-only TRD)
- `grep -rn "8080" plugins/devflow/agents/executor.md plugins/devflow/agents/verifier.md plugins/devflow/devflow/workflows/execute-objective.md` → zero or prohibition-only
- Frontmatter sanity: both agent files still parse (YAML between --- markers, no stray tabs)
- Two separate commits so worktree revert stays surgical
</verification>

<success_criteria>
- [ ] maxTurns 50/30, isolation: worktree (executor), memory: project (verifier)
- [ ] permissionMode/hooks documented as intentionally omitted
- [ ] Spawn prompts embed full TRD content + worktree protocol
- [ ] Post-wave merge step precedes spot-checks
- [ ] 2 atomic commits
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-07-SUMMARY.md
</output>
