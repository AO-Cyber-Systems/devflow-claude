---
objective: 15-phase-a-routing-keystone
trd: "01"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/classifier.cjs
  - plugins/devflow/devflow/bin/lib/classifier.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
  - plugins/devflow/hooks/classify-session.js
  - plugins/devflow/hooks/classify-session.test.js
  - plugins/devflow/hooks/hooks.json
autonomous: true
requirements:
  - A1
must_haves:
  truths:
    - "classifySession({planningDir,hasGitDir,hasDeclineMarker}) returns one of: ambient | init-offer | skip"
    - "Ambient mode triggers when planningDir is non-null and no decline marker exists"
    - "Init-offer mode triggers when planningDir is null but hasGitDir is true and no decline marker"
    - "Skip mode triggers when hasDeclineMarker is true OR (no planningDir AND no git dir)"
    - "renderRoutingPreamble({mode}) returns the locked routing decision table for ambient / init-offer; empty string for skip"
    - "classify-session.js SessionStart hook reads cwd, calls classifySession, emits additionalContext JSON to stdout"
    - "classify-session.js no-ops (zero stdout) when mode is skip"
    - "classify-session.js no-ops when DEVFLOW_SKIP_CLASSIFY=1 env var is set"
    - "classify-session.js is registered in hooks.json AFTER sync-runtime.js"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/classifier.cjs"
      provides: "classifySession + renderRoutingPreamble pure functions + AMBIENT_PREAMBLE / INIT_OFFER_PREAMBLE constants"
      min_lines: 80
      exports: ["classifySession", "renderRoutingPreamble", "CONSOLIDATED_SKILLS"]
    - path: "plugins/devflow/devflow/bin/lib/classifier.test.cjs"
      provides: "Pure-function unit tests covering all classifySession branches + preamble shape assertions"
      min_lines: 120
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs"
      provides: "buildClassifyInput factory + tmpdir scaffolds (ambient / init-offer / skip / decline-marker)"
      min_lines: 60
    - path: "plugins/devflow/hooks/classify-session.js"
      provides: "SessionStart hook entry point — findPlanningDir + classifySession + JSON stdout"
      min_lines: 50
      exports: ["findPlanningDir"]
    - path: "plugins/devflow/hooks/classify-session.test.js"
      provides: "Subprocess integration tests covering 5 scenarios from #26 acceptance criteria"
      min_lines: 100
  key_links:
    - from: "plugins/devflow/hooks/classify-session.js"
      to: "plugins/devflow/devflow/bin/lib/classifier.cjs"
      via: "require relative path"
      pattern: "require.+lib/classifier"
    - from: "plugins/devflow/hooks/hooks.json"
      to: "plugins/devflow/hooks/classify-session.js"
      via: "SessionStart registration after sync-runtime"
      pattern: "classify-session\\.js"
---

<objective>
Add `lib/classifier.cjs` (pure-logic helper) + `classify-session.js` SessionStart hook that classifies projects as `ambient` / `init-offer` / `skip` and injects a system-level routing decision table into the model's context. Register the hook in `hooks.json` after `sync-runtime.js`.

Purpose: A1 from issue #26. This is the keystone of Plan B's ambient-mode routing — the model must see the consolidated-skill routing table before the first user prompt so it can route correctly without depending on the per-prompt advisory hook (route-intent.js) firing first. Pure-logic classifier so unit tests don't need tmpdirs for every assertion.

Output: New `lib/classifier.cjs` + tests + `classify-session.js` hook + hooks.json entry. Five acceptance scenarios covered (ambient project, init-offer-eligible, scratch dir, no-git dir, decline-marker present).
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/lib/
│   ├── classifier.cjs                              ← CREATE
│   ├── classifier.test.cjs                         ← CREATE
│   └── __fixtures__/
│       └── classifier-fixtures.cjs                 ← CREATE
└── hooks/
    ├── classify-session.js                         ← CREATE
    ├── classify-session.test.js                    ← CREATE
    └── hooks.json                                  ← MODIFY (register classify-session AFTER sync-runtime)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: pure-logic two-tier API (mirror brownfield-detector.cjs from obj 14)

```js
// plugins/devflow/devflow/bin/lib/classifier.cjs
'use strict';

// Pure function — no fs, no I/O, fully testable
function classifySession({ planningDir, hasGitDir, hasDeclineMarker }) {
  if (hasDeclineMarker) return 'skip';
  if (planningDir) return 'ambient';
  if (hasGitDir) return 'init-offer';
  return 'skip';
}

// Pure function — renders the system-prompt block
function renderRoutingPreamble({ mode }) {
  if (mode === 'ambient') return AMBIENT_PREAMBLE;
  if (mode === 'init-offer') return INIT_OFFER_PREAMBLE;
  return '';
}

// Locked constants (snapshot from 12-RESEARCH.md Phase G handoff)
const CONSOLIDATED_SKILLS = [
  { name: 'objective',   subcommands: ['add', 'remove'] },
  { name: 'milestone',   subcommands: ['new', 'audit', 'complete', 'gaps'] },
  { name: 'workstreams', subcommands: ['setup', 'status', 'merge', 'run'] },
  { name: 'todo',        subcommands: ['add', 'list'] },
  { name: 'status',      subcommands: [null, 'check', 'pause', 'resume'] },
];

module.exports = { classifySession, renderRoutingPreamble, CONSOLIDATED_SKILLS };
```

### Pattern: SessionStart hook (mirror inject-org-context.js)

```js
// plugins/devflow/hooks/classify-session.js
const fs = require('fs');
const path = require('path');
const { classifySession, renderRoutingPreamble } = require('../devflow/bin/lib/classifier.cjs');

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

function findGitDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return path.join(dir, '.git');
    dir = path.dirname(dir);
  }
  return null;
}

function hasDeclineMarker(planningDir) {
  if (!planningDir) return false;
  return fs.existsSync(path.join(planningDir, '.devflow-init-declined'));
}

function main() {
  if (process.env.DEVFLOW_SKIP_CLASSIFY === '1') return;

  const cwd = process.cwd();
  const planningDir = findPlanningDir(cwd);
  const hasGit = !!findGitDir(cwd);
  const declineMarker = planningDir ? hasDeclineMarker(planningDir) : false;

  const mode = classifySession({
    planningDir,
    hasGitDir: hasGit,
    hasDeclineMarker: declineMarker,
  });

  if (mode === 'skip') return;

  const preamble = renderRoutingPreamble({ mode });
  if (!preamble) return;

  const out = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: preamble,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

module.exports = { findPlanningDir, findGitDir, hasDeclineMarker };
```

### Pattern: factory-builder fixtures (mirror skill-route-fixtures.cjs)

```js
// plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
'use strict';

function buildClassifyInput({
  planningDir = null,
  hasGitDir = false,
  hasDeclineMarker = false,
} = {}) {
  return { planningDir, hasGitDir, hasDeclineMarker };
}

const SCENARIOS = {
  ambient:        () => buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true }),
  initOffer:      () => buildClassifyInput({ planningDir: null, hasGitDir: true }),
  scratchDir:     () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  noGitDir:       () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  declineMarker:  () => buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true, hasDeclineMarker: true }),
};

function mkAmbientTmpProject() {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-ambient-'));
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function mkInitOfferTmpProject() {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-init-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function mkScratchDir() {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  return fs.mkdtempSync(path.join(os.tmpdir(), 'classify-scratch-'));
}

function mkDeclineMarkerProject() {
  const fs = require('fs'); const path = require('path');
  const root = mkAmbientTmpProject();
  fs.writeFileSync(path.join(root, '.planning', '.devflow-init-declined'), '');
  return root;
}

module.exports = {
  buildClassifyInput, SCENARIOS,
  mkAmbientTmpProject, mkInitOfferTmpProject, mkScratchDir, mkDeclineMarkerProject,
};
```

### Pattern: hooks.json registration (CURRENT — must add classify-session AFTER sync-runtime)

```json
"SessionStart": [
  {
    "hooks": [
      { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/sync-runtime.js" }
    ]
  },
  {
    "hooks": [
      { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/awareness-cache-populate.js" }
    ]
  }
]
```

After modification — append a third group with classify-session:

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/sync-runtime.js" }] },
  { "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/awareness-cache-populate.js" }] },
  { "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/classify-session.js" }] }
]
```

</codebase_examples>

<anti_patterns>

- **Do NOT shell out to `df-tools skill-route --list`** from `classifier.cjs` to fetch the consolidated-skill list. SessionStart hooks are hot-path; subprocess overhead is unacceptable. Embed `CONSOLIDATED_SKILLS` as a const matching the 12-RESEARCH.md snapshot. Drift across versions is acceptable for the routing-table preamble.
- **Do NOT use `__dirname` for path resolution** when looking for the user's project. Always walk up from `process.cwd()`. `__dirname` resolves into the plugin tree (wrong).
- **Do NOT couple to sync-runtime.** `classify-session.js` should `require('../devflow/bin/lib/classifier.cjs')` using a path relative to the hook script (the bundled plugin tree), NOT the home-mirrored path. This avoids the SessionStart ordering coupling.
- **Do NOT crash on missing planningDir.** All fs checks must be `existsSync`-guarded. SessionStart hooks that crash break Claude Code session startup.
- **Do NOT hard-code paths in fixtures.** Use `os.tmpdir() + mkdtempSync` for every test scaffold. Tests must clean up via `try/finally + fs.rmSync(root, { recursive: true, force: true })`.
- **Do NOT include `/devflow:micro`** in the routing-table preamble WITHOUT the parenthetical note. Phase B (obj 7) hasn't shipped yet — referring to a missing skill confuses the model. The locked text is `/devflow:micro (in development — for now, route 1-2 line changes to /devflow:quick)`.

</anti_patterns>

<error_recovery>

- **`require('../devflow/bin/lib/classifier.cjs')` fails** — the relative path is computed from the hook file location. If the plugin tree layout changes, this breaks. Mitigation: keep the path-locked comment in `classify-session.js` ("PATH-LOCKED: relative path assumes plugins/devflow/{hooks,devflow/bin/lib}/ layout"). If the require throws, the hook silently no-ops via try/catch wrapping `main()` — DO NOT crash.
- **`fs.existsSync` racing with parallel mkdir during init.** Both `findPlanningDir` and `findGitDir` walk up the tree. If a parent directory is deleted mid-walk, `path.dirname(dir) === dir` terminates the loop safely. No special handling needed beyond the existing pattern.
- **`hooks.json` JSON parse error after edit.** Validate the JSON shape before committing: `node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/hooks/hooks.json'))"` must exit 0.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/15-phase-a-routing-keystone/15-CONTEXT.md
@.planning/objectives/15-phase-a-routing-keystone/15-RESEARCH.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md

@plugins/devflow/hooks/inject-org-context.js
@plugins/devflow/hooks/inject-org-context.test.js
@plugins/devflow/hooks/sync-runtime.js
@plugins/devflow/hooks/hooks.json
@plugins/devflow/devflow/bin/lib/brownfield-detector.cjs
</context>

<research_context>

## Locked routing decision table (from 15-RESEARCH.md)

`renderRoutingPreamble({ mode: 'ambient' })` returns this verbatim text (heredoc-style, plain text, no markdown):

```
DEVFLOW PROJECT DETECTED — ROUTING DIRECTIVE

This project has .planning/ — DevFlow ambient mode is active.

ROUTING DECISION TABLE:
  • Q&A / explanation / exploration       → respond directly, no skill
  • 1-2 line change, single file          → /devflow:micro (in development —
                                              for now, route to /devflow:quick)
  • <5 files, <200 LOC                    → /devflow:quick
  • Multi-file feature                    → /devflow:build
  • Bug investigation                     → /devflow:debug
  • Plan an objective                     → /devflow:plan-objective
  • Verify work                           → /devflow:verify-work
  • Status check                          → /devflow:status
  • Resume work                           → /devflow:status resume
  • Pause work                            → /devflow:status pause

CONSOLIDATED SKILLS (Phase G, v1.2 obj 12):
  /devflow:objective    add | remove
  /devflow:milestone    new | audit | complete | gaps
  /devflow:workstreams  setup | status | merge | run
  /devflow:todo         add | list
  /devflow:status       (no arg) | check | pause | resume

GATE: gate-edits.js will DENY direct Edit/Write/MultiEdit in ambient mode
unless an active skill marker (.planning/.skill-active) is present, or the
user prompt contains an explicit override phrase ("skip devflow", "just edit",
"bypass devflow", "force edit").

You MUST route through the appropriate skill BEFORE editing code.
```

`renderRoutingPreamble({ mode: 'init-offer' })` returns this verbatim text:

```
DEVFLOW INIT OFFER — non-DevFlow project detected

This is a git repository without .planning/. If the user requests a
non-trivial change (multi-file feature, plan, milestone work), offer:

  "This looks like work DevFlow could coordinate. Want me to run
   /devflow:new-project to set up planning?"

Do NOT auto-init. Wait for the user to confirm. If the user declines, write
.planning/.devflow-init-declined to suppress future offers in this project.

For trivial changes (single-file, <2 line), proceed directly without offering.
```

`renderRoutingPreamble({ mode: 'skip' })` returns the empty string `''`.

## hook payload schema (empirical from existing hooks)

`SessionStart` payload — observed fields:
- `session_id` (string, may be undefined)
- (other fields not used by this hook)

`process.cwd()` is the user's project root, not the hook script directory.

</research_context>

<gotchas>

- **PATH-LOCKED require:** `classify-session.js` uses a relative require to reach `lib/classifier.cjs`. The relative path assumes the layout `plugins/devflow/hooks/<hook>.js` and `plugins/devflow/devflow/bin/lib/classifier.cjs`. If layout changes, this require breaks. Lock with a code comment on the require line.
- **`process.exit` is forbidden in hooks.** `main()` returns; the process exits naturally with code 0. Errors are caught and silently no-op (write to stderr only as diagnostic).
- **hooks.json registration order is significant.** SessionStart hooks fire in declaration order. Place classify-session AFTER both existing entries (sync-runtime, awareness-cache-populate). Test asserts the file's parsed JSON has classify-session.js as the LAST SessionStart entry.
- **`/devflow:micro` is missing.** Phase B hasn't shipped. The preamble text MUST include the parenthetical "(in development — for now, route to /devflow:quick)". Test asserts substring presence.
- **Decline marker location.** `.planning/.devflow-init-declined` lives INSIDE `.planning/`, not at project root. Test fixture creates it at the right path.
- **`init-offer` mode requires git but NOT planning.** The two conditions are mutually exclusive: ambient = planning exists; init-offer = no planning AND git exists; skip otherwise. Test the truth table exhaustively.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD lib/classifier.cjs pure-logic module + fixtures</name>
  <files>
    plugins/devflow/devflow/bin/lib/classifier.cjs,
    plugins/devflow/devflow/bin/lib/classifier.test.cjs,
    plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for the pure-logic classifier module.

**Test list (build BEFORE writing any classifier.cjs code — habit 2 of TDD playbook):**

`classifySession`:
1. Returns `'skip'` when `hasDeclineMarker: true` (regardless of other inputs)
2. Returns `'ambient'` when `planningDir` is non-null and no decline marker
3. Returns `'init-offer'` when `planningDir` is null AND `hasGitDir: true` AND no decline marker
4. Returns `'skip'` when `planningDir` is null AND `hasGitDir: false` AND no decline marker (scratch dir)
5. Decline marker takes precedence over ambient (planningDir set + decline marker → skip)
6. Truth table is total — every combination of the 3 booleans returns one of {ambient, init-offer, skip}

`renderRoutingPreamble`:
7. `mode: 'ambient'` returns non-empty string containing `'DEVFLOW PROJECT DETECTED'`
8. `mode: 'ambient'` contains `'/devflow:build'` (multi-file feature route)
9. `mode: 'ambient'` contains `'/devflow:micro'` AND `'(in development'` (Phase B not yet shipped)
10. `mode: 'ambient'` contains `'/devflow:status resume'` (NOT `/devflow:resume-work` — Phase G consolidated)
11. `mode: 'ambient'` mentions all 5 consolidated skills by name (objective, milestone, workstreams, todo, status)
12. `mode: 'ambient'` mentions gate-edits DENY behavior + override phrases ("skip devflow", "just edit", "bypass devflow", "force edit")
13. `mode: 'init-offer'` returns non-empty string containing `'INIT OFFER'`
14. `mode: 'init-offer'` mentions `/devflow:new-project`
15. `mode: 'skip'` returns empty string `''`
16. Unknown mode (e.g. `'banana'`) returns empty string

`CONSOLIDATED_SKILLS` constant:
17. Exported and matches the 12-RESEARCH.md Phase G snapshot (5 skills, exact names + subcommands)
18. `status.subcommands[0]` is `null` (default subcommand semantics from 12-03)

**Fixtures (`__fixtures__/classifier-fixtures.cjs`):**

Build BEFORE the test file (habit 4): factory `buildClassifyInput({...})` + tmpdir scaffolds (`mkAmbientTmpProject`, `mkInitOfferTmpProject`, `mkScratchDir`, `mkDeclineMarkerProject`). The tmpdir scaffolds are used by Task 2's hook tests, not this task — but ship them here for atomicity.

# CRITICAL: Habit 2 — write the FULL test list above as `test('case N: ...')` calls in classifier.test.cjs FIRST. They all fail (module doesn't exist). Then implement classifier.cjs minimally to pass each test.
# GOTCHA: `CONSOLIDATED_SKILLS` constant — copy verbatim from 12-RESEARCH.md "Phase A handoff (live snapshot)". Drift = test failure.
# PATTERN: Two-tier API like brownfield-detector.cjs — pure functions + module.exports lock comment at end.

Commits:
- `test(15-01): add failing tests for classifier pure-logic`
- `feat(15-01): implement classifySession + renderRoutingPreamble`
- (REFACTOR optional) `refactor(15-01): extract preamble constants`
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs
# Must pass all 18+ test cases.

node -e "
  const { classifySession, renderRoutingPreamble, CONSOLIDATED_SKILLS } = require('./plugins/devflow/devflow/bin/lib/classifier.cjs');
  console.log('classifySession:', typeof classifySession);
  console.log('renderRoutingPreamble:', typeof renderRoutingPreamble);
  console.log('CONSOLIDATED_SKILLS length:', CONSOLIDATED_SKILLS.length);
  console.log('ambient:', classifySession({ planningDir: '/tmp/p', hasGitDir: true, hasDeclineMarker: false }));
  console.log('init-offer:', classifySession({ planningDir: null, hasGitDir: true, hasDeclineMarker: false }));
  console.log('skip:', classifySession({ planningDir: null, hasGitDir: false, hasDeclineMarker: false }));
"
# Expected output:
#   classifySession: function
#   renderRoutingPreamble: function
#   CONSOLIDATED_SKILLS length: 5
#   ambient: ambient
#   init-offer: init-offer
#   skip: skip
  </verify>
  <done>
- `lib/classifier.cjs` exists, exports `classifySession`, `renderRoutingPreamble`, `CONSOLIDATED_SKILLS`
- `lib/classifier.test.cjs` has 18+ tests, all passing
- `lib/__fixtures__/classifier-fixtures.cjs` has factory + 4 tmpdir scaffolds
- All branches of the 3-boolean truth table covered by tests
- `CONSOLIDATED_SKILLS` matches 12-RESEARCH.md snapshot exactly
- 2-3 atomic commits per RED-GREEN-REFACTOR cycle
  </done>
  <recovery>
If RED phase fails (test file has syntax errors): re-read `plugins/devflow/devflow/bin/lib/skill-route.test.cjs` for the import/describe pattern. Tests use `node:test` + `node:assert/strict` (already used elsewhere in this codebase).

If `CONSOLIDATED_SKILLS` test fails because the snapshot drifted: read 12-RESEARCH.md "Phase A handoff (live snapshot)" lines 384-454 directly. Re-emit the constant verbatim.

If REFACTOR breaks tests: revert via `git reset HEAD~1` and skip the REFACTOR commit (it's optional per the playbook).
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TDD classify-session.js SessionStart hook + hooks.json registration</name>
  <files>
    plugins/devflow/hooks/classify-session.js,
    plugins/devflow/hooks/classify-session.test.js,
    plugins/devflow/hooks/hooks.json
  </files>
  <action>
RED → GREEN → REFACTOR for the SessionStart hook + hooks.json registration.

**Test list (build BEFORE writing the hook):**

Pure-function tests (require the hook module, call exported functions directly):
1. `findPlanningDir` walks up from start dir, returns first ancestor containing `.planning/`
2. `findPlanningDir` returns `null` when no `.planning/` found walking up to filesystem root
3. `findGitDir` walks up similarly, finds first ancestor `.git/`
4. `hasDeclineMarker(planningDir)` returns true when `.planning/.devflow-init-declined` exists
5. `hasDeclineMarker(planningDir)` returns false when planningDir is null OR marker absent

Subprocess integration tests (`spawnSync(node, [HOOK_PATH], { cwd })` with empty stdin):

The 5 acceptance scenarios from #26:
6. **Ambient project** (mkAmbientTmpProject): hook stdout is JSON with `hookSpecificOutput.hookEventName === 'SessionStart'` AND `additionalContext` contains `'DEVFLOW PROJECT DETECTED'`
7. **Init-offer-eligible** (mkInitOfferTmpProject — git but no planning): hook stdout JSON with `additionalContext` containing `'INIT OFFER'`
8. **Scratch dir** (mkScratchDir — no planning, no git): hook stdout is empty (no JSON, exit 0)
9. **No-git dir** (mkdtemp without git or planning): hook stdout is empty (same as scratch — both classify as skip)
10. **Decline-marker present** (mkDeclineMarkerProject — planning + decline marker): hook stdout is empty (skip mode despite planningDir present)

Env var test:
11. `DEVFLOW_SKIP_CLASSIFY=1` env var: ambient project still produces empty stdout (skip-all override)

JSON shape test:
12. When stdout is non-empty, it parses as valid JSON with the documented shape

**hooks.json registration test (separate `describe` block):**
13. Parsing `hooks.json` succeeds (no JSON errors after edit)
14. SessionStart array length === 3 (was 2; added one)
15. Last SessionStart entry's command contains `'classify-session.js'`
16. classify-session entry comes AFTER sync-runtime entry (index > sync-runtime's index)

# CRITICAL: Habit 5 — outside-in for hook flows. Subprocess test (whole hook end-to-end) is the OUTER test. Inner tests are pure functions (findPlanningDir, etc.). Drill in.
# GOTCHA: spawnSync env: pass `env: { ...process.env, DEVFLOW_SKIP_CLASSIFY: undefined }` to clear inherited env on most tests, AND set explicitly on the env-var test.
# PATTERN: Mirror inject-org-context.test.js for tmpdir + spawnSync structure (lines 1-60).

**Implementation (GREEN phase):**

Create `classify-session.js` per the codebase_examples block. Update `hooks.json` to add a third SessionStart entry. Validate JSON parse via:

```bash
node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/hooks/hooks.json'))"
```

Commits:
- `test(15-01): add failing tests for classify-session hook + hooks.json registration`
- `feat(15-01): implement classify-session.js + register in hooks.json`
- (REFACTOR optional) `refactor(15-01): extract findPlanningDir to lib/`
  </action>
  <verify>
# Pure + subprocess tests
node --test plugins/devflow/hooks/classify-session.test.js
# Must pass all 16+ tests.

# hooks.json valid JSON after edit
node -e "
  const h = JSON.parse(require('fs').readFileSync('plugins/devflow/hooks/hooks.json', 'utf8'));
  const ss = h.hooks.SessionStart;
  console.log('SessionStart entries:', ss.length);
  console.log('Last command:', ss[ss.length - 1].hooks[0].command);
"
# Expected:
#   SessionStart entries: 3
#   Last command: node \${CLAUDE_PLUGIN_ROOT}/hooks/classify-session.js

# Smoke test: hook on a real ambient project
cd plugins/devflow/hooks && echo '{}' | node classify-session.js | head -c 200
# Expected: JSON output with additionalContext containing "DEVFLOW PROJECT DETECTED"
# (because devflow-claude-v1.1 has .planning/)
  </verify>
  <done>
- `hooks/classify-session.js` exists with `findPlanningDir`, `findGitDir`, `hasDeclineMarker` exports
- `hooks/classify-session.test.js` has 16+ tests, all passing
- `hooks.json` SessionStart array has 3 entries; classify-session is LAST
- 5 acceptance scenarios from #26 covered by subprocess tests
- DEVFLOW_SKIP_CLASSIFY=1 env var disables the hook
- Smoke test on devflow-claude-v1.1 (an ambient project) emits the routing preamble
- 2-3 atomic commits per RED-GREEN-REFACTOR
  </done>
  <recovery>
If `require('../devflow/bin/lib/classifier.cjs')` fails at hook runtime: the relative path is wrong. The correct path from `plugins/devflow/hooks/classify-session.js` to `plugins/devflow/devflow/bin/lib/classifier.cjs` is `../devflow/bin/lib/classifier.cjs`. Verify with `node -e "console.log(require('path').resolve('plugins/devflow/hooks/../devflow/bin/lib/classifier.cjs'))"`.

If hooks.json edit produces invalid JSON: revert via `git checkout plugins/devflow/hooks/hooks.json` and re-edit carefully (commas, brackets matter). The file is structurally simple; manual edit is safer than regex sed.

If subprocess test stdout is empty when expected non-empty: check (1) the cwd passed to spawnSync, (2) the env var clearance, (3) that the tmpdir scaffold actually has `.planning/` created. Print stderr to diagnose: `console.error(result.stderr.toString())`.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs</test>
<test>node --test plugins/devflow/hooks/classify-session.test.js</test>
<lint>node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/hooks/hooks.json'))"</lint>
</validation_gates>

<verification>
Acceptance criteria from #26 (this TRD covers A1):
- [ ] `classify-session.js` correctly classifies 5 test scenarios: ambient project, init-offer-eligible, scratch dir, no-git dir, decline-marker present (Task 2 subprocess tests)
- [ ] `lib/classifier.cjs` is testable in isolation (Task 1)
- [ ] hooks.json registers `classify-session.js` AFTER `sync-runtime.js` (Task 2)
- [ ] Pre-existing 1551 tests still pass (npm test full suite)

Truth-coverage:
- Truth #1 (classifySession returns one of 3 modes): Task 1 tests 1-6
- Truth #2-#4 (mode triggers): Task 1 tests 1-5
- Truth #5 (renderRoutingPreamble shape): Task 1 tests 7-16
- Truth #6 (hook reads cwd, emits JSON): Task 2 tests 6-7, 12
- Truth #7 (no-op on skip): Task 2 tests 8-9, 10
- Truth #8 (env var disables): Task 2 test 11
- Truth #9 (hooks.json registration order): Task 2 tests 13-16
</verification>

<success_criteria>
- 5 files created/modified, all in `files_modified` frontmatter list
- 18+ pure-function tests + 16+ hook tests pass (~34 total new tests)
- `npm test` full suite: 1551 pre-existing tests still pass + ~34 new = ~1585 total
- 4-6 atomic commits across the two tasks (RED → GREEN per task, optional REFACTOR)
- SUMMARY.md captures: test counts, commit hashes, snapshot of preamble text emitted
- Phase A acceptance criterion #1 satisfied (5 scenarios classified correctly)
</success_criteria>

<output>
After completion, create `.planning/objectives/15-phase-a-routing-keystone/15-01-SUMMARY.md`
</output>
