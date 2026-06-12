---
objective: 10-autonomous-mode-overhaul
trd: 02
type: standard
confidence: high
wave: 2
depends_on: ["10-01"]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/references/checkpoints.md
  - plugins/devflow/agents/verifier.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "In autonomous mode, checkpoint:human-verify is delegated to the verifier agent — approved only on green machine evidence, escalated to the user on failure"
    - "Blind auto-approve of human-verify survives ONLY in legacy yolo mode (back-compat); autonomous mode never blind-approves"
    - "The verifier agent has a documented checkpoint-verification mode: scoped functional pass against the checkpoint's what-built/how-to-verify, structured passed/gaps_found/human_needed return"
    - "Every verification-server instruction in the touched files mandates port 8091 and forbids 8080"
    - "checkpoint:human-action still always stops for the user (auth gates cannot be automated)"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "three-branch checkpoint handler: autonomous → verifier delegation; yolo → legacy blind approve; interactive → present to user"
      contains: "verifier-delegated"
    - path: "plugins/devflow/devflow/references/checkpoints.md"
      provides: "golden rule 5 rewritten for three modes; autonomous checkpoint semantics section"
    - path: "plugins/devflow/agents/verifier.md"
      provides: "checkpoint verification mode section + port 8091 hard rule"
  key_links:
    - from: "execute-objective.md checkpoint_handling step"
      to: "verifier agent"
      via: "Task(subagent_type=\"verifier\") spawn with checkpoint context when MODE=autonomous"
      pattern: "subagent_type=\"verifier\""
    - from: "execute-objective.md checkpoint_handling step"
      to: "df-tools config-get mode"
      via: "MODE shell variable with yolo fallback"
      pattern: "config-get mode"
---

<objective>
Replace blind `checkpoint:human-verify` auto-approval with verifier delegation (locked work item 1). In autonomous mode the orchestrator spawns the verifier agent with the checkpoint's `what-built` and `how-to-verify` context; the verifier runs the functional pass it already knows how to do (verifier.md Step 8 Playwright/Maestro), and the orchestrator approves the checkpoint ONLY on green evidence. On failure or ambiguity, escalate to the user with the verifier report attached.

Purpose: Yolo's blind "approved" skips verification instead of automating it — the audit found this calibrated backwards. Machines should own mechanical verification; humans should only see failures.

Output: Three-branch checkpoint handler in execute-objective.md, rewritten golden rule 5 + autonomous semantics in checkpoints.md, checkpoint-verification mode documented in verifier.md. All markdown/prompt changes — no .cjs code.
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
└── execute-objective.md                        ← MODIFY (checkpoint_handling step, ~line 377-421)
plugins/devflow/devflow/references/
└── checkpoints.md                              ← MODIFY (overview golden rule 5 + new autonomous section)
plugins/devflow/agents/
└── verifier.md                                 ← MODIFY (checkpoint verification mode + port rule)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Current auto-mode checkpoint handler (execute-objective.md:380-390):**

```markdown
Read auto-advance config:
\`\`\`bash
AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
\`\`\`

When executor returns a checkpoint AND `AUTO_CFG` is `"true"`:
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.
```

**Target shape (research Pattern 2 — autonomous branch checked FIRST):**

```markdown
Read mode + auto-advance config:
\`\`\`bash
MODE=$(node ~/.claude/devflow/bin/df-tools.cjs config-get mode 2>/dev/null || echo "yolo")
AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
\`\`\`

When executor returns a checkpoint AND `MODE` is `"autonomous"`:
- **human-verify** → VERIFIER-DELEGATED. Spawn verifier agent (checkpoint verification mode) with the checkpoint's what-built + how-to-verify + plan ID. HARD CONSTRAINT passed in prompt: any dev server uses port 8091, never 8080.
  - verifier returns `status: passed` → spawn continuation agent with `{user_response}` = "approved (verifier evidence: {one-line summary})". Log `⚡ Verifier-approved: [checkpoint]`.
  - verifier returns `status: gaps_found` or `human_needed` → escalate to user: present checkpoint + full verifier report, wait for response (standard flow step 4).
- **decision** → handled by decision queue (TRD 10-04 wires this; until then fall through to standard flow — do NOT auto-select first option in autonomous mode).
- **human-action** → Present to user. Auth gates cannot be automated.

When `MODE` is not `"autonomous"` AND `AUTO_CFG` is `"true"` (legacy yolo — unchanged):
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-select first option (unchanged).
- **human-action** → Present to user.
```

**Verifier spawn prompt skeleton (mirror the executor spawn pattern at execute-objective.md:268-300):**

```
Task(
  subagent_type="verifier",
  model="{resolved_verifier_model}",
  prompt="
    <objective>
    CHECKPOINT VERIFICATION MODE — scoped functional pass, not full objective verification.
    Verify the checkpoint below and return structured status.
    </objective>

    <checkpoint_context>
    Plan: {plan_id} — {plan_name}
    What was built: {what-built from checkpoint}
    How to verify: {how-to-verify steps from checkpoint}
    </checkpoint_context>

    <constraints>
    - NEVER use port 8080 for anything. If a dev/verification server is needed, use port 8091.
    - Run only the checks needed to prove/disprove the how-to-verify steps. Do not re-verify the whole objective.
    </constraints>

    <output_format>
    Return: status: passed | gaps_found | human_needed, plus evidence (commands run, observed output, screenshots taken).
    </output_format>
  "
)
```
</codebase_examples>

<anti_patterns>
- Do NOT remove the legacy yolo blind-approve branch — yolo keeps current semantics (locked decision, item 6: "yolo keeps current semantics").
- Do NOT make autonomous human-verify "approve on verifier timeout/ambiguity" — ambiguity escalates to the user. Approve only on explicit `passed`.
- Do NOT wire checkpoint:decision parking here — that is TRD 10-04's file-ownership (it also edits execute-objective.md, in Wave 3). Leave a one-line forward reference only.
- Do NOT write `localhost:8080` in ANY example, even as a "bad example".
</anti_patterns>

<error_recovery>
- If the checkpoint_handling step structure has drifted from lines 377-421 (other TRDs merged first), locate it by the step name `<step name="checkpoint_handling">` — the step name is stable.
- If verifier.md Step 8 numbering shifted, anchor on the heading `## Step 8: Functional Verification (Backend-Aware)`.
</error_recovery>

</embedded_context>

<gotchas>
- `config-get mode` errors with "Key not found" on projects whose config.json lacks a `mode` key — the `|| echo "yolo"` fallback is mandatory in every snippet.
- verifier.md Step 8a examples use `localhost:3000` for user projects — that is acceptable (user-project ports vary). The new rule to add: port 8080 is NEVER acceptable; when DevFlow itself chooses a port (self-verification, checkpoint mode), it must be 8091.
- checkpoints.md golden rule 5 currently says "Auto-mode bypasses verification/decision checkpoints" — this sentence is the audit's smoking gun; it must be rewritten, not appended to.
</gotchas>

<tasks>

<task type="auto">
  <name>Three-branch checkpoint handler in execute-objective.md</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
In `<step name="checkpoint_handling">`: replace the "Auto-mode checkpoint handling" block (currently reads AUTO_CFG only, then blind-approves) with the three-branch structure from codebase_examples: (1) read both MODE and AUTO_CFG with shell fallbacks; (2) autonomous branch FIRST — human-verify → verifier delegation with the spawn prompt skeleton (include the port-8091 constraint verbatim and the structured-return contract), decision → one-line forward reference "parked via decision queue — wired in TRD 10-04; until wired, fall through to standard flow (never auto-select in autonomous mode)", human-action → present to user; (3) legacy yolo branch (MODE != autonomous AND AUTO_CFG true) — preserve existing blind-approve text byte-for-byte; (4) standard interactive flow unchanged.

Add to the autonomous human-verify branch: on `gaps_found`/`human_needed`, the escalation presents the checkpoint using the existing "Present to user" format (step 4 of standard flow) PLUS a `### Verifier Report` section with the verifier's evidence.

Commit `feat(10-02): verifier-delegated human-verify checkpoints in autonomous mode`.
  </action>
  <verify>grep -n 'config-get mode' plugins/devflow/devflow/workflows/execute-objective.md returns ≥1; grep -n 'Verifier-approved' returns 1; grep -c '8080' plugins/devflow/devflow/workflows/execute-objective.md returns 0; legacy text '⚡ Auto-approved checkpoint' still present (yolo branch)</verify>
  <done>Autonomous branch delegates human-verify to verifier and never blind-approves; yolo branch unchanged; interactive flow unchanged</done>
</task>

<task type="auto">
  <name>Checkpoint reference + verifier checkpoint-verification mode</name>
  <files>plugins/devflow/devflow/references/checkpoints.md, plugins/devflow/agents/verifier.md</files>
  <action>
**checkpoints.md:** Rewrite golden rule 5 in `<overview>` to describe three modes: interactive (present to user), yolo (`workflow.auto_advance` true, mode != autonomous: human-verify auto-approves, decision auto-selects first option — legacy), autonomous (`mode: "autonomous"`: human-verify is verifier-delegated and approved only on green machine evidence; decision is parked in the decision queue; human-action always stops). Add a short `<autonomous_checkpoints>` section after `<checkpoint_types>` summarizing: delegation flow, evidence requirement, escalation on failure, port 8091 rule for verification servers, and pointer to `references/unattended-operation.md` (created by TRD 10-09 — forward reference is fine).

**verifier.md:** Add a new section `<checkpoint_verification_mode>` (after `<role>`, before the main flow): when the spawn prompt contains `CHECKPOINT VERIFICATION MODE`, skip goal-backward objective verification and run ONLY a scoped functional pass derived from the checkpoint's how-to-verify steps, using Step 8a/8b tooling as appropriate; return `status: passed | gaps_found | human_needed` with evidence (commands, output, screenshots); `human_needed` is for checks machines genuinely cannot perform (subjective UX, audio quality). Add a hard rule in this section AND at the top of Step 8: "NEVER use port 8080 — it is permanently occupied on the operator's machine. When the verifier starts any server itself, bind port 8091."

Commit `docs(10-02): autonomous checkpoint semantics + verifier checkpoint mode`.
  </action>
  <verify>grep -n 'checkpoint_verification_mode' plugins/devflow/agents/verifier.md returns ≥1; grep -n '8091' plugins/devflow/agents/verifier.md returns ≥2; grep -c '8080' on both files returns only lines that forbid it (manual check: every 8080 mention is a prohibition, or zero matches); grep -n 'autonomous' plugins/devflow/devflow/references/checkpoints.md returns ≥2</verify>
  <done>Golden rule 5 describes three modes accurately; verifier has a documented scoped checkpoint mode with structured return and port rule</done>
</task>

</tasks>

<verification>
- `grep -rn "8080" plugins/devflow/devflow/workflows/execute-objective.md plugins/devflow/devflow/references/checkpoints.md plugins/devflow/agents/verifier.md` → zero matches, or only explicit prohibitions ("never use port 8080")
- `grep -n "Auto-approved checkpoint" plugins/devflow/devflow/workflows/execute-objective.md` → present (yolo back-compat preserved)
- `grep -n "subagent_type=\"verifier\"" plugins/devflow/devflow/workflows/execute-objective.md` → present in checkpoint_handling
- `npm test` → no regressions (markdown-only TRD; suite guards against accidental code edits)
</verification>

<success_criteria>
- [ ] Autonomous human-verify = verifier delegation, approve only on `passed`
- [ ] Failure/ambiguity escalates to user with verifier report
- [ ] Yolo semantics byte-preserved
- [ ] Verifier checkpoint mode documented with structured return contract
- [ ] Port 8091 mandated; 8080 absent or forbidden in all touched files
- [ ] 2 atomic commits
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-02-SUMMARY.md
</output>
