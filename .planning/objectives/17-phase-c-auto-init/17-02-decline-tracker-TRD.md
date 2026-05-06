---
objective: 17-phase-c-auto-init
trd: "02"
type: tdd
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/decline-tracker.cjs
  - plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/decline-tracker-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements:
  - C3
must_haves:
  truths:
    - "df-tools project-decline writes a per-cwd entry to ~/.claude/devflow/declined-projects.json with declined_at + expires_at fields"
    - "Default decline duration is 30 days; --duration-days N flag overrides"
    - "df-tools project-accept removes the cwd entry from the JSON file (idempotent)"
    - "readDecline(cwd) returns { declined: bool, expires_at: string|null }; auto-prunes expired entries on read"
    - "Corrupt JSON is handled gracefully (returns safe defaults; never crashes)"
    - "Atomic writes via .tmp rename so partial writes never produce a corrupt file"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/decline-tracker.cjs"
      provides: "writeDecline + readDecline + clearDecline pure helpers + cmdProjectDecline + cmdProjectAccept CLI entries"
      min_lines: 120
      exports: ["writeDecline", "readDecline", "clearDecline", "cmdProjectDecline", "cmdProjectAccept", "DECLINED_PROJECTS_PATH"]
    - path: "plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs"
      provides: "Pure-function + CLI tests covering write/read/clear/expiry/atomic-write per test list"
      min_lines: 200
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/decline-tracker-fixtures.cjs"
      provides: "Hand-built factory builders + named SCENARIOS for decline file states"
      min_lines: 60
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'project-decline' and case 'project-accept' switch arms invoking cmdProjectDecline / cmdProjectAccept"
      contains: "case 'project-decline'"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/decline-tracker.cjs"
      via: "require('./lib/decline-tracker.cjs') + case arms in switch dispatch"
      pattern: "require.*lib/decline-tracker"
    - from: "plugins/devflow/devflow/bin/lib/decline-tracker.cjs"
      to: "~/.claude/devflow/declined-projects.json"
      via: "fs.readFileSync + atomic write via .tmp rename"
      pattern: "declined-projects\\.json"
---

<objective>
Build `lib/decline-tracker.cjs` (read/write helpers for `~/.claude/devflow/declined-projects.json`) plus the `df-tools project-decline` and `df-tools project-accept` CLI surfaces. TDD via the locked test list in 17-RESEARCH.md.

Purpose: C3 from issue #28. Decline tracking is the persistence backbone for Phase C — without it, the substantive-project init offer would re-fire every session even after the user said "no thanks". This TRD ships the persistence layer in isolation; 17-01 consumes `readDecline` to populate `previously_declined` in project-state output, and 17-03 wires the offer flow.

Output: New `lib/decline-tracker.cjs` + tests + fixtures + df-tools.cjs case arms. Two CLI subcommands work end-to-end: `df-tools project-decline [<cwd>] [--duration-days N]` and `df-tools project-accept [<cwd>]`. JSON file format matches #28 spec exactly.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                          ← MODIFY (add 2 case arms + import)
└── lib/
    ├── decline-tracker.cjs                               ← CREATE (writeDecline + readDecline + clearDecline + 2 cmd entries)
    ├── decline-tracker.test.cjs                          ← CREATE (~20 test cases per test list)
    └── __fixtures__/
        └── decline-tracker-fixtures.cjs                  ← CREATE (factory + SCENARIOS)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: two-tier API (mirror skill-active.cjs)

```js
// plugins/devflow/devflow/bin/lib/decline-tracker.cjs
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// LOCKED PATH — must match other ~/.claude/devflow/ uses (sync-runtime.js, audit.log)
const DEVFLOW_HOME = path.join(os.homedir(), '.claude', 'devflow');
const DECLINED_PROJECTS_PATH = path.join(DEVFLOW_HOME, 'declined-projects.json');

const DEFAULT_DURATION_DAYS = 30;

// fs injection for tests
const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  renameSync: (...a) => fs.renameSync(...a),
  unlinkSync: (...a) => fs.unlinkSync(...a),
};
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// Allow override of file path for tests (so tests don't trample real ~/.claude/devflow/)
let _runDeclinePath = DECLINED_PROJECTS_PATH;
function _setDeclinePath(p) { _runDeclinePath = (p != null) ? p : DECLINED_PROJECTS_PATH; }
```

### Pattern: atomic JSON write (mirror gh.cjs writeMapping)

```js
function _writeJsonAtomic(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!_runFs.existsSync(dir)) _runFs.mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  _runFs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2));
  _runFs.renameSync(tmpPath, filePath);
}
```

### Pattern: graceful read (mirror awareness.cjs readCache)

```js
function _readJson(filePath) {
  if (!_runFs.existsSync(filePath)) return {};
  try {
    const raw = _runFs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return (typeof parsed === 'object' && parsed !== null) ? parsed : {};
  } catch {
    // corrupt JSON — fail-open with empty state
    return {};
  }
}
```

### Pattern: switch arm in df-tools.cjs (mirror case 'micro' line 900)

```js
// Top imports (~line 173 area, alphabetical-ish):
const { cmdProjectDecline, cmdProjectAccept } = require('./lib/decline-tracker.cjs');

// In switch dispatch (insert near case 'micro'):
case 'project-decline': {
  // df-tools project-decline [<cwd>] [--duration-days N]
  cmdProjectDecline(cwd, args.slice(1), raw);
  break;
}

case 'project-accept': {
  // df-tools project-accept [<cwd>]
  cmdProjectAccept(cwd, args.slice(1), raw);
  break;
}
```

### Pattern: factory-builder fixtures (mirror skill-route-fixtures.cjs / classifier-fixtures.cjs)

```js
// __fixtures__/decline-tracker-fixtures.cjs
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function mkTmpDeclineHome() {
  // Returns a path safe to use as DECLINED_PROJECTS_PATH override in tests
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'decline-home-'));
  return path.join(home, 'declined-projects.json');
}

function mkDeclineFile(entries, declineFilePath) {
  // Write declined-projects.json with given entries object
  const dir = path.dirname(declineFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(declineFilePath, JSON.stringify(entries, null, 2));
}

const NOW = '2026-05-04T12:00:00.000Z';
const NOW_PLUS_30D = '2026-06-03T12:00:00.000Z';
const PAST = '2026-04-01T12:00:00.000Z';
const PAST_PLUS_1D = '2026-04-02T12:00:00.000Z';

const SCENARIOS = {
  empty: () => ({}),
  oneActive: () => ({
    '/some/path': { declined_at: NOW, expires_at: NOW_PLUS_30D }
  }),
  oneExpired: () => ({
    '/some/path': { declined_at: PAST, expires_at: PAST_PLUS_1D }
  }),
  mixed: () => ({
    '/active': { declined_at: NOW, expires_at: NOW_PLUS_30D },
    '/expired': { declined_at: PAST, expires_at: PAST_PLUS_1D },
  }),
};

module.exports = { mkTmpDeclineHome, mkDeclineFile, SCENARIOS, NOW, NOW_PLUS_30D, PAST, PAST_PLUS_1D };
```

</codebase_examples>

<anti_patterns>

- **Do NOT write to the real `~/.claude/devflow/declined-projects.json` in tests.** Use `_setDeclinePath(tmpPath)` injection. Otherwise tests trample the user's actual decline state. Verify tests use `try { _setDeclinePath(tmp); ... } finally { _setDeclinePath(null); fs.rmSync(home, ...); }`.
- **Do NOT use `Date.now()` directly in pure functions.** Inject `now` as a parameter (`readDecline(cwd, { now })`) so tests can fix time. Mirror the pattern in `skill-active.cjs:startSkill` which takes `now` as a param.
- **Do NOT skip atomic write.** Plain `writeFileSync` produces a corrupt file if the process is killed mid-write. Always write `.tmp` then rename. Test 20 enforces this via `_setRunFs` injection that asserts `renameSync` was called.
- **Do NOT throw on corrupt JSON.** Return `{}` and continue. Decline tracking is best-effort; a corrupt file should not break the whole flow.
- **Do NOT delete the file when the last entry is cleared.** Write `{}` instead. Avoids a TOCTOU race between `existsSync` and read.
- **Do NOT include OS-mutable timestamp fields (mtime) in the JSON schema.** Only `declined_at` and `expires_at` (both ISO 8601 strings). Keep the schema minimal.

</anti_patterns>

<error_recovery>

- **`fs.mkdirSync(DEVFLOW_HOME, { recursive: true })` race condition** — if the directory was created concurrently by another process (e.g., audit log writer), `recursive: true` makes mkdir idempotent. No special handling needed.
- **`fs.renameSync` fails across filesystems** — `os.tmpdir()` may live on a different mount than `~`. We write to `~/.claude/devflow/declined-projects.json.tmp` (same dir as target), so this is not a concern. Lock with comment: `// Atomic rename only works within same filesystem; .tmp lives in same dir as target`.
- **JSON file becomes >100 KB** — defer pagination to v1.3. For v1.2 ship: log a one-time warning if file exceeds 100 entries, no enforcement.
- **`process.exit` in tests** — the existing `error()` helper calls `process.exit(1)`. Tests should call functions with valid inputs, OR catch the process-exit via in-process IO capture pattern (mirror skill-active.test.cjs).

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/17-phase-c-auto-init/17-CONTEXT.md
@.planning/objectives/17-phase-c-auto-init/17-RESEARCH.md

@plugins/devflow/devflow/bin/lib/skill-active.cjs
@plugins/devflow/devflow/bin/lib/skill-active.test.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/classifier-fixtures.cjs
</context>

<research_context>

## Locked file format (from #28)

```json
{
  "/Users/justin/dev/some-repo": {
    "declined_at": "2026-05-05T12:00:00.000Z",
    "expires_at": "2026-06-04T12:00:00.000Z"
  }
}
```

Top-level: object keyed by absolute cwd path. Each value: object with exactly `declined_at` and `expires_at` (both ISO 8601 strings).

## Locked CLI surface

```bash
df-tools project-decline                          # writes entry for cwd, 30-day default
df-tools project-decline /some/path               # writes entry for explicit path
df-tools project-decline --duration-days 60       # writes entry for cwd, 60 days
df-tools project-decline /some/path --duration-days 14  # combines both
df-tools project-accept                           # clears cwd entry
df-tools project-accept /some/path                # clears explicit path entry
```

Both commands return JSON to stdout when invoked with `--raw`, human-readable summary otherwise.

## Locked function signatures

```js
function writeDecline(cwd, { now = new Date().toISOString(), durationDays = 30 } = {}) → { declined_at, expires_at }
function readDecline(cwd, { now = new Date().toISOString() } = {}) → { declined: bool, expires_at: string|null }
function clearDecline(cwd) → { cleared: bool, was_present: bool }
```

`readDecline` auto-prunes expired entries (rewrites file with expired entries removed). Side-effect is intentional and documented.

## Test list (locked from 17-RESEARCH.md, see test list 17-02)

20 cases — all must appear as `test('case N: ...', ...)` calls in the test file (TDD playbook habit 2).

</research_context>

<gotchas>

- **`os.homedir()` vs `process.env.HOME`** — use `os.homedir()`. The env var is unreliable in some shells / hooks.
- **TIME-INJECTION:** Always pass `now` as a string (ISO 8601). Tests can pass `'2026-05-04T12:00:00.000Z'` and assert deterministic outputs. Don't pass Date objects (serialization ambiguity).
- **MUTATION:** `_runFs` is module-scoped state. Tests must `_resetMocks()` in `afterEach` to avoid bleed-over. Tests that don't use `_setRunFs` should be safe (default `realFs` reads/writes real files inside tmpdir).
- **FIXTURE CLEANUP:** `mkTmpDeclineHome` returns a path; the caller MUST `fs.rmSync(path.dirname(returnedPath), { recursive: true, force: true })` in `finally`. Otherwise tmpdirs accumulate.
- **CONCURRENT READ/WRITE:** Two df-tools invocations in parallel could race on the JSON file. Atomic write via rename mitigates corruption but not lost updates. Defer locking to v1.3 — current call sites are interactive (user types `df-tools project-decline`), no concurrency risk in practice.
- **`process.exit(1)` in error()** — when CLI receives bad input (e.g., `--duration-days abc`), `error()` exits the process. In test harness, this propagates as `process.exit` throwing — caller must wrap in try/catch OR test via spawnSync subprocess.

</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: TDD lib/decline-tracker.cjs pure helpers + fixtures</name>
  <files>
    plugins/devflow/devflow/bin/lib/decline-tracker.cjs,
    plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs,
    plugins/devflow/devflow/bin/lib/__fixtures__/decline-tracker-fixtures.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for `writeDecline`, `readDecline`, `clearDecline`.

**Test list (TDD playbook habit 2 — write FIRST as `test('case N: ...')` calls):**

`writeDecline`:
1. Write to non-existent file → file created with single entry; entry has `declined_at` and `expires_at` fields
2. Write to existing file → entry merged (other entries preserved)
3. Write same cwd twice → second write overwrites (declined_at + expires_at refreshed to new now)
4. Write with custom `durationDays: 14` → expires_at = declined_at + 14 days (verified by ISO arithmetic)
5. Write with default duration → expires_at = declined_at + 30 days

`readDecline`:
6. File missing → returns `{ declined: false, expires_at: null }`
7. cwd not in file → returns `{ declined: false, expires_at: null }`
8. cwd in file, not yet expired → returns `{ declined: true, expires_at: '...' }`
9. cwd in file, expired (expires_at < now) → returns `{ declined: false, expires_at: null }` AND removes entry from file (auto-prune)
10. Corrupt JSON → returns `{ declined: false, expires_at: null }` (graceful fail-open)

`clearDecline`:
11. File missing → no-op (returns `{ cleared: false, was_present: false }`); no error
12. cwd not in file → no-op (returns `{ cleared: false, was_present: false }`); other entries untouched
13. cwd in file → entry removed; other entries preserved; returns `{ cleared: true, was_present: true }`
14. Only entry → file written as `{}`, NOT deleted

Atomic write smoke:
15. Spy on _setRunFs to count `writeFileSync` calls + assert one `renameSync` call per write

**Fixture file (build BEFORE the test file, TDD playbook habit 4):**

`__fixtures__/decline-tracker-fixtures.cjs` — factory function `mkTmpDeclineHome()` returns a tmpdir-based path safe for `_setDeclinePath(p)` injection. SCENARIOS named presets per the codebase_examples block.

# CRITICAL: Habit 2 — write all 15 cases above as failing tests FIRST. They must fail because decline-tracker.cjs doesn't exist yet.
# CRITICAL: Habit 4 — fixtures are HAND-BUILT. No LLM-generated test data, no random IDs. Use NOW = '2026-05-04T12:00:00.000Z' as the locked test timestamp.
# GOTCHA: Tests must use _setDeclinePath to redirect away from real ~/.claude/devflow/declined-projects.json. Wrap each test in try/finally to call _resetMocks() and rmSync the tmpdir.
# PATTERN: Mirror skill-active.test.cjs structure (line 1-100) — describe blocks per function, beforeEach/afterEach for tmpdir setup/teardown.

**Implementation (GREEN phase):**

Implement `decline-tracker.cjs` minimally to pass each test. Use the codebase_examples block as the starting structure. Don't optimize prematurely — tests guide the API.

Commits:
- `test(17-02): add failing tests for decline-tracker pure helpers`
- `feat(17-02): implement writeDecline/readDecline/clearDecline + atomic write`
- (REFACTOR optional) `refactor(17-02): extract _readJson / _writeJsonAtomic helpers`
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs
# Must pass all 15+ tests.

node -e "
  const t = require('./plugins/devflow/devflow/bin/lib/decline-tracker.cjs');
  console.log('writeDecline:', typeof t.writeDecline);
  console.log('readDecline:', typeof t.readDecline);
  console.log('clearDecline:', typeof t.clearDecline);
  console.log('DECLINED_PROJECTS_PATH:', t.DECLINED_PROJECTS_PATH);
"
# Expected:
#   writeDecline: function
#   readDecline: function
#   clearDecline: function
#   DECLINED_PROJECTS_PATH: /Users/.../.claude/devflow/declined-projects.json
  </verify>
  <done>
- `lib/decline-tracker.cjs` exists, exports writeDecline + readDecline + clearDecline + DECLINED_PROJECTS_PATH + _setDeclinePath + _setRunFs
- `lib/decline-tracker.test.cjs` has 15+ tests, all passing
- `lib/__fixtures__/decline-tracker-fixtures.cjs` provides mkTmpDeclineHome + SCENARIOS factory builders
- Atomic write verified by spy/mock test (Test 15)
- Auto-prune of expired entries verified (Test 9)
- 2-3 atomic commits per RED-GREEN-REFACTOR cycle
- No tests touch the real `~/.claude/devflow/` directory
  </done>
  <recovery>
If tests fail because real ~/.claude/devflow/ state interferes: verify every test calls `_setDeclinePath(tmpPath)` BEFORE any function under test, and `_setDeclinePath(null)` in `finally`.

If atomic write test (Test 15) is hard to verify: use `_setRunFs({ writeFileSync: ..., renameSync: ... })` to install spies that record call args. Assert spy received the .tmp path then the final path.

If REFACTOR breaks tests: revert via `git reset HEAD~1` and skip the optional refactor commit.
  </recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: TDD CLI surface (project-decline + project-accept) + df-tools.cjs wiring</name>
  <files>
    plugins/devflow/devflow/bin/lib/decline-tracker.cjs,
    plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs,
    plugins/devflow/devflow/bin/df-tools.cjs
  </files>
  <action>
RED → GREEN → REFACTOR for `cmdProjectDecline` and `cmdProjectAccept` plus df-tools.cjs case-arm wiring.

**Test list (extends Task 1's test file with new describe block):**

CLI argument parsing + behavior:
16. `cmdProjectDecline` with no args → uses cwd, calls writeDecline with default 30 days
17. `cmdProjectDecline ['/some/path']` → uses /some/path, calls writeDecline
18. `cmdProjectDecline ['--duration-days', '60']` → calls writeDecline with durationDays=60 for cwd
19. `cmdProjectDecline ['/some/path', '--duration-days', '14']` → writes 14-day entry for /some/path
20. `cmdProjectAccept` with no args → uses cwd, calls clearDecline
21. `cmdProjectAccept ['/some/path']` → calls clearDecline for /some/path
22. `cmdProjectAccept` when cwd has no entry → exits 0 silently (no error thrown)

CLI output:
23. `cmdProjectDecline` raw mode → emits compact JSON with declined_at + expires_at
24. `cmdProjectDecline` non-raw → emits human-readable summary line
25. `cmdProjectAccept` raw mode → emits `{ cleared: bool, was_present: bool }` JSON
26. `cmdProjectDecline` with malformed --duration-days (e.g. "abc") → process.exit(1) via error()

df-tools.cjs subprocess integration (spawnSync):
27. `node df-tools.cjs project-decline /tmp/test-decline-cwd --duration-days 7 --raw` (with HOME redirected to a tmpdir) → exit 0, valid JSON stdout
28. `node df-tools.cjs project-accept /tmp/test-decline-cwd --raw` → exit 0, JSON stdout
29. Round-trip: project-decline → project-state-style read → project-accept → second read shows undeclined (defer state check to 17-01; here just verify file mutations via direct fs.readFileSync)

# CRITICAL: Subprocess tests redirect HOME to a tmpdir via env: { ...process.env, HOME: tmpHome }. This redirects os.homedir(). Verified by node:os documentation and matches the pattern in awareness-cli.test.cjs.
# GOTCHA: --raw flag is parsed by the top-level df-tools dispatcher (line ~250 area). Confirm raw is propagated into args correctly. Verify by inspecting df-tools.cjs args parsing.
# PATTERN: Mirror skill-active.test.cjs Group D (CLI tests) lines 200-300 — in-process cmdSkillActive(...) calls capture stdout via process.stdout.write spy.

**df-tools.cjs wiring:**

Add 2 case arms in the switch dispatch (insert near case 'micro' at line ~900, alphabetical-ish ordering preferred). Add the require import at the top with other lib imports (~line 173).

```js
// Top imports area:
const { cmdProjectDecline, cmdProjectAccept } = require('./lib/decline-tracker.cjs');

// Switch dispatch:
case 'project-decline': {
  cmdProjectDecline(cwd, args.slice(1), raw);
  break;
}
case 'project-accept': {
  cmdProjectAccept(cwd, args.slice(1), raw);
  break;
}
```

Validate the switch arm exists with grep:
```bash
grep -n "case 'project-decline'\|case 'project-accept'" plugins/devflow/devflow/bin/df-tools.cjs
# Should print 2 lines, one for each case.
```

Commits:
- `test(17-02): add failing tests for project-decline + project-accept CLI`
- `feat(17-02): wire cmdProjectDecline + cmdProjectAccept into df-tools.cjs`
  </action>
  <verify>
# Tests
node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs
# Must pass all 29 cases.

# Subprocess smoke (with HOME redirected)
TMPHOME=$(mktemp -d)
HOME="$TMPHOME" node plugins/devflow/devflow/bin/df-tools.cjs project-decline /tmp/test-cwd --duration-days 7 --raw
# Expected: JSON output with declined_at + expires_at, file written at $TMPHOME/.claude/devflow/declined-projects.json

cat "$TMPHOME/.claude/devflow/declined-projects.json"
# Expected: { "/tmp/test-cwd": { "declined_at": "...", "expires_at": "..." } }

HOME="$TMPHOME" node plugins/devflow/devflow/bin/df-tools.cjs project-accept /tmp/test-cwd --raw
# Expected: JSON output { "cleared": true, "was_present": true }

cat "$TMPHOME/.claude/devflow/declined-projects.json"
# Expected: {}

rm -rf "$TMPHOME"

# df-tools.cjs case arms registered
grep -n "case 'project-decline'\|case 'project-accept'" plugins/devflow/devflow/bin/df-tools.cjs
# Expected: 2 lines

# Full test suite still passes
npm test 2>&1 | tail -5
# Expected: 1726 + 29 = ~1755 tests pass (2 pre-existing failures still fail; do not introduce new failures)
  </verify>
  <done>
- `cmdProjectDecline` and `cmdProjectAccept` exported from decline-tracker.cjs
- df-tools.cjs has both case arms + import statement
- Subprocess smoke test (HOME-redirected) round-trips decline → file written → accept → file emptied
- All 29 tests pass
- npm test full suite: net +29 tests (no new failures)
- 2 atomic commits (test + feat)
  </done>
  <recovery>
If subprocess test fails because HOME redirection doesn't work: confirm node uses os.homedir() which respects HOME env var on Linux/macOS. On Windows it uses USERPROFILE — but DevFlow only ships for macOS+Linux per existing tests.

If `--raw` flag isn't propagated: check df-tools.cjs lines ~30-60 where raw is extracted from args. The `args.slice(1)` may include `--raw` or it may be filtered upstream — adjust accordingly.

If grep verification finds extra case arms (e.g. case 'project' partial match): use `grep -nE "^\s*case 'project-(decline|accept)'"` for stricter matching.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test>node --test plugins/devflow/devflow/bin/lib/decline-tracker.test.cjs</test>
<lint>node -e "JSON.parse(require('fs').readFileSync('plugins/devflow/devflow/bin/lib/decline-tracker.cjs', 'utf8')); console.log('parse OK')" || true</lint>
</validation_gates>

<verification>
Acceptance criteria from #28 (this TRD covers C3):
- [ ] `df-tools project-decline` writes a per-cwd entry with declined_at + expires_at (Task 2 cases 16-19, 23-24, 27)
- [ ] Default decline duration = 30 days; `--duration-days N` overrides (Task 1 cases 4-5, Task 2 cases 18-19)
- [ ] `df-tools project-accept` clears entry (idempotent — exits 0 even if absent) (Task 1 cases 11-13, Task 2 cases 20-22, 25)
- [ ] Decline marker persists across sessions (file-based, no in-memory state) — verified by subprocess round-trip in Task 2 case 27-28
- [ ] Decline marker auto-expires after 30 days — readDecline auto-prunes (Task 1 case 9)
- [ ] Atomic write so partial failure never corrupts the file (Task 1 case 15)
- [ ] Pre-existing 1726 tests still pass (npm test full suite)

Truth-coverage:
- Truth #1 (write entry to JSON file): Task 1 cases 1-5, Task 2 cases 16-19, 27
- Truth #2 (default 30 days, --duration-days override): Task 1 cases 4-5, Task 2 cases 18-19
- Truth #3 (project-accept idempotent removal): Task 1 cases 11-13, Task 2 cases 20-22
- Truth #4 (readDecline auto-prune + safe defaults): Task 1 cases 6-10
- Truth #5 (corrupt JSON graceful): Task 1 case 10
- Truth #6 (atomic .tmp rename writes): Task 1 case 15
</verification>

<success_criteria>
- 4 files created/modified (3 NEW: decline-tracker.cjs + .test.cjs + fixtures; 1 MODIFY: df-tools.cjs)
- 29 new tests pass; npm test full suite has 1726 + 29 ≈ 1755 passing
- Subprocess smoke test round-trips decline → accept end-to-end (Task 2 verify block)
- Atomic write verified via spy test (Task 1 case 15)
- 4-6 atomic commits across 2 tasks (RED → GREEN per task, optional REFACTOR)
- SUMMARY.md captures: test counts, commit hashes, sample JSON written by smoke test
- Phase C acceptance criterion #4 satisfied (decline persistence + 30-day expiry)
</success_criteria>

<output>
After completion, create `.planning/objectives/17-phase-c-auto-init/17-02-SUMMARY.md`
</output>
