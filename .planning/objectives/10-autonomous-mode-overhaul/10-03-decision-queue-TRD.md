---
objective: 10-autonomous-mode-overhaul
trd: 03
type: standard
confidence: high
wave: 2
depends_on: ["10-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/decision-queue.cjs
  - plugins/devflow/devflow/bin/lib/decision-queue.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/skills/decide/SKILL.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "df-tools decision-queue add writes a structured DECISION-NNN.md to .planning/decisions/pending/ with frontmatter (id, objective, trd, type, created, status, blocks, independent, recommendation) and fires an OS notification"
    - "df-tools decision-queue list returns pending (and optionally resolved) decisions as JSON"
    - "df-tools decision-queue resolve <id> <choice> moves the file to .planning/decisions/resolved/ with resolution + resolved_at recorded"
    - "computeBlockedSet derives blocked vs independent TRD sets from TRD frontmatter decision_gate fields — TRDs without a matching decision_gate are independent"
    - "/devflow:decide skill resolves a parked decision and tells the user how to resume execution"
    - "Notification dispatch reuses lib/notifier.cjs — no new notification code"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/decision-queue.cjs"
      provides: "addDecision, listDecisions, resolveDecision, computeBlockedSet, renderDecisionMarkdown, nextDecisionId + CLI cmd handlers"
      exports: ["addDecision", "listDecisions", "resolveDecision", "computeBlockedSet", "renderDecisionMarkdown", "nextDecisionId", "cmdDecisionQueueRoute", "_setRunFs", "_resetMocks"]
    - path: "plugins/devflow/devflow/bin/lib/decision-queue.test.cjs"
      provides: "tests for add/list/resolve/blocked-set/render/id-generation/CLI routing"
      contains: "describe('decision-queue"
    - path: "plugins/devflow/skills/decide/SKILL.md"
      provides: "/devflow:decide <id> <choice> thin orchestrator"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "lib/decision-queue.cjs"
      via: "case 'decision-queue': router arm"
      pattern: "case 'decision-queue'"
    - from: "lib/decision-queue.cjs addDecision"
      to: "lib/notifier.cjs notify"
      via: "require('./notifier.cjs')"
      pattern: "notifier\\.cjs"
    - from: "computeBlockedSet"
      to: "TRD frontmatter decision_gate field"
      via: "frontmatter.cjs extractFrontmatter over objective TRD files"
      pattern: "decision_gate"
---

<objective>
Build the decision-queue library, CLI, and `/devflow:decide` skill (locked work item 2, code half). Decisions parked here let autonomous execution continue independent TRDs/waves instead of halting on `checkpoint:decision` or executor Rule 4 stops. The workflow wiring into execute-objective.md is TRD 10-04 (Wave 3); this TRD ships the mechanism.

Purpose: Auto-selecting the first option automates exactly the thing humans should own. Parking decisions with full context + notification keeps humans in the design loop without blocking mechanical work.

Output: `lib/decision-queue.cjs` (+tests), `df-tools decision-queue add|list|resolve|notify` CLI, `/devflow:decide` skill. File format per 10-RESEARCH.md Pattern 3.
</objective>

## Test list

Behavior cases, outermost (CLI) noted last per group; ordered happy → edge → failure:

**ID generation (nextDecisionId)**
1. Empty/missing decisions dir → `DECISION-001`
2. pending has 001, resolved has 002 → `DECISION-003` (scans BOTH dirs)
3. Non-decision files in dir ignored

**addDecision**
4. Writes `.planning/decisions/pending/DECISION-NNN.md` with all frontmatter fields (id, objective, trd, wave, type, created ISO timestamp, status: pending, blocks[], independent[], recommendation) + body sections (## Decision, **Context:**, **Options:** with pros/cons, ## To Resolve with `/devflow:decide` command line)
5. Creates pending/ and resolved/ dirs if missing
6. Returns `{ id, path }`
7. Fires notify({title: 'DevFlow: Decision Required', body: ...}) — assert via notifier `_setRunExec` mock (or injected notify seam)
8. Notification failure does not fail addDecision (notifier never throws — confirm contract holds)

**listDecisions**
9. Returns pending decisions with parsed frontmatter, sorted by id
10. `{status:'resolved'}` filter returns resolved set
11. Missing dir → `[]` silently (graceful-empty, mirrors loadInitiatives contract)
12. Malformed frontmatter file → stderr warning + skipped, siblings returned

**resolveDecision**
13. Moves file pending/ → resolved/, sets `status: resolved`, `resolution: <choice>`, `resolved_at: <ISO>`
14. Unknown id → error object/throw with message listing pending ids
15. Choice not in options → resolves anyway with warning (user freeform answers are legitimate)

**computeBlockedSet**
16. Objective dir where one TRD has `decision_gate: DECISION-001` → that TRD id in blocked; all other TRDs in independent
17. No TRD carries the gate → blocked: [], all independent
18. Transitive: TRD whose `depends_on` includes a blocked TRD is also blocked (closure over depends_on)

**CLI (subprocess, df-tools decision-queue ...)**
19. `add --objective 10 --trd 10-03 --title T --context C --options "a,b" --recommendation a` → exit 0, JSON {id, path}, file exists
20. `list --raw` → exit 0, JSON array
21. `resolve DECISION-001 option-a` → exit 0, file moved
22. Unknown subcommand → exit 1 with usage

<file_tree>
plugins/devflow/devflow/bin/lib/
├── decision-queue.cjs                          ← CREATE
├── decision-queue.test.cjs                     ← CREATE
└── __fixtures__/
    └── autonomous-fixtures.cjs                 ← MODIFY (add buildDecisionFile, buildObjectiveDirWithTrds)
plugins/devflow/devflow/bin/
└── df-tools.cjs                                ← MODIFY (case 'decision-queue' router arm)
plugins/devflow/skills/decide/
└── SKILL.md                                    ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

**Decision file format (10-RESEARCH.md Pattern 3 — implement exactly):**

```markdown
---
id: DECISION-001
objective: 10
wave: 2
trd: 10-03
type: checkpoint:decision
created: 2026-06-12T14:30:00Z
status: pending
blocks: []
independent: [10-04, 10-05]
recommendation: option-a
---

## Decision: [What's being decided]

**Context:** [Why this matters]

**Options:**

1. **option-a** — [Name]
   - Pros: [benefits]
   - Cons: [tradeoffs]

## To Resolve

Reply: `/devflow:decide DECISION-001 option-a`
```

**_setRunFs injection pattern (locked by TRD 03-01, mirror exactly):**

```javascript
const realFs = { readFileSync: fs.readFileSync, readdirSync: fs.readdirSync, existsSync: fs.existsSync,
  writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync, renameSync: fs.renameSync, statSync: fs.statSync };
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }
```

All fs access routes through `_runFs.X()`.

**Frontmatter parsing:** `const { extractFrontmatter } = require('./frontmatter.cjs');` — returns the parsed object DIRECTLY (not `{frontmatter, body}`) — locked finding from TRD 03-01.

**Notifier usage (lib/notifier.cjs — async, never throws):**

```javascript
const { notify } = require('./notifier.cjs');
await notify({ title: 'DevFlow: Decision Required', body: `${id}: ${title} — run /devflow:decide ${id} <choice>` });
```

Note: notify is async; addDecision should be async (or fire-and-forget with `.catch(()=>{})`). Existing precedent for async lib fns: syncInitiatives (TRD 05-03).

**df-tools.cjs router arm pattern (mirror case 'dup-detect' at ~line 867):**

```javascript
case 'decision-queue': {
  const { cmdDecisionQueueRoute } = require('./lib/decision-queue.cjs');
  await cmdDecisionQueueRoute(cwd, args.slice(1), raw);
  break;
}
```

(Check whether the surrounding switch is async-capable — `initiatives` arm already awaits, so the pattern exists.)

**CLI handler pattern (mirror lib/dup-detect-cli.cjs / initiatives-cli.cjs):** route subcommands, `output(result, raw, summary)` from helpers.cjs on success (NOTE: output() calls process.exit(0) — tests use subprocess execSync pattern, locked by TRD 02-06), JSON to stderr + exit(1) on error.

**Thin-orchestrator skill (mirror skills/awareness/SKILL.md):** frontmatter (name, description, argument-hint, allowed-tools: Bash, Read) + body that invokes `node ~/.claude/devflow/bin/df-tools.cjs decision-queue resolve $ARGUMENTS`, prints the resolution, then suggests `/devflow:execute-objective {objective}` to resume gated work.
</codebase_examples>

<anti_patterns>
- Do NOT build a graph-traversal engine for computeBlockedSet — TRD frontmatter `depends_on` + `decision_gate` is the entire dependency model (research Don't-Hand-Roll table).
- Do NOT build custom notification code — notifier.cjs only.
- Do NOT gitignore `.planning/decisions/` — parked decisions are durable planning state the user must see (contrast with the runtime markers gitignored in 10-01).
- No LLM-generated fixture data; hand-built builders only. No property-based tests. No .feature files.
- No port 8080 anywhere, including test data.
</anti_patterns>

<error_recovery>
- If `cmdDecisionQueueRoute` await in df-tools.cjs main switch causes "await outside async" — check how `case 'initiatives'` handles async (it awaits inside an async main); mirror it.
- If output()'s process.exit breaks in-process tests, switch those cases to the subprocess pattern (execSync + JSON.parse) — established by TRD 02-06.
</error_recovery>

</embedded_context>

<gotchas>
- `extractFrontmatter` returns the parsed object directly — TRD 03-01 corrected this; do not destructure `{frontmatter}`.
- notifier auto-disables process-wide after first ENOENT — tests must use `_setRunExec` mock or `NOTIFIER_DISABLE=1` to avoid real osascript calls.
- Decision ids must scan BOTH pending/ and resolved/ for the max — otherwise resolving 001 then adding a new decision reuses 001.
- `blocks`/`independent` arrays in frontmatter: the simple YAML list parser in frontmatter.cjs handles `[a, b]` inline arrays — verify with a test before relying on multiline list syntax.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Fixtures + decision-queue core library</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/autonomous-fixtures.cjs, plugins/devflow/devflow/bin/lib/decision-queue.test.cjs, plugins/devflow/devflow/bin/lib/decision-queue.cjs</files>
  <action>
First extend `autonomous-fixtures.cjs` (created by 10-01) with hand-built builders: `buildDecisionFile(dir, {id, status, blocks, independent, ...})` writing a spec-conformant decision file, and `buildObjectiveDirWithTrds(tmpdir, trdSpecs)` writing minimal TRD files with frontmatter (`trd`, `depends_on`, optional `decision_gate`) for computeBlockedSet tests.

RED: write `decision-queue.test.cjs` covering Test list cases 1-18 (library surface; CLI cases 19-22 come in task 2's test extension or here via subprocess if df-tools arm exists — keep 19-22 for task 2). Run tests, confirm fail. Commit `test(10-03): add failing tests for decision queue library`.

GREEN: implement `decision-queue.cjs`: `nextDecisionId(cwd)`, `addDecision(cwd, opts)` (async — renders markdown per the locked format, writes via _runFs, fires notify fire-and-forget with .catch), `listDecisions(cwd, {status})` (graceful-empty, warn-and-skip malformed), `resolveDecision(cwd, id, choice)` (rewrite frontmatter status/resolution/resolved_at, move to resolved/), `computeBlockedSet(cwd, objectiveDir, decisionId)` (read TRD frontmatter via extractFrontmatter; blocked = TRDs with matching decision_gate + transitive depends_on closure; independent = rest), `renderDecisionMarkdown(opts)` (pure). _setRunFs/_resetMocks injection per locked pattern. Commit `feat(10-03): decision queue library`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/decision-queue.test.cjs → cases 1-18 pass; npm test → no regressions</verify>
  <done>Library surface complete with locked file format, graceful-empty contracts, transitive blocked-set computation</done>
</task>

<task type="auto" tdd="true">
  <name>CLI routing + df-tools arm</name>
  <files>plugins/devflow/devflow/bin/lib/decision-queue.cjs, plugins/devflow/devflow/bin/lib/decision-queue.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED: add Test list cases 19-22 (subprocess: `execSync('node ' + DF_TOOLS + ' decision-queue add --objective 10 ...', {cwd: tmpdir})` + JSON.parse — the TRD 02-06 locked pattern; set NOTIFIER_DISABLE=1 in subprocess env). Confirm fail. Commit `test(10-03): add failing CLI tests for decision-queue subcommand`.

GREEN: add `cmdDecisionQueueRoute(cwd, argv, raw)` to decision-queue.cjs dispatching add|list|resolve|notify (notify = re-fire notification for an existing pending decision; useful for runbook cron). Flag parsing mirrors initiatives-cli.cjs `_parseFlags` (key-value flags: --objective --trd --wave --title --context --options --recommendation --blocks --independent; comma-split list flags). Add the `case 'decision-queue':` arm to df-tools.cjs mirroring the dup-detect arm. Usage error → stderr + exit 1. Commit `feat(10-03): decision-queue CLI subcommand`.
  </action>
  <verify>node ~/.claude/devflow/bin/df-tools.cjs decision-queue 2>&1 prints usage after sync (or test via repo path: node plugins/devflow/devflow/bin/df-tools.cjs decision-queue); node --test plugins/devflow/devflow/bin/lib/decision-queue.test.cjs all green; npm test no regressions</verify>
  <done>All four subcommands routed and tested end-to-end via subprocess</done>
</task>

<task type="auto">
  <name>/devflow:decide skill</name>
  <files>plugins/devflow/skills/decide/SKILL.md</files>
  <action>
Create `skills/decide/SKILL.md` as a thin orchestrator (mirror skills/awareness/SKILL.md structure): frontmatter `name: decide`, description triggering on "resolve decision", "decide DECISION-", argument-hint `<decision-id> <choice>`, allowed-tools Bash + Read. Body: (1) if no arguments, run `df-tools decision-queue list --raw` and present pending decisions with their options + recommendations; (2) with arguments, run `df-tools decision-queue resolve <id> <choice>`, show the resolution, then read the resolved decision's `blocks` list and suggest `/devflow:execute-objective <objective>` to resume the gated TRDs. Note in the body: decisions live in `.planning/decisions/`, resolved archive preserved. Commit `feat(10-03): /devflow:decide skill`.
  </action>
  <verify>Frontmatter has name/description/argument-hint/allowed-tools; body references decision-queue list and resolve; grep -c 8080 returns 0</verify>
  <done>Skill resolves decisions and points the user at resuming execution</done>
</task>

</tasks>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/decision-queue.test.cjs` → all 22 cases green
- `npm test` → no regressions
- Manual smoke: in a temp dir with .planning/, `df-tools decision-queue add --objective 10 --trd 10-99 --title "smoke" --context "c" --options "a,b" --recommendation a` then `list --raw` shows it, `resolve DECISION-001 a` moves it
- `grep -rn "8080" plugins/devflow/devflow/bin/lib/decision-queue*.cjs plugins/devflow/skills/decide/SKILL.md` → zero
</verification>

<success_criteria>
- [ ] Decision files match the locked research format exactly
- [ ] add/list/resolve/notify + computeBlockedSet implemented with injection hooks
- [ ] OS notification on park via notifier.cjs
- [ ] /devflow:decide skill ships
- [ ] 5 atomic commits (test/feat × 2 + skill feat)
</success_criteria>

<output>
SUMMARY.md in .planning/objectives/10-autonomous-mode-overhaul/ named 10-03-SUMMARY.md
</output>
