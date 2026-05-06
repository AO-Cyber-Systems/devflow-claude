---
objective: 17-phase-c-auto-init
trd: "04"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/global-config.cjs
  - plugins/devflow/devflow/bin/lib/global-config.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/global-config-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - C4
must_haves:
  truths:
    - "df-tools global-config get <key> returns the value from ~/.claude/devflow/global-config.json or default"
    - "df-tools global-config set <key> <value> writes the JSON file atomically"
    - "auto_init_substantive_projects defaults to false when key or file is missing"
    - "shouldAutoInit() helper exposes the boolean for classify-session.js consumption"
    - "Corrupt JSON falls back to default config gracefully (no crash; warning to stderr)"
    - "Unknown keys are preserved on read (forward-compat for v1.3+ keys)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/global-config.cjs"
      provides: "readConfig + writeConfig + shouldAutoInit + cmdGlobalConfig CLI entry"
      min_lines: 100
      exports: ["readConfig", "writeConfig", "shouldAutoInit", "cmdGlobalConfig", "GLOBAL_CONFIG_PATH", "DEFAULT_CONFIG"]
    - path: "plugins/devflow/devflow/bin/lib/global-config.test.cjs"
      provides: "Pure-function + CLI tests covering get/set/default/corrupt/forward-compat"
      min_lines: 180
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/global-config-fixtures.cjs"
      provides: "Hand-built factory + named SCENARIOS for config file states"
      min_lines: 40
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'global-config' switch arm with get/set subcommands"
      contains: "case 'global-config'"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/global-config.cjs"
      via: "require + case 'global-config' switch arm"
      pattern: "require.*lib/global-config"
    - from: "plugins/devflow/devflow/bin/lib/global-config.cjs"
      to: "~/.claude/devflow/global-config.json"
      via: "fs.readFileSync + atomic write via .tmp rename"
      pattern: "global-config\\.json"
---

<objective>
Build `lib/global-config.cjs` (read/write helpers for `~/.claude/devflow/global-config.json`) plus the `df-tools global-config get|set` CLI surface. TDD via the locked test list in 17-RESEARCH.md. Expose `shouldAutoInit()` helper that 17-03 consumes from `classify-session.js`.

Purpose: C4 from issue #28. Optional auto-init mode lets advanced users skip the offer-and-confirm flow for substantive non-DevFlow projects. Default OFF. Opt-in via `df-tools global-config set auto_init_substantive_projects true`. This TRD ships the persistence + CLI in isolation; 17-03 wires the consumption side.

Output: New `lib/global-config.cjs` + tests + fixtures + df-tools.cjs case arm. CLI works end-to-end: `df-tools global-config get <key>` and `df-tools global-config set <key> <value>`. JSON file format matches #28 spec (`{ "auto_init_substantive_projects": false }`).
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                          ← MODIFY (add 1 case arm + import)
└── lib/
    ├── global-config.cjs                                 ← CREATE (readConfig + writeConfig + shouldAutoInit + cmdGlobalConfig)
    ├── global-config.test.cjs                            ← CREATE (~21 test cases per test list)
    └── __fixtures__/
        └── global-config-fixtures.cjs                    ← CREATE (factory + SCENARIOS)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: config module skeleton (mirror decline-tracker structure from 17-02)

```js
// plugins/devflow/devflow/bin/lib/global-config.cjs
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { output, error } = require('./helpers.cjs');

const DEVFLOW_HOME = path.join(os.homedir(), '.claude', 'devflow');
const GLOBAL_CONFIG_PATH = path.join(DEVFLOW_HOME, 'global-config.json');

// LOCKED: keys with default values. Future v1.3+ keys are added here.
const DEFAULT_CONFIG = {
  auto_init_substantive_projects: false,
};

// fs injection
const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  renameSync: (...a) => fs.renameSync(...a),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// Path injection (so tests don't trample real ~/.claude/devflow/)
let _runConfigPath = GLOBAL_CONFIG_PATH;
function _setConfigPath(p) { _runConfigPath = (p != null) ? p : GLOBAL_CONFIG_PATH; }
```

### Pattern: graceful read with default merge

```js
function readConfig() {
  if (!_runFs.existsSync(_runConfigPath)) {
    return { ...DEFAULT_CONFIG };
  }
  let parsed;
  try {
    const raw = _runFs.readFileSync(_runConfigPath, 'utf-8');
    parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('config root must be a plain object');
    }
  } catch (e) {
    process.stderr.write(`[global-config] corrupt config at ${_runConfigPath}, using defaults: ${e.message}\n`);
    return { ...DEFAULT_CONFIG };
  }
  // Merge with defaults — known missing keys filled, unknown keys preserved (forward-compat)
  return { ...DEFAULT_CONFIG, ...parsed };
}

function writeConfig(config) {
  const dir = path.dirname(_runConfigPath);
  if (!_runFs.existsSync(dir)) _runFs.mkdirSync(dir, { recursive: true });
  const tmpPath = _runConfigPath + '.tmp';
  _runFs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  _runFs.renameSync(tmpPath, _runConfigPath);
}

function shouldAutoInit() {
  return readConfig().auto_init_substantive_projects === true;
}
```

### Pattern: CLI dispatch (mirror cmdSkillActive at skill-active.cjs:215+)

```js
function cmdGlobalConfig(cwd, args, raw) {
  const op = args[0];
  if (op === 'get') {
    const key = args[1];
    if (!key) error('Usage: df-tools global-config get <key>');
    const config = readConfig();
    const value = (key in config) ? config[key] : null;
    output({ key, value }, raw, JSON.stringify(value));
    return;
  }
  if (op === 'set') {
    const key = args[1];
    const rawValue = args[2];
    if (!key || rawValue === undefined) error('Usage: df-tools global-config set <key> <value>');
    if (!(key in DEFAULT_CONFIG)) {
      process.stderr.write(`[global-config] warning: unknown key "${key}" (allowed: ${Object.keys(DEFAULT_CONFIG).join(', ')})\n`);
    }
    const value = _coerceValue(rawValue); // 'true' → true, 'false' → false, '42' → 42, else string
    const config = readConfig();
    config[key] = value;
    writeConfig(config);
    output({ key, value, written: true }, raw, JSON.stringify({ key, value, written: true }));
    return;
  }
  error(`Unknown global-config subcommand: "${op}". Usage: get|set <key> [<value>]`);
}

function _coerceValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  return raw; // string fallback
}
```

### Pattern: switch arm in df-tools.cjs

```js
// Top imports:
const { cmdGlobalConfig } = require('./lib/global-config.cjs');

// Switch dispatch:
case 'global-config': {
  cmdGlobalConfig(cwd, args.slice(1), raw);
  break;
}
```

</codebase_examples>

<anti_patterns>

- **Do NOT use real `~/.claude/devflow/global-config.json` in tests.** Always `_setConfigPath(tmpPath)` BEFORE any function under test. Tests trample real config otherwise.
- **Do NOT throw on unknown keys in `set`.** Warn to stderr and write the key anyway. This is forward-compat: v1.3 may add keys this v1.2 binary doesn't know about.
- **Do NOT validate value types beyond coercion.** `set <key> <value>` accepts strings; coercion to bool/int/float is best-effort. Validation is the caller's job.
- **Do NOT expose `process.env.DEVFLOW_CONFIG_PATH` overrides.** Single source of truth: `~/.claude/devflow/global-config.json`. Env var overrides invite drift between sessions.
- **Do NOT silently swallow JSON parse errors** in production code. Write a stderr warning so the user knows their config was rejected. Tests can assert the warning if needed.
- **Do NOT split DEFAULT_CONFIG across files.** All defaults live in `global-config.cjs`. v1.3 adds keys here; v1.2 binaries see unknown keys as forward-compat noise.

</anti_patterns>

<error_recovery>

- **`fs.mkdirSync(DEVFLOW_HOME, { recursive: true })` when `~/.claude/` doesn't exist** — `recursive: true` creates parents. No special handling.
- **`fs.renameSync` cross-filesystem** — same-dir `.tmp` (locked path) means no cross-fs concern. Lock with code comment.
- **Corrupt JSON file user accidentally edited** — `readConfig()` writes warning to stderr, returns defaults. User's bad edit doesn't break DevFlow. They can re-run `set` to overwrite.
- **Config file deleted between read + write** — atomic write recreates it. No race window where DevFlow sees a partial file.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/17-phase-c-auto-init/17-CONTEXT.md
@.planning/objectives/17-phase-c-auto-init/17-RESEARCH.md

@plugins/devflow/devflow/bin/lib/skill-active.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<research_context>

## Locked file format (from #28)

```json
{
  "auto_init_substantive_projects": false
}
```

Top-level: object with config keys. v1.2 ships exactly one key. Forward-compat: extra keys preserved on read.

## Locked CLI surface

```bash
df-tools global-config get <key>             # prints value (or null if absent), JSON in --raw mode
df-tools global-config set <key> <value>     # writes value (coerces 'true'/'false' to bool, digits to number)
df-tools global-config get auto_init_substantive_projects   # → "false" or "true"
df-tools global-config set auto_init_substantive_projects true   # → writes { auto_init_substantive_projects: true }
```

## Locked function signatures

```js
function readConfig() → { ...DEFAULT_CONFIG, ...userConfig }   // forward-compat merge
function writeConfig(config) → void                            // atomic write via .tmp rename
function shouldAutoInit() → boolean                            // sugar over readConfig().auto_init_substantive_projects === true
function cmdGlobalConfig(cwd, args, raw) → void                // CLI entry
```

## Test list (locked from 17-RESEARCH.md test list 17-04)

21 cases — all must appear as `test('case N: ...', ...)` calls per TDD playbook habit 2.

</research_context>

<gotchas>

- **Default config object is COPIED on every read** — use `{ ...DEFAULT_CONFIG, ...parsed }` to avoid mutation bleed. If a caller mutates the returned config, DEFAULT_CONFIG stays clean. Test 5 enforces this.
- **`shouldAutoInit()` uses strict equality `=== true`** — `auto_init_substantive_projects: 'true'` (string) returns false. Defensive against config corruption (string was set instead of bool). Test 11 enforces this with mocked config = `{ auto_init_substantive_projects: 'true' }` → false.
- **CLI `set` value coercion** — `'true'` → `true`, `'false'` → `false`, `'42'` → `42`, else stays string. Tests cover all three branches.
- **Forward-compat unknown keys** — `set foo bar` writes `{ foo: 'bar', auto_init_substantive_projects: false }`. Future v1.3 binaries that know `foo` will read it correctly. v1.2 binary just doesn't act on it.
- **HOME env var redirection in tests** — same as 17-02. Tests redirect `os.homedir()` via `_setConfigPath(tmpPath)` for in-process tests, OR via `env: { HOME: tmpHome }` for spawnSync subprocess tests.
- **`process.exit(1)` in `error()`** — bad input (`set` with no key) terminates the process. In tests, wrap in try/catch OR use spawnSync subprocess (mirror skill-active.test.cjs Group D).

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD lib/global-config.cjs read/write/shouldAutoInit + fixtures</name>
  <files>
    plugins/devflow/devflow/bin/lib/global-config.cjs,
    plugins/devflow/devflow/bin/lib/global-config.test.cjs,
    plugins/devflow/devflow/bin/lib/__fixtures__/global-config-fixtures.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for `readConfig`, `writeConfig`, `shouldAutoInit` pure helpers.

**Test list (TDD playbook habit 2 — write FIRST as failing tests):**

`readConfig`:
1. File missing → returns `{ auto_init_substantive_projects: false }` (matches DEFAULT_CONFIG)
2. File present with all known keys (`{ auto_init_substantive_projects: true }`) → returns parsed object
3. File present, partial keys (`{}` empty) → missing keys filled from DEFAULT_CONFIG (returns full default)
4. Corrupt JSON (`'this is not JSON{{{'`) → returns DEFAULT_CONFIG; stderr warning emitted
5. File present with unknown extra keys (`{ auto_init_substantive_projects: true, future_v13_key: 'foo' }`) → preserved (forward-compat)

`writeConfig`:
6. File missing, parent dir exists → file created with parsed JSON
7. File present → values updated, atomic write (verify via spy on `renameSync`)
8. Parent dir missing → mkdir recursive creates it then writes

`shouldAutoInit`:
9. Config missing → returns false
10. `auto_init_substantive_projects: true` → returns true
11. `auto_init_substantive_projects: false` → returns false
12. `auto_init_substantive_projects: undefined` (key absent in file) → returns false (default applies)
13. `auto_init_substantive_projects: 'true'` (string, not bool — corrupt config) → returns false (strict === check)

**Fixture file (build BEFORE the test file):**

`__fixtures__/global-config-fixtures.cjs` — provides `mkTmpConfigPath()` returning a tmpdir-based path safe for `_setConfigPath()` injection. SCENARIOS as locked in 17-RESEARCH.md.

# CRITICAL: Habit 2 — write all 13 cases above as failing tests FIRST. They fail because global-config.cjs doesn't exist.
# CRITICAL: Habit 4 — fixtures are HAND-BUILT. SCENARIOS = { default, enabled, unknown, corrupt } per locked spec.
# GOTCHA: Tests redirect via _setConfigPath BEFORE every function call, _setConfigPath(null) in finally. Test 13 uses _setRunFs to inject a mock readFileSync that returns the corrupt-config string.
# PATTERN: Mirror decline-tracker.test.cjs structure if 17-02 has shipped, OR mirror skill-active.test.cjs (lines 1-200).

**Implementation (GREEN):**

Implement minimally per codebase_examples block. Use spread `{ ...DEFAULT_CONFIG, ...parsed }` for forward-compat merge. Use `=== true` strict check in `shouldAutoInit` for defensive bool handling.

Commits:
- `test(17-04): add failing tests for global-config pure helpers`
- `feat(17-04): implement readConfig/writeConfig/shouldAutoInit + atomic write`
- (REFACTOR optional) `refactor(17-04): extract _coerceValue helper`
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs
# Must pass all 13+ tests.

node -e "
  const c = require('./plugins/devflow/devflow/bin/lib/global-config.cjs');
  console.log('readConfig:', typeof c.readConfig);
  console.log('writeConfig:', typeof c.writeConfig);
  console.log('shouldAutoInit:', typeof c.shouldAutoInit);
  console.log('DEFAULT_CONFIG:', c.DEFAULT_CONFIG);
  console.log('GLOBAL_CONFIG_PATH:', c.GLOBAL_CONFIG_PATH);
"
# Expected:
#   readConfig: function
#   writeConfig: function
#   shouldAutoInit: function
#   DEFAULT_CONFIG: { auto_init_substantive_projects: false }
#   GLOBAL_CONFIG_PATH: /Users/.../.claude/devflow/global-config.json
  </verify>
  <done>
- `lib/global-config.cjs` exists with readConfig + writeConfig + shouldAutoInit + GLOBAL_CONFIG_PATH + DEFAULT_CONFIG + _setConfigPath + _setRunFs exports
- `lib/global-config.test.cjs` has 13+ tests, all passing
- Forward-compat preserved: unknown keys round-trip through read/write (Test 5)
- Strict bool check in shouldAutoInit (Test 13)
- Atomic write spy test verifies `.tmp` then `renameSync` (Test 7)
- 2-3 atomic commits (test + feat, optional refactor)
- No tests touch real `~/.claude/devflow/` directory
  </done>
  <recovery>
If tests fail because real ~/.claude/devflow/global-config.json exists and pollutes state: verify every test uses _setConfigPath(tmp) BEFORE any function call. Check that _resetMocks() and _setConfigPath(null) run in `finally` blocks.

If forward-compat test fails (Test 5): the merge is `{ ...DEFAULT_CONFIG, ...parsed }` — parsed must come SECOND so user's known keys override defaults AND unknown keys pass through.

If shouldAutoInit returns true for string 'true' (Test 13): the check should be `=== true` (strict), not truthy. Read returns `auto_init_substantive_projects: 'true'` from the corrupt config; bool check fails.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TDD CLI surface (global-config get/set) + df-tools.cjs wiring</name>
  <files>
    plugins/devflow/devflow/bin/lib/global-config.cjs,
    plugins/devflow/devflow/bin/lib/global-config.test.cjs,
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for `cmdGlobalConfig` plus df-tools.cjs case-arm wiring.

**Test list (extends Task 1's test file with new describe block):**

CLI behavior:
14. `cmdGlobalConfig(cwd, ['get', 'auto_init_substantive_projects'])` (default state) → outputs "false"
15. `cmdGlobalConfig(cwd, ['set', 'auto_init_substantive_projects', 'true'])` → file written with `{ auto_init_substantive_projects: true }`
16. `cmdGlobalConfig(cwd, ['get', 'auto_init_substantive_projects'])` after set true → outputs "true"
17. `cmdGlobalConfig(cwd, ['set'])` (missing args) → error path → process.exit(1)
18. `cmdGlobalConfig(cwd, ['set', 'foo', 'bar'])` (unknown key) → stderr warning emitted; file written with foo:'bar' anyway
19. `cmdGlobalConfig(cwd, ['get', 'foo'])` (unknown key) → outputs null
20. `cmdGlobalConfig(cwd, ['set', 'auto_init_substantive_projects', 'false'])` → coerces to bool false
21. `cmdGlobalConfig(cwd, ['set', 'some_int', '42'])` → coerces to number 42

Subprocess integration (HOME-redirected):
22. `node df-tools.cjs global-config set auto_init_substantive_projects true` (HOME=tmpdir) → exit 0; file at $TMPHOME/.claude/devflow/global-config.json contains `{ "auto_init_substantive_projects": true }`
23. `node df-tools.cjs global-config get auto_init_substantive_projects --raw` → exit 0, stdout = "true" (or JSON in --raw mode)

# CRITICAL: Subprocess tests use env: { ...process.env, HOME: tmpHome } to redirect os.homedir(). Verified pattern from awareness-cli.test.cjs.
# GOTCHA: Test 17 (missing args → process.exit) — call from a child_process.spawnSync OR wrap the call in try/catch since error() throws via process.exit.
# PATTERN: Mirror skill-active.test.cjs Group D (CLI tests) lines 200-300 for in-process IO capture pattern. Use process.stdout.write spy.

**df-tools.cjs wiring:**

Add 1 case arm:
```js
// Top imports:
const { cmdGlobalConfig } = require('./lib/global-config.cjs');

// Switch dispatch:
case 'global-config': {
  cmdGlobalConfig(cwd, args.slice(1), raw);
  break;
}
```

Verify:
```bash
grep -n "case 'global-config'" plugins/devflow/devflow/bin/df-tools.cjs
# Should print 1 line.
```

Commits:
- `test(17-04): add failing tests for global-config CLI`
- `feat(17-04): wire cmdGlobalConfig into df-tools.cjs`
  </action>
  <verify>
# Tests
node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs
# Must pass all 21+ cases.

# Subprocess smoke
TMPHOME=$(mktemp -d)
HOME="$TMPHOME" node plugins/devflow/devflow/bin/df-tools.cjs global-config set auto_init_substantive_projects true
cat "$TMPHOME/.claude/devflow/global-config.json"
# Expected: { "auto_init_substantive_projects": true }

HOME="$TMPHOME" node plugins/devflow/devflow/bin/df-tools.cjs global-config get auto_init_substantive_projects
# Expected stdout includes "true"

HOME="$TMPHOME" node plugins/devflow/devflow/bin/df-tools.cjs global-config set auto_init_substantive_projects false
cat "$TMPHOME/.claude/devflow/global-config.json"
# Expected: { "auto_init_substantive_projects": false }

rm -rf "$TMPHOME"

# df-tools.cjs case arm registered
grep -n "case 'global-config'" plugins/devflow/devflow/bin/df-tools.cjs
# Expected: 1 line

# Full test suite
npm test 2>&1 | tail -5
# Expected: 1726 + 21 = ~1747 tests pass (no new failures)
  </verify>
  <done>
- `cmdGlobalConfig` exported from global-config.cjs
- df-tools.cjs has case 'global-config' + import statement
- Subprocess smoke test (HOME-redirected) round-trips set true → get true
- All 21 tests pass
- npm test full suite: net +21 tests (no new failures)
- Coercion verified: 'true' → true, '42' → 42, 'bar' → 'bar' (Tests 18, 20, 21)
- 2 atomic commits (test + feat)
  </done>
  <recovery>
If subprocess smoke test fails because HOME redirection isn't honored: confirm `os.homedir()` reads HOME on macOS/Linux. Some shells may set USER but not HOME — debug with `echo $HOME` before the test.

If `--raw` flag isn't propagated correctly: check df-tools.cjs lines ~30-60 where raw is extracted. The output() helper formats JSON when raw=true.

If grep returns more matches than expected (e.g., `case 'global-config-foo'`): use stricter regex `grep -nE "^\s*case 'global-config':"`.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/devflow/bin/lib/global-config.test.cjs</test>
</validation_gates>

<verification>
Acceptance criteria from #28 (this TRD covers C4):
- [ ] `~/.claude/devflow/global-config.json` exists when user runs `set` (Task 1 cases 6-8, Task 2 case 22)
- [ ] `auto_init_substantive_projects` defaults to false when missing (Task 1 cases 1, 9)
- [ ] CLI `get` returns current value (Task 2 cases 14, 16, 23)
- [ ] CLI `set` writes value with bool/number coercion (Task 2 cases 15, 20-21)
- [ ] Forward-compat: unknown keys preserved on read (Task 1 case 5)
- [ ] Corrupt JSON falls back to defaults gracefully (Task 1 case 4)
- [ ] Atomic write so partial failure never corrupts file (Task 1 case 7)
- [ ] `shouldAutoInit()` exposed for 17-03 consumption (Task 1 cases 9-13)
- [ ] Pre-existing 1726 tests still pass

Truth-coverage:
- Truth #1 (read returns value or default): Task 1 cases 1-3, Task 2 cases 14, 16
- Truth #2 (write atomic): Task 1 case 7
- Truth #3 (default false): Task 1 case 1, Task 2 case 14
- Truth #4 (shouldAutoInit helper): Task 1 cases 9-13
- Truth #5 (corrupt JSON graceful): Task 1 case 4
- Truth #6 (forward-compat unknown keys): Task 1 case 5, Task 2 case 18
</verification>

<success_criteria>
- 4 files created/modified (3 NEW: global-config.cjs + .test.cjs + fixtures; 1 MODIFY: df-tools.cjs)
- 21 new tests pass; npm test full suite has 1726 + 21 ≈ 1747 passing
- Subprocess smoke test round-trips set → get end-to-end
- shouldAutoInit() ready for 17-03 consumption
- 4-6 atomic commits (RED → GREEN per task, optional REFACTOR)
- SUMMARY.md captures: test counts, commit hashes, sample JSON written
- Phase C acceptance criterion #5 satisfied (auto-init off by default; opt-in works)
</success_criteria>

<output>
After completion, create `.planning/objectives/17-phase-c-auto-init/17-04-SUMMARY.md`
</output>
