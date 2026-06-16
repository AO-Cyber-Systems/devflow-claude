---
objective: 10-autonomous-mode-overhaul
trd: 09
type: standard
confidence: high
wave: 4
depends_on: ["10-02", "10-03", "10-05"]
files_modified:
  - plugins/devflow/devflow/references/unattended-operation.md
  - plugins/devflow/skills/settings/SKILL.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "references/unattended-operation.md exists and covers: headless `claude -p` launch with session-level permission mode, enabling mode autonomous, decision-queue monitoring + /devflow:decide resolution, OS notification prerequisites, Routines (/schedule) pointer for overnight runs, and the resume/retry safety bounds"
    - "The runbook documents that permissionMode in plugin agent frontmatter is silently ignored and the session-level flag is the working mechanism"
    - "The runbook states the port rule explicitly: verification servers always use 8091; port 8080 is forbidden"
    - "A recommended settings.json permissions allowlist example is included"
    - "/devflow:settings surfaces mode autonomous as a configurable option"
  artifacts:
    - path: "plugins/devflow/devflow/references/unattended-operation.md"
      provides: "complete unattended-operation runbook"
      contains: "claude -p"
    - path: "plugins/devflow/skills/settings/SKILL.md"
      provides: "autonomous mode option + runbook pointer"
  key_links:
    - from: "unattended-operation.md"
      to: "/devflow:decide + .planning/decisions/pending/"
      via: "decision monitoring section"
      pattern: "devflow:decide"
    - from: "skills/settings/SKILL.md"
      to: "references/unattended-operation.md"
      via: "pointer when user selects autonomous"
      pattern: "unattended-operation"
---

<objective>
Ship the unattended-operation runbook (locked work item 6, runbook half — the config preset landed in 10-01). The runbook is the user-facing contract for overnight/headless DevFlow: how to launch, what stops for humans (design decisions, auth, destructive actions — nothing else), where parked decisions surface, and the safety bounds (3 resume attempts, 1 executor retry, dependency-aware skip).

Purpose: All the machinery from TRDs 10-01..10-08 is invisible without an operational guide. The audit's deliverable is "humans stop only for design/architecture decisions, auth, and destructive actions" — the runbook is where that promise is stated and made operable.

Output: New `references/unattended-operation.md` + settings skill exposure.
</objective>

<file_tree>
plugins/devflow/devflow/references/
└── unattended-operation.md                     ← CREATE
plugins/devflow/skills/settings/
└── SKILL.md                                    ← MODIFY (autonomous option + pointer)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Runbook outline (research Pattern 8, expanded with the shipped mechanics):**

```markdown
# Unattended Operation Runbook

## What autonomous mode is (vs yolo)
yolo = blind auto-approve (legacy). autonomous = machine-verify checkpoints (verifier
delegation), park design decisions (queue + notification), retry/resume mechanics
automatically. Humans stop ONLY for: design/architecture decisions (parked, not blocking
independent work), auth (checkpoint:human-action), destructive actions
(safety.always_confirm_destructive).

## Enabling
node ~/.claude/devflow/bin/df-tools.cjs config-set mode autonomous
(or /devflow:settings)

## Headless launch
claude -p "Execute objective 12 via /devflow:execute-objective 12" --permission-mode acceptEdits
- NEVER use --permission-mode bypassPermissions without explicit operator opt-in.
- permissionMode in plugin agent frontmatter is SILENTLY IGNORED — the session-level
  flag above is the working mechanism.

## Recommended settings.json permissions allowlist
{ "permissions": { "allow": ["Bash(node ~/.claude/devflow/bin/df-tools.cjs *)",
  "Bash(npm test*)", "Bash(git *)", ...] } }
(tailor per project; principle: allow the mechanical, prompt for the destructive)

## Decision queue monitoring
- Parked decisions: .planning/decisions/pending/DECISION-*.md (full context, options,
  recommendation). OS notification fires on park (macOS osascript out of the box;
  Linux needs notify-send/libnotify).
- Resolve: /devflow:decide DECISION-001 option-a  → then /devflow:execute-objective N
  to resume gated TRDs.
- List: node ~/.claude/devflow/bin/df-tools.cjs decision-queue list

## Safety bounds (what stops a runaway)
- Stop-hook resume: max 3 attempts per objective (.planning/.autonomous-resume-*)
- Executor retry: exactly once per agent (SubagentStop), then wave failure handling
- Wave failure: retry once → skip dependents only → end-of-run report
- maxTurns: executor 50, verifier 30

## Scheduled overnight runs (Routines)
DevFlow cannot create Routines programmatically. Set up manually:
claude /schedule  (point the routine at: /devflow:execute-objective <N>)

## Port rule
Verification/dev servers in this environment MUST use port 8091. Port 8080 is
permanently forbidden — it is occupied on the operator's machine. This constraint
is passed to every spawned subagent.
```

**Reference-doc conventions:** plain markdown, no YAML status frontmatter required for references/ (that convention is for workflows/). Match the heading style of references/checkpoints.md (sentence-case ## headings).

**settings SKILL.md:** has `allowed-tools: AskUserQuestion` — find the mode question/option list in its body and add an "Autonomous" option (description: "machine-verified checkpoints, parked decisions, auto-resume — see unattended-operation runbook") writing `mode: "autonomous"` via `df-tools config-set mode autonomous`, with a pointer line to `references/unattended-operation.md`.
</codebase_examples>

<anti_patterns>
- Do NOT document features that did not ship in this objective (no PTY watcher, no GitHub bidirectional sync — deferred ideas must not appear).
- Do NOT recommend bypassPermissions as a default anywhere.
- Do NOT write port 8080 except in the explicit prohibition sentence.
- Do NOT duplicate the full checkpoint semantics — link to references/checkpoints.md autonomous section (10-02) instead.
</anti_patterns>

<error_recovery>
- If the settings skill body structure doesn't have an obvious mode question, add a minimal "Mode" section listing yolo/interactive/autonomous with config-set commands — do not restructure the skill.
- Cross-check every CLI invocation in the runbook against the real df-tools surface before writing (decision-queue subcommands from 10-03, config-set from config.cjs) — run each command's usage path once.
</error_recovery>

</embedded_context>

<gotchas>
- TRDs 10-02/10-03/10-05 are upstream dependencies because the runbook documents their behavior — read their SUMMARYs first and match documented flag names/paths to what actually shipped (e.g., exact counter filename pattern, exact decision-queue subcommand names).
- The home-mirror path (`~/.claude/devflow/...`) is the correct path in all user-facing commands — sync-runtime mirrors the plugin there on session start.
- Routines invocation syntax may differ by Claude Code version — present it as a pointer ("see /schedule") rather than a guaranteed-stable command signature.
</gotchas>

<tasks>

<task type="auto">
  <name>Author unattended-operation.md runbook</name>
  <files>plugins/devflow/devflow/references/unattended-operation.md</files>
  <action>
Read 10-01/10-02/10-03/10-05/10-06 SUMMARYs (and 10-04/10-07/10-08 if present) to capture exact shipped names (counter file pattern, decision-queue subcommands, config keys, maxTurns values). Write the runbook per the codebase_examples outline — all nine sections, every CLI command verified against the real surface, the permissionMode-ignored warning, the settings.json allowlist example, the safety-bounds table, the Routines pointer, and the port rule verbatim. Keep it under ~200 lines — it is an operator card, not a spec. Commit `docs(10-09): unattended-operation runbook`.
  </action>
  <verify>File exists; grep -n 'claude -p' ≥1; grep -n 'devflow:decide' ≥1; grep -n '8091' ≥1; grep -n '8080' matches ONLY the prohibition sentence; grep -n 'bypassPermissions' matches only the warning against it</verify>
  <done>Operator can take a cold machine to a scheduled overnight autonomous run using only this document</done>
</task>

<task type="auto">
  <name>Expose autonomous mode in /devflow:settings</name>
  <files>plugins/devflow/skills/settings/SKILL.md</files>
  <action>
Add the Autonomous mode option to the settings skill's mode configuration (per codebase_examples — option label, one-line description, `df-tools config-set mode autonomous` write path, pointer to `@~/.claude/devflow/references/unattended-operation.md`). Keep the existing yolo/interactive options untouched. Commit `feat(10-09): expose autonomous mode in settings skill`.
  </action>
  <verify>grep -n 'autonomous' plugins/devflow/skills/settings/SKILL.md ≥2; grep -n 'unattended-operation' ≥1; existing options unchanged</verify>
  <done>Users can discover and enable autonomous mode through the normal settings flow</done>
</task>

</tasks>

<verification>
- Every command in the runbook executes without "unknown command" against the repo's df-tools (`node plugins/devflow/devflow/bin/df-tools.cjs decision-queue list` etc. in a fixture project)
- `grep -rn "8080" plugins/devflow/devflow/references/unattended-operation.md` → prohibition sentence only
- `npm test` → no regressions
</verification>

<success_criteria>
- [ ] Runbook covers launch, enablement, decision monitoring, notifications, Routines, safety bounds, port rule
- [ ] permissionMode plugin-agent limitation documented with the working session-level alternative
- [ ] Settings skill exposes autonomous mode
- [ ] 2 atomic commits
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-09-SUMMARY.md
</output>
