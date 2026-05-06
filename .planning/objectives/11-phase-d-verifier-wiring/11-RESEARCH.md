---
objective: 11-phase-d-verifier-wiring
research_for: 11-01-diagnose-and-fix
status: complete
---

# Research: `/devflow:build` → df-verifier wiring chain

## Method

Traced the build chain by reading the four files cited in #29:
- `plugins/devflow/devflow/workflows/build.md`
- `plugins/devflow/devflow/workflows/execute-objective.md`
- `plugins/devflow/devflow/workflows/verify-objective.md`
- `plugins/devflow/agents/verifier.md`

Cross-referenced against Phase E SUMMARY (`10-phase-e-agent-audit/10-01-SUMMARY.md`) to confirm what Phase E intentionally preserved vs. what it switched.

Greps run:
- `grep -rn 'subagent_type="general-purpose"' plugins/devflow/` — found 5 remaining sites
- `grep -rn '"verifier"' plugins/devflow/devflow/workflows/ plugins/devflow/skills/*/SKILL.md` — found 6 references
- `grep -n "VERIFICATION.md\|verify_objective_goal\|verifier_model" plugins/devflow/devflow/workflows/build.md` — found 1 match (just `verifier_model` in the JSON parse comment, no actual usage)

## Trace: How the chain SHOULD work

```
User runs: /devflow:build <objective>
  │
  ▼
build.md skill → loads workflow body
  │
  ▼
build.md § 1 Initialize        ← parses init JSON (incl. verifier_model)
build.md § 2 Resolve Objective
build.md § 3 Present Plan      (skipped with --auto)
build.md § 4 Research           Spawns: objective-researcher agent
build.md § 5 Generate TRDs      Spawns: planner agent
build.md § 6 Verify TRDs        Optional: job-checker agent
build.md § 7 Execute TRDs       Spawns: Task(prompt="Run /devflow:execute-objective ${OBJECTIVE} --auto",
                                               subagent_type="general-purpose")  ← LINE 167
                                       │
                                       ▼
                                  general-purpose subagent
                                       │
                                       ▼
                                  reads execute-objective.md skill SKILL.md
                                       │
                                       ▼
                                  reads ~/.claude/devflow/workflows/execute-objective.md
                                       │
                                       ▼
                                  execute-objective.md § initialize
                                  execute-objective.md § handle_branching
                                  execute-objective.md § discover_and_group_plans
                                  execute-objective.md § execute_waves   (spawns executor agents)
                                  execute-objective.md § verify_objective_goal  ← LINE 521
                                                                                Task(subagent_type="verifier",
                                                                                     model="{verifier_model}")
                                                                                     │
                                                                                     ▼
                                                                              verifier agent runs
                                                                              creates VERIFICATION.md
                                                                                     │
                                                                                     ▼
                                  execute-objective.md § update_roadmap (or auto_gap_closure)
                                       │
                                       ▼
                                  trampoline returns to build.md
build.md § 8 Auto-Verify + Complete  ← LINES 174-209
                                  display banner; NO Task() spawn here.
```

## Where the chain breaks (ROOT CAUSE)

The chain's Layer 2 (execute-objective.md) is correctly wired. Verifier spawn at line 521 uses the dedicated `subagent_type="verifier"` agent name, which matches `agents/verifier.md` frontmatter `name: verifier`. That works when reached.

The chain's Layer 1 (build.md) has TWO problems:

### Problem A: Trampoline doesn't guarantee deep workflow execution

`build.md:165-170`:

```
Task(
  prompt="Run /devflow:execute-objective ${OBJECTIVE_NUMBER} --auto",
  subagent_type="general-purpose",
  description="Execute Objective ${OBJECTIVE_NUMBER}"
)
```

The general-purpose subagent receives a slash-command-style prompt. It does NOT have an explicit `<execution_context>` directive forcing it to read the full execute-objective.md workflow. The prompt expects the subagent to behave as if a user typed `/devflow:execute-objective N --auto` in the parent CLI — but subagent contexts can't invoke slash commands. They have to read the workflow file directly.

In practice, the general-purpose agent often interprets "Run /devflow:execute-objective" as a high-level instruction to execute the objective's tasks, completing executor work without reaching the verification step further down the workflow. It then returns "execution complete" to the build orchestrator, bypassing `verify_objective_goal` and never spawning `verifier`.

This is the same class of failure Phase E flagged for the OTHER 14 sites — the subagent type mismatched the work expected. Phase E's preservation of `build.md:167` as a "DOCUMENT case" assumed the trampoline reliably reaches all downstream steps. **It doesn't.**

### Problem B: build.md § 8 has zero Task spawns

`build.md:174-209` is the `## 8. Auto-Verify + Complete` section. Reading the section body:

- Lines 174-176: section intro "After execute-objective returns:"
- Lines 178-193: "If OBJECTIVE COMPLETE" branch — only display logic
- Lines 195-205: "If GAPS FOUND" branch — display + spawn planner with `--gaps` flag (this DOES exist)
- Lines 207: "If still failing after 2 cycles: report gaps and stop for human input"
- Line 209: "If execution failed: Report failure details, suggest manual intervention"

There is no `Task(subagent_type="verifier", ...)` block anywhere in section 8. The section is named "Auto-Verify + Complete" but it does NOT contain the verify spawn. It assumes verification was already done by the trampoline.

This is the actual mechanical bug: a section labeled "Auto-Verify" that doesn't verify.

## Solution

Add a `Task(subagent_type="verifier", ...)` spawn at the top of `## 8. Auto-Verify + Complete` BEFORE the display logic. Make the verifier spawn the first action of section 8.

**Why this works:**

1. **Idempotency.** `agents/verifier.md` Step 0 explicitly handles re-verification:
   > If previous verification exists with `gaps:` section → RE-VERIFICATION MODE
   > Failed items: Full 3-level verification
   > Passed items: Quick regression check

   So if the trampoline DID happen to reach execute-objective.md's verify step and produce a VERIFICATION.md, the build-level spawn runs a fast regression check (cheap). If the trampoline did NOT reach it, the build-level spawn runs full initial verification (correct fallback). Either way, `df-verifier` is spawned ≥1 time per build session.

2. **Single point of guarantee.** The build orchestrator now owns verification end-to-end. The trampoline becomes "best-effort early verification"; section 8 becomes "guaranteed verification". Future refactors of the trampoline can't accidentally lose verification.

3. **Mirrors execute-objective.md:521 exactly.** Same `subagent_type="verifier"`, same `model="{verifier_model}"`, same prompt shape. Zero new conventions.

4. **Mechanically testable.** A regression test grepping `build.md` for `subagent_type="verifier"` deterministically asserts the spawn site exists. Same pattern Phase E used for its 14-site verification.

## Library + framework verification

This is a self-contained workflow markdown change. No external libraries.

The Task tool semantics (Claude Code's subagent spawning) are well-established across the existing codebase:
- `subagent_type` must match an agent's frontmatter `name` field
- `prompt` is the agent's working instructions
- `model` is optional override
- The agent reads its own role file based on the subagent_type → file resolution

`agents/verifier.md` frontmatter:
```
name: verifier
description: Verifies that built code actually achieves the objective goal, not just that tasks were completed.
tools: Read, Write, Bash, Grep, Glob, mcp__plugin_playwright_playwright__browser_*, mcp__maestro__*
color: green
```

So `subagent_type="verifier"` is the canonical reference for invoking this agent.

## Common pitfalls (for executor)

1. **Don't remove the trampoline at line 167.** It's still needed for execute-objective.md's wave management. We're ADDING a backstop, not replacing.

2. **Don't change `agents/verifier.md`.** It's correct. The verifier handles re-verification idempotently.

3. **Don't add the spawn outside section 8.** The section header explicitly promises verification — that's the natural home. Other sections have other concerns.

4. **Pass the right context to the verifier.** The execute-objective.md spawn at line 513-524 is the canonical pattern:
   ```
   Task(
     prompt="Verify objective {objective_number} goal achievement.
       Objective directory: {objective_dir}
       Objective goal: {goal from ROADMAP.md}
       Objective requirement IDs: {objective_req_ids}
       Check must_haves against actual codebase.
       Cross-reference requirement IDs from TRD/JOB frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
       Create VERIFICATION.md.",
     subagent_type="verifier",
     model="{verifier_model}"
   )
   ```
   The build.md backstop should mirror this prompt exactly. Variables `{objective_number}`, `{objective_dir}`, etc. are already in scope from `## 1. Initialize`.

5. **Don't break the existing "If GAPS FOUND" auto-fix loop.** The verifier spawn must come BEFORE the gaps check so the gap-closure logic gets the latest VERIFICATION.md to read.

## Regression test pattern

The test belongs in `plugins/devflow/devflow/bin/df-tools.test.cjs` even though `df-tools.cjs` itself doesn't change. The repo already uses this file for "static asserts about workflow markdown" (no separate workflow-test file exists). Test pattern:

```javascript
test('build.md spawns verifier subagent for guaranteed VERIFICATION.md', () => {
  const buildMd = fs.readFileSync(
    path.join(__dirname, '..', 'workflows', 'build.md'),
    'utf8'
  );
  // Section 8 must contain a verifier spawn
  assert.match(buildMd, /subagent_type="verifier"/,
    'build.md must spawn the dedicated verifier agent in § 8 Auto-Verify');
  // Spawn must reference verifier_model so the profile is honored
  assert.match(buildMd, /model="\{verifier_model\}"/,
    'verifier spawn must use {verifier_model} from init');
});
```

This test is fast (single fs.readFileSync + regex), deterministic, and runs in `npm test`. It catches both regressions (someone removes the spawn) and partial regressions (someone removes the model parameter).

## What this objective does NOT do

- Doesn't change the trampoline pattern itself (preserved per Phase E decision)
- Doesn't add verifier spawns to other workflow trampolines
- Doesn't refactor verify-objective.md (subordinate to verifier agent — not the orchestration concern)
- Doesn't add new agent types
- Doesn't change verifier agent behavior
- Doesn't add browser/Maestro automation requirements (verifier already handles those internally per Step 8)
