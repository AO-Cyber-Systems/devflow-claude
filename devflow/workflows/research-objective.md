<purpose>
Research how to implement an objective. Spawns df-objective-researcher with objective context.

Standalone research command. For most workflows, use `/df:plan-objective` which integrates research automatically.
</purpose>

<process>

## Step 0: Resolve Model Profile

@~/.claude/devflow/references/model-profile-resolution.md

Resolve model for:
- `df-objective-researcher`

## Step 1: Normalize and Validate Objective

@~/.claude/devflow/references/objective-argument-parsing.md

```bash
OBJECTIVE_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE}")
```

If `found` is false: Error and exit.

## Step 2: Check Existing Research

```bash
ls .planning/objectives/${OBJECTIVE}-*/RESEARCH.md 2>/dev/null
```

If exists: Offer update/view/skip options.

## Step 3: Gather Objective Context

```bash
# Objective section from roadmap (already loaded in OBJECTIVE_INFO)
echo "$OBJECTIVE_INFO" | jq -r '.section'
cat .planning/REQUIREMENTS.md 2>/dev/null
cat .planning/objectives/${OBJECTIVE}-*/*-CONTEXT.md 2>/dev/null
# Decisions from state-snapshot (structured JSON)
node ~/.claude/devflow/bin/df-tools.cjs state-snapshot | jq '.decisions'
```

## Step 4: Spawn Researcher

```
Task(
  prompt="<objective>
Research implementation approach for Objective {objective}: {name}
</objective>

<context>
Objective description: {description}
Requirements: {requirements}
Prior decisions: {decisions}
Objective context: {context_md}
</context>

<output>
Write to: .planning/objectives/${OBJECTIVE}-{slug}/${OBJECTIVE}-RESEARCH.md
</output>",
  subagent_type="df-objective-researcher",
  model="{researcher_model}"
)
```

## Step 5: Handle Return

- `## RESEARCH COMPLETE` — Display summary, offer: Plan/Dig deeper/Review/Done
- `## CHECKPOINT REACHED` — Present to user, spawn continuation
- `## RESEARCH INCONCLUSIVE` — Show attempts, offer: Add context/Try different mode/Manual

</process>
