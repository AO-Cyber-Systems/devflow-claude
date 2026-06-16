---
objective: 10-autonomous-mode-overhaul
trd: 06
type: standard
confidence: high
wave: 3
depends_on: ["10-01"]
files_modified:
  - plugins/devflow/hooks/verify-commits.js
  - plugins/devflow/hooks/verify-commits.test.js
autonomous: true
requirements: []

must_haves:
  truths:
    - "In autonomous mode, a subagent that produced no commits in 10 minutes while STATE.md shows mid-execution is blocked ONCE (SubagentStop decision:'block') with failure feedback so it retries"
    - "The retry is bounded to exactly one per agent via marker file .planning/.autonomous-retry-{agentId} — second SubagentStop for the same agent always allows stop"
    - "Stale retry markers (>1 hour old) are cleaned up as a safety net"
    - "Non-autonomous behavior is unchanged: warn-only stderr message, no block JSON ever"
    - "The hook never crashes or blocks the event on error"
  artifacts:
    - path: "plugins/devflow/hooks/verify-commits.js"
      provides: "autonomous retry-once logic with per-agent marker files; exported helpers for tests"
      exports: ["findPlanningDir", "hasRecentCommits", "isMidExecution", "isAutonomousMode", "retryMarkerPath", "cleanStaleMarkers"]
    - path: "plugins/devflow/hooks/verify-commits.test.js"
      provides: "first-ever test file for verify-commits hook"
      contains: "describe('verify-commits"
  key_links:
    - from: "verify-commits.js main()"
      to: "SubagentStop block JSON"
      via: "hookSpecificOutput { hookEventName:'SubagentStop', decision:'block', reason }"
      pattern: "hookSpecificOutput"
    - from: "verify-commits.js"
      to: ".planning/.autonomous-retry-{agentId}"
      via: "marker existence check before block"
      pattern: "autonomous-retry"
    - from: "verify-commits.js"
      to: "stdin payload agent_id"
      via: "readStdin + JSON.parse (mirror verify-completion.js parsePayload)"
      pattern: "agent_id"
---

<objective>
Upgrade the warn-only SubagentStop hook to retry a failed executor once with failure feedback (locked work item 3b). When an executor subagent stops with no commits in 10 minutes during mid-execution autonomous work, the hook blocks once — the platform re-prompts the subagent with the reason — then always allows the second stop.

Purpose: Transient executor failures (context exhaustion mid-task, flaky first attempt) currently surface as silent no-commit stops the user discovers later. One bounded retry recovers most of them for free.

Output: verify-commits.js rewritten with gated retry logic + verify-commits.test.js (first test file for this hook).
</objective>

## Test list

Ordered outermost (subprocess) → inner (helpers); happy → edge → failure:

**Subprocess integration (spawnSync, cwd = fixture project, stdin = payload with agent_id)**
1. Autonomous + mid-execution + no recent commits + no marker → stdout JSON `{hookSpecificOutput:{hookEventName:'SubagentStop', decision:'block', reason:/no commits/}}`, marker file created, exit 0
2. Same agent_id, marker exists → no block JSON (retry already used), exit 0
3. Different agent_id, no marker for it → blocks independently (per-agent bounding)
4. mode yolo + no commits + mid-execution → stderr warning only (existing behavior preserved verbatim), no stdout JSON
5. Autonomous + recent commits exist → no block, no warning
6. Autonomous + STATE.md not mid-execution → no block
7. Non-DevFlow dir → silent no-op
8. Payload missing agent_id → falls back to 'unknown' key, still bounded once
9. git unavailable / not a repo in fixture → silent no-op (existing try/catch contract)

**Helpers (in-process)**
10. retryMarkerPath sanitizes agentId (path traversal chars stripped — agent_id is external input written into a filename)
11. cleanStaleMarkers removes markers older than 1 hour, keeps fresh ones
12. isAutonomousMode / isMidExecution behave as in 10-05 (same contracts)

<file_tree>
plugins/devflow/hooks/
├── verify-commits.js                           ← MODIFY (gated retry-once region; preserve warn path)
└── verify-commits.test.js                      ← CREATE (first-ever test file for this hook)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**SubagentStop block emission (10-RESEARCH.md, official schema verified June 2026):**

```javascript
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SubagentStop',
    decision: 'block',
    reason: 'DevFlow autonomous mode: executor produced no commits in the last 10 minutes during mid-execution work. Retry once: re-read your TRD/plan file, check git status for uncommitted work, commit completed tasks atomically, and write SUMMARY.md. If genuinely blocked, return a structured failure report instead of stopping silently. Never use port 8080 for anything — use 8091.'
  }
}));
```

NOTE the schema difference from the Stop hook: SubagentStop wraps decision/reason inside `hookSpecificOutput` (research Pattern 5); the Stop hook (10-05) emits top-level `{decision, reason}`.

**Per-agent marker (research Pattern 5):**

```javascript
const agentId = String(payload.agent_id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
const marker = path.join(planningDir, `.autonomous-retry-${agentId}`);
if (fs.existsSync(marker)) return; // already retried once → allow stop
fs.writeFileSync(marker, String(Date.now()));
```

**Stdin payload parsing — mirror verify-completion.js:**

```javascript
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } }
function parsePayload() { try { return JSON.parse(readStdin() || '{}'); } catch { return {}; } }
```

**Existing logic to preserve (verify-commits.js:33-53):** the `git log --oneline --since="10 minutes ago"` check, the STATE.md `Executing`/`In progress` heuristic, and the stderr warning text — these stay as the non-autonomous path.

**Config read:** same `isAutonomousMode(planningDir)` as 10-05 — `path.join(planningDir, 'config.json')` direct JSON read (planningDir IS the .planning path). Hooks are standalone; duplicate the small helper rather than importing across hook files (each hook is self-contained by convention — see statusline.js nested try/catch precedent).
</codebase_examples>

<anti_patterns>
- Do NOT retry more than once — no counter loops here; marker existence is the entire bound.
- Do NOT block in yolo or interactive mode under any input.
- Do NOT let the hook throw — wrap the new region in try/catch; the existing "Silently fail — hook should never block" contract is the governing rule.
- Do NOT write agent_id into a filename unsanitized (test 10 guards this).
- Hand-built fixtures; no property-based tests; no .feature files; port 8080 only as prohibition text.
</anti_patterns>

<error_recovery>
- Marker cleanup on success: SubagentStop has no reliable "success" signal in-hook; rely on (a) the 1-hour stale sweep run at the top of main() and (b) the gitignore pattern from 10-01 so markers never pollute commits. Do not attempt SUMMARY-mtime correlation.
- If fixture git repos make `--since` flaky in CI, create the fixture commit with `GIT_COMMITTER_DATE`/`GIT_AUTHOR_DATE` env or assert via the helper seam instead of real git timing.
</error_recovery>

</embedded_context>

<gotchas>
- The existing hook calls `main()` unconditionally at module load (line 59: `main();` with no `require.main` guard) — requiring it from tests would execute main. Add the `if (require.main === module) main();` guard + `module.exports` as part of this TRD (mirrors verify-completion.js structure).
- `execSync('git log --since=...')` runs in process.cwd() — fixture subprocess tests must `git init` + commit inside the tmp project for case 5.
- The block reason is the ONLY feedback channel to the retried subagent — make it actionable (re-read plan, check git status, commit, SUMMARY.md), not just descriptive.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Failing tests for SubagentStop retry-once</name>
  <files>plugins/devflow/hooks/verify-commits.test.js</files>
  <action>
RED: create verify-commits.test.js (first-ever — model file layout on statusline.test.js / verify-completion.test.js): hand-built fixture helpers (tmp project with .planning/config.json, STATE.md, optional `git init` + dated commit), subprocess group covering Test list 1-9 (pipe payload JSON via stdin, parse stdout for the hookSpecificOutput shape), helper group covering 10-12 (in-process require — will fail until exports exist). Run: red. Commit `test(10-06): add failing tests for SubagentStop retry-once`.
  </action>
  <verify>node --test plugins/devflow/hooks/verify-commits.test.js → red on new behavior, no crash on collection</verify>
  <done>12 cases encode the retry-once contract including sanitization and stale cleanup</done>
</task>

<task type="auto" tdd="true">
  <name>Retry-once implementation in verify-commits.js</name>
  <files>plugins/devflow/hooks/verify-commits.js</files>
  <action>
GREEN: restructure verify-commits.js — extract `hasRecentCommits()`, `isMidExecution(planningDir)`, add `isAutonomousMode(planningDir)`, `parsePayload()`, `retryMarkerPath(planningDir, agentId)` (with sanitization), `cleanStaleMarkers(planningDir)` (1-hour threshold). main(): find planningDir → cleanStaleMarkers → evaluate (no recent commits AND mid-execution); if autonomous: marker-gate then emit the hookSpecificOutput block JSON + write marker; else: existing stderr warning verbatim. Add `if (require.main === module) main();` guard + module.exports for the helpers. Entire new logic inside try/catch. Commit `feat(10-06): SubagentStop retries failed executor once with feedback`.
  </action>
  <verify>node --test plugins/devflow/hooks/verify-commits.test.js → all green; npm test → no regressions; manual: echo '{"agent_id":"x"}' | node plugins/devflow/hooks/verify-commits.js in non-DevFlow tmpdir → no output</verify>
  <done>One bounded retry per agent in autonomous mode; warn-only everywhere else; markers self-cleaning</done>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/hooks/verify-commits.test.js` → all green
- `npm test` → no regressions
- Double-invocation proof: same fixture + same agent_id twice → block then allow
- `grep -n "8080" plugins/devflow/hooks/verify-commits.js` → prohibition-only or zero
</verification>

<success_criteria>
- [ ] hookSpecificOutput SubagentStop schema (NOT top-level decision) used for the block
- [ ] Exactly one retry per agent_id, sanitized marker filenames, 1-hour stale sweep
- [ ] Yolo/interactive warn-only path byte-preserved
- [ ] require.main guard + exports added
- [ ] 2 atomic commits (test + feat)
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-06-SUMMARY.md
</output>
