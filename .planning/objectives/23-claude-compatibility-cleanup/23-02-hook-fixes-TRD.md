---
objective: 23-claude-compatibility-cleanup
trd: 02
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/route-intent.test.js
  - plugins/devflow/hooks/gate-commits.js
  - plugins/devflow/hooks/gate-commits.test.js
  - plugins/devflow/hooks/statusline.js
autonomous: true
requirements: [SCOPE-4, SCOPE-5, SCOPE-6B]
must_haves:
  truths:
    - "route-intent.js injects a compact directive of <=400 bytes per matched prompt (was 1564 bytes) and all renderDirective test assertions still pass meaningfully"
    - "Raw `git commit` is DENIED in a project whose .planning/ contains ROADMAP.md or objectives/ even when STATE.md is absent"
    - "A manually created bare .planning/ (no ROADMAP.md, no objectives/) passes through ungated"
    - "statusline.js holds module-level cache variables for the stateLib path and module; existing statusline tests stay green"
  artifacts:
    - "plugins/devflow/hooks/route-intent.js — compact renderDirective"
    - "plugins/devflow/hooks/gate-commits.js — initialization check on ROADMAP.md/objectives/"
    - "plugins/devflow/hooks/gate-commits.test.js — new test file (none exists today)"
  key_links:
    - "route-intent.test.js assertions updated DELIBERATELY: OBLIGATORY, DEVFLOW, 'gate-edits.js will DENY', skill name, box corners all still asserted against the compact output"
    - "gate-commits deny payload keeps the hookSpecificOutput PreToolUse permissionDecision shape"
---

<objective>
Three independent hook fixes: shrink the route-intent per-prompt injection from ~1.5KB to ≤400 bytes, fix the gate-commits bypass (gate stood down whenever STATE.md was absent), and add a module-level stateLib cache to statusline.js.

Purpose: route-intent's box directive costs ~1.5KB on every matched prompt; gate-commits has a real enforcement hole; statusline re-resolves the watcher-state lib every render.
Output: Three hardened hooks + a from-scratch gate-commits test suite + updated route-intent tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
gate-commits.js deny shape (KEEP this output contract):

```js
function deny(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
```

The buggy check (gate-commits.js lines 67-70 — REPLACE):

```js
const stateFile = path.join(planningDir, 'STATE.md');
const stateExists = fs.existsSync(stateFile);
if (!stateExists) return; // Planning dir exists but uninitialized — don't interfere
```

statusline.js current per-render resolution (lines 95-97, inside the daemon.status_line branch):

```js
const stateLibPath = path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs');
if (fs.existsSync(stateLibPath)) {
  const stateLib = require(stateLibPath);
```
</codebase_examples>

<anti_patterns>
- Do NOT change matchIntent, INTENT_MAP, findPlanningDir, or the module.exports surface of route-intent.js — only renderDirective shrinks. Tests pin INTENT_MAP shape (>=10 entries, consolidated skills present, no deprecated names).
- Do NOT delete or weaken route-intent test assertions to make the compact format pass — the rewrite must SATISFY them (research Pitfall 3). Update assertions deliberately only where they pin dropped decoration (e.g., a `╠` divider check, exact line counts).
- Do NOT build a custom LRU/TTL cache in statusline.js — Node `require()` is already memoized; a plain module-level variable pair is the entire fix.
- Do NOT gate commits on `.planning/` existence alone — that is the current pass-through for non-initialized dirs and must remain.
</anti_patterns>

<error_recovery>
- If the compact directive truncates a long multi-skill list (e.g., two matched skills), widen rows adaptively to the longest content line rather than truncating skill names — byte budget still lands far under 400 for realistic inputs.
- If gate-commits tests are flaky due to cwd resolution, pass `cwd:` to spawnSync pointing at the tmp project dir; findPlanningDir walks up from process.cwd().
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/23-claude-compatibility-cleanup/OBJECTIVE.md
@plugins/devflow/hooks/route-intent.js
@plugins/devflow/hooks/gate-commits.js
@plugins/devflow/hooks/statusline.js
</context>

<research_context>
From 23-RESEARCH.md (HIGH confidence):
- renderDirective currently outputs 1082 chars / 1564 bytes over 15 lines. Seven pinned assertions: returns string; contains "OBLIGATORY"; contains "DEVFLOW"; contains "gate-edits.js will DENY"; contains the passed-in skill name; contains `╔`; contains `╚`.
- Reference compact implementation (research Code Examples) emits ~210 bytes: 5 lines — top border, `DEVFLOW ROUTING — OBLIGATORY`, `Use <skillList>`, `gate-edits.js will DENY ambient edits`, bottom border.
- gate-commits fix (research Code Examples): `const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md')); const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives')); if (!roadmapExists && !objectivesDirExists) return;` — both files are created only by new-project; either proves DevFlow initialization.
- gate-commits has NO existing tests; write new. statusline tests are subprocess-based and transparent to a module-level cache.
- statusline cache shape: module-level `let _stateLib = null; let _stateLibPath = null;` — compute path once, require once, reuse within the process.
</research_context>

<gotchas>
- route-intent.test.js may contain assertions BEYOND the seven enumerated (e.g., on the `╠` divider or padding). Read the full `renderDirective` describe block first; for each assertion decide keep-as-is (compact output satisfies it) or rewrite deliberately (assertion pins dropped decoration). Never delete an assertion without replacing its intent.
- The status skill routes (`/devflow:status resume`, `/devflow:status pause`) flow through INTENT_MAP regexes on prompt text, not descriptions — renderDirective changes cannot affect routing.
- 12 pre-existing test failures in daemon/watcher/peer-scan/novel-domain suites — do not fix, do not worsen.
- Hand-built fixtures only (no_llm_test_data); descriptive test names (no gherkin, no property-based libs).
- HARD CONSTRAINT: never use port 8080 anywhere; use 8091 if a port is ever needed (none expected here).
</gotchas>

## Test list

gate-commits.test.js (new file — subprocess spawn pattern, JSON piped to stdin, tmp project dirs hand-built):

1. Bare `.planning/` (no ROADMAP.md, no objectives/, no STATE.md) + `git commit -m x` → empty stdout (pass through).
2. `.planning/ROADMAP.md` present, STATE.md ABSENT + `git commit -m x` → deny JSON (`permissionDecision: "deny"`) — the bypass fix.
3. `.planning/objectives/` dir present, no ROADMAP.md, no STATE.md + `git commit -m x` → deny JSON.
4. DevFlow-initialized project + `DEVFLOW_ALLOW_RAW_COMMIT=1` → pass through.
5. DevFlow-initialized project + command `node ~/.claude/devflow/bin/df-tools.cjs commit "msg"` → pass through (wrapper allowed).
6. DevFlow-initialized project + non-commit command (`git status`) → pass through.
7. tool_name !== "Bash" → pass through.
8. No `.planning/` anywhere up the tree → pass through.

route-intent.test.js (updates to existing suite):

9. Existing renderDirective assertions all pass against compact output (OBLIGATORY, DEVFLOW, gate-edits.js will DENY, skill name, ╔, ╚, string type).
10. NEW: `Buffer.byteLength(renderDirective(['/devflow:debug']), 'utf8') <= 400`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Compact renderDirective + deliberate test updates</name>
  <files>plugins/devflow/hooks/route-intent.js, plugins/devflow/hooks/route-intent.test.js</files>
  <action>
1. Read the full `renderDirective` describe block in route-intent.test.js. Add the new byte-budget assertion (Test-list #10) FIRST and run — it must fail at 1564 bytes (RED).
2. Replace `renderDirective` in route-intent.js with the compact 5-line box from research Code Examples: top border `╔══...╗`, row `DEVFLOW ROUTING — OBLIGATORY`, row `Use <skillList>`, row `gate-edits.js will DENY ambient edits`, bottom border `╚══...╝`. Make inner width adapt to the longest content line (min 38) so multi-skill lists don't truncate. Keep `padEnd` if still used; drop `BOX_DIV` and the padding rows. Do not touch INTENT_MAP, matchIntent, findPlanningDir, main, or module.exports.
3. For any existing assertion that pins dropped decoration (e.g., `╠` divider, specific line text like "This is a DEVFLOW project"), rewrite it deliberately to assert the compact format's equivalent intent — with a comment noting the 23-02 rewrite. Keep all seven core assertions verbatim-satisfiable.

# CRITICAL: every required string (OBLIGATORY, DEVFLOW, gate-edits.js will DENY, skill name, ╔, ╚) must appear in the compact output — draft the string and grep it before writing (research Pitfall 3).

Run `node --test plugins/devflow/hooks/route-intent.test.js` — all pass.

Commit: `feat(23-02): compact route-intent directive to <=400 bytes`
  </action>
  <verify>node --test plugins/devflow/hooks/route-intent.test.js passes; node -e "const {renderDirective}=require('./plugins/devflow/hooks/route-intent.js'); console.log(Buffer.byteLength(renderDirective(['/devflow:debug']),'utf8'))" prints <=400</verify>
  <done>Directive <=400 bytes, all route-intent tests green, INTENT_MAP/matchIntent untouched</done>
  <recovery>If an assertion cannot be satisfied by any <=400-byte format (unlikely — research confirms ~210 bytes suffices), keep the assertion's intent and grow the box minimally; the 400-byte ceiling is the locked scope bound.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: gate-commits initialization fix + new test suite</name>
  <files>plugins/devflow/hooks/gate-commits.test.js, plugins/devflow/hooks/gate-commits.js</files>
  <action>
1. Create gate-commits.test.js implementing Test-list cases 1-8. Harness: `fs.mkdtempSync` tmp project dirs with hand-built `.planning/` variants; `spawnSync(process.execPath, [hookPath], { cwd: tmpProject, input: JSON.stringify({tool_name:'Bash', tool_input:{command:'git commit -m "x"'}}), env: {...} })`; assert stdout empty (pass) or parses to `hookSpecificOutput.permissionDecision === 'deny'`. Run — case 2 and 3 FAIL against current code (STATE.md-absent bypass), others pass (characterization). Commit: `test(23-02): add failing tests for gate-commits ROADMAP/objectives gating`
2. Replace gate-commits.js lines 67-70 with the research fix:
```js
const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives'));
if (!roadmapExists && !objectivesDirExists) return; // Planning dir exists but uninitialized
```
Keep everything else (deny text, escape hatch, df-tools allowance) byte-identical. Run the suite — 8/8 green. Commit: `fix(23-02): gate commits on ROADMAP.md or objectives dir, not STATE.md`
  </action>
  <verify>node --test plugins/devflow/hooks/gate-commits.test.js passes 8/8</verify>
  <done>Deny fires with ROADMAP.md or objectives/ present regardless of STATE.md; bare .planning/ passes through; escape hatches intact</done>
  <recovery>If spawnSync cwd-based findPlanningDir resolution misbehaves on macOS tmpdir symlinks (/var vs /private/var), use fs.realpathSync on the tmpdir before passing as cwd.</recovery>
</task>

<task type="auto">
  <name>Task 3: statusline.js module-level stateLib cache</name>
  <files>plugins/devflow/hooks/statusline.js</files>
  <action>
Add at module level (above the stdin handler):

```js
// 23-02: cache resolved watcher-state lib across renders within this process
let _stateLibPath = null;
let _stateLib = null;
```

Inside the `cfg.daemon.status_line === true` branch, replace the per-render `const stateLibPath = path.join(...)` + `require(stateLibPath)` with: compute `_stateLibPath` only when null; require into `_stateLib` only when null and `fs.existsSync(_stateLibPath)`; use `_stateLib` thereafter. No other behavior changes — the surrounding try/catch and the never-crash contract stay intact.

Run `node --test plugins/devflow/hooks/statusline.test.js` — all 25 existing tests stay green (subprocess-based, transparent to the cache).

Commit: `perf(23-02): cache stateLib resolution in statusline hook`
  </action>
  <verify>node --test plugins/devflow/hooks/statusline.test.js — same pass count as before the change</verify>
  <done>Module-level cache present; statusline output byte-identical for all existing test scenarios</done>
  <recovery>If any statusline test regresses, the cache initialization order is wrong (e.g., _stateLib cached before existsSync) — revert to the exact research snippet shape.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/hooks/route-intent.test.js plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/statusline.test.js` — all pass
- Directive byte size <=400 confirmed by the new assertion
- `npm test` — zero new failures beyond the 12 known pre-existing
</verification>

<success_criteria>
- route-intent injection <=400 bytes with all routing-decision content preserved
- gate-commits enforces in any .planning/ containing ROADMAP.md or objectives/; new 8-case suite green
- statusline stateLib resolved at most once per process; existing 25 tests green
</success_criteria>

<output>
After completion, create `.planning/objectives/23-claude-compatibility-cleanup/23-02-SUMMARY.md`
</output>
