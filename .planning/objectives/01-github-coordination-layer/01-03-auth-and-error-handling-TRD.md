---
objective: 01-github-coordination-layer
trd: 01-03
title: Auth + error handling — hard-fail with remediation on missing/expired gh auth
type: tdd
confidence: high
wave: 3
depends_on: [01-02]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh.cjs
  - plugins/devflow/devflow/bin/lib/gh.test.cjs
autonomous: true
requirements: [SC-8]
verification_commands:
  - "npm test"
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/gh.cjs plugins/devflow/devflow/bin/lib/gh.test.cjs | grep -E '^[a-f0-9]+ test\\(01-03\\)' | head -1"
  - "node -e 'const gh=require(\"./plugins/devflow/devflow/bin/lib/gh.cjs\"); if(typeof gh.requireGhAuth!==\"function\") throw new Error(\"requireGhAuth not exported\"); console.log(\"OK\");'"
  - "node -e 'const gh=require(\"./plugins/devflow/devflow/bin/lib/gh.cjs\"); try { gh._setRunGh(()=>({ ok:false, status:1, stdout:\"\", stderr:\"You are not logged into any GitHub hosts.\"})); gh.requireGhAuth([\"project\",\"read:project\"]); throw new Error(\"should have thrown\"); } catch(e) { if (!e.remediation || !e.remediation.includes(\"gh auth\")) throw new Error(\"missing remediation: \"+e.message); console.log(\"OK\"); }'"

must_haves:
  truths:
    - "requireGhAuth(requiredScopes) throws a structured error with .remediation field when gh is not installed, returning the install URL"
    - "requireGhAuth throws when gh auth status reports unauthenticated, with remediation 'gh auth login'"
    - "requireGhAuth throws when authenticated but missing required scopes, with remediation 'gh auth refresh -s <scope1>,<scope2>'"
    - "requireGhAuth returns silently (no throw) when gh is installed, authenticated, and has all required scopes"
    - "cmdGhResolve calls requireGhAuth(['project', 'read:project', 'repo']) before any gh API call; on auth failure, exits non-zero with the remediation message printed to stderr (NOT silently degrading)"
    - "Existing subcommands (cmdGhSyncObjectives, cmdGhComment, cmdGhCloseIssue, cmdGhSyncRelease) keep their current 'skip with reason' behavior — back-compat (CONTEXT.md §7)"
    - "Error from requireGhAuth has shape { name: 'GhAuthError', message, remediation, scopes_missing? } — testable via instanceof or property checks"
    - "All new tests have test: commits before feat: commits per TDD Playbook"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/gh.cjs"
      provides: "Adds requireGhAuth(requiredScopes) helper + integration with cmdGhResolve hard-fail flow"
      exports: ["resolveChain", "findRoadmapIssue", "addToProject", "linkSubIssue", "cmdGhResolve", "requireGhAuth", "_resetCache", "_setRunGh", "ghStatus", "cmdGhStatus", "cmdGhSyncObjectives", "cmdGhComment", "cmdGhCloseIssue", "cmdGhSyncRelease"]
    - path: "plugins/devflow/devflow/bin/lib/gh.test.cjs"
      provides: "Adds describe('requireGhAuth') block + cmdGhResolve hard-fail integration tests"
      contains: "requireGhAuth"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/gh.cjs::cmdGhResolve"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::requireGhAuth"
      via: "requireGhAuth called as first action; throws short-circuit cmdGhResolve to non-zero exit"
      pattern: "requireGhAuth\\("
    - from: "plugins/devflow/devflow/bin/lib/gh.cjs::requireGhAuth"
      to: "plugins/devflow/devflow/bin/lib/gh.cjs::_runGh"
      via: "Calls `gh auth status` to detect auth state"
      pattern: "auth.*status"
---

<objective>
Add `requireGhAuth(requiredScopes)` to `lib/gh.cjs` that hard-fails with a structured error containing the exact `gh auth refresh -s ...` remediation command when gh is missing, unauthenticated, or has insufficient scopes. Wire it into `cmdGhResolve` (from TRD 01-02) so `df-tools gh resolve` exits non-zero with the remediation printed to stderr — never silently degrading.

Purpose: Closes objective-1 success criterion 8. This is a **hard inversion** of the existing `lib/gh.cjs` skip-on-fail pattern (used by `cmdGhSyncObjectives` etc.) for the new resolver/sync subcommands. Existing subcommands KEEP their current behavior (back-compat); only new ones use `requireGhAuth`.

Output: `lib/gh.cjs` extended with `requireGhAuth` export + integration into `cmdGhResolve`. New tests in `gh.test.cjs` covering the 4 failure modes (no gh binary, unauthenticated, insufficient scopes, scope subset missing) and the happy path. Atomic commits: `test(01-03):` → `feat(01-03):`.

Why TDD: pure-logic structured-input/output transformation with mockable boundaries (`_runGh` injection from TRD 01-02). Error message structure and exit-code behavior are the testable surface.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── gh.cjs               ← MODIFY (add requireGhAuth + wire into cmdGhResolve)
└── gh.test.cjs          ← MODIFY (add describe('requireGhAuth') block + cmdGhResolve hard-fail tests)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code. Each bullet is a planned test case appended to `gh.test.cjs`.

**Group A — `requireGhAuth` happy path (`describe('requireGhAuth — happy path')`)**
- A1: When `gh auth status` mock returns `ok: true, stdout: 'github.com\n  ✓ Logged in as ...\n  - Token scopes: \"gist\", \"project\", \"read:project\", \"repo\", \"read:org\"'`, `requireGhAuth(['project', 'read:project'])` returns silently.
- A2: When the user has MORE scopes than required, `requireGhAuth(['repo'])` returns silently. (Subset matching, not exact.)
- A3: When `requireGhAuth([])` (empty required scopes) is called and gh is installed + authenticated, returns silently regardless of scope list.

**Group B — `requireGhAuth` fail modes (`describe('requireGhAuth — fail modes')`)**
- B1 missing gh binary: `_runGh` mock returns `ok: false, stderr: 'gh: command not found'` (or the `which gh` check fails) → throws `GhAuthError` with `.remediation` containing the install URL `https://cli.github.com`.
- B2 unauthenticated: mock returns `ok: false, stderr: 'You are not logged into any GitHub hosts.'` → throws `GhAuthError` with `.remediation === 'gh auth login'`.
- B3 missing single scope: mock returns `ok: true, stdout: 'github.com\n  - Token scopes: \"repo\", \"gist\"'`, but `requireGhAuth(['project'])` is called → throws `GhAuthError` with `.scopes_missing === ['project']` and `.remediation === 'gh auth refresh -h github.com -s project'`.
- B4 missing multiple scopes: mock returns scopes `['repo']`, `requireGhAuth(['project', 'read:project'])` → throws with `.scopes_missing === ['project', 'read:project']` and `.remediation === 'gh auth refresh -h github.com -s project,read:project'`.
- B5 expired token: mock returns `ok: false, stderr: 'The token in keyring/store has expired.'` → throws `GhAuthError` with `.remediation === 'gh auth refresh'` (no scopes flag — just refresh).
- B6 partially-listed scopes (gh's output uses BOTH `, ` and `\n  - ` separators across versions): the parser handles both. Mock with `Token scopes: 'gist', 'project'` (line wrap) parses to `['gist', 'project']` correctly.

**Group C — Error shape (`describe('GhAuthError shape')`)**
- C1: Thrown error is an `Error` subclass with `.name === 'GhAuthError'` (testable via `e.name === 'GhAuthError'` or `e instanceof Error`).
- C2: `.message` is human-readable, includes the failure mode (e.g., "GitHub CLI is not authenticated").
- C3: `.remediation` is a runnable shell command string (no quoting issues, no template placeholders).
- C4: `.scopes_missing` is an array (possibly empty for non-scope failures); always present on the error object.

**Group D — `cmdGhResolve` integration (`describe('cmdGhResolve — auth hard-fail')`)**
- D1: When `requireGhAuth` throws (mock returns unauthenticated), `cmdGhResolve` writes the error to stderr (capture via spawnSync), exits with non-zero status. Error JSON includes `error`, `remediation`, `scopes_missing`.
- D2: When `requireGhAuth` succeeds, `cmdGhResolve` proceeds to call `resolveChain` (assert via spy that resolveChain's mocked `_runGh` is called).
- D3: Existing subcommand `cmdGhSyncObjectives` does NOT call `requireGhAuth` — it preserves its `skipped: true` graceful-skip behavior on auth failure (back-compat). Test by mocking auth fail and asserting cmdGhSyncObjectives output contains `skipped: true`, NOT a thrown error.

**Group E — Scope parsing (`describe('parseScopes')`)** — internal helper testable directly
- E1: `parseScopes('  - Token scopes: \"repo\", \"gist\", \"project\"')` → `['repo', 'gist', 'project']`
- E2: `parseScopes('  - Token scopes: \\n      \"repo\",\\n      \"project\"')` (multiline) → `['repo', 'project']`
- E3: `parseScopes('')` → `[]`
- E4: `parseScopes('Token scopes: none')` → `[]` (or `['none']` then handled — be explicit; test expects empty array)

The 18 enumerated cases above cover happy paths (A1–A3, D2), all 5 failure modes (B1–B5), error shape (C1–C4), back-compat preservation (D3), and the scope-parsing edge cases that gh's output formatting introduces (E1–E4, B6).

## RED → GREEN → REFACTOR plan

Two atomic commits (refactor likely unnecessary — small surface):

1. `test(01-03): add failing test list for requireGhAuth + cmdGhResolve hard-fail integration` — Add the 18 cases above as failing tests appended to `gh.test.cjs`. RED confirmed via `npm test`.

2. `feat(01-03): implement requireGhAuth + wire into cmdGhResolve hard-fail` — Implement until all tests pass. Includes:
   - `parseScopes(stdoutLines)` helper (private)
   - `class GhAuthError extends Error` with `.name`, `.remediation`, `.scopes_missing`
   - `requireGhAuth(requiredScopes)` calling `_runGh(['auth', 'status'])`, parsing scopes, throwing on missing
   - `cmdGhResolve` wraps `requireGhAuth(['project', 'read:project', 'repo'])` in try/catch, writes error to stderr + exits non-zero on throw
   - Module export updated to include `requireGhAuth`

<embedded_context>

<codebase_examples>
**Existing `ghStatus` graceful-skip pattern (`gh.cjs` lines 64-82)** — DO NOT mimic this for `requireGhAuth`:

```javascript
function ghStatus(cwd) {
  const cfg = readConfig(cwd);
  const ghCfg = cfg && cfg.github ? cfg.github : null;
  if (!ghCfg || !ghCfg.enabled) {
    return { enabled: false, reason: 'github.enabled is false in .planning/config.json' };
  }
  // ... silent return, no throw
  const auth = runGh(['auth', 'status']);
  if (!auth.ok) {
    return { enabled: false, reason: 'gh not authenticated — run `gh auth login`' };
  }
  return { enabled: true, repo: ghCfg.repo, ... };
}
```

This is the back-compat behavior preserved by `cmdGhSyncObjectives` and friends. The new `requireGhAuth` is the **opposite**: it THROWS instead of returning a status dict. Both functions can coexist; `cmdGhResolve` uses the new one, existing subcommands use the old one.

**Pattern for `gh auth status` parsing**: gh's output looks like:

```
github.com
  ✓ Logged in to github.com account markemerson (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_*****************************
  - Token scopes: 'gist', 'project', 'read:org', 'read:project', 'repo'
```

Parsing strategy: find the line matching `/Token scopes:/`, extract the comma-separated list, strip quotes, split. Handle edge cases (multiline, missing line, "no token" output).

**Existing pattern for ad-hoc CLI errors** (helpers.cjs `error(msg)`): writes to stderr, exits non-zero. But for `cmdGhResolve`, we want STRUCTURED output (JSON to stdout for raw mode) — so don't use `error()`; manually `console.error(JSON.stringify(...))` or use `output(..., raw, ...)` with non-zero exit afterwards.

**Test injection from TRD 01-02**: `gh._setRunGh(mockFn)` is the single mocking surface. `requireGhAuth` uses `_runGh` internally so it's mockable.
</codebase_examples>

<anti_patterns>
- **Do NOT modify existing functions' graceful-skip behavior.** `cmdGhSyncObjectives`, `cmdGhComment`, `cmdGhCloseIssue`, `cmdGhSyncRelease` keep their `{ ok: false, skipped: true, reason }` returns on auth failure. They are back-compat surface. Locked in CONTEXT.md §7.
- **Do NOT add a `--no-auth-check` flag to `gh resolve`.** Hard-fail is hard. The user fixes auth, retries.
- **Do NOT silently downgrade `requireGhAuth` to a warning if scopes are missing.** Throw, exit non-zero, surface the remediation. The user is the only one who can fix scope grants.
- **Do NOT introduce `chalk` or color libraries for the error message.** stderr should be plain text — pipe-friendly.
- **Do NOT use property-based testing for scope-parsing.** The `no_property_based_default` constraint applies. Use enumerated cases (E1–E4 above). gh's output format is stable enough to enumerate.
- **Do NOT use the LLM to generate test fixtures for gh's auth output.** Per `no_llm_test_data`. Hand-build the fixture strings; copy actual `gh auth status` output from a local terminal if needed (sanitize the token first).
- **Do NOT swallow `requireGhAuth` errors in `cmdGhResolve`.** Catch, write structured stderr, exit non-zero. Re-throwing is fine too if the caller (df-tools.cjs's main switch) handles it — but explicit `process.exit(1)` after writing the error is cleaner.
</anti_patterns>

<error_recovery>
- If `gh auth status` returns ok=true but with an empty `Token scopes:` line: gh sometimes prints scopes on a separate line. The `parseScopes` helper should accept `gh auth status -t` output (which is more structured). Consider falling back to `_runGh(['auth', 'status', '-t'])` if the first parse returns empty scopes — but test E2/E4 should cover the parsing cases without needing the `-t` flag.
- If a test fails because `process.exit(1)` actually exits the test runner: tests must NOT call `process.exit` directly. Mock `cmdGhResolve` to capture exit-intent via a thrown error or a spy on `process.exit`. The test runner's recommended pattern is `t.mock.method(process, 'exit')` (Node test runner has built-in mocking).
- If `requireGhAuth` throws but the error doesn't have `.remediation`: ensure the `GhAuthError` class assigns the field in its constructor. The pattern:
  ```js
  class GhAuthError extends Error {
    constructor({ message, remediation, scopes_missing = [] }) {
      super(message);
      this.name = 'GhAuthError';
      this.remediation = remediation;
      this.scopes_missing = scopes_missing;
    }
  }
  ```
- If existing tests for `cmdGhSyncObjectives` start failing (they shouldn't): the test set up may have leaked `_setRunGh` state from a previous test. Add `gh._setRunGh(null)` (resets to default) in `beforeEach` of test files that touch the gh module.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/01-github-coordination-layer/01-CONTEXT.md
@.planning/objectives/01-github-coordination-layer/01-02-resolver-chain-walk-SUMMARY.md
@plugins/devflow/devflow/bin/lib/gh.cjs
@plugins/devflow/devflow/bin/lib/gh.test.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/gh-fixtures.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<gotchas>
- **Required scopes for v1.1**: `repo, project, read:project, read:org` minimum. The `gist` scope is NOT required (existing repo has it because the user's token has it; `requireGhAuth` should NOT enforce it). The default `cmdGhResolve` call uses `['project', 'read:project', 'repo']`.
- **`gh auth status` output format varies by gh version.** Recent versions (2.40+) print `Token scopes: 'a', 'b', 'c'` with single quotes. Older versions used double quotes or no quotes. Strip both `'` and `"` in the parser.
- **`gh auth status` exits 0 when authenticated, 1 when not.** Use both signals: `r.ok === false` is the primary "not authenticated" indicator. The stderr message is secondary (used to distinguish "no gh installed" from "not logged in").
- **Detecting "no gh binary" vs "gh not authenticated"**: when `gh` doesn't exist, `spawnSync('gh', ...)` returns `{ status: null, error: ENOENT }`. The existing `runGh` wrapper sets `ok: false, status: ...` — treat `status === null` (or stderr containing `command not found`) as the "no binary" signal. The `which gh` check from `ghStatus` is a cleaner discriminator if you want it; mocking via `_runGh` makes it less critical.
- **Order of arguments in `gh auth refresh`**: `gh auth refresh -h github.com -s scope1,scope2` (NOT `-s scope1 -s scope2`). The remediation message must use the comma-joined form. Test B4 enforces this.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add failing test list for requireGhAuth + cmdGhResolve hard-fail integration (RED phase)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.test.cjs</files>
  <action>
Append all 18 test cases from the test list above to the existing `gh.test.cjs`. Re-use `buildMockRunGh` from `gh-fixtures.cjs`. Hand-build the auth status output strings.

Example structure (append to existing file):

```javascript
// === Group A: requireGhAuth happy path ===

test('requireGhAuth — returns silently when authenticated with required scopes', () => {
  const mock = fx.buildMockRunGh(new Map([
    ['auth status', {
      ok: true, status: 0,
      stdout: `github.com\n  ✓ Logged in to github.com account x\n  - Token scopes: 'gist', 'project', 'read:project', 'repo', 'read:org'`,
      stderr: '',
    }],
  ]));
  gh._setRunGh(mock);
  // Should not throw
  gh.requireGhAuth(['project', 'read:project']);
});

// === Group B: fail modes ===

test('requireGhAuth — throws when missing required scope', () => {
  const mock = fx.buildMockRunGh(new Map([
    ['auth status', {
      ok: true, status: 0,
      stdout: `github.com\n  ✓ Logged in\n  - Token scopes: 'repo', 'gist'`,
      stderr: '',
    }],
  ]));
  gh._setRunGh(mock);
  try {
    gh.requireGhAuth(['project']);
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.name, 'GhAuthError');
    assert.deepStrictEqual(e.scopes_missing, ['project']);
    assert.strictEqual(e.remediation, 'gh auth refresh -h github.com -s project');
  }
});

test('requireGhAuth — throws when not authenticated', () => {
  const mock = fx.buildMockRunGh(new Map([
    ['auth status', { ok: false, status: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }],
  ]));
  gh._setRunGh(mock);
  try {
    gh.requireGhAuth(['repo']);
    assert.fail('should have thrown');
  } catch (e) {
    assert.strictEqual(e.name, 'GhAuthError');
    assert.strictEqual(e.remediation, 'gh auth login');
  }
});

// ... continue for B1, B5, B6, C1-C4, D1-D3, E1-E4
```

After all tests written, confirm RED: `npm test 2>&1 | grep -E '(fail|✗)' | grep -E 'requireGhAuth|GhAuthError|cmdGhResolve' | wc -l` should be 18+.

Commit: `git add plugins/devflow/devflow/bin/lib/gh.test.cjs && git commit -m 'test(01-03): add failing test list for requireGhAuth + cmdGhResolve hard-fail integration'`

# CRITICAL: Hand-build the gh auth status fixture strings. Don't AI-generate them. Copy from `gh auth status` output if needed.
# CRITICAL: Use `t.mock.method(process, 'exit')` for D1 (cmdGhResolve hard-fail test) so the test runner doesn't actually exit.
# PATTERN: Match the existing `gh.test.cjs` style from TRD 01-02. Don't introduce a different test framework or assertion style.
  </action>
  <verify>
- `npm test 2>&1 | grep -c 'requireGhAuth'` shows 18+ test names referencing requireGhAuth (or related groups).
- `npm test 2>&1 | tail -5` shows the new tests RED, existing tests still passing.
- `git log --oneline -1` shows `test(01-03): add failing test list ...`
  </verify>
  <done>RED: 18 new tests in gh.test.cjs, all failing. Existing tests unaffected. Commit completed.</done>
  <recovery>
If a test "passes" when it should fail (false RED): the most common cause is an uninitialized `gh.requireGhAuth` returning `undefined` and the assertion checking `assert.fail('should have thrown')` only firing if the function returns. If `requireGhAuth` doesn't exist yet, calling it would throw `TypeError: gh.requireGhAuth is not a function` — that's still a thrown error, but the test catches it as a generic Error and the assertion `e.name === 'GhAuthError'` fails. Verify the test catches the RIGHT error message (`TypeError`, indicating "not implemented" — that's the correct RED signal).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Implement requireGhAuth + wire into cmdGhResolve (GREEN phase)</name>
  <files>plugins/devflow/devflow/bin/lib/gh.cjs</files>
  <action>
Add `GhAuthError` class, `parseScopes` helper, `requireGhAuth` function. Wire `cmdGhResolve` to call `requireGhAuth(['project', 'read:project', 'repo'])` first.

```javascript
// Add near top of gh.cjs (after existing requires):
class GhAuthError extends Error {
  constructor({ message, remediation, scopes_missing = [] }) {
    super(message);
    this.name = 'GhAuthError';
    this.remediation = remediation;
    this.scopes_missing = scopes_missing;
  }
}

// Internal helper — parse `gh auth status` output for token scopes.
// Returns array of scope strings; empty array if no scopes line found.
function parseScopes(stdout) {
  if (!stdout) return [];
  // Match the line: "  - Token scopes: 'a', 'b', 'c'" (single or double quotes, single line)
  // Also tolerate multiline where scopes wrap.
  const match = stdout.match(/Token scopes:\s*([^\n]+(?:\n\s+['"][^'"]+['"][^\n]*)*)/);
  if (!match) return [];
  const raw = match[1];
  // Extract all quoted tokens
  const scopes = [];
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    scopes.push(m[1]);
  }
  return scopes;
}

// Public: hard-fail auth check. Throws GhAuthError when:
//   - gh binary is missing
//   - not authenticated
//   - authenticated but missing required scopes
// Returns silently otherwise.
function requireGhAuth(requiredScopes = []) {
  const r = _runGh(['auth', 'status']);
  if (!r.ok) {
    // Distinguish "no binary" vs "not authenticated" vs "expired token"
    const stderr = r.stderr || '';
    if (/command not found|ENOENT/i.test(stderr) || r.status === null) {
      throw new GhAuthError({
        message: 'GitHub CLI (gh) is not installed.',
        remediation: 'Install gh from https://cli.github.com',
      });
    }
    if (/expired/i.test(stderr)) {
      throw new GhAuthError({
        message: 'GitHub CLI token has expired.',
        remediation: 'gh auth refresh',
      });
    }
    // Default: not authenticated
    throw new GhAuthError({
      message: 'GitHub CLI is not authenticated.',
      remediation: 'gh auth login',
    });
  }
  // Authenticated — check scopes
  const scopes = parseScopes(r.stdout);
  const missing = requiredScopes.filter((s) => !scopes.includes(s));
  if (missing.length > 0) {
    throw new GhAuthError({
      message: `GitHub CLI is missing required scopes: ${missing.join(', ')}`,
      remediation: `gh auth refresh -h github.com -s ${missing.join(',')}`,
      scopes_missing: missing,
    });
  }
  // OK — return silently
}

// Modify cmdGhResolve (defined in TRD 01-02) to wrap requireGhAuth:
function cmdGhResolve(cwd, objectiveId, raw) {
  if (!objectiveId) {
    output({ error: 'Usage: gh resolve <objectiveId>' }, raw, '');
    process.exit(1);
  }

  // Hard-fail on auth before any gh API calls (SC-8)
  try {
    requireGhAuth(['project', 'read:project', 'repo']);
  } catch (e) {
    if (e.name === 'GhAuthError') {
      // Write structured error to stderr (NOT stdout — keep stdout JSON-clean for raw consumers)
      const errPayload = {
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      };
      process.stderr.write(JSON.stringify(errPayload, null, 2) + '\n');
      process.exit(1);
    }
    throw e;  // Unknown error — propagate
  }

  // ... existing logic from TRD 01-02 (read OBJECTIVE.md, call resolveChain, output)
  const objPath = path.join(cwd, '.planning', 'objectives', objectiveId, 'OBJECTIVE.md');
  // ... etc.
}

// Add to module.exports:
module.exports = {
  // ... existing exports ...
  requireGhAuth,
  GhAuthError,
};
```

Run `npm test`. All 18 RED tests should now be GREEN. Existing tests still pass.

Commit: `git add plugins/devflow/devflow/bin/lib/gh.cjs && git commit -m 'feat(01-03): implement requireGhAuth + wire into cmdGhResolve hard-fail'`

# CRITICAL: `cmdGhResolve` writes the error to STDERR, not stdout. The stdout stays clean so downstream consumers parsing JSON output don't choke.
# CRITICAL: Existing subcommands (cmdGhSyncObjectives, etc.) are NOT modified. They keep using `runGh` directly and their existing skip-on-fail logic. Verify with `git diff` — only requireGhAuth, GhAuthError, parseScopes, and the cmdGhResolve wrap are added.
# PATTERN: Use `process.exit(1)` for hard-fail in CLI commands. Don't `throw` past the command boundary; CLI commands should signal failure via exit code.
# GOTCHA: parseScopes regex must handle both `'gist'` and `"gist"` quote styles. Test E1 with single quotes; vary the fixture for double quotes to verify both work.
  </action>
  <verify>
- `npm test` passes — all 18 new tests GREEN, all existing tests still pass.
- `node -e 'const gh = require("./plugins/devflow/devflow/bin/lib/gh.cjs"); console.log(typeof gh.requireGhAuth, typeof gh.GhAuthError)'` outputs `function function`.
- Smoke test: in a directory WITHOUT a github_repo configured but with `gh` authenticated, `node plugins/devflow/devflow/bin/df-tools.cjs gh resolve 01-github-coordination-layer 2>&1 | head -20` either succeeds (you have all scopes) or fails with the remediation command.
- Existing `cmdGhSyncObjectives` test (or smoke: `node plugins/devflow/devflow/bin/df-tools.cjs gh status`) still works without throwing.
- `git log --oneline -2` shows `feat(01-03): ...` then `test(01-03): ...`.
  </verify>
  <done>GREEN: All 18 new tests pass. cmdGhResolve hard-fails with structured error + remediation on missing/expired auth or insufficient scopes. Existing subcommands' graceful-skip behavior preserved. Two atomic commits.</done>
  <recovery>
If a test for the cmdGhResolve hard-fail case (D1) fails because `process.exit(1)` exits the test runner: switch to `t.mock.method(process, 'exit')` to capture the exit call. The Node native test runner provides `t.mock` in the test context — use it to spy on `process.exit` without actually exiting.

If parseScopes returns `[]` for valid input: the regex needs to be debugged. Print the matched substring with `console.log(JSON.stringify(stdout.match(/Token scopes:.*/)))` to see what the regex captures vs. what's in the input. Edge cases: leading/trailing whitespace, Windows CRLF line endings, multiline scope lists.

If existing `cmdGhSyncObjectives` tests fail: you accidentally modified its code path. Run `git diff` and back out any changes outside the new functions + the cmdGhResolve modification. The constraint is that `cmdGhSyncObjectives`, `cmdGhComment`, `cmdGhCloseIssue`, `cmdGhSyncRelease` remain unchanged.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
Before declaring TRD complete:
- [ ] `npm test` passes — 18 new tests GREEN; existing tests untouched
- [ ] Two atomic commits: `test(01-03): ...` then `feat(01-03): ...`
- [ ] `lib/gh.cjs` exports `requireGhAuth` and `GhAuthError`
- [ ] `cmdGhResolve` hard-fails on auth error with structured stderr + non-zero exit
- [ ] `cmdGhSyncObjectives` and other existing subcommands unchanged (back-compat preserved)
- [ ] All 4 verification_commands in this TRD's frontmatter exit 0
</verification>

<success_criteria>
- requireGhAuth(scopes) throws GhAuthError with .remediation field on missing/expired/insufficient auth
- cmdGhResolve calls requireGhAuth(['project', 'read:project', 'repo']) before any gh API call
- cmdGhResolve writes structured JSON error to stderr and exits non-zero on auth failure
- Existing subcommands keep their graceful-skip behavior (back-compat)
- SC-8 (hard-fail on auth, exact remediation command) addressed
</success_criteria>

<output>
After completion, create `.planning/objectives/01-github-coordination-layer/01-03-auth-and-error-handling-SUMMARY.md`.
</output>
