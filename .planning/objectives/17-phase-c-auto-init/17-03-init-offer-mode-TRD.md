---
objective: 17-phase-c-auto-init
trd: "03"
type: tdd
confidence: high
wave: 3
depends_on: ["17-01", "17-04"]
files_modified:
  - plugins/devflow/devflow/bin/lib/classifier.cjs
  - plugins/devflow/devflow/bin/lib/classifier.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
  - plugins/devflow/hooks/classify-session.js
  - plugins/devflow/hooks/classify-session.test.js
autonomous: true
requirements:
  - C2
must_haves:
  truths:
    - "classifySession({planningDir, hasGitDir, hasDeclineMarker, isSubstantive, previouslyDeclined}) extends the truth table to gate init-offer on isSubstantive AND NOT previouslyDeclined"
    - "Existing 18 classifier tests from 15-01 continue to pass without modification (back-compat via default param values)"
    - "renderRoutingPreamble({mode:'init-offer'}) emits updated text mentioning /devflow:new-project --auto and df-tools project-decline"
    - "renderRoutingPreamble({mode:'auto-init'}) emits NEW preamble (AUTO_INIT_PREAMBLE) directing Claude to fire /devflow:new-project --auto on first work prompt"
    - "classify-session.js calls getProjectState (from 17-01) and shouldAutoInit (from 17-04) to derive the inputs for classifySession"
    - "When project-state I/O fails, classify-session.js falls back to safe defaults (isSubstantive=false, previouslyDeclined=false) → skip mode → no crash"
    - "Subprocess test: brownfield substantive project (git + manifest + 50 files) emits INIT_OFFER preamble (when auto_init=false) or AUTO_INIT preamble (when auto_init=true)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/classifier.cjs"
      provides: "Extended classifySession with isSubstantive + previouslyDeclined params; new auto-init mode; AUTO_INIT_PREAMBLE constant"
      min_lines: 200
      exports: ["classifySession", "renderRoutingPreamble", "CONSOLIDATED_SKILLS"]
    - path: "plugins/devflow/devflow/bin/lib/classifier.test.cjs"
      provides: "Extended test suite — back-compat for 15-01 tests + 13 new cases for substantive/declined/auto-init branches"
      contains: "classifySession"
    - path: "plugins/devflow/hooks/classify-session.js"
      provides: "SessionStart hook calls getProjectState + shouldAutoInit; selects mode; emits matching preamble"
      min_lines: 120
    - path: "plugins/devflow/hooks/classify-session.test.js"
      provides: "Subprocess integration tests for substantive non-DevFlow + declined project + auto-init enabled scenarios"
      contains: "spawnSync"
  key_links:
    - from: "plugins/devflow/hooks/classify-session.js"
      to: "plugins/devflow/devflow/bin/lib/project-state.cjs"
      via: "require('../devflow/bin/lib/project-state.cjs').getProjectState"
      pattern: "require.+lib/project-state"
    - from: "plugins/devflow/hooks/classify-session.js"
      to: "plugins/devflow/devflow/bin/lib/global-config.cjs"
      via: "require('../devflow/bin/lib/global-config.cjs').shouldAutoInit"
      pattern: "require.+lib/global-config"
    - from: "plugins/devflow/devflow/bin/lib/classifier.cjs"
      to: "extended truth table"
      via: "5-input classifySession({...}) returns one of {ambient, init-offer, auto-init, skip}"
      pattern: "auto-init"
---

<objective>
Extend `lib/classifier.cjs` with `isSubstantive` + `previouslyDeclined` inputs and add a new `auto-init` mode. Update `INIT_OFFER_PREAMBLE` text per #28. Add `AUTO_INIT_PREAMBLE` for the opt-in advanced mode. Wire `classify-session.js` to call `getProjectState` (from 17-01) and `shouldAutoInit` (from 17-04) before invoking `classifySession`. Preserve back-compat with all 18 existing 15-01 tests.

Purpose: C2 from issue #28. The keystone TRD that ties C1 (project-state), C3 (decline tracking), and C4 (auto-init config) together into the SessionStart hook. After this TRD ships:
- Substantive non-DevFlow projects emit a polished init offer preamble (auto_init=false default)
- Declined projects skip silently for 30 days
- Users who opted into auto-init get the AUTO_INIT preamble directing Claude to fire `/devflow:new-project --auto` on first work prompt
- Non-substantive scratch dirs are silent (no offer pestering)

Output: Updated classifier.cjs + classify-session.js. New AUTO_INIT_PREAMBLE constant. Extended test suite that preserves all 18 existing tests + adds 13 new ones. Subprocess tests verify all 4 acceptance scenarios.
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/lib/
│   ├── classifier.cjs                                ← MODIFY (extend signature, add AUTO_INIT_PREAMBLE, update INIT_OFFER_PREAMBLE)
│   ├── classifier.test.cjs                           ← MODIFY (back-compat existing 18 + add 13 new)
│   ├── project-state.cjs                             ← READ-ONLY (import getProjectState from 17-01)
│   ├── global-config.cjs                             ← READ-ONLY (import shouldAutoInit from 17-04)
│   └── __fixtures__/
│       └── classifier-fixtures.cjs                   ← MODIFY (add new SCENARIOS for substantive/declined/auto-init)
└── hooks/
    ├── classify-session.js                           ← MODIFY (call getProjectState + shouldAutoInit)
    └── classify-session.test.js                      ← MODIFY (add subprocess scenarios for new modes)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: extending classifier.cjs (additive — preserve back-compat)

Current signature (15-01, locked):
```js
function classifySession({ planningDir, hasGitDir, hasDeclineMarker }) { ... }
```

New signature (additive params with backward-compatible defaults):
```js
function classifySession({
  planningDir,
  hasGitDir,
  hasDeclineMarker,
  isSubstantive = true,        // default true → existing init-offer tests still pass
  previouslyDeclined = false,  // default false → existing init-offer tests still pass
}) {
  // Decline marker (legacy 15-01 in-project marker) — unchanged precedence
  if (hasDeclineMarker) return 'skip';

  // Ambient — unchanged
  if (planningDir) return 'ambient';

  // Init-offer extended: gate on substantive AND not declined
  if (hasGitDir && isSubstantive && !previouslyDeclined) return 'init-offer';

  return 'skip';
}
```

**Why default `isSubstantive=true` (not false):** existing 15-01 tests like "case 3: returns init-offer when planningDir is null AND hasGitDir is true AND no decline marker" don't pass `isSubstantive`. Defaulting to true preserves the old assertion (`init-offer`). New tests explicitly set `isSubstantive: false` to verify the gate.

### Pattern: AUTO_INIT_PREAMBLE constant (new)

```js
// Add to classifier.cjs after INIT_OFFER_PREAMBLE
const AUTO_INIT_PREAMBLE = `DEVFLOW AUTO-INIT ACTIVE — substantive non-DevFlow project detected

This is a substantive git repository without .planning/, and the user has
opted into auto-init mode (auto_init_substantive_projects=true in
~/.claude/devflow/global-config.json).

When the user submits their first work-flavored request (not Q&A or
exploration), automatically invoke:

  /devflow:new-project --auto

Do NOT prompt. The user has pre-authorized this via global config. If you
need to abort, the user can run: df-tools global-config set auto_init_substantive_projects false

For Q&A or exploration prompts, respond directly without auto-initing.`;
```

### Pattern: updated INIT_OFFER_PREAMBLE (replace existing constant)

```js
// REPLACES the existing INIT_OFFER_PREAMBLE in classifier.cjs (lines 82-93)
const INIT_OFFER_PREAMBLE = `DEVFLOW INIT OFFER — substantive non-DevFlow project detected

This is a git repository without .planning/ that meets the substantive-project
heuristic (git history >7 days OR >10 source files, with a manifest, not a
scratch dir). If the user requests a non-trivial change (multi-file feature,
plan, milestone work), offer:

  "This looks like a substantive project but DevFlow isn't set up.
   Want me to run /devflow:new-project --auto to bootstrap it (~2 min),
   or skip and edit directly?"

If the user declines, run: df-tools project-decline
This suppresses future offers in this project for 30 days.

For trivial changes (single-file, <2 line), proceed directly without offering.`;
```

### Pattern: extended renderRoutingPreamble (add 'auto-init' branch)

```js
function renderRoutingPreamble({ mode }) {
  if (mode === 'ambient') return AMBIENT_PREAMBLE;
  if (mode === 'init-offer') return INIT_OFFER_PREAMBLE;
  if (mode === 'auto-init') return AUTO_INIT_PREAMBLE;
  return '';
}
```

### Pattern: classify-session.js extension (call getProjectState + shouldAutoInit)

```js
// MODIFY plugins/devflow/hooks/classify-session.js
const { classifySession, renderRoutingPreamble } = require('../devflow/bin/lib/classifier.cjs');
const { getProjectState } = require('../devflow/bin/lib/project-state.cjs');
const { shouldAutoInit } = require('../devflow/bin/lib/global-config.cjs');

function main() {
  if (process.env.DEVFLOW_SKIP_CLASSIFY === '1') return;

  const cwd = process.cwd();
  const planningDir = findPlanningDir(cwd);
  const hasGit = !!findGitDir(cwd);
  const declineMarker = hasDeclineMarker(planningDir);

  // NEW: Compute substantive + previously_declined via project-state
  let isSubstantive = false;
  let previouslyDeclined = false;
  let autoInit = false;
  try {
    if (hasGit && !planningDir) {
      // Only meaningful for non-DevFlow git repos
      const state = getProjectState(cwd);
      isSubstantive = state.is_substantive;
      previouslyDeclined = state.previously_declined;
      autoInit = shouldAutoInit();
    }
  } catch (e) {
    // Fail-open: any error → skip mode (safe)
    process.stderr.write(`[classify-session] project-state lookup failed: ${e.message}\n`);
  }

  let mode = classifySession({
    planningDir, hasGitDir: hasGit, hasDeclineMarker: declineMarker,
    isSubstantive, previouslyDeclined,
  });

  // NEW: When init-offer fires AND auto_init is enabled, switch to auto-init mode
  if (mode === 'init-offer' && autoInit) {
    mode = 'auto-init';
  }

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

if (require.main === module) {
  try { main(); } catch (err) {
    process.stderr.write(`[classify-session] error: ${err.message}\n`);
  }
}

module.exports = { findPlanningDir, findGitDir, hasDeclineMarker };
```

### Pattern: extending classifier-fixtures.cjs (additive)

Add new SCENARIOS:
```js
// MODIFY plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
const SCENARIOS = {
  // Existing (preserve)
  ambient:       () => buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true }),
  initOffer:     () => buildClassifyInput({ planningDir: null, hasGitDir: true }),
  scratchDir:    () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  noGitDir:      () => buildClassifyInput({ planningDir: null, hasGitDir: false }),
  declineMarker: () => buildClassifyInput({ planningDir: '/tmp/p/.planning', hasGitDir: true, hasDeclineMarker: true }),
  // NEW (17-03)
  initOfferSubstantive:   () => buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: false }),
  initOfferNotSubstantive: () => buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: false, previouslyDeclined: false }),
  initOfferDeclined:      () => buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: true }),
};
```

Update buildClassifyInput defaults to match new signature:
```js
function buildClassifyInput({
  planningDir = null,
  hasGitDir = false,
  hasDeclineMarker = false,
  isSubstantive = true,        // backward-compat default
  previouslyDeclined = false,  // backward-compat default
} = {}) {
  return { planningDir, hasGitDir, hasDeclineMarker, isSubstantive, previouslyDeclined };
}
```

</codebase_examples>

<anti_patterns>

- **Do NOT change existing 15-01 test assertions.** Add NEW tests for new behavior. Existing tests pass via backward-compat default param values (isSubstantive=true, previouslyDeclined=false).
- **Do NOT remove `hasDeclineMarker` parameter.** It's the legacy `.planning/.devflow-init-declined` marker from 15-01. The new `previouslyDeclined` is a SEPARATE parameter for the file-based decline tracking. Both coexist.
- **Do NOT call `getProjectState` for ambient projects.** Ambient = .planning/ exists; substantive heuristic doesn't apply. Wrap the call in `if (hasGit && !planningDir)` to avoid unnecessary git/fs work in ambient mode.
- **Do NOT crash classify-session.js on project-state failure.** Always wrap in try/catch with stderr-only diagnostic. SessionStart hooks must never break the session.
- **Do NOT block on git for >2s.** project-state.cjs's gitAgeDays already enforces 2s timeout. classify-session.js inherits this — no further timeout needed.
- **Do NOT call `shouldAutoInit()` for ambient mode.** Like project-state, only call when `hasGit && !planningDir`. Saves ~5ms on every ambient session start.
- **Do NOT couple to home-mirrored paths.** classify-session.js uses `require('../devflow/bin/lib/...')` (relative to plugin tree), not `require('~/.claude/devflow/bin/lib/...')`. Same pattern as 15-01 (PATH-LOCKED comment).

</anti_patterns>

<error_recovery>

- **`getProjectState` throws** — caught in classify-session.js try/catch, fall through to default isSubstantive=false → skip mode. User sees no preamble; no crash.
- **`shouldAutoInit()` throws** — caught in same try/catch, autoInit defaults to false. User gets standard init-offer preamble (safer default than auto-init).
- **`require('../devflow/bin/lib/project-state.cjs')` fails** — module not found means 17-01 hasn't shipped. depends_on enforces this; in practice the require will succeed. If it doesn't, the try/catch around `getProjectState` catches it.
- **Existing 18 classifier tests fail** — diagnose via diff: which test changed? If a test expected `init-offer` and now gets `skip`, the default for isSubstantive may have flipped to false. Re-read backward-compat defaults section.
- **subprocess test stdout is empty when expected non-empty** — confirm tmpdir setup creates real .git/, real package.json, and >10 source files. mkBrownfieldSubstantive does this; mkScratchDir doesn't.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/17-phase-c-auto-init/17-CONTEXT.md
@.planning/objectives/17-phase-c-auto-init/17-RESEARCH.md
@.planning/objectives/17-phase-c-auto-init/17-01-project-state-detector-TRD.md
@.planning/objectives/17-phase-c-auto-init/17-02-decline-tracker-TRD.md
@.planning/objectives/17-phase-c-auto-init/17-04-global-config-TRD.md
@.planning/objectives/15-phase-a-routing-keystone/15-01-classifier-and-session-hook-TRD.md
@.planning/objectives/15-phase-a-routing-keystone/15-01-SUMMARY.md

@plugins/devflow/devflow/bin/lib/classifier.cjs
@plugins/devflow/devflow/bin/lib/classifier.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
@plugins/devflow/hooks/classify-session.js
@plugins/devflow/hooks/classify-session.test.js
</context>

<research_context>

## Locked extended truth table

Inputs: `{ planningDir, hasGitDir, hasDeclineMarker, isSubstantive, previouslyDeclined }`

| hasDeclineMarker | planningDir | hasGitDir | isSubstantive | previouslyDeclined | Result |
|---|---|---|---|---|---|
| true | * | * | * | * | `'skip'` |
| false | non-null | * | * | * | `'ambient'` |
| false | null | true | true | false | `'init-offer'` |
| false | null | true | true | true | `'skip'` |
| false | null | true | false | * | `'skip'` |
| false | null | false | * | * | `'skip'` |

Then `classify-session.js` post-processes: if `mode === 'init-offer' && autoInit`, switch to `'auto-init'`.

## Locked preamble texts

See 17-RESEARCH.md "Locked preamble texts" — INIT_OFFER_PREAMBLE (replace) and AUTO_INIT_PREAMBLE (new). Both texts are byte-locked.

## Test list (locked, see 17-RESEARCH.md test list 17-03)

13 NEW cases extend the existing 18 — total 31 in classifier.test.cjs. Plus 6 new subprocess cases in classify-session.test.js (extends existing).

Locked NEW cases:
1. existing 15-01 ambient case still returns 'ambient' (back-compat smoke — re-run a 15-01 test)
2. existing 15-01 init-offer case (planningDir=null, hasGitDir=true) with default isSubstantive=true → still 'init-offer' (back-compat)
3. existing 15-01 skip cases unchanged
4. NEW: planningDir=null, hasGitDir=true, isSubstantive=false → 'skip'
5. NEW: planningDir=null, hasGitDir=true, isSubstantive=true, previouslyDeclined=true → 'skip'
6. NEW: planningDir=null, hasGitDir=true, isSubstantive=true, previouslyDeclined=false → 'init-offer'
7. NEW: hasDeclineMarker=true (legacy 15-01) still wins over isSubstantive → 'skip'
8. AUTO_INIT_PREAMBLE renders for mode='auto-init' (non-empty, contains '/devflow:new-project --auto')
9. INIT_OFFER_PREAMBLE updated text mentions '/devflow:new-project --auto' and 'df-tools project-decline'
10. AUTO_INIT_PREAMBLE mentions 'auto_init_substantive_projects' config key
11. INIT_OFFER_PREAMBLE removed reference to '.planning/.devflow-init-declined' (replaced by `df-tools project-decline`)
12. CONSOLIDATED_SKILLS unchanged — back-compat snapshot
13. mode='auto-init' → renderRoutingPreamble returns non-empty AUTO_INIT_PREAMBLE

Subprocess cases (in classify-session.test.js):
S1. brownfield substantive (mkBrownfieldSubstantive from 17-01 fixtures) → stdout JSON contains 'INIT OFFER'
S2. brownfield non-substantive (small repo, <10 files, recent git, no manifest) → stdout empty (skip)
S3. brownfield substantive + project-decline file present → stdout empty (skip via previously_declined)
S4. ambient project (existing 15-01 test) → still returns DEVFLOW PROJECT DETECTED (back-compat)
S5. brownfield substantive + auto_init=true (write global-config.json with HOME redirected) → stdout JSON contains 'AUTO-INIT ACTIVE' and '/devflow:new-project --auto'
S6. fail-open: chmod 000 the .git dir → no crash, no stdout (skip mode)

</research_context>

<gotchas>

- **Back-compat is brittle.** The 18 existing 15-01 tests in classifier.test.cjs MUST continue to pass with zero modification. The DEFAULT param values (`isSubstantive=true, previouslyDeclined=false`) are the back-compat mechanism. Verify by running the OLD test file against the NEW classifier.cjs — every test should pass without editing the test. ONE exception: `case 9` in 15-01 tests `'(in development'` substring presence, which has been removed by 16-04 (Phase B shipped). Confirm this test was already updated by 16-04 — if not, this TRD's scope creeps.
- **Subprocess fixture cross-TRD coupling.** S5 needs to write a global-config.json with `auto_init_substantive_projects: true` to a HOME-redirected tmpdir. AND a brownfield repo. Two tmpdirs in one test. Use a helper pattern:
  ```js
  function setupAutoInitFixture() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'autoinit-home-'));
    const project = mkBrownfieldSubstantive();
    const configDir = path.join(home, '.claude/devflow');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'global-config.json'), JSON.stringify({ auto_init_substantive_projects: true }));
    return { home, project, cleanup: () => { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true }); } };
  }
  ```
- **HOME redirection in spawnSync.** `env: { ...process.env, HOME: tmpHome }` — confirm Node honors this for `os.homedir()` calls inside the spawned subprocess.
- **classify-session.js path-locked require.** When updating, ensure the existing `// PATH-LOCKED:` comment is preserved AND the two new requires (`project-state.cjs`, `global-config.cjs`) inherit the same path-locked discipline.
- **Ambient mode short-circuits.** When `planningDir` is non-null, skip the `getProjectState` call entirely (return early). Saves ~50ms+spawn overhead per ambient session.
- **DEVFLOW_SKIP_CLASSIFY env var still works.** The env-var bypass test from 15-01 must continue to pass. Don't break it.
- **`require('../devflow/bin/lib/project-state.cjs')`** at hook load time — if the module errors during `require` (e.g., syntax error during dev), the whole hook fails. Wrap in try/catch around the require itself, OR ensure 17-01 ships a clean module. The depends_on enforces ordering.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD classifier.cjs extension (extended truth table + AUTO_INIT_PREAMBLE + INIT_OFFER text update)</name>
  <files>
    plugins/devflow/devflow/bin/lib/classifier.cjs,
    plugins/devflow/devflow/bin/lib/classifier.test.cjs,
    plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for the classifier.cjs extension.

**Step 1 — Verify back-compat baseline:**
```bash
node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs
# Confirm all 18 existing tests pass BEFORE making changes. This is your back-compat baseline.
```

**Step 2 — Add 13 new tests (RED phase, TDD playbook habit 2):**

In classifier.test.cjs, add a new describe block AFTER the existing tests:

```js
describe('classifySession (17-03 extension)', () => {
  test('case 19: planningDir=null, hasGitDir=true, isSubstantive=false → skip (substantive gate)', () => {
    const input = buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: false });
    assert.equal(classifySession(input), 'skip');
  });

  test('case 20: planningDir=null, hasGitDir=true, isSubstantive=true, previouslyDeclined=true → skip (decline gate)', () => {
    const input = buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: true });
    assert.equal(classifySession(input), 'skip');
  });

  test('case 21: planningDir=null, hasGitDir=true, isSubstantive=true, previouslyDeclined=false → init-offer', () => {
    const input = buildClassifyInput({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: false });
    assert.equal(classifySession(input), 'init-offer');
  });

  test('case 22: hasDeclineMarker=true wins over isSubstantive (legacy 15-01 marker still respected)', () => {
    const input = buildClassifyInput({ planningDir: '/tmp/p', hasGitDir: true, hasDeclineMarker: true, isSubstantive: true });
    assert.equal(classifySession(input), 'skip');
  });

  test('case 23: SCENARIOS.initOfferSubstantive → init-offer', () => {
    assert.equal(classifySession(SCENARIOS.initOfferSubstantive()), 'init-offer');
  });

  test('case 24: SCENARIOS.initOfferNotSubstantive → skip', () => {
    assert.equal(classifySession(SCENARIOS.initOfferNotSubstantive()), 'skip');
  });

  test('case 25: SCENARIOS.initOfferDeclined → skip', () => {
    assert.equal(classifySession(SCENARIOS.initOfferDeclined()), 'skip');
  });

  test('case 26: existing 15-01 ambient SCENARIO still returns ambient (back-compat)', () => {
    assert.equal(classifySession(SCENARIOS.ambient()), 'ambient');
  });

  test('case 27: existing 15-01 initOffer SCENARIO with default isSubstantive=true still returns init-offer (back-compat)', () => {
    assert.equal(classifySession(SCENARIOS.initOffer()), 'init-offer');
  });
});

describe('renderRoutingPreamble (17-03 extension)', () => {
  test('case 28: mode auto-init returns non-empty AUTO_INIT_PREAMBLE', () => {
    const result = renderRoutingPreamble({ mode: 'auto-init' });
    assert.ok(result.length > 0, 'must be non-empty');
    assert.ok(result.includes('AUTO-INIT ACTIVE'), 'must contain AUTO-INIT ACTIVE');
  });

  test('case 29: AUTO_INIT_PREAMBLE mentions /devflow:new-project --auto', () => {
    const result = renderRoutingPreamble({ mode: 'auto-init' });
    assert.ok(result.includes('/devflow:new-project --auto'), 'must mention /devflow:new-project --auto');
  });

  test('case 30: AUTO_INIT_PREAMBLE mentions auto_init_substantive_projects config key', () => {
    const result = renderRoutingPreamble({ mode: 'auto-init' });
    assert.ok(result.includes('auto_init_substantive_projects'), 'must mention auto_init_substantive_projects');
  });

  test('case 31: INIT_OFFER_PREAMBLE updated mentions /devflow:new-project --auto and df-tools project-decline', () => {
    const result = renderRoutingPreamble({ mode: 'init-offer' });
    assert.ok(result.includes('/devflow:new-project --auto'), 'must mention /devflow:new-project --auto');
    assert.ok(result.includes('df-tools project-decline'), 'must mention df-tools project-decline');
  });
});
```

Run tests — all 13 new tests fail (classifier.cjs unchanged):
```bash
node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs
# Expected: 18 pass, 13 fail.
```

**Step 3 — Update fixtures (build BEFORE implementation, habit 4):**

Modify `__fixtures__/classifier-fixtures.cjs`:
- Update `buildClassifyInput` defaults: add `isSubstantive=true, previouslyDeclined=false`
- Add 3 new SCENARIOS: `initOfferSubstantive`, `initOfferNotSubstantive`, `initOfferDeclined`

**Step 4 — Implement classifier.cjs changes (GREEN phase):**

Edit `lib/classifier.cjs`:
1. Update `classifySession` signature with new params + back-compat defaults (per codebase_examples)
2. Update truth table to gate init-offer on `isSubstantive && !previouslyDeclined`
3. Add `AUTO_INIT_PREAMBLE` constant
4. Replace `INIT_OFFER_PREAMBLE` with updated text per locked spec
5. Add 'auto-init' branch to `renderRoutingPreamble`

Run tests — all 31 pass:
```bash
node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs
# Expected: 31 pass.
```

# CRITICAL: Habit 2 — write all 13 new tests FIRST, run, see them fail. THEN modify classifier.cjs to make them pass.
# CRITICAL: Back-compat — DO NOT change any of the existing 18 test assertions. They must pass via default param values.
# GOTCHA: 15-01's "case 9" tests `(in development` substring NOT present. 16-04 already updated AMBIENT_PREAMBLE. Don't re-introduce that text.
# PATTERN: Mirror existing classifier.test.cjs structure (describe blocks, test names with "case N: ...").

Commits:
- `test(17-03): add 13 failing tests for classifier extension (substantive + auto-init + updated init-offer)`
- `feat(17-03): extend classifySession with isSubstantive + previouslyDeclined; add AUTO_INIT_PREAMBLE; update INIT_OFFER_PREAMBLE text`
- (REFACTOR optional) `refactor(17-03): consolidate preamble constants`
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs
# Must pass all 31 tests (18 original + 13 new).

node -e "
  const c = require('./plugins/devflow/devflow/bin/lib/classifier.cjs');
  console.log('init-offer:', c.classifySession({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: false }));
  console.log('substantive=false:', c.classifySession({ planningDir: null, hasGitDir: true, isSubstantive: false }));
  console.log('declined:', c.classifySession({ planningDir: null, hasGitDir: true, isSubstantive: true, previouslyDeclined: true }));
  console.log('auto-init preamble:', c.renderRoutingPreamble({ mode: 'auto-init' }).slice(0, 60));
"
# Expected:
#   init-offer: init-offer
#   substantive=false: skip
#   declined: skip
#   auto-init preamble: DEVFLOW AUTO-INIT ACTIVE — substantive non-DevFlow project
  </verify>
  <done>
- classifier.cjs has new param signature (isSubstantive, previouslyDeclined) + back-compat defaults
- AUTO_INIT_PREAMBLE constant added; renderRoutingPreamble has 'auto-init' branch
- INIT_OFFER_PREAMBLE replaced with updated text (mentions --auto, project-decline)
- classifier-fixtures.cjs has new SCENARIOS (initOfferSubstantive, initOfferNotSubstantive, initOfferDeclined)
- All 31 tests pass (18 original back-compat + 13 new)
- 2-3 atomic commits per RED-GREEN-REFACTOR
- Verbatim preamble texts match 17-RESEARCH.md "Locked preamble texts"
  </done>
  <recovery>
If existing 18 tests fail after classifier.cjs edit: the back-compat default values are wrong. `isSubstantive` default MUST be true (not false), otherwise existing init-offer tests start returning skip. Re-read 17-RESEARCH.md "Don't break back-compat" section.

If a test for case 9 ("(in development" parenthetical) fails because the text is gone: that test was updated by 16-04 (Phase B shipped). Re-read the test in classifier.test.cjs at the line referenced — it should already be updated. If not, scope creep — defer.

If REFACTOR breaks tests: revert via `git reset HEAD~1`. The optional refactor commit isn't required.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TDD classify-session.js wiring (call getProjectState + shouldAutoInit) + subprocess scenarios</name>
  <files>
    plugins/devflow/hooks/classify-session.js,
    plugins/devflow/hooks/classify-session.test.js
  </files>
  <action>
RED → GREEN → REFACTOR for the classify-session.js hook + 6 new subprocess test scenarios.

**Step 1 — Add subprocess test scenarios (RED phase, TDD playbook habit 5 — outside-in):**

In classify-session.test.js, add a new describe block:

```js
const { mkBrownfieldSubstantive, mkScratchDirInTmp, mkAmbientProject, mkNoGitProject } = require('../devflow/bin/lib/__fixtures__/project-state-fixtures.cjs');
const { writeDecline, _setDeclinePath } = require('../devflow/bin/lib/decline-tracker.cjs');

describe('classify-session.js subprocess (17-03 extension)', () => {
  test('S1: brownfield substantive (50 files + git history >7d + manifest) → INIT_OFFER preamble', () => {
    const root = mkBrownfieldSubstantive();
    try {
      const r = spawnSync('node', [HOOK_PATH], { cwd: root, encoding: 'utf-8', input: '' });
      assert.ok(r.stdout.includes('INIT OFFER'), `expected INIT OFFER preamble, got: ${r.stdout.slice(0, 200)}`);
      assert.ok(r.stdout.includes('substantive'), 'must mention substantive');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('S2: brownfield non-substantive (5 files, no manifest, no commits) → skip (empty stdout)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-thin-'));
    fs.mkdirSync(path.join(root, '.git'));
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(root, `f${i}.js`), 'x');
    try {
      const r = spawnSync('node', [HOOK_PATH], { cwd: root, encoding: 'utf-8', input: '' });
      assert.equal(r.stdout, '', `expected empty stdout (skip), got: ${r.stdout}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('S3: brownfield substantive + decline file present → skip (empty stdout)', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-decline-home-'));
    const project = mkBrownfieldSubstantive();
    const declineDir = path.join(home, '.claude', 'devflow');
    fs.mkdirSync(declineDir, { recursive: true });
    const future = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
    fs.writeFileSync(path.join(declineDir, 'declined-projects.json'),
      JSON.stringify({ [project]: { declined_at: new Date().toISOString(), expires_at: future } }, null, 2));
    try {
      const r = spawnSync('node', [HOOK_PATH], { cwd: project, encoding: 'utf-8', input: '', env: { ...process.env, HOME: home } });
      assert.equal(r.stdout, '', `expected empty stdout (skip via decline), got: ${r.stdout}`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  test('S4: ambient project still returns DEVFLOW PROJECT DETECTED (back-compat)', () => {
    const root = mkAmbientProject();
    try {
      const r = spawnSync('node', [HOOK_PATH], { cwd: root, encoding: 'utf-8', input: '' });
      assert.ok(r.stdout.includes('DEVFLOW PROJECT DETECTED'), 'back-compat: ambient mode preamble');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('S5: brownfield substantive + auto_init=true global-config → AUTO_INIT_PREAMBLE', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-autoinit-home-'));
    const project = mkBrownfieldSubstantive();
    const configDir = path.join(home, '.claude', 'devflow');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'global-config.json'),
      JSON.stringify({ auto_init_substantive_projects: true }, null, 2));
    try {
      const r = spawnSync('node', [HOOK_PATH], { cwd: project, encoding: 'utf-8', input: '', env: { ...process.env, HOME: home } });
      assert.ok(r.stdout.includes('AUTO-INIT ACTIVE'), `expected AUTO_INIT_PREAMBLE, got: ${r.stdout.slice(0, 200)}`);
      assert.ok(r.stdout.includes('/devflow:new-project --auto'), 'must direct to --auto');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  test('S6: project-state I/O failure (chmod 000 .git) → no crash, no stdout', () => {
    const root = mkBrownfieldSubstantive();
    try {
      fs.chmodSync(path.join(root, '.git'), 0o000);
      const r = spawnSync('node', [HOOK_PATH], { cwd: root, encoding: 'utf-8', input: '' });
      assert.equal(r.status, 0, 'must exit 0 (no crash)');
      // stdout may be empty (skip) or contain a warning — just verify no crash
      assert.ok(r.stdout === '' || !r.stdout.includes('Error'), 'must not crash, stderr only diagnostic');
    } finally {
      try { fs.chmodSync(path.join(root, '.git'), 0o755); } catch {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
```

Run tests — 6 new fail because classify-session.js doesn't yet call getProjectState/shouldAutoInit:
```bash
node --test plugins/devflow/hooks/classify-session.test.js
# Expected: existing tests pass; S1, S3, S5 fail; S2, S4, S6 may pass coincidentally.
```

**Step 2 — Modify classify-session.js (GREEN phase):**

Edit `plugins/devflow/hooks/classify-session.js` per codebase_examples block:
1. Add `require('../devflow/bin/lib/project-state.cjs')` import
2. Add `require('../devflow/bin/lib/global-config.cjs')` import
3. Compute isSubstantive + previouslyDeclined from getProjectState (only when `hasGit && !planningDir`)
4. Compute autoInit from shouldAutoInit() (only when `hasGit && !planningDir`)
5. Pass new params to classifySession
6. Post-process: if mode='init-offer' AND autoInit=true, switch mode to 'auto-init'
7. Wrap project-state + shouldAutoInit calls in try/catch (fail-open to safe defaults)

**Step 3 — Verify all subprocess tests pass:**

```bash
node --test plugins/devflow/hooks/classify-session.test.js
# Expected: all original tests + 6 new = ~22 total passing.
```

# CRITICAL: Habit 5 — outside-in. Subprocess tests are the OUTERMOST layer. Inner tests are pure functions in classifier.test.cjs (Task 1). This task's subprocess tests verify the wired-together flow.
# CRITICAL: Habit 6 — multi-tenancy guard SKIPPED (DevFlow Claude is single-user dev tool, not multi-tenant).
# GOTCHA: HOME redirection via env: { HOME: tmpHome } — confirms os.homedir() in subprocess uses tmpHome.
# GOTCHA: chmod 000 on .git — must restore permissions in finally (use try/catch around chmod restore — directory may already be partially deleted).
# PATTERN: Mirror existing classify-session.test.js subprocess test structure (lines 90-180).

Commits:
- `test(17-03): add 6 subprocess test scenarios for classify-session.js init-offer extension`
- `feat(17-03): wire getProjectState + shouldAutoInit into classify-session.js; gate init-offer on substantive + not declined; auto-init mode promotion`
  </action>
  <verify>
# Subprocess tests
node --test plugins/devflow/hooks/classify-session.test.js
# Must pass all ~22 tests (existing 16 + 6 new).

# Pure-function tests still pass
node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs
# Must pass 31 tests.

# Smoke test on this devflow-claude-v1.1 (ambient project)
echo '{}' | node plugins/devflow/hooks/classify-session.js | head -c 200
# Expected: JSON with additionalContext containing "DEVFLOW PROJECT DETECTED"

# Smoke test on a real brownfield: clone a small repo elsewhere temporarily
# (or use an existing brownfield project the user has)

# Full test suite
npm test 2>&1 | tail -5
# Expected: 1726 + 21 (17-02) + 21 (17-04) + 28 (17-01) + 13 (17-03 classifier) + 6 (17-03 hook) ≈ 1815 tests pass; no new failures
  </verify>
  <done>
- classify-session.js imports project-state + global-config; calls getProjectState + shouldAutoInit
- init-offer mode gated on isSubstantive AND NOT previouslyDeclined (subprocess S1, S2, S3)
- auto-init mode fires when init-offer + auto_init=true (subprocess S5)
- Ambient mode unchanged — back-compat (subprocess S4)
- Fail-open on I/O errors — no crash (subprocess S6)
- All 6 new subprocess tests pass + existing 16 still pass
- npm test full suite: net additive (~+88 across all 4 TRDs)
- 2 atomic commits (test + feat)
  </done>
  <recovery>
If S1 (brownfield substantive) fails because git_age_days is too small (< 7): the mkBrownfieldSubstantive fixture commits 30 days ago via GIT_AUTHOR_DATE. If git rejects the backdated commit, fall back to `>10 source files` triggering the file threshold (50 files in the fixture → substantive=true regardless of git age).

If S5 (auto-init) fails because HOME redirection isn't honored: confirm spawnSync env is `{ ...process.env, HOME: tmpHome }` (preserve PATH etc., override HOME).

If S6 (chmod 000) fails on macOS due to extended permissions: skip the test on macOS via `if (process.platform === 'darwin') t.skip('chmod 000 unreliable on macOS APFS')`. Alternative: write a corrupt declined-projects.json with `\x00` bytes to trigger a parse error → readDecline catches → safe default.

If `require('../devflow/bin/lib/project-state.cjs')` fails at hook load: confirm 17-01 has shipped + project-state.cjs exists. depends_on=[17-01,17-04] enforces this.
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
Acceptance criteria from #28 (this TRD covers C2 + integrates C1/C3/C4):
- [ ] Init-offer injection appears in classify-session output for substantive non-DevFlow projects (Task 2 S1, S5)
- [ ] Init-offer suppressed for declined projects (Task 2 S3)
- [ ] Init-offer suppressed for non-substantive projects (Task 2 S2)
- [ ] Auto-init mode fires `/devflow:new-project --auto` directive when opted in (Task 2 S5)
- [ ] Ambient mode preserved (back-compat) (Task 2 S4)
- [ ] Project-state I/O failure does not crash session (Task 2 S6)
- [ ] All 18 existing 15-01 classifier tests still pass (Task 1 cases 26-27 verify back-compat)
- [ ] Pre-existing 1726 tests still pass

Truth-coverage:
- Truth #1 (extended classifySession with 5 inputs): Task 1 cases 19-25
- Truth #2 (back-compat with 15-01 tests): Task 1 cases 26-27, plus existing 18 unchanged
- Truth #3 (updated INIT_OFFER_PREAMBLE text): Task 1 case 31
- Truth #4 (new AUTO_INIT_PREAMBLE): Task 1 cases 28-30
- Truth #5 (classify-session.js calls getProjectState + shouldAutoInit): Task 2 S1, S3, S5 (integration)
- Truth #6 (fail-open on project-state errors): Task 2 S6
- Truth #7 (subprocess test verifies all scenarios): Task 2 S1-S6
</verification>

<success_criteria>
- 5 files modified (classifier.cjs, classifier.test.cjs, classifier-fixtures.cjs, classify-session.js, classify-session.test.js)
- 13 new classifier tests + 6 new subprocess tests pass (total +19 in this TRD)
- All 18 existing 15-01 classifier tests preserved without modification (back-compat)
- npm test full suite: 1726 baseline + ~88 new across all 4 obj-17 TRDs = ~1814 passing; no new failures
- Subprocess test verifies all 4 acceptance scenarios from #28: substantive, non-substantive, declined, ambient
- Auto-init mode tested end-to-end (S5)
- Fail-open verified (S6)
- 4-6 atomic commits across 2 tasks
- SUMMARY.md captures: test counts, commit hashes, locked preamble texts emitted
- Phase C acceptance criteria #1, #3, #4, #5 all satisfied (this TRD ties them together)
</success_criteria>

<output>
After completion, create `.planning/objectives/17-phase-c-auto-init/17-03-SUMMARY.md`
</output>
