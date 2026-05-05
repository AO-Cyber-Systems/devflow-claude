---
objective: 08-program-aware-tui
trd: "08-03"
type: tdd
confidence: high
wave: 3
depends_on: ["08-01", "08-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/tui.cjs
  - plugins/devflow/devflow/bin/lib/tui.test.cjs
  - plugins/devflow/skills/tui/SKILL.md
autonomous: true
requirements:
  - SC-6
  - SC-9
  - SC-10

must_haves:
  truths:
    - "/devflow:tui slash command invokes `df-tools tui $ARGUMENTS` and presents output verbatim"
    - "lib/tui.cjs exports exactly 7 entries: render, _renderOrgPanel, _renderPeerPanel, _renderInitiativesPanel, _layoutPanels, _setRunStdout, _resetMocks"
    - "Export surface is asserted by EX1 deepStrictEqual test against the documented locked surface"
    - "Banner comment 'LOCKED by TRD 08-03 (7-entry surface; SC-9)' precedes module.exports block"
    - "df-tools tui --once --raw emits this repo's actual state and exits 0 (e2e self-test)"
    - "df-tools tui --once --raw piped to a non-TTY emits ANSI without hang or error (SC-10 pipe contract)"
    - "Composition contract verified: render output contains expected panel headers + at least one real artifact from each source (this repo)"
  artifacts:
    - path: "plugins/devflow/skills/tui/SKILL.md"
      provides: "/devflow:tui slash command — thin orchestrator over df-tools tui"
      contains: "df-tools tui"
      min_lines: 30
    - path: "plugins/devflow/devflow/bin/lib/tui.cjs"
      provides: "module.exports LOCKED surface with banner comment"
      exports: ["render", "_renderOrgPanel", "_renderPeerPanel", "_renderInitiativesPanel", "_layoutPanels", "_setRunStdout", "_resetMocks"]
      contains: "LOCKED by TRD 08-03"
    - path: "plugins/devflow/devflow/bin/lib/tui.test.cjs"
      provides: "EX1 export-lock test + E2E1-E2E3 self-tests"
      contains: "deepStrictEqual.*tui|module.exports"
  key_links:
    - from: "skills/tui/SKILL.md"
      to: "df-tools tui"
      via: "Bash tool invocation in <process> block"
      pattern: "df-tools tui"
    - from: "lib/tui.test.cjs EX1"
      to: "lib/tui.cjs module.exports"
      via: "require('./tui.cjs') + Object.keys(...).sort() deepStrictEqual"
      pattern: "Object\\.keys.*module|deepStrictEqual.*tui"
    - from: "lib/tui.test.cjs E2E1"
      to: "df-tools tui --once --raw subprocess"
      via: "child_process.execSync('node df-tools.cjs tui --once --raw')"
      pattern: "execSync.*df-tools.*tui"
---

<objective>
Final TRD of v1.1: ship the `/devflow:tui` slash command, lock `lib/tui.cjs` module.exports surface with a banner comment + EX1 deepStrictEqual test, and add E2E self-tests proving `df-tools tui --once --raw` works against this repo's actual state.

Purpose: Close SC-6 (skill exists), SC-9 (module surface locked), SC-10 (e2e self-test). After this TRD, Objective 8 is DONE and v1.1 is COMPLETE.

`type: tdd` because all three deliverables are testable:
- EX1 export-lock test (deepStrictEqual against documented surface)
- E2E1/E2E2/E2E3 subprocess tests (run `df-tools tui --once --raw`, assert exit code + output shape)
- Skill file existence + structural assertions (frontmatter present, `df-tools tui` invocation present)

Output:
- `lib/tui.cjs` — banner comment + module.exports finalized
- `lib/tui.test.cjs` — EX1 + Group J (E2E) tests
- `plugins/devflow/skills/tui/SKILL.md` — slash command thin orchestrator
</objective>

<file_tree>
plugins/devflow/
├── skills/
│   └── tui/                              ← CREATE (directory)
│       └── SKILL.md                      ← CREATE
└── devflow/bin/lib/
    ├── tui.cjs                           ← MODIFY (add LOCKED banner + finalize exports)
    └── tui.test.cjs                      ← MODIFY (add Group EX + Group J)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: export-lock banner comment (lib/dup-detect.cjs)

```js
// ─── module.exports — LOCKED by TRD 04-06 (19-entry surface; SC-10) ──────────
//
// This block is the AUTHORITATIVE export surface for lib/dup-detect.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + CONTEXT.md §"Module surface".

module.exports = {
  // Public API (TDD'd):
  detectDuplicates,
  formatDetectionMarkdown,
  // ... etc
};
```

Same idiom for tui.cjs at TRD 08-03:

```js
// ─── module.exports — LOCKED by TRD 08-03 (7-entry surface; SC-9) ─────────────
//
// This block is the AUTHORITATIVE export surface for lib/tui.cjs.
// Asserted by EX1 test in tui.test.cjs: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating EX1 + 08-CONTEXT.md §5.

module.exports = {
  // Public renderer (TRD 08-01):
  render,

  // Sub-renderers (exposed for tests; TRD 08-01):
  _renderOrgPanel,
  _renderPeerPanel,
  _renderInitiativesPanel,

  // Layout helper (TRD 08-01):
  _layoutPanels,

  // Test hooks (TRD 08-01):
  _setRunStdout,
  _resetMocks,
};
```

### Pattern: EX1 deepStrictEqual export-lock test (lib/dup-detect.test.cjs equivalent)

```js
const tui = require('./tui.cjs');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('Group EX: export surface (TRD 08-03 lock)', () => {
  test('EX1: lib/tui.cjs exports exactly 7 entries (locked surface)', () => {
    const expected = [
      '_layoutPanels',
      '_renderInitiativesPanel',
      '_renderOrgPanel',
      '_renderPeerPanel',
      '_resetMocks',
      '_setRunStdout',
      'render',
    ];
    assert.deepStrictEqual(Object.keys(tui).sort(), expected);
  });

  test('EX2: render is a function', () => {
    assert.equal(typeof tui.render, 'function');
  });

  test('EX3: banner comment present in source', () => {
    const src = require('fs').readFileSync(require.resolve('./tui.cjs'), 'utf8');
    assert.ok(src.includes('LOCKED by TRD 08-03'),
      'banner comment "LOCKED by TRD 08-03" not found in tui.cjs source');
  });
});
```

### Pattern: E2E subprocess test (lib/check-todos.test.cjs / obj 6 pattern)

```js
const { execSync } = require('node:child_process');
const path = require('node:path');

describe('Group J: e2e self-test (SC-10)', () => {
  const dfTools = path.resolve(__dirname, '../df-tools.cjs');

  test('J1: df-tools tui --once --raw exits 0 against this repo', () => {
    const out = execSync(`node "${dfTools}" tui --once --raw`, {
      cwd: path.resolve(__dirname, '../../../../..'),  // repo root
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(typeof out === 'string');
    assert.ok(out.length > 0);
  });

  // ... J2 + J3
});
```

`execSync` throws if exit code != 0, so the test passes on exit-0 by virtue of not throwing.

### Pattern: SKILL.md thin orchestrator (skills/check-todos/SKILL.md)

```markdown
---
name: check-todos
description: |
  Morning-standup view across local todos + GitHub issues + active peer sessions + initiative open questions + dup-detect log...
  Triggers on: "what should I work on?", "morning standup", "check todos", ...
argument-hint: "[--all] [--refresh] [--lane blocked|now|soon|ideas] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Render a single morning-standup Markdown view across 5 sources, grouped by urgency lane:
...
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.check-todos-cache.json
</execution_context>

<process>
**Run the check-todos CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs check-todos $ARGUMENTS
```

After the command runs, present the output to the user verbatim — show the Markdown so urgency emoji renders. Don't summarize.
</process>
```

For `/devflow:tui` SKILL.md follow this exact structure: frontmatter + `<objective>` + `<execution_context>` + `<process>` + `<context>`.

</codebase_examples>

<anti_patterns>

### Anti-pattern 1: Skill summarizing the TUI output

**Bad:** `<process>` block says "After running, summarize what the TUI showed."

Why bad: the TUI emits ANSI control codes meant for a terminal, not a chat. Summarizing destroys the rendered framing. Per SC-6 + locked decision #1 (hand-rolled ANSI), the rendered output is for the terminal session.

**Good:** the skill says "after the command runs, the user sees the TUI in their terminal directly. Do not summarize." For `--once --raw` mode (when invoked from chat without a TTY), present the rendered output as a code block so it's preserved verbatim.

### Anti-pattern 2: Adding new exports in 08-03 without updating EX1

If during 08-03 implementation you discover a missing helper (e.g., `_truncate` should be exported for reuse), DO NOT just add it to module.exports. The export surface is locked. Either:
- Decide it stays internal (preferred — encapsulation)
- Update EX1's expected array AND 08-CONTEXT.md §5 in the same commit (treat as a deliberate deviation)

### Anti-pattern 3: Skill referencing internal helpers

The skill is a USER-FACING entry point. Don't reference `_loadData` or `_renderOrgPanel` in the skill body. Reference only the public CLI: `df-tools tui [flags]`.

### Anti-pattern 4: E2E test relying on exact output content

**Bad:**
```js
test('J2: output contains specific branch name', () => {
  const out = execSync('df-tools tui --once --raw');
  assert.ok(out.includes('feature/v1.1-obj-8-tui'));   // breaks the moment branch is deleted
});
```

**Good:**
```js
test('J2: output contains expected panel framing', () => {
  const out = execSync('df-tools tui --once --raw', { ...env... });
  // Match structural framing from the renderer, not data content
  assert.ok(out.includes('Org Context'), 'org panel header missing');
  assert.ok(out.includes('Peer Sessions'), 'peer panel header missing');
  assert.ok(out.includes('Active Initiatives'), 'initiatives panel header missing');
});
```

E2E tests pin the COMPOSITION contract (renderer + data load wired correctly), not specific data values.

</anti_patterns>

<error_recovery>

### EX1 fails because the surface differs from expected

If EX1 produces a diff between actual and expected:
1. Inspect the actual surface: `node -e "console.log(Object.keys(require('./plugins/devflow/devflow/bin/lib/tui.cjs')).sort())"`
2. Decide: is the actual surface intentional (08-01/08-02 added something not anticipated)?
   - If YES: update EX1's expected array to match. Update 08-CONTEXT.md §5 with the new entries. Document the change in this TRD's SUMMARY as a Rule 1 auto-fix.
   - If NO: trim the unintended exports from tui.cjs. Re-run EX1.
3. The locked surface is THE specification — EX1 is the gate. Adjust either side based on intent.

### E2E test J1 throws (exit code != 0)

execSync throws when the subprocess exits non-zero. Inspect the thrown error:
- `e.status` — exit code
- `e.stdout` / `e.stderr` — captured output

Common causes:
- Awareness cache schema mismatch — caused by stale cache file; clear with `rm .planning/.awareness-cache.json`
- Initiatives home permission issue — chmod the home dir (rare)
- Renderer threw — should be impossible per SC-8, but if it happened, escalate to TRD 08-01 fix

### E2E test J3 (pipe-friendly) hangs

If the test exceeds the 10s timeout: the non-TTY auto-fallback isn't firing. Check that `_runOneShot` is being called (08-02 wiring), and that the `process.exit(0)` at end of `_runOneShot` is reached. Add temporary `console.error('reached _runOneShot end')` to confirm.

### Skill file isn't picked up by Claude

After creating `skills/tui/SKILL.md`, the user must restart Claude or run `/plugin` reload for new skills to register. This is a manual step, not part of automated verification. The TRD verification is "skill file exists with correct structure"; "skill is invokable" is implicitly verified by the user when they next say `/devflow:tui`.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/objectives/08-program-aware-tui/08-CONTEXT.md
@plugins/devflow/devflow/bin/lib/dup-detect.cjs
@plugins/devflow/devflow/bin/lib/tui.cjs
@plugins/devflow/devflow/bin/lib/tui-cli.cjs
@plugins/devflow/skills/check-todos/SKILL.md
@plugins/devflow/skills/initiatives/SKILL.md
</context>

<gotchas>

- **Banner comment text is verbatim.** EX3 greps for the literal string "LOCKED by TRD 08-03" — match it exactly.
- **Sorted Object.keys.** EX1 uses `.sort()` on actual keys before comparing; the expected array is alphabetically sorted (underscores before letters).
- **execSync cwd.** Group J tests must run from the repo root, not from `__dirname`. Use `path.resolve(__dirname, '../../../../..')` (5 levels up from `lib/`) or `process.cwd()` if test runner is invoked from root. Check with a `console.log(cwd)` during initial RED run if unsure.
- **execSync timeout.** Default is none (waits forever). Always pass `timeout: 10000` (10s) to fail fast on hangs.
- **Skill directory structure.** It's `skills/tui/SKILL.md` not `skills/tui.md`. Each skill is a DIRECTORY containing exactly one SKILL.md. Mirror existing skills (check-todos, initiatives, awareness).
- **Skill frontmatter is YAML.** Triple-dashes, YAML keys, then content. Required keys: `name`, `description`, `argument-hint` (or omit if no args), `allowed-tools` (list).

</gotchas>

## Test list (TDD playbook)

**Group EX — export-lock surface (SC-9)**
- [ ] EX1: `Object.keys(require('./tui.cjs')).sort()` deep-equals the locked 7-entry array
- [ ] EX2: `tui.render` is a function (sanity)
- [ ] EX3: `tui.cjs` source contains the literal string `LOCKED by TRD 08-03`

**Group J — e2e self-test (SC-10)**
- [ ] J1: `df-tools tui --once --raw` against this repo exits 0 within 10s
- [ ] J2: J1 output contains the three expected panel headers (`Org Context`, `Peer Sessions`, `Active Initiatives`)
- [ ] J3: `df-tools tui --once --raw` piped through `head -5` (non-TTY) does not hang and exits 0

**Group K — skill structural test**
- [ ] K1: `skills/tui/SKILL.md` exists
- [ ] K2: SKILL.md frontmatter contains `name: tui`
- [ ] K3: SKILL.md body contains `df-tools tui` (CLI invocation)

**Total: 9 new test cases** + EX1 acts as the gate for any future export changes.

<tasks>

<task type="auto">
  <name>Task 1: RED — write Groups EX, J, K with expected-failure assertions</name>
  <files>plugins/devflow/devflow/bin/lib/tui.test.cjs</files>
  <action>
Append three new describe blocks (Groups EX, J, K) to the existing `lib/tui.test.cjs`.

This is the RED phase. EX1 fails because the locked banner comment hasn't been added (EX3) and the expected surface might not match exactly (depends on what 08-01 + 08-02 actually exported). J1-J3 may pass already if 08-02 ran the manual checkpoint correctly. K1-K3 fail because the skill file doesn't exist yet.

Approach:

```js
// At top of tui.test.cjs (if not already present):
const { execSync } = require('node:child_process');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ... existing Groups A-I ...

describe('Group EX: export surface (TRD 08-03 lock)', () => {
  test('EX1: lib/tui.cjs exports exactly 7 entries (locked surface)', () => {
    // Force a fresh require to avoid caching across test runs
    delete require.cache[require.resolve('./tui.cjs')];
    const tui = require('./tui.cjs');
    const expected = [
      '_layoutPanels',
      '_renderInitiativesPanel',
      '_renderOrgPanel',
      '_renderPeerPanel',
      '_resetMocks',
      '_setRunStdout',
      'render',
    ];
    assert.deepStrictEqual(Object.keys(tui).sort(), expected);
  });

  test('EX2: render is a function', () => {
    const tui = require('./tui.cjs');
    assert.equal(typeof tui.render, 'function');
  });

  test('EX3: banner comment "LOCKED by TRD 08-03" present in tui.cjs source', () => {
    const src = fs.readFileSync(require.resolve('./tui.cjs'), 'utf8');
    assert.ok(src.includes('LOCKED by TRD 08-03'),
      'banner comment "LOCKED by TRD 08-03" not found in tui.cjs source — required by SC-9');
  });
});

describe('Group J: e2e self-test (SC-10)', () => {
  // Compute repo root: tui.test.cjs lives at plugins/devflow/devflow/bin/lib/
  // → repo root is 5 levels up
  const REPO_ROOT = path.resolve(__dirname, '../../../../..');
  const DF_TOOLS = path.resolve(__dirname, '../df-tools.cjs');

  test('J1: df-tools tui --once --raw exits 0 within 10s', () => {
    let out = '';
    try {
      out = execSync(`node "${DF_TOOLS}" tui --once --raw`, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 10000,
      });
    } catch (e) {
      assert.fail('df-tools tui --once --raw exited non-zero or timed out: ' +
                  (e.stderr || e.message || String(e)));
    }
    assert.ok(typeof out === 'string');
    assert.ok(out.length > 0, 'expected non-empty output');
  });

  test('J2: output contains expected panel framing', () => {
    const out = execSync(`node "${DF_TOOLS}" tui --once --raw`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ok(out.includes('Org Context'),       'top panel header "Org Context" missing');
    assert.ok(out.includes('Peer Sessions'),     'middle panel header "Peer Sessions" missing');
    assert.ok(out.includes('Active Initiatives'),'bottom panel header "Active Initiatives" missing');
  });

  test('J3: piped (non-TTY) does not hang; exits 0 in < 10s', () => {
    // Use spawnSync with a piped stdout (no TTY); confirm exit code 0 and bounded time.
    const start = Date.now();
    const r = cp.spawnSync('node', [DF_TOOLS, 'tui'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 10000,
      // No stdio:'inherit' — so stdout is captured, NOT a TTY → triggers auto-fallback
    });
    const elapsed = Date.now() - start;
    assert.equal(r.status, 0, 'expected exit 0; got ' + r.status + '\nstderr: ' + r.stderr);
    assert.ok(elapsed < 10000, 'took ' + elapsed + 'ms; suspect hang');
    assert.ok(r.stdout && r.stdout.length > 0, 'expected captured stdout');
  });
});

describe('Group K: /devflow:tui skill structural', () => {
  const SKILL_PATH = path.resolve(__dirname, '../../../../skills/tui/SKILL.md');

  test('K1: skills/tui/SKILL.md exists', () => {
    assert.ok(fs.existsSync(SKILL_PATH), 'expected ' + SKILL_PATH);
  });

  test('K2: SKILL.md frontmatter contains name: tui', () => {
    const src = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(/^name:\s*tui\s*$/m.test(src), 'expected "name: tui" in frontmatter');
  });

  test('K3: SKILL.md body invokes df-tools tui', () => {
    const src = fs.readFileSync(SKILL_PATH, 'utf8');
    assert.ok(src.includes('df-tools tui'),
      'expected "df-tools tui" CLI invocation in skill body');
  });
});
```

Commit: `test(08-03): add export-lock + e2e + skill structural tests (RED)`.

# CRITICAL: Tests must FAIL on first run. EX3 fails because banner not yet added; K1-K3 fail because skill not yet created.
# CRITICAL: J tests may PASS at this point if 08-02 wiring is solid. That's OK — the tests still serve as the regression gate.
# GOTCHA: REPO_ROOT path math: from `plugins/devflow/devflow/bin/lib/`, repo root is 5 directories up. Confirm with `node -e "console.log(require('path').resolve('plugins/devflow/devflow/bin/lib', '../../../../..'))"` — should print absolute path to the repo root.
# GOTCHA: SKILL_PATH path math: skill files are at `plugins/devflow/skills/{name}/SKILL.md`. From `bin/lib/`, that's `../../../../skills/tui/SKILL.md` (4 ups, then down).
# PATTERN: Mirror obj 4 EX1/EX2/EX3 from dup-detect.test.cjs (the canonical example).
  </action>
  <verify>
1. `npm test 2>&1 | grep -E '(EX[0-9]|J[0-9]|K[0-9])' | tail -20`

   Expected: EX1/EX2/EX3 — at least EX3 fails (banner not yet added). EX1 may pass if surface already matches; EX2 should pass.
   J1/J2/J3 may pass (08-02 wiring works) or fail (depends on 08-02 completion).
   K1/K2/K3 — all fail (skill file doesn't exist).

2. Total fail count: at least 4 new fails (EX3 + K1 + K2 + K3 minimum). May be more.

3. No regressions in existing tests: existing pass count unchanged.
  </verify>
  <done>
- 9 new test cases added across Groups EX, J, K.
- Tests run; at least 4 fail (the RED signal).
- No existing tests regress.
- Commit: `test(08-03): add export-lock + e2e + skill structural tests` (RED phase commit).
  </done>
  <recovery>
If EX1 already passes: 08-01/08-02 produced exactly the expected surface — proceed to GREEN tasks. The test still serves as a regression gate.

If a J test fails for an unrelated reason (e.g., timeout because the renderer is slow): increase timeout to 30000ms; document in SUMMARY.

If REPO_ROOT path math is wrong (path doesn't exist): print the resolved path and adjust the up-count. The test is for verification regardless of path math; the math just needs to land on the actual repo root.

If a Group K assertion is too strict (e.g., the skill's frontmatter uses `name: tui` with extra whitespace): relax the regex but keep the contract (must contain `name: tui` in some form).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — add LOCKED banner to tui.cjs + create /devflow:tui SKILL.md</name>
  <files>plugins/devflow/devflow/bin/lib/tui.cjs, plugins/devflow/skills/tui/SKILL.md</files>
  <action>
Two changes:

**(a) lib/tui.cjs:** Replace the existing module.exports block with the locked surface + banner.

Approach: find the existing `module.exports = { ... };` block at the bottom of `lib/tui.cjs` (added in TRD 08-01). Replace it with the locked, banner-fronted version below.

```js
// ─── module.exports — LOCKED by TRD 08-03 (7-entry surface; SC-9) ─────────────
//
// This block is the AUTHORITATIVE export surface for lib/tui.cjs.
// Asserted by EX1 test in tui.test.cjs: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating EX1 + 08-CONTEXT.md §5 "Module surface".
//
// Surface recount:
//   1 public renderer (render)
//   3 sub-renderers (_renderOrgPanel, _renderPeerPanel, _renderInitiativesPanel)
//   1 layout helper (_layoutPanels)
//   2 test hooks (_setRunStdout, _resetMocks)
//   Total = 7

module.exports = {
  // Public renderer (TRD 08-01):
  render,

  // Sub-renderers (TRD 08-01):
  _renderOrgPanel,
  _renderPeerPanel,
  _renderInitiativesPanel,

  // Layout helper (TRD 08-01):
  _layoutPanels,

  // Test hooks (TRD 08-01):
  _setRunStdout,
  _resetMocks,
};
```

**(b) plugins/devflow/skills/tui/SKILL.md:** Create the slash command thin orchestrator.

Approach: create the directory + SKILL.md. Mirror skills/check-todos/SKILL.md structure exactly.

```markdown
---
name: tui
description: |
  Open the program-aware TUI viewer — a read-only terminal UI showing parallel sessions + their position in the org tree. Three vertically-stacked panels: org tree (Product × Quarter from the Product Roadmap project), peer awareness (active branches with author + objective + last commit), and active initiatives (slug + Why summary + open question count). tmux-pane safe; reflows narrow terminals (< 80 cols). Read-only — no mutation. `r` refreshes; `q` exits cleanly.
  Use when the user wants to see what's happening across parallel sessions, get a high-level view of the program/initiative landscape, or visualize where their current work sits in the org. Composes obj 1 (gh chain) + obj 2 (peer awareness) + obj 5 (initiatives) + obj 6 (todo aggregation cache) into a single screen.
  Triggers on: "open tui", "show tui", "program viewer", "what's running across sessions", "show org tree", "tui", "show peer sessions", "what's everyone working on", "tui viewer".
argument-hint: "[--once] [--raw] [--no-color] [--reset-only]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Open the program-aware TUI viewer (`df-tools tui`). Read-only; composes obj 2 peer awareness + obj 5 initiatives + obj 2 cached org chain into a 3-panel stacked terminal view.

Modes:

- **Default (interactive):** opens alternate-screen, hides cursor, enters raw mode. `r` re-fetches data and re-renders. `q` (or Ctrl-C) exits cleanly with terminal state restored.
- **`--once`:** renders once + exits without entering raw mode. Useful when you want a snapshot but not an interactive session.
- **`--raw`:** renders once + writes ANSI to stdout WITHOUT entering alternate screen. Pipe-friendly. Implies `--once`.
- **`--no-color`:** strips foreground color codes (keeps box drawing + cursor positioning). Useful in pipelines that re-render the output.
- **`--reset-only`:** recovery hatch. Emits cursor-show + alt-screen-leave + SGR-reset escapes then exits. Use after a previous TUI session was killed -9 (terminal state stuck).

Auto-fallback: when stdout is non-TTY (piped, redirected, running in a non-interactive environment), `df-tools tui` automatically switches to `--once --raw` mode.

Locked v1.1 limitations: read-only (no mutations), manual refresh only (no auto-poll), 3 stacked panels (no multi-pane layouts), `r` and `q` are the only keystrokes accepted.
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.awareness-cache.json
</execution_context>

<process>
**Run the TUI CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs tui $ARGUMENTS
```

The CLI:

1. Parses flags: `--once`, `--raw`, `--no-color`, `--reset-only`.
2. Detects TTY: non-TTY stdout/stdin auto-falls back to `--once --raw` (warning to stderr).
3. Loads data from existing sources (no new fetchers): obj 2 `readCache(cwd)` for peer + cached org sections; obj 5 `loadInitiatives({})` for global initiatives home.
4. For interactive mode: writes alt-screen + hide-cursor escapes; registers cleanup on `process.on('exit')` + SIGINT + SIGTERM; enters raw mode; renders; awaits keystrokes.
5. For one-shot/raw mode: renders to stdout once + exits 0.

**After the command runs:**

- If invoked from chat (non-TTY context): the output is rendered ANSI; present it in a code block so it preserves verbatim. Do NOT summarize the panels — the user wants the structured view, not a paraphrase.
- If invoked from an interactive terminal: control returns when the user presses `q` or Ctrl-C. The user has already seen the TUI; no further presentation needed.

If the user reports their terminal is "stuck" (cursor missing, screen weird) after a previous TUI session: run `node ~/.claude/devflow/bin/df-tools.cjs tui --reset-only`.
</process>

<context>
The TUI is a read-only viewer. To act on anything visible:

- **Peer sessions** — `git checkout <branch>` to switch to a peer's work, or `gh issue view <issue>` for the GH context.
- **Initiatives** — `/devflow:initiatives show <slug>` to see the full initiative body (Why, Open Questions, Sub-issues).
- **Org tree entries** — `gh issue view <issue>` for the upstream tracking issue.

Locked v1.1 decisions (relevant to user expectations):

- Hand-rolled ANSI rendering (no TUI library dependency); ~600-line render module.
- Refresh model: manual only (`r` keypress); no auto-poll. By design — eliminates flicker + battery drain in idle terminals.
- Snapshot-tested: every render scenario has a committed expected ANSI fixture; pure-function renderer is deterministic.
- Future TUI features (selection, drill-down, mutations) are explicitly v1.2+ scope.

Subcommand options:

- `df-tools tui` — interactive mode (default).
- `df-tools tui --once` — render once, exit cleanly. No alt-screen, no raw mode.
- `df-tools tui --raw` — render once, write ANSI to stdout. Pipe-friendly. Implies `--once`.
- `df-tools tui --no-color` — strip foreground color codes. Useful with `--raw` for pipelines.
- `df-tools tui --reset-only` — emit recovery escapes (cursor-show + alt-screen-leave + SGR-reset). Use after a killed session.

Requires obj 2 awareness cache (`/devflow:awareness scan-peer`) and obj 5 initiatives (`/devflow:initiatives sync`) for the richest view. With neither cached, the TUI still renders — it just shows "(no peer sessions)" / "(no org context)" / "(no initiatives)" placeholders. Never crashes (SC-8 resilience).
</context>
```

# CRITICAL: SKILL.md goes in `plugins/devflow/skills/tui/SKILL.md`. Create the directory if it doesn't exist (`mkdir -p plugins/devflow/skills/tui`).
# CRITICAL: SKILL.md frontmatter triple-dashes + YAML keys. The `description` is a multi-line YAML scalar (uses `|` for literal block).
# GOTCHA: `$ARGUMENTS` is the literal string in the bash code block — Claude's slash-command runner substitutes it at invocation. Do NOT escape or quote.
# PATTERN: Mirror skills/check-todos/SKILL.md exactly. Same frontmatter shape, same XML body sections, same arg-passthrough idiom.
  </action>
  <verify>
1. lib/tui.cjs banner present:
   `grep -c "LOCKED by TRD 08-03" plugins/devflow/devflow/bin/lib/tui.cjs`

   Expected: 1 (single match).

2. Module loads + correct surface:
   `node -e "delete require.cache[require.resolve('./plugins/devflow/devflow/bin/lib/tui.cjs')]; const t = require('./plugins/devflow/devflow/bin/lib/tui.cjs'); console.log(JSON.stringify(Object.keys(t).sort()));"`

   Expected: `["_layoutPanels","_renderInitiativesPanel","_renderOrgPanel","_renderPeerPanel","_resetMocks","_setRunStdout","render"]`.

3. SKILL.md exists + has correct shape:
   `cat plugins/devflow/skills/tui/SKILL.md | head -20`

   Expected: `---` followed by `name: tui`, `description: |`, etc.

4. SKILL.md invokes df-tools tui:
   `grep -c "df-tools tui" plugins/devflow/skills/tui/SKILL.md`

   Expected: at least 1 (likely 2-3 instances in objective + process + context).

5. Test pass:
   `npm test 2>&1 | tail -5`

   Expected: ALL tests pass — Groups EX, J, K all green; no regressions; total count = baseline + 9 from this TRD.
  </verify>
  <done>
- `lib/tui.cjs` has the LOCKED banner comment + 7-entry surface (in alphabetical-sorted order; banner mentions "TRD 08-03").
- `skills/tui/SKILL.md` exists with valid frontmatter (name, description, argument-hint, allowed-tools) + body with `df-tools tui` invocation.
- All 9 new tests (EX1/2/3, J1/2/3, K1/2/3) pass.
- Total test count: baseline (1097) + 30+ from 08-01 + 11 from 08-02 + 9 from 08-03 ≈ 1147+. Zero failures.
- Commits: `feat(08-03): lock tui module surface + add /devflow:tui skill` (the GREEN feat commit). Optional `refactor(08-03): ...` if cleanup happened.
  </done>
  <recovery>
If EX1 still fails after the banner is added: the actual surface differs from expected. Run the verify step #2 to see the real surface; either fix tui.cjs to match the expected list, or update EX1's expected list (and 08-CONTEXT.md §5) to match reality. Document the choice in the SUMMARY.

If a J test fails: the e2e regression is real. Inspect captured stderr (test failure message). Common fixes: clear stale cache (`rm .planning/.awareness-cache.json`), check tui-cli.cjs is properly wired in df-tools.cjs.

If K2 fails because the regex doesn't match: the SKILL.md frontmatter has typos or unexpected formatting. Read the file; fix the frontmatter; re-run.

If the skill seems to work in tests but doesn't appear in `/devflow:` autocomplete: that's user-side — they need to restart Claude or reload plugins. Document in SUMMARY but don't block the TRD on it.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Verify e2e self-test against this repo's actual state + close-out</name>
  <files>plugins/devflow/devflow/bin/lib/tui.test.cjs</files>
  <action>
Final closing verification: confirm the e2e test (J1/J2/J3) actually exercises this repo's data, not just empty placeholders.

This task does NOT add new code — it adds an additional sanity assertion to Group J that pins the integration:

```js
test('J4: output reflects this repo\'s state (not empty placeholders only)', () => {
  // Some integration sanity: at least ONE of the panels should have non-placeholder
  // content, given that this repo has a peer cache + initiatives + org cache.
  // (If all panels show placeholders, either the cache is missing OR the integration
  // wiring is broken. Both are interesting failures to surface.)
  const out = execSync(`node "${DF_TOOLS}" tui --once --raw`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10000,
  });

  const allPlaceholders =
    out.includes('(no org context') &&
    out.includes('(no peer sessions') &&
    out.includes('(no initiatives');

  // Either at least one source has data, OR all are empty (acceptable in a fresh checkout
  // before any /devflow:awareness scan / /devflow:initiatives sync). Document the actual
  // state in the test failure message so the user can act on it.
  if (allPlaceholders) {
    process.stderr.write('\n[J4] All TUI panels show placeholders. This is acceptable\n');
    process.stderr.write('[J4] in a fresh checkout, but if you expected data, run:\n');
    process.stderr.write('[J4]   /devflow:awareness scan-peer\n');
    process.stderr.write('[J4]   /devflow:initiatives sync\n');
  }

  // The assertion itself: the output is non-empty and contains the panel framing.
  // (J2 already covers framing; J4's value is the diagnostic stderr above.)
  assert.ok(out.length > 100, 'output suspiciously short: ' + out.length + ' chars');
});
```

Add this test to Group J. It's a soft-integration gate: it accepts both data-present and data-absent states, but logs a hint when the latter is true.

After adding J4: run the full test suite one final time and confirm everything is green.

# CRITICAL: J4 must NOT fail when the repo has no awareness/initiatives cache. Fresh checkouts are valid; the TUI still works (renders placeholders).
# GOTCHA: Use process.stderr.write inside tests for diagnostic output; it appears in the test runner's output. assert.fail() would block the test; we don't want that for the "all placeholders" case.
# PATTERN: Mirror obj 2's TRD 02-07 IT4 pattern (skip-or-warn rather than hard-fail when integration data is absent).
  </action>
  <verify>
1. Final test run:
   `npm test 2>&1 | tail -10`

   Expected: total count ≈ 1148+; 0 failures. Stderr may contain `[J4] All TUI panels show placeholders.` if the repo has no caches — that's acceptable.

2. Module surface frozen:
   `node -e "console.log(require('./plugins/devflow/devflow/bin/lib/tui.cjs').render({}))" | head -5`

   Expected: prints panel framing + placeholders (cores like "(no peer sessions)") to stdout. Does not crash.

3. Skill registered (best-effort, manual confirmation):
   `ls plugins/devflow/skills/tui/`

   Expected: `SKILL.md` listed.

4. Documentation cross-check:
   `grep -l "8-program-aware-tui\|TRD 08" plugins/devflow/devflow/bin/lib/tui.cjs plugins/devflow/devflow/bin/lib/tui-cli.cjs`

   Expected: both files reference TRD 08 in comments / banners.

5. End-to-end smoke test (subprocess timing):
   `time node plugins/devflow/devflow/bin/df-tools.cjs tui --once --raw > /tmp/tui-output.txt`

   Expected: completes in < 2 seconds. Output file size > 100 bytes.

   Then: `wc -l /tmp/tui-output.txt` — expect 20-50+ lines depending on data.
  </verify>
  <done>
- J4 added; passes (with or without cached data).
- Full test suite green: 0 failures across all groups (A-G + X + H + I + EX + J + K).
- Module surface for `lib/tui.cjs` confirmed locked at 7 entries with banner comment.
- `/devflow:tui` skill exists at `plugins/devflow/skills/tui/SKILL.md` with valid frontmatter + body.
- E2E self-test (`df-tools tui --once --raw`) runs against this repo, completes in < 2s, exits 0, emits ANSI with all 3 panel headers.
- Commit: `feat(08-03): close v1.1 — TUI export-lock + skill + e2e self-test` OR `chore(08-03): final v1.1 verification`.
- Per TDD playbook: 2-3 atomic commits across this TRD (test → feat → optional refactor/chore).
  </done>
  <recovery>
If J4 fails because output is suspiciously short (< 100 chars): the renderer is producing degraded output. Inspect the captured output via `node ... tui --once --raw > /tmp/out.txt` and look for missing panel headers or truncated frame.

If the test suite is unstable (passes sometimes, fails sometimes): the most likely cause is non-determinism in the renderer (Date.now() leaking in, cache state varying). Audit the render function for impurity; remove any Date/random/env access. The pure-function contract is locked in TRD 08-01.

If `df-tools tui --once --raw` completes in > 5 seconds: the data load is slow (probably scanPeer running git fetch). Confirm `_loadData` uses `no_fetch: true` for the fallback path (it should — TRD 08-02 task 1).

If everything passes but the user reports the slash command doesn't work in their session: they need to restart Claude or reload plugins (sync-runtime hook fires on SessionStart). Document in SUMMARY; not blocking for this TRD.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- 9 new test cases pass (Group EX: 3, Group J: 4 with J4, Group K: 3).
- Full suite: 0 failures across all groups across all 3 TRDs (08-01 + 08-02 + 08-03).
- `lib/tui.cjs` exports exactly 7 entries; banner comment present.
- `skills/tui/SKILL.md` exists with valid frontmatter + body.
- `df-tools tui --once --raw` runs end-to-end against this repo; emits ANSI with all 3 panel headers; exits 0 in < 2s.
- Pipe-friendly: `df-tools tui | head` does not hang.
- Per TDD playbook: 2-3 atomic commits (test → feat → optional refactor/chore).

After this TRD: **Objective 8 is COMPLETE. v1.1 milestone is COMPLETE.**
</verification>

<success_criteria>
- SC-6: ✓ `/devflow:tui` skill invokes the CLI (verified by Group K + manual `/devflow:tui` invocation by user).
- SC-9: ✓ `lib/tui.cjs` exports stable LOCKED surface: `render`, `_renderOrgPanel`, `_renderPeerPanel`, `_renderInitiativesPanel`, `_layoutPanels`, `_setRunStdout`, `_resetMocks`. Asserted by EX1.
- SC-10: ✓ Self-test: `df-tools tui --once --raw` renders this repo's actual state to stdout as ANSI; exits 0; exits cleanly even when piped to non-TTY (Group J: J1/J2/J3/J4).
</success_criteria>

<output>
After completion, create `.planning/objectives/08-program-aware-tui/08-03-skill-and-export-lock-SUMMARY.md` with:
- Final test count by group across all 3 TRDs (A-G + X + H + I + EX + J + K)
- Total v1.1 test count (baseline + obj 8 contribution)
- Module surface confirmation (7 entries, alphabetical-sorted)
- Skill file path + frontmatter shape verification
- E2E timing measurement (`df-tools tui --once --raw` actual elapsed time)
- Any RED → GREEN cycle deviations (e.g., EX1 passed at RED because surface already matched)
- Commit hashes (test:, feat:, optional refactor/chore:)
- **Objective 8 closeout statement: SC-1 through SC-10 all met. v1.1 DONE.**
</output>
