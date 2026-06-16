---
objective: 10-autonomous-mode-overhaul
trd: 04
type: standard
confidence: medium
wave: 3
depends_on: ["10-02", "10-03"]
files_modified:
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/references/trd-spec.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "In autonomous mode, checkpoint:decision is parked via df-tools decision-queue add (context, options, recommendation), the user is notified, and execution continues with TRDs/waves that do not depend on the answer"
    - "Executor Rule 4 architectural stops are parked the same way in autonomous mode — queued, never auto-selected, never silently dropped"
    - "Wave failure handling in autonomous mode is retry-once with failure feedback, then dependency-aware skip of only the dependent TRDs, with a final report listing failed + skipped + parked items"
    - "The decision_gate TRD frontmatter field is documented in trd-spec.md so planners can link TRDs to pending decisions"
    - "Interactive and yolo failure/decision behavior is unchanged"
  artifacts:
    - path: "plugins/devflow/devflow/workflows/execute-objective.md"
      provides: "decision parking branch, dependency-aware continuation, autonomous wave-failure retry/skip protocol"
      contains: "decision-queue add"
    - path: "plugins/devflow/agents/executor.md"
      provides: "Rule 4 structured return (options + recommendation) suitable for queuing"
    - path: "plugins/devflow/devflow/references/trd-spec.md"
      provides: "decision_gate frontmatter field documentation"
      contains: "decision_gate"
  key_links:
    - from: "execute-objective.md checkpoint_handling (decision branch)"
      to: "df-tools decision-queue add"
      via: "bash invocation with --blocks/--independent computed from decision_gate + depends_on"
      pattern: "decision-queue add"
    - from: "execute-objective.md failure handler (step 7)"
      to: "dependency-aware skip"
      via: "depends_on transitive closure from objective-job-index"
      pattern: "retry once"
    - from: "executor.md Rule 4"
      to: "structured checkpoint return"
      via: "options + recommendation fields in the return format"
      pattern: "recommendation"
---

<objective>
Wire the decision queue into the execution orchestrator and replace the wave-failure "Continue?/Stop?" prompt (locked work items 2-wiring and 3c). After this TRD, an unattended run never halts on a design decision (it parks and continues independent work) and never halts on a mechanical failure (it retries once, then skips only the dependent TRDs).

Purpose: Wave dependency data already exists in the orchestrator (`objective-job-index` reads `depends_on`); the decision queue (10-03) and verifier delegation (10-02) are landed. This TRD connects them.

Output: Updated checkpoint decision branch + autonomous failure protocol in execute-objective.md, structured Rule 4 return in executor.md, decision_gate documented in trd-spec.md. Markdown/prompt changes only.
</objective>

<file_tree>
plugins/devflow/devflow/workflows/
└── execute-objective.md                        ← MODIFY (checkpoint decision branch from 10-02's forward-ref; step 7 failure handler)
plugins/devflow/agents/
└── executor.md                                 ← MODIFY (Rule 4 structured return)
plugins/devflow/devflow/references/
└── trd-spec.md                                 ← MODIFY (decision_gate field docs)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Current failure handler (execute-objective.md:366-371, step 7):**

```markdown
For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.
```

**Target autonomous failure protocol (research item 3c):**

```markdown
For real failures in autonomous mode (`MODE` = "autonomous"):
1. RETRY ONCE: re-spawn a fresh executor for the failed plan with a `<failure_feedback>` block
   (what failed: spot-check results, error output, missing artifacts from the failed attempt).
2. If the retry also fails: compute the dependent set — all TRDs whose `depends_on` transitively
   includes the failed plan (use the wave/depends_on data already loaded from objective-job-index).
3. SKIP only the dependent set. Continue executing all independent TRDs in remaining waves.
4. Final report: table of completed / failed (with last error) / skipped (with blocking failure id)
   / parked decisions. Never ask "Continue?/Stop?" mid-run.

For real failures NOT in autonomous mode: existing behavior (ask "Continue?" or "Stop?") — unchanged.
```

**Decision parking branch (replaces 10-02's forward reference in the autonomous checkpoint block):**

```markdown
- **decision** → PARK, NOTIFY, CONTINUE INDEPENDENT.
  1. Park: run
     node ~/.claude/devflow/bin/df-tools.cjs decision-queue add \
       --objective {N} --trd {plan_id} --wave {W} \
       --title "{decision summary}" --context "{context from checkpoint}" \
       --options "{option ids, comma-separated}" --recommendation "{first/recommended option}" \
       --blocks "{TRD ids gated on this decision}" --independent "{remaining TRD ids}"
     (--blocks = TRDs whose frontmatter carries decision_gate matching this decision, plus their
     depends_on transitive closure; when no TRD declares a gate, --blocks is the remainder of the
     PARKED PLAN ONLY and everything else is independent. df-tools decision-queue add fires the
     OS notification itself.)
  2. Mark the parked plan paused in the wave table (status: ⏸ parked on DECISION-NNN).
  3. Continue: proceed to the next wave, executing every TRD not in the blocked set.
  4. Aggregate report lists pending decisions with their `/devflow:decide` resolve commands.
```

**Current Rule 4 return (executor.md ~line 147):** "STOP → return checkpoint with: what found, proposed change, why needed, impact, alternatives." — extend to a queueable shape.
</codebase_examples>

<anti_patterns>
- Do NOT auto-select any option in autonomous mode — that is the exact behavior this objective removes. Parking is the only autonomous handling for decisions.
- Do NOT remove Rule 4 stops — they are queued, not removed (OBJECTIVE.md Notes: "Rule 4 architectural stops (queued, not removed)").
- Do NOT touch the human-verify branch added by 10-02 — file ownership within execute-objective.md: this TRD owns the decision branch + step 7 only.
- Do NOT halt all waves when a decision is parked (research Pitfall 3) — only the blocked set waits.
- Interactive/yolo paths byte-preserved.
</anti_patterns>

<error_recovery>
- If 10-02's forward-reference text ("parked via decision queue — wired in TRD 10-04") is not found verbatim, anchor on the autonomous checkpoint block's `- **decision**` bullet.
- If trd-spec.md has a frontmatter field table, add decision_gate there; if it documents fields as prose sections, follow the surrounding format.
</error_recovery>

</embedded_context>

<gotchas>
- The blocked-set computation at orchestrator level is prompt-driven (the orchestrator already holds wave/depends_on data in context from objective-job-index) — it does NOT need to shell out to computeBlockedSet for the parking call; it passes --blocks/--independent explicitly. computeBlockedSet exists for resume-time recomputation by /devflow:decide and future tooling.
- A checkpoint:decision usually arrives MID-plan: the remainder of that plan is inherently blocked (the continuation agent needs the answer). The minimum blocked set is therefore always the parked plan itself.
- Executor Rule 4 stops surface as agent returns, not checkpoint tasks — the orchestrator must treat a Rule 4 return in autonomous mode identically to checkpoint:decision (park with type: rule-4-deviation).
- Port 8080 must not appear in any example added; use 8091 if a port example is needed.
</gotchas>

<tasks>

<task type="auto">
  <name>Decision parking + dependency-aware continuation in execute-objective.md</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
In the autonomous checkpoint block (added by 10-02), replace the decision forward-reference with the full PARK/NOTIFY/CONTINUE-INDEPENDENT protocol from codebase_examples (df-tools decision-queue add invocation with all flags, paused status in wave table, continue independent waves, aggregate report section listing pending decisions with `/devflow:decide DECISION-NNN <choice>` commands). Also add: Rule 4 deviation returns from executors in autonomous mode are parked identically (type: rule-4-deviation, options = executor's alternatives, recommendation = executor's proposed change).

Extend the `aggregate_results` step's report template with a `### Pending Decisions` section (id, title, blocked TRDs, resolve command) shown whenever `.planning/decisions/pending/` is non-empty.

Commit `feat(10-04): park decisions and continue independent waves in autonomous mode`.
  </action>
  <verify>grep -n 'decision-queue add' plugins/devflow/devflow/workflows/execute-objective.md ≥1; grep -n 'Pending Decisions' ≥1; grep -n 'rule-4-deviation' ≥1; grep -c 8080 = 0; 10-02's verifier-delegation block untouched (grep 'Verifier-approved' still present)</verify>
  <done>Autonomous decision checkpoints park with full context and execution continues for the independent set</done>
</task>

<task type="auto">
  <name>Autonomous wave-failure protocol (retry-once + dependency-aware skip)</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
In step 7 ("Handle failures") of execute_waves: keep the classifyHandoffIfNeeded bug paragraph and the non-autonomous "Continue?/Stop?" text, then add the autonomous protocol from codebase_examples — retry once with `<failure_feedback>` block (spot-check results, error output, failed attempt's partial commits), then transitive dependency skip, then continue, then final report table (completed / failed / skipped / parked). State explicitly: the orchestrator computes the dependent set from the depends_on data already loaded via objective-job-index; a skipped TRD is reported with the id of the failure that blocked it. Also update step 6's spot-check failure routing ("ask Retry plan? or Continue with remaining waves?") to route into this same autonomous protocol when MODE=autonomous.

Commit `feat(10-04): retry-once then dependency-aware skip for autonomous wave failures`.
  </action>
  <verify>grep -n 'retry once\|Retry once\|RETRY ONCE' plugins/devflow/devflow/workflows/execute-objective.md ≥1 in step 7; grep -n 'failure_feedback' ≥1; non-autonomous '"Continue?" or "Stop?"' text still present; grep -c 8080 = 0</verify>
  <done>Unattended runs never prompt on mechanical failure; only dependents are skipped and everything is reported at the end</done>
</task>

<task type="auto">
  <name>Executor Rule 4 structured return + decision_gate spec</name>
  <files>plugins/devflow/agents/executor.md, plugins/devflow/devflow/references/trd-spec.md</files>
  <action>
**executor.md:** Extend RULE 4's Action line: the checkpoint return MUST be queueable — structured fields: `decision:` (one-line what's being decided), `context:` (what found, why needed, impact), `options:` (2+ named options, each with pros/cons — current approach as option-a, proposed change as option-b, plus alternatives), `recommendation:` (executor's pick + one-line rationale). Add a note: "In autonomous mode the orchestrator parks this return in the decision queue and continues independent work — your structured return IS the decision file content, so make options self-contained."

**trd-spec.md:** Document the new optional frontmatter field `decision_gate: DECISION-NNN` — set by the planner on TRDs that cannot start until a parked decision is resolved; consumed by execute-objective's blocked-set computation and `df-tools decision-queue` computeBlockedSet; absent = independent. Include a 3-line frontmatter example.

Commit `docs(10-04): queueable Rule 4 return + decision_gate frontmatter field`.
  </action>
  <verify>grep -n 'recommendation' plugins/devflow/agents/executor.md ≥1 in the Rule 4 section; grep -n 'decision_gate' plugins/devflow/devflow/references/trd-spec.md ≥2; npm test no regressions</verify>
  <done>Rule 4 returns are park-ready; planners have a documented field to gate TRDs on decisions</done>
</task>

</tasks>

<verification>
- `grep -rn "8080" plugins/devflow/devflow/workflows/execute-objective.md plugins/devflow/agents/executor.md plugins/devflow/devflow/references/trd-spec.md` → zero or prohibition-only
- `grep -n "first option" plugins/devflow/devflow/workflows/execute-objective.md` → appears ONLY in the legacy yolo branch
- `npm test` → no regressions
- Read-through: autonomous flow has no remaining mid-run user prompt except human-action and escalated verifier failures
</verification>

<success_criteria>
- [ ] checkpoint:decision parks with full context + notification, independent waves continue
- [ ] Rule 4 stops parked (queued, not removed) in autonomous mode
- [ ] Wave failure: retry-once → dependency-aware skip → end-of-run report
- [ ] decision_gate documented in trd-spec.md
- [ ] Interactive + yolo behavior unchanged
- [ ] 3 atomic commits
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-04-SUMMARY.md
</output>
