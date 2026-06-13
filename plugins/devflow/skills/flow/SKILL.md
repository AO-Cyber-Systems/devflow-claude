---
name: flow
description: |
  Orchestrate a multi-step DevFlow workflow by chaining skills. Use when the user wants to invoke a sequence of skills as one ask (e.g., "build and sync to github", "research, plan, then build", "ship and announce").
  Triggers on: "ship X to Y", "build and X", "plan and X", "X then Y", "in one go", "as a chain", "all in sequence", "chain", "ship-and-sync", "research-plan-build"
argument-hint: <description of the multi-step flow>
allowed-tools:
  - Skill
  - Task
  - Read
  - Bash
---

<objective>
Orchestrate a multi-skill DevFlow workflow as a single user ask. Parse the natural-language description into a sequence of DevFlow skill invocations, run them sequentially via the Skill tool (threading objective number / args through), surface intermediate state between steps, and stop on first failure with clear diagnosis.

This skill is the chain-aware front door for combinations like build→gh-sync or research→plan→execute. It is NOT a planner — the user has already named the chain; this skill executes it.
</objective>

<process>

**Step 1: Parse the chain from `$ARGUMENTS`**

Identify two things:
1. **Chain shape** — sequence of skills, in order, with their args.
2. **Threaded args** — the objective number or feature description that flows through each step.

Match the description against the common chains below (case-insensitive). If no named chain matches, derive the sequence from the verbs in the description (e.g., "build and sync to github" → /devflow:build + /devflow:gh-sync).

If ambiguous, surface options to the user via `AskUserQuestion` before invoking — do NOT guess.

**Step 2: Display the planned chain**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chain: {chain-name or derived}
Steps:
  1. /devflow:{skill-1} {args}
  2. /devflow:{skill-2} {args}
  ...

◆ Starting step 1/N...
```

**Step 3: Invoke each step sequentially via the Skill tool**

For each step:
1. Invoke the skill via `Skill(skill="devflow:{name}", args="{step-args}")`.
2. After the skill returns, display a transition banner: `✓ Step N/M complete — {short result}` or `✗ Step N/M FAILED — {error}`.
3. On failure, stop the chain. Do NOT proceed to subsequent steps. Surface the failed step's output + suggest a retry/abort path.
4. On success, advance to the next step. Carry through the threaded objective number (most chains share the same objective).

**Step 4: Final summary**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► FLOW COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chain: {chain-name}
Steps: {N}/{N} complete
{Brief per-step result}
```

</process>

<common_chains>

Reference patterns. Match the user's description against these names first; if no match, derive from verbs.

- **build-and-sync** — `/devflow:build {N}` → `/devflow:gh-sync {N}`. After building an objective, push state to GitHub.
- **discuss-and-plan** — `/devflow:discuss-objective {N}` → `/devflow:plan-objective {N}`. Lock decisions before planning.
- **research-plan-build** — `/devflow:research-objective {N}` → `/devflow:plan-objective {N}` → `/devflow:execute-objective {N}`. Full pipeline from blank slate.
- **debug-and-track** — `/devflow:debug "{issue}"` → `/devflow:todo add "{finding}"`. Investigate then capture a follow-up.
- **verify-and-sync** — `/devflow:verify-work {N}` → `/devflow:gh-sync {N}`. Re-verify and push verification gaps to GitHub.
- **ship-and-release** — `/devflow:execute-objective {N}` → `/devflow:verify-work {N}` → `/devflow:gh-sync sync-release {tag}`. End-to-end ship with release notes.
- **plan-and-discuss-first** — `/devflow:discuss-objective {N}` → `/devflow:research-objective {N}` → `/devflow:plan-objective {N}`. Lock decisions → research → plan, when an objective is risky or under-specified.

</common_chains>

<rules>

- Never invoke skills in parallel. Chains are strictly sequential — each step's output may inform the next.
- Never invoke `/devflow:flow` recursively. If a step IS another flow, expand its chain inline before running.
- Never skip steps. If a step fails, stop and surface — do NOT auto-retry beyond what the called skill itself supports.
- Preserve threaded args (objective number, description) across steps — most chains share the same objective; do NOT re-prompt the user for it between steps.
- Honor `disable-model-invocation` on called skills — if any step requires user-typed invocation, stop the chain and tell the user the command to type.
- Do NOT bypass gate-edits or gate-commits. The called skills handle their own gate state via `df-tools skill-active`.

</rules>

<success_criteria>

- [ ] Chain identified from `$ARGUMENTS` (named or derived)
- [ ] Planned chain displayed to user before execution
- [ ] Each step invoked sequentially via Skill tool
- [ ] Transition banner displayed between steps
- [ ] Chain stops on first failure with clear diagnosis
- [ ] Final summary shown on completion (success or failure)
- [ ] No recursive `/devflow:flow` invocations
- [ ] Threaded args preserved across steps

</success_criteria>
