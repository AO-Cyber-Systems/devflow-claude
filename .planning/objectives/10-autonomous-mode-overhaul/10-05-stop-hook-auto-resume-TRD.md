---
objective: 10-autonomous-mode-overhaul
trd: 05
type: standard
confidence: high
wave: 3
depends_on: ["10-01", "10-03"]
files_modified:
  - plugins/devflow/hooks/verify-completion.js
  - plugins/devflow/hooks/verify-completion.test.js
autonomous: true
requirements: []

must_haves:
  truths:
    - "In autonomous mode with STATE.md showing mid-execution work, the Stop hook returns decision:'block' with a resume directive instead of allowing the session to end"
    - "Resume attempts are bounded: counter file .planning/.autonomous-resume-{objective} caps blocking at 3 attempts, then the hook allows stop and resets"
    - "The counter clears when execution completes cleanly (recent SUMMARY.md exists / STATE.md no longer mid-execution)"
    - "The hook NEVER blocks when: mode is not autonomous, no .planning dir, STATE.md not mid-execution, or all remaining work is parked on pending decisions"
    - "Existing warn-only SUMMARY scan and audit-log behavior is preserved byte-for-byte for non-autonomous projects"
  artifacts:
    - path: "plugins/devflow/hooks/verify-completion.js"
      provides: "autonomous resume logic: isAutonomousMode, readResumeCount/writeResumeCount/clearResumeCount, isMidExecution, hasPendingDecisionsOnly, block emission"
      exports: ["renderAuditEntry", "appendAuditLog", "auditLogPath", "findPlanningDir", "isAutonomousMode", "readResumeCount", "writeResumeCount", "clearResumeCount", "isMidExecution"]
    - path: "plugins/devflow/hooks/verify-completion.test.js"
      provides: "new test groups for resume counter, autonomous gating, block emission, decision-pending bypass"
      contains: "autonomous"
  key_links:
    - from: "verify-completion.js main()"
      to: ".planning/config.json mode field"
      via: "isAutonomousMode(planningDir) direct JSON read (hooks cannot require df-tools)"
      pattern: "config\\.json"
    - from: "verify-completion.js block path"
      to: "stdout JSON"
      via: "process.stdout.write(JSON.stringify({decision:'block', reason}))"
      pattern: "decision.*block"
    - from: "verify-completion.js"
      to: ".planning/.autonomous-resume-{objective}"
      via: "counter file read/increment/clear"
      pattern: "autonomous-resume"
---

<objective>
Upgrade the warn-only Stop hook to auto-resume interrupted autonomous runs (locked work item 3a). When the session tries to stop while STATE.md shows mid-execution work and mode is autonomous, the hook returns `decision: "block"` with a resume directive pointing Claude back at STATE.md — bounded at 3 attempts via a per-objective counter file so it can never loop forever (research Pitfall 2).

Purpose: Resume-after-context-reset is currently manual re-invocation only. This closes the largest unattended-operation gap.

Output: verify-completion.js with autonomous resume logic + extended test file. Existing audit-log + SUMMARY-scan behavior untouched.
</objective>

## Test list

Ordered outermost (subprocess hook invocation) → inner (pure helpers); happy → edge → failure:

**Subprocess integration (spawnSync node verify-completion.js with cwd = fixture project, stdin = payload JSON)**
1. Autonomous + STATE.md mid-execution ("Executing"/"In progress") + count 0 → stdout JSON `{decision:'block', reason:/resuming \(attempt 1\/3\)/}`, counter file = 1, exit 0
2. Same but counter at 3 → NO block JSON on stdout, counter file deleted (allow stop + reset)
3. mode yolo + mid-execution → no block (warn-only behavior preserved)
4. Autonomous + STATE.md NOT mid-execution → no block, counter cleared if present
5. Autonomous + mid-execution BUT pending decisions exist in .planning/decisions/pending/ AND reason text mentions them → no block; stderr note lists pending decision ids (work is human-gated, resuming is pointless)
6. Non-DevFlow dir (no .planning) → no output, exit 0 (existing contract)
7. Malformed config.json → treated as non-autonomous, no block, no crash
8. Existing audit-log behavior: entry still appended in autonomous block path (audit + block coexist)

**Pure helpers (in-process require)**
9. isAutonomousMode: true only for `{"mode":"autonomous"}`; false for yolo/missing/malformed
10. readResumeCount: missing file → 0; garbage content → 0; "2" → 2
11. writeResumeCount + clearResumeCount round-trip
12. isMidExecution: "Executing"/"In progress" in STATE.md → true; absent → false; missing STATE.md → false
13. Counter file is per-objective: `.autonomous-resume-10` and `.autonomous-resume-11` independent (objective number parsed from STATE.md "Objective" position line; fallback key 'current' when unparseable)

<file_tree>
plugins/devflow/hooks/
├── verify-completion.js                        ← MODIFY (add autonomous resume region; preserve existing regions)
└── verify-completion.test.js                   ← MODIFY (add autonomous test groups)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Counter pattern (10-RESEARCH.md Pattern 4 — adapt with per-objective key per research Open Question 4):**

```javascript
const MAX_RESUME_ATTEMPTS = 3;

function resumeCounterPath(planningDir, objectiveKey) {
  return path.join(planningDir, `.autonomous-resume-${objectiveKey}`);
}
function readResumeCount(planningDir, key) {
  try { return parseInt(fs.readFileSync(resumeCounterPath(planningDir, key), 'utf8').trim(), 10) || 0; } catch { return 0; }
}
function writeResumeCount(planningDir, key, count) {
  try { fs.writeFileSync(resumeCounterPath(planningDir, key), String(count)); } catch {}
}
function clearResumeCount(planningDir, key) {
  try { fs.unlinkSync(resumeCounterPath(planningDir, key)); } catch {}
}
```

**Config read in a hook — planningDir already IS the .planning path** (findPlanningDir returns `path.join(dir, '.planning')`). The research example had a path bug; correct form:

```javascript
function isAutonomousMode(planningDir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    return config.mode === 'autonomous';
  } catch { return false; }
}
```

**Block emission (official hook schema, research verified June 2026):**

```javascript
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `DevFlow autonomous mode: mid-execution state detected — resuming (attempt ${count + 1}/${MAX_RESUME_ATTEMPTS}). Read .planning/STATE.md for current position, then continue executing the in-flight objective via /devflow:execute-objective. Never use port 8080 for any verification server — use 8091.`
}));
```

**Existing test style (verify-completion.test.js):** node:test describe/test, spawnSync subprocess integration with tmp project dirs, in-process require for pure helpers. Extend the same file; reuse its tmp-dir setup helpers if present.

**Mid-execution detection:** reuse the exact string heuristic already in verify-commits.js:47 (`stateContent.includes('Executing') || stateContent.includes('In progress')`) so both hooks agree. Extract as `isMidExecution(planningDir)`.
</codebase_examples>

<anti_patterns>
- Do NOT block unconditionally — every block path must pass ALL gates: planningDir exists, autonomous true, mid-execution true, counter < 3, and NOT decisions-pending-only.
- Do NOT throw anywhere in main() — the hook must never crash the Stop event (existing contract: silent failure).
- Do NOT remove or reorder the existing scanRecentSummaries / emitAuditEntry calls.
- Do NOT scan transcripts or build a sentinel protocol — counter file only (research Don't-Hand-Roll).
- Fixtures hand-built; no property-based tests; no .feature files; no port 8080 anywhere (the reason string explicitly forbids it).
</anti_patterns>

<error_recovery>
- If existing subprocess tests in verify-completion.test.js rely on stdout being EMPTY, scope those assertions to non-autonomous fixtures — the block JSON is new, legitimate stdout for autonomous fixtures only.
- If stdout JSON parsing in Claude Code conflicts with console.error warnings, keep warnings on stderr (they already are — console.error) and JSON alone on stdout.
</error_recovery>

</embedded_context>

<gotchas>
- `findPlanningDir()` returns the `.planning` directory itself — config is at `path.join(planningDir, 'config.json')`, NOT `planningDir/../.planning/...` (research code sample had this wrong).
- Pending-decisions bypass (test 5): if `.planning/decisions/pending/` has files AND the only incomplete work is parked plans, blocking would loop uselessly — Claude can't resolve decisions for the user. Conservative implementation: when pending decisions exist, still block ONCE with a reason that includes the pending ids and resume directive for independent work, but on the NEXT attempt (counter ≥ 1 with pending decisions unchanged) allow stop. Simplest correct form: subtract nothing, just include pending ids in reason and let the 3-cap bound it — choose this simpler form, and assert in test 5 only that pending ids appear in the reason (adjust test 5: block IS emitted, reason lists pending decisions). Document the choice in the SUMMARY.
- Clean-completion clearing: clear the counter when `isMidExecution` is false (test 4) — this is the "execution completed" signal; don't try to diff SUMMARY mtimes.
- The objective key comes from STATE.md's "## Current Position" section; STATE.md formats drift — parse defensively, fall back to 'current'.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Failing tests for autonomous resume behavior</name>
  <files>plugins/devflow/hooks/verify-completion.test.js</files>
  <action>
RED: extend verify-completion.test.js with the 13-case Test list (new describe groups: 'autonomous resume — subprocess', 'autonomous resume — helpers'). Build fixture projects with hand-built helpers in the test file (tmpdir + .planning + config.json + STATE.md with/without "Executing" + optional decisions/pending/DECISION-001.md) — reuse buildPlanningDirWithConfig from lib/__fixtures__/autonomous-fixtures.cjs via relative require if the path resolves cleanly from hooks/, otherwise define a local builder (hooks tests are self-contained by convention, see statusline.test.js). Apply the gotcha adjustment to test 5 (block emitted, reason lists pending decision ids). Run: new cases fail (helpers not exported yet). Commit `test(10-05): add failing tests for Stop-hook autonomous resume`.
  </action>
  <verify>node --test plugins/devflow/hooks/verify-completion.test.js → pre-existing cases green, new cases red</verify>
  <done>13 cases encode the full gating + bounding contract before implementation</done>
</task>

<task type="auto" tdd="true">
  <name>Autonomous resume logic in verify-completion.js</name>
  <files>plugins/devflow/hooks/verify-completion.js</files>
  <action>
GREEN: add a new region `// ─── Autonomous resume (Stop-hook decision:block, TRD 10-05) ───` implementing: `isAutonomousMode`, `isMidExecution`, `readResumeCount`/`writeResumeCount`/`clearResumeCount` (per-objective key parsed from STATE.md, fallback 'current'), `listPendingDecisions(planningDir)` (readdir decisions/pending, return basenames, [] on missing). Extend main(): after the existing scanRecentSummaries + emitAuditEntry calls, run the resume gate chain — not autonomous → return; not mid-execution → clearResumeCount + return; counter ≥ 3 → clearResumeCount + return (allow stop); else increment counter and emit the block JSON (reason includes attempt n/3, STATE.md directive, pending decision ids when present, and the port-8091 rule). Wrap the whole region in try/catch (never crash Stop). Extend module.exports with the new helpers. Commit `feat(10-05): Stop hook auto-resumes mid-execution autonomous runs (bounded 3 attempts)`.
  </action>
  <verify>node --test plugins/devflow/hooks/verify-completion.test.js → all green; npm test → no regressions; manual: echo '{}' | node plugins/devflow/hooks/verify-completion.js in a non-DevFlow tmpdir produces no stdout</verify>
  <done>Stop hook blocks with resume directive under exactly the gated conditions, bounded at 3, self-clearing</done>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/hooks/verify-completion.test.js` → all cases green
- `npm test` → no regressions
- `grep -n "8080" plugins/devflow/hooks/verify-completion.js` → only the prohibition inside the reason string ("Never use port 8080"), or zero
- Bounded-loop proof: run the hook 4× against the same autonomous mid-execution fixture → blocks on runs 1-3, allows stop on run 4, counter file gone
</verification>

<success_criteria>
- [ ] decision:'block' emitted only when all gates pass
- [ ] 3-attempt cap with per-objective counter file, self-clearing on completion and on cap
- [ ] Pending decisions surfaced in the resume reason
- [ ] Warn-only + audit behavior preserved for everything else
- [ ] 2 atomic commits (test + feat)
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-05-SUMMARY.md
</output>
