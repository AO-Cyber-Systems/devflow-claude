---
objective: 17-phase-c-auto-init
created: 2026-05-04
status: complete
---

# Phase C — Auto-init detection: Research

## Standard stack (existing patterns to follow)

### Two-tier API pattern (pure logic + I/O wrapper)

Mirrors `lib/brownfield-detector.cjs` (obj 14 TRD 14-03):

```js
// Pure function — testable without filesystem
function detectXxx({ planningExists, codebaseMapExists, sourceFileCount, threshold = 50 }) { ... }

// I/O wrapper — reads filesystem, calls pure function, emits CLI output
function cmdDetectXxx(cwd, targetCwd, raw) {
  const root = targetCwd ? path.resolve(targetCwd) : cwd;
  if (!fs.existsSync(root)) { error('cwd not found'); return; }
  const planningExists = fs.existsSync(path.join(root, '.planning'));
  const result = detectXxx({ planningExists, ... });
  output(result, raw, JSON.stringify(result));
}
```

This pattern is the de facto standard for new df-tools detectors. Use it for `project-state.cjs`.

### Module structure (mirror skill-active.cjs / brownfield-detector.cjs)

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// Optional fs injection for testability
const realFs = { existsSync: ..., readFileSync: ..., writeFileSync: ... };
let _runFs = realFs;
function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _resetMocks() { _runFs = realFs; }

// Pure functions
function detectXxx(opts) { ... }

// CLI entry
function cmdDetectXxx(cwd, args, raw) { ... }

module.exports = { detectXxx, cmdDetectXxx, _setRunFs, _resetMocks };
```

`_setRunFs` enables tests to inject a controlled filesystem. Used by skill-active.test.cjs, micro.test.cjs.

### df-tools.cjs case-arm registration

```js
// At top of df-tools.cjs (~line 173):
const { cmdDetectBrownfieldMap } = require('./lib/brownfield-detector.cjs');

// In the switch dispatch (~line 389):
case 'project-state': {
  cmdProjectState(cwd, args[1], raw);
  break;
}
```

Each new CLI gets ONE case arm. Use `args[1]` for the first positional arg, `args.slice(1)` for variadic.

### Test framework

`node:test` + `node:assert/strict`. Tests live adjacent to source as `<name>.test.cjs`. Fixtures live in `lib/__fixtures__/<name>-fixtures.cjs`. Always factory-function builders, never LLM-generated test data.

```js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { detectXxx } = require('./xxx.cjs');
const { mkAmbient, mkScratch } = require('./__fixtures__/xxx-fixtures.cjs');

describe('detectXxx', () => {
  test('case 1: ambient project → true', () => {
    const root = mkAmbient();
    try {
      assert.equal(detectXxx({ root }).is_substantive, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
```

## Don't hand-roll (use what exists)

### Source file counting — extract or duplicate?

`brownfield-detector.cjs` already has `countSourceFiles(root)` with EXCLUDE/EXTS sets. Two options:

**Option A: Extract to shared helper** — `lib/source-file-count.cjs` exporting `countSourceFiles(root)` + `EXCLUDE`/`EXTS` constants. Refactor brownfield-detector to import it.

**Option B: Duplicate the function in project-state.cjs** — accept the duplication; keep modules independent.

**Recommendation: Option B for now.** The function is ~30 LOC and likely to diverge (project-state may want primary_lang detection too). Duplicate first, extract on the third use. Document the parallel in a `// PARALLEL:` comment in both files.

### git history age detection

```js
const { spawnSync } = require('child_process');
function gitAgeDays(cwd) {
  const r = spawnSync('git', ['log', '--reverse', '--format=%ct', '-n', '1'], {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (r.status !== 0) return null;
  const firstCommitUnix = parseInt(r.stdout.trim(), 10);
  if (isNaN(firstCommitUnix)) return null;
  const nowUnix = Math.floor(Date.now() / 1000);
  return Math.floor((nowUnix - firstCommitUnix) / 86400);
}
```

Mirrors `awareness.cjs:234` (`spawnSync('git', args, ...)`). Returns null on failure; caller treats null as "no git history" (not substantive).

### Atomic JSON write pattern

```js
function writeJsonAtomic(filePath, obj) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2));
  fs.renameSync(tmpPath, filePath);
}
```

Used in: `awareness.cjs` cache writes, `gh.cjs` mapping writes. Standard pattern.

### Home directory resolution

```js
const os = require('os');
const path = require('path');
const DEVFLOW_HOME = path.join(os.homedir(), '.claude', 'devflow');
const DECLINED_PROJECTS_PATH = path.join(DEVFLOW_HOME, 'declined-projects.json');
const GLOBAL_CONFIG_PATH = path.join(DEVFLOW_HOME, 'global-config.json');
```

Mirror existing `~/.claude/devflow/` paths used by sync-runtime.js + audit log (15-05).

## Common pitfalls (anti-patterns)

### Don't treat null git age as substantive

`gitAgeDays(cwd)` returns `null` when `git log` fails (no commits, not a repo, etc.). Substantive heuristic must treat `null` as "0 days" — `(git_age_days > 7)` evaluates false on null. Don't accidentally short-circuit to true.

### Don't use sync git in hot paths without timeout

`spawnSync('git', ...)` blocks. classify-session.js is SessionStart hot-path. Use a timeout:

```js
const r = spawnSync('git', args, {
  cwd, encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'],
});
if (r.error || r.status !== 0) return null;
```

The 2s timeout is generous; git log on first commit is fast even on large repos.

### Don't fail-loud in classify-session.js

Existing pattern (15-01): try/catch wraps `main()`, errors go to stderr only. classify-session never crashes the session. Apply the same pattern to project-state I/O failures: catch, return safe defaults.

### Don't expand decline JSON file unbounded

If user works on 1000 projects, the decline JSON could grow. Two mitigations:

1. **Auto-prune expired entries on read.** When `readDecline()` loads the file, drop any entry with `expires_at < now`. Caller never sees expired entries; file is only re-written on next `writeDecline` call (lazy cleanup).
2. **Cap at 1000 entries.** If file exceeds 1000 keys, drop oldest by `declined_at`. Unlikely to hit; defensive only.

For obj 17 ship: implement (1), defer (2) until we observe growth in practice.

### Don't break back-compat with classifier.cjs API

15-01's `classifySession({ planningDir, hasGitDir, hasDeclineMarker })` is called by classify-session.js AND tested in classifier.test.cjs. Adding new params `isSubstantive` and `previouslyDeclined` must:

- Default to safe values when omitted (e.g., `isSubstantive=true` defaults to false → `init-offer` becomes `skip`; safer to default `isSubstantive=true` so back-compat tests still pass)
- Existing 18 tests in classifier.test.cjs MUST continue to pass without modification, OR be updated minimally with the new params filled in to match the OLD truth table behavior

**Recommendation:** Default new params to backward-compatible values (`isSubstantive: true`, `previouslyDeclined: false`) so existing tests still pass. New tests cover the new combinations.

### Don't read project-state in classify-session.js without graceful fallback

If project-state I/O fails (permission denied, weird filesystem state), classify-session.js must NOT crash. Wrap the project-state lookup in try/catch and fall back to `{ is_substantive: false, previously_declined: false }`. False isSubstantive → skip mode → no offer → safe.

## Architecture patterns

### Decline file lifecycle

```
[user opens substantive non-devflow project]
  → classify-session.js calls project-state
  → project-state.previously_declined → false
  → classifySession → 'init-offer'
  → preamble injected: "Want to set up planning?"

[user types: "no thanks"]
  → user OR claude calls: df-tools project-decline
  → decline-tracker.writeDecline(cwd) writes JSON entry with 30-day expiry
  → Next session: project-state.previously_declined → true → 'skip' mode

[30 days pass]
  → readDecline auto-prunes expired entry
  → project-state.previously_declined → false → 'init-offer' fires again

[user changes mind early]
  → df-tools project-accept clears entry immediately
```

### Global config lifecycle

```
[default state] auto_init_substantive_projects = false (file may not exist)
  → classify-session.js init-offer mode → standard offer preamble

[user enables] df-tools global-config set auto_init_substantive_projects true
  → ~/.claude/devflow/global-config.json written: { "auto_init_substantive_projects": true }
  → Next session: classify-session.js reads config → true → AUTO_INIT_PREAMBLE
  → AUTO_INIT_PREAMBLE directs Claude: "Fire /devflow:new-project --auto on first work prompt"
```

### Test list checklist (TDD playbook habit 2)

Each TDD TRD ships a test list before any test code. Lists below are LOCKED for each TRD and must appear verbatim in the test file as `test('case N: ...', ...)` calls.

#### 17-01 project-state test list

Pure-function `isSubstantive` cases:
1. git_age_days=240, code_files=47, has_manifest=true, is_scratch=false → true
2. git_age_days=2, code_files=5, has_manifest=true, is_scratch=false → false (neither git nor file threshold met)
3. git_age_days=240, code_files=5, has_manifest=true, is_scratch=false → true (git age threshold met)
4. git_age_days=2, code_files=20, has_manifest=true, is_scratch=false → true (file threshold met)
5. git_age_days=240, code_files=47, has_manifest=false, is_scratch=false → false (no manifest)
6. git_age_days=240, code_files=47, has_manifest=true, is_scratch=true → false (scratch dir)
7. git_age_days=null (no git), code_files=20, has_manifest=true, is_scratch=false → true (file threshold met)
8. git_age_days=null, code_files=5, has_manifest=true, is_scratch=false → false

Pure-function `isScratchDir` cases:
9. /tmp/foo → true
10. /var/folders/abc/T/xyz → true
11. /Users/x/Downloads/repo → true
12. /Users/x/Source/repo → false
13. /home/user/projects/myapp → false

Pure-function `detectManifest` cases:
14. dir contains package.json → has_manifest:true, primary_lang:'javascript'/'typescript' (based on tsconfig presence)
15. dir contains Cargo.toml → has_manifest:true, primary_lang:'rust'
16. dir contains pyproject.toml → has_manifest:true, primary_lang:'python'
17. dir contains go.mod → has_manifest:true, primary_lang:'go'
18. dir contains Gemfile → has_manifest:true, primary_lang:'ruby'
19. dir contains pom.xml → has_manifest:true, primary_lang:'java'
20. no manifest → has_manifest:false, primary_lang:null

CLI integration cases (5 fixtures from #28):
21. ambient project (.planning/ + .git/ + manifest) → has_planning:true, has_git:true, is_substantive:true
22. brownfield no-planning (.git/ + manifest + 50 source files) → has_planning:false, is_substantive:true
23. scratch dir under /tmp → is_scratch_dir:true → is_substantive:false
24. no-git (manifest only, no .git/) → has_git:false, is_substantive depends on file count
25. declined project (decline file present) → previously_declined:true, decline_expires:non-null

#### 17-02 decline-tracker test list

`writeDecline` cases:
1. write to non-existent file → file created with single entry
2. write to existing file → entry merged (other entries preserved)
3. write same cwd twice → second write overwrites (declined_at + expires_at refreshed)
4. write with custom durationDays=14 → expires_at = declined_at + 14 days
5. write with default duration → expires_at = declined_at + 30 days

`readDecline` cases:
6. file missing → returns { declined: false, expires_at: null }
7. cwd not in file → returns { declined: false, expires_at: null }
8. cwd in file, not yet expired → returns { declined: true, expires_at: '...' }
9. cwd in file, expired (expires_at < now) → returns { declined: false, expires_at: null } AND auto-prunes entry from file
10. corrupt JSON → returns { declined: false, expires_at: null } (graceful fail-open)

`clearDecline` cases:
11. file missing → no-op (no error)
12. cwd not in file → no-op (no error, file untouched)
13. cwd in file → entry removed; other entries preserved
14. only entry → file written as `{}`

CLI cases:
15. `df-tools project-decline` (no args) → uses cwd, writes 30-day entry
16. `df-tools project-decline /some/path` → writes entry for explicit path
17. `df-tools project-decline --duration-days 60` → writes 60-day entry
18. `df-tools project-accept` → clears cwd entry
19. `df-tools project-accept` (no entry) → exits 0 silently
20. atomic write → `<file>.tmp` is removed after successful write

#### 17-03 classifier extension test list

Updated `classifySession` truth table (extends 15-01's 18 tests):
1. existing 15-01 ambient case still returns 'ambient' (back-compat smoke)
2. existing 15-01 init-offer case (planningDir=null, hasGitDir=true) with default isSubstantive=true → still 'init-offer' (back-compat)
3. existing 15-01 skip cases unchanged
4. NEW: planningDir=null, hasGitDir=true, isSubstantive=false → 'skip'
5. NEW: planningDir=null, hasGitDir=true, isSubstantive=true, previouslyDeclined=true → 'skip'
6. NEW: planningDir=null, hasGitDir=true, isSubstantive=true, previouslyDeclined=false → 'init-offer'
7. NEW: hasDeclineMarker=true (legacy .planning/.devflow-init-declined) still wins → 'skip'

`classify-session.js` integration cases:
8. brownfield substantive project (git + manifest + 50 files, NO decline) → emits INIT_OFFER preamble
9. brownfield non-substantive (git + 2 files + no manifest) → no stdout (skip)
10. brownfield substantive but project-decline file says declined → no stdout (skip)
11. ambient project (existing test still passes) → DEVFLOW PROJECT DETECTED preamble
12. project-state I/O error (chmod scenario) → no crash, falls back to safe defaults → no stdout
13. INIT_OFFER_PREAMBLE mentions `/devflow:new-project --auto`

#### 17-04 global-config test list

`readConfig` cases:
1. file missing → returns DEFAULT_CONFIG
2. file present with all keys → returns parsed object
3. file present, partial keys → missing keys filled from DEFAULT_CONFIG
4. corrupt JSON → returns DEFAULT_CONFIG (graceful fail-open) AND writes warning to stderr
5. file present, extra keys → preserved (forward-compat for v1.3+ keys)

`writeConfig` cases:
6. file missing → directory created if needed, file written
7. file present → values updated, other keys preserved
8. atomic write → `.tmp` removed after success

`shouldAutoInit` cases:
9. config missing → false
10. auto_init_substantive_projects=true → true
11. auto_init_substantive_projects=false → false
12. auto_init_substantive_projects=undefined → false (default applies)

CLI cases:
13. `df-tools global-config get auto_init_substantive_projects` → prints "false" (default)
14. `df-tools global-config set auto_init_substantive_projects true` → file written
15. `df-tools global-config get auto_init_substantive_projects` (after set) → prints "true"
16. `df-tools global-config set` (missing args) → error, exit 1
17. `df-tools global-config set foo bar` (unknown key) → warns but writes (forward-compat)
18. `df-tools global-config get foo` → returns null/undefined for unknown keys

`classify-session.js` integration:
19. when init-offer mode AND auto_init=true → emits AUTO_INIT_PREAMBLE (different from INIT_OFFER_PREAMBLE)
20. when init-offer mode AND auto_init=false → emits INIT_OFFER_PREAMBLE (existing behavior)
21. AUTO_INIT_PREAMBLE mentions `/devflow:new-project --auto`

## Locked preamble texts

### INIT_OFFER_PREAMBLE (updated for C2)

Today's text (from 15-01):

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

Updated text (TRD 17-03):

```
DEVFLOW INIT OFFER — substantive non-DevFlow project detected

This is a git repository without .planning/ that meets the substantive-project
heuristic (git history >7 days OR >10 source files, with a manifest, not a
scratch dir). If the user requests a non-trivial change (multi-file feature,
plan, milestone work), offer:

  "This looks like a substantive project but DevFlow isn't set up.
   Want me to run /devflow:new-project --auto to bootstrap it (~2 min),
   or skip and edit directly?"

If the user declines, run: df-tools project-decline
This suppresses future offers in this project for 30 days.

For trivial changes (single-file, <2 line), proceed directly without offering.
```

### AUTO_INIT_PREAMBLE (new, TRD 17-04)

```
DEVFLOW AUTO-INIT ACTIVE — substantive non-DevFlow project detected

This is a substantive git repository without .planning/, and the user has
opted into auto-init mode (auto_init_substantive_projects=true in
~/.claude/devflow/global-config.json).

When the user submits their first work-flavored request (not Q&A or
exploration), automatically invoke:

  /devflow:new-project --auto

Do NOT prompt. The user has pre-authorized this via global config. If you
need to abort, the user can run: df-tools global-config set auto_init_substantive_projects false

For Q&A or exploration prompts, respond directly without auto-initing.
```

## Hand-built fixtures (TDD playbook habit 4)

Locked fixture signatures for `__fixtures__/project-state-fixtures.cjs`:

```js
// Filesystem scaffolds (caller cleans up via fs.rmSync)
mkAmbientProject()           // .planning/ + .git/ + package.json + 5 source files
mkBrownfieldSubstantive()    // .git/ + package.json + 50 source files, no .planning/
mkBrownfieldThinGit()        // .git/ (1 commit, today) + 5 source files, no manifest
mkScratchDir(prefix)         // tmpdir under specified prefix (use os.tmpdir() default)
mkScratchDirInTmp()          // tmpdir under /tmp explicitly (for is_scratch_dir test)
mkNoGitProject()             // package.json + 5 source files, no .git/
mkDeclinedProject(declineFile, expiresInDays)  // mkBrownfieldSubstantive + decline file present
mkManifestVariants(lang)     // produces dir with package.json | Cargo.toml | pyproject.toml | go.mod | Gemfile | pom.xml

// Pure-function input builders
buildSubstantiveInputs({ git_age_days, code_files, has_manifest, is_scratch })
```

Locked signatures for `__fixtures__/decline-tracker-fixtures.cjs`:

```js
mkDeclineFile(entries)       // write declined-projects.json with given entries to fresh DEVFLOW_HOME tmpdir
buildDeclineEntry({ declined_at, expires_at })
SCENARIOS = {
  empty: () => ({}),
  oneActive: () => ({ '/some/path': { declined_at: NOW, expires_at: NOW_PLUS_30D } }),
  oneExpired: () => ({ '/some/path': { declined_at: PAST, expires_at: PAST_PLUS_1D } }),
  mixed: () => ({ '/active': ..., '/expired': ... }),
}
```

Locked signatures for `__fixtures__/global-config-fixtures.cjs`:

```js
mkConfigFile(config)         // write global-config.json with given object to fresh DEVFLOW_HOME tmpdir
SCENARIOS = {
  default: () => ({ auto_init_substantive_projects: false }),
  enabled: () => ({ auto_init_substantive_projects: true }),
  unknown: () => ({ auto_init_substantive_projects: false, future_v13_key: 'foo' }),
  corrupt: () => 'this is not JSON{{{',
}
```

## Multi-tenancy guard (TDD playbook habit 6)

DevFlow Claude is a single-user developer tool. **Multi-tenant assertions don't apply.** Skip this habit per playbook (only relevant for multi-tenant codebases like AODex/AOSentry).

## Outside-in entry point (TDD playbook habit 5)

For 17-03 (classifier integration), outside-in starts at the SUBPROCESS test layer (mirrors 15-01 pattern):

1. **Outermost:** `spawnSync('node', [classify-session.js], { cwd: tmpdir })` — emits expected JSON or empty
2. **Middle:** `classifySession({ ... })` pure function tests
3. **Innermost:** `isSubstantive(...)` / `isScratchDir(...)` pure-function tests in 17-01

For 17-01, 17-02, 17-04 (CLI surfaces), outside-in starts at the CLI layer:

1. **Outermost:** `spawnSync('node', ['df-tools.cjs', 'project-state'])` end-to-end
2. **Middle:** `cmdProjectState(cwd, ...)` in-process IO capture
3. **Innermost:** Pure-function unit tests

Pure-logic features (substantive heuristic computation, decline expiry math) start at unit level — outside-in doesn't apply when there's no user-visible flow.
