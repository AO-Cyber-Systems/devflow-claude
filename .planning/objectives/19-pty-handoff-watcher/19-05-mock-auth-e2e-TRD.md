---
objective: 19-pty-handoff-watcher
trd: "05"
type: tdd
confidence: medium
wave: 3
depends_on:
  - "19-01"
  - "19-02"
files_modified:
  - plugins/devflow/devflow/bin/handoff-e2e.test.cjs
  - plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs
  - plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/gh-auth-login.json
  - plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/doctl-auth-init.json
autonomous: true
requirements:
  - E2E-MOCK-AUTH
must_haves:
  truths:
    - "mockGhServer({port}) returns an http.Server that responds to gh's OAuth device-code flow endpoints"
    - "mockDoctlServer({port}) returns an http.Server that responds to doctl's account verification endpoint"
    - "Cassettes capture request method+path+body and response status+body for each step of the flow"
    - "e2e test 'gh auth login via PTY succeeds against mock' completes without real GH_TOKEN"
    - "e2e test 'doctl auth init via PTY with token from inputs.secrets[env] succeeds against mock' completes without real DIGITALOCEAN_TOKEN"
    - "Mock servers bind to ephemeral ports (server.listen(0)) so tests can run in parallel"
    - "Mock servers shut down cleanly in afterEach (no port leak)"
    - "Tests skip cleanly with t.skip when node-pty native binary unavailable on test machine"
    - "Tests skip cleanly when gh or doctl CLI binary not available on test machine"
    - "All 4 existing handoff-e2e tests pass unchanged"
  artifacts:
    - path: "plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs"
      provides: "Mock HTTP servers for gh + doctl OAuth flows"
      exports: ["mockGhServer", "mockDoctlServer"]
      min_lines: 150
    - path: "plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/gh-auth-login.json"
      provides: "Recorded request/response pairs for gh auth login flow"
      contains: "device_code"
    - path: "plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/doctl-auth-init.json"
      provides: "Recorded request/response pairs for doctl auth init flow"
      contains: "account"
    - path: "plugins/devflow/devflow/bin/handoff-e2e.test.cjs"
      provides: "Existing 4 tests + new 'PTY-path mock auth' describe block with 4+ tests"
      min_lines: 320
  key_links:
    - from: "plugins/devflow/devflow/bin/handoff-e2e.test.cjs"
      to: "mock-auth-servers.cjs"
      via: "require + setup in beforeEach"
      pattern: "require.+mock-auth-servers"
    - from: "Test pending records"
      to: "Mock auth servers"
      via: "GH_HOST / DIGITALOCEAN_API_URL env override pointing daemon at mock"
      pattern: "GH_HOST=|DIGITALOCEAN_API_URL="
    - from: "Cassettes"
      to: "Mock servers"
      via: "Cassette JSON drives server response by method+path lookup"
      pattern: "cassette\\.|cassettes/"
---

<objective>
Add end-to-end tests that exercise the PTY-backed daemon dispatching real `gh auth login` and `doctl auth init` commands against local mock HTTP servers (no real network, no real credentials). Cassettes capture the request/response pairs of the flows; mock servers replay them at deterministic ports.

Purpose: Locked decision 8 of CONTEXT.md. Without these tests, the PTY path's real-world value (TTY-required auth flows) is not verified end-to-end — only at the unit level. CI must pass without any live credentials.

Output: New `lib/__fixtures__/mock-auth-servers.cjs` with `mockGhServer` + `mockDoctlServer` factories. Two cassette JSON files. New e2e test describe block in `handoff-e2e.test.cjs` covering happy path + error scenarios.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── handoff-e2e.test.cjs                         ← MODIFY (add PTY-path mock-auth describe block)
└── __fixtures__/                                ← CREATE if missing
    ├── mock-auth-servers.cjs                    ← CREATE
    └── handoff-cassettes/                       ← CREATE
        ├── gh-auth-login.json                   ← CREATE (recorded fixture)
        └── doctl-auth-init.json                 ← CREATE (recorded fixture)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: Existing handoff-e2e.test.cjs structure

Lines 70-108 — `withDaemon` helper:

```js
async function withDaemon({ home, project, shell }, fn) {
  const child = spawn('node', [CLI, 'start',
    '--project', project,
    '--shell', shell || 'bash',
    '--foreground',
  ], {
    env: { ...process.env, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ... PID file polling ...
  try {
    await fn(child);
  } finally {
    try { child.kill('SIGTERM'); } catch {}
    // ... clean exit wait ...
  }
}
```

**Extension pattern (this TRD):** spawn the daemon with extra env vars pointing at mock servers:

```js
const env = {
  ...process.env,
  HOME: home,
  GH_HOST: `127.0.0.1:${mockGhPort}`,        // gh respects this for API calls
  DIGITALOCEAN_API_URL: `http://127.0.0.1:${mockDoctlPort}/`,
};
```

### Pattern: Existing cassette pattern (obj 1 TRD 01-06)

Per STATE.md cassette-based replay testing pattern locked in TRD 01-06:
- Committed JSON cassettes in `__fixtures__/`
- Tests load via `fs.readFileSync`
- NOT regenerated on test runs
- Live re-capture only with explicit env flag (e.g. `GH_INTEGRATION=1`)

Apply the same pattern here. Cassettes are recorded ONCE (manual or via a one-shot record-mode script) and committed. Replay-only in CI; re-capture gated on `HANDOFF_INTEGRATION=1`.

### Pattern: gh + doctl OAuth flow shapes

**`gh auth login` device flow (default for TTY input):**
1. `POST https://github.com/login/device/code` → returns `{ device_code, user_code, verification_uri, expires_in, interval }`
2. gh prints user_code + URL, prompts user to press Enter (which the daemon answers via `inputs.secrets`)
3. `POST https://github.com/login/oauth/access_token` (polling) → eventually returns `{ access_token, token_type, scope }`
4. `GET https://api.github.com/user` → returns user info (gh confirms login)

**`doctl auth init` (with --access-token via inputs.secrets[env]):**
1. doctl prompts "Enter your access token:" (read from PTY)
2. `GET https://api.digitalocean.com/v2/account` with the token → returns account info on success

For e2e tests, `gh auth login` is the harder of the two (multi-step flow); `doctl auth init` is the simpler validation case (single auth check).

</codebase_examples>

<anti_patterns>

- **DO NOT** use Express, msw, nock, or any heavy mocking library. Vanilla `http.createServer` is sufficient. Locked decision 8.
- **DO NOT** make real network calls in tests. If a test inadvertently leaks a real call (because the env override wasn't applied), it will fail with a TLS handshake error or 401. Audit env wiring before commit.
- **DO NOT** record cassettes against real api.github.com / api.digitalocean.com using real credentials in CI. Cassettes are recorded once locally by a developer and committed. CI uses replay only.
- **DO NOT** assert against real-time-sensitive fields in cassettes (timestamps, request IDs). Tests should match by method+path+body shape, not exact byte equality.
- **DO NOT** ship the cassettes uncompressed if they exceed 100KB each. Use minimal viable content — only the request/response pairs the daemon's flow actually traverses.
- **DO NOT** introduce a cassette format that obj 1's `gh-cassettes/` doesn't use — match that pattern (flat JSON, request keys = `method:path`, value = response object). Cross-reference `lib/__fixtures__/gh-cassettes/` for shape.

</anti_patterns>

<error_recovery>

- **Mock server fails to bind port (EADDRINUSE)** → use `server.listen(0)` for ephemeral port; ports are auto-allocated. If still failing: skip the test cleanly with `t.skip('port unavailable')`.
- **`gh` or `doctl` CLI binary not on test machine** → tests skip cleanly: `try { execFileSync('gh', ['--version']); } catch { return t.skip('gh CLI unavailable'); }`.
- **PTY unavailable on test machine** → tests skip cleanly via `ptyAvailable()` helper from 19-01 (or local copy). Document the skip pattern in the test file's behavior list.
- **Cassette doesn't match real flow** (gh/doctl API changes) → re-record cassette with `HANDOFF_INTEGRATION=1` flag set in a special record-mode test. Do NOT silently fix the cassette in tests.
- **Daemon dispatch hangs in test** (mock server doesn't respond, prompt detector misses) → tests have an aggressive timeout (10-15s); on timeout, the daemon emits `status:'timeout'` and the test asserts the failure path explicitly (negative test for prompt-not-matched).
- **Test on macOS but CI on Linux disagrees on shell behavior** → daemon test uses `bash` explicitly (already pinned in `withDaemon` shell arg). Don't rely on `$SHELL`.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/objectives/19-pty-handoff-watcher/19-CONTEXT.md
@.planning/objectives/19-pty-handoff-watcher/19-RESEARCH.md
@plugins/devflow/devflow/bin/handoff-e2e.test.cjs
</context>

<research_context>

From 19-RESEARCH.md §4 "Mock auth server pitfalls":

- gh's OAuth flow uses GitHub's actual host headers — mock must respond to `Host: github.com` (gh sets this), not just localhost. Use `--hostname <host>` flag or override `GH_HOST` env var to redirect gh at the mock.
- doctl pulls API URL from `DIGITALOCEAN_API_URL` env var — set in test env to `http://127.0.0.1:<port>/`.
- TLS not required for local mock — both `gh` and `doctl` accept HTTP when env vars point at HTTP URLs. Avoid certificate complexity.
- Cassette drift: mark cassettes with capture date in JSON, periodically re-record. Pattern locked in obj 1 (TRD 01-06): `_captured: true` + `captured_at: <iso>` keys.

From 19-RESEARCH.md §8 "Error Recovery":

- Mock auth server fails to bind port → tests skip cleanly via `t.skip('mock server port unavailable')`. Pattern: ephemeral port via `server.listen(0, () => { const port = server.address().port; ... })`.

</research_context>

<gotchas>

- **`gh auth login` interactive prompts inside the PTY:** gh prompts "What account do you want to log into?" (GitHub.com vs Enterprise) BEFORE the device-code flow. Tests need to handle this prompt via `inputs.secrets[]` OR pre-set `GH_AUTH_LOGIN_HOSTNAME=github.com` env. Use the env approach — simpler, no secret injection needed for the host selection.

- **`doctl auth init` reads token from prompt regardless of `DIGITALOCEAN_TOKEN` env:** the env var is a fallback for `doctl <subcmd>`, not for the `auth init` flow itself. The auth init explicitly prompts. Tests must use `inputs.secrets[]` with `value_source: env` and `value_ref: DIGITALOCEAN_TOKEN` (set in test env to a fake token like `do-test-token-123456789`) so the daemon answers the prompt from process.env.

- **Daemon's PTY isn't a child of the test process — it's a child of the daemon subprocess.** That means `process.env` of the test does NOT propagate to the daemon's PTY shell automatically. The test must pass the relevant env vars (`GH_HOST`, `DIGITALOCEAN_API_URL`, `DIGITALOCEAN_TOKEN`) via the `withDaemon` env arg. Audit the test setup to confirm.

- **Cassette captures vs request matching:** the daemon's gh-via-PTY may issue requests in a slightly different order than a manual gh run. Mock server should match by method+path (regex if needed), not by sequence. Document the matching algorithm in `mock-auth-servers.cjs` JSDoc.

- **Recording cassettes the first time:** the executor needs to set up real gh + doctl auth once locally to record. This is a one-time setup task. Document in the SUMMARY for future maintainers. The committed cassettes capture the bytes — re-capture only if upstream APIs change shape.

- **CI compatibility:** the existing 4 e2e tests already use `bash` and rely on test environment having a working bash. PTY tests have the additional dependency on node-pty + a working PTY device. Linux containers normally have `/dev/ptmx`; verify CI runners do.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Test list + RED — mock servers + cassettes scaffolded, e2e tests written but failing</name>
  <files>plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs, plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/gh-auth-login.json, plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/doctl-auth-init.json, plugins/devflow/devflow/bin/handoff-e2e.test.cjs</files>
  <action>
Per CLAUDE.md TDD Playbook habits 2 + 4 (test list first, fixture generators not LLM-generated test data). The fixtures here are recorded cassettes — best-effort recorded once via real flows the executor runs locally, OR (if local recording isn't feasible) hand-built minimal valid cassettes that are clearly marked as "minimal hand-built; re-record from real flow when convenient" in a header comment.

Behavior list for the new `describe('handoff pipeline — PTY-path mock auth (TRD 19-05)', ...)` block:

- MA-1: gating — when ptyAvailable() OR ghAvailable() returns false, all MA-* tests skip cleanly
- MA-2: mockGhServer({port}) listens on the given port and responds to POST /login/device/code with cassette response
- MA-3: mockGhServer responds to POST /login/oauth/access_token with cassette response (polling step)
- MA-4: mockDoctlServer({port}) listens on the given port and responds to GET /v2/account with cassette response
- MA-5: end-to-end — write pending record `gh auth login` (with GH_HOST pointing at mockGh), daemon dispatches via PTY, gets device code, completes auth flow, done record has status:'done'
- MA-6: end-to-end — write pending record `doctl auth init` with inputs.secrets[env] pointing at DIGITALOCEAN_TOKEN, daemon dispatches via PTY, daemon answers token prompt, mock validates token, done record has status:'done'
- MA-7: failure case — DIGITALOCEAN_TOKEN unset in env → daemon emits done status:'failed' with stderr containing "secret resolution failed"
- MA-8: failure case — mock server returns 401 → daemon dispatch completes but exit_code is non-zero (doctl/gh exits non-zero on auth failure)

Steps:

1. Create directory `plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/`.

2. Create `plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs` with:

```js
'use strict';

/**
 * Mock HTTP servers for handoff-e2e PTY-path auth tests.
 *
 * Servers replay cassette JSON files. Cassettes are committed and treated as
 * read-only fixtures — re-record only with HANDOFF_INTEGRATION=1 + the
 * appropriate live-record helper script.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const CASSETTE_DIR = path.join(__dirname, 'handoff-cassettes');

function loadCassette(name) {
  const p = path.join(CASSETTE_DIR, `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function findResponse(cassette, method, urlPath) {
  // Cassette shape: { entries: [{ method, path, status, headers, body }] }
  for (const entry of cassette.entries) {
    if (entry.method === method && new RegExp(entry.path).test(urlPath)) {
      return entry;
    }
  }
  return null;
}

function makeServer(cassetteName, opts = {}) {
  const cassette = loadCassette(cassetteName);
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const match = findResponse(cassette, req.method, req.url);
      if (!match) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `no cassette match for ${req.method} ${req.url}` }));
        return;
      }
      res.statusCode = match.status;
      for (const [k, v] of Object.entries(match.headers || {})) res.setHeader(k, v);
      res.end(typeof match.body === 'string' ? match.body : JSON.stringify(match.body));
    });
  });
  return server;
}

function mockGhServer(opts = {}) {
  return makeServer('gh-auth-login', opts);
}

function mockDoctlServer(opts = {}) {
  return makeServer('doctl-auth-init', opts);
}

module.exports = { mockGhServer, mockDoctlServer, loadCassette };
```

3. Create cassette files. Two options:

   **Option A (preferred):** Run real `gh auth login --hostname <real-host>` once locally, capture network with `mitmproxy` or by running gh against the mock with NODE_TLS_REJECT_UNAUTHORIZED, save the request/response pairs. Save to JSON with shape:

   ```json
   {
     "_captured": true,
     "captured_at": "2026-05-04T...",
     "_note": "Recorded once via real gh auth login flow against api.github.com",
     "entries": [
       {
         "method": "POST",
         "path": "/login/device/code",
         "status": 200,
         "headers": { "Content-Type": "application/json" },
         "body": { "device_code": "fake-code-...", "user_code": "ABCD-1234", "verification_uri": "https://github.com/login/device", "expires_in": 900, "interval": 5 }
       },
       { "method": "POST", "path": "/login/oauth/access_token", "status": 200, "headers": { "Content-Type": "application/json" }, "body": { "access_token": "gho_fake_token_for_testing", "token_type": "bearer", "scope": "repo" } },
       { "method": "GET", "path": "/user", "status": 200, "headers": { "Content-Type": "application/json" }, "body": { "login": "test-user", "id": 12345 } }
     ]
   }
   ```

   **Option B (fallback):** If real recording isn't feasible during this task, hand-build a minimal cassette with hand-crafted plausible responses, and add a header `_hand_built: true` + `_note: "Minimal hand-built fixture — re-record from real flow when convenient"`. The tests still validate the daemon's wiring against KNOWN expected request/response shapes.

   For doctl-auth-init.json:
   ```json
   {
     "_captured": true,
     "_note": "Recorded once via real doctl auth init flow against api.digitalocean.com",
     "entries": [
       { "method": "GET", "path": "/v2/account", "status": 200, "headers": { "Content-Type": "application/json" }, "body": { "account": { "uuid": "fake-uuid", "email": "test@example.com", "status": "active" } } }
     ]
   }
   ```

4. Append to `handoff-e2e.test.cjs` a new describe block with the behavior list (as comment) + skeleton failing tests:

```js
describe('handoff pipeline — PTY-path mock auth (TRD 19-05)', () => {
  // Behavior list:
  //   MA-1 ... MA-8 (per the list above)

  function ptyAvailable() {
    try { require('node-pty'); return true; } catch { return false; }
  }
  function ghAvailable() {
    try { spawnSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
  }
  function doctlAvailable() {
    try { spawnSync('doctl', ['version'], { stdio: 'ignore' }); return true; } catch { return false; }
  }

  let mockGh, mockDoctl, mockGhPort, mockDoctlPort;
  beforeEach(async () => {
    if (!ptyAvailable()) return;
    const { mockGhServer, mockDoctlServer } = require('./__fixtures__/mock-auth-servers.cjs');
    mockGh = mockGhServer();
    mockDoctl = mockDoctlServer();
    await new Promise(r => mockGh.listen(0, '127.0.0.1', r));
    await new Promise(r => mockDoctl.listen(0, '127.0.0.1', r));
    mockGhPort = mockGh.address().port;
    mockDoctlPort = mockDoctl.address().port;
  });
  afterEach(async () => {
    if (mockGh) await new Promise(r => mockGh.close(r));
    if (mockDoctl) await new Promise(r => mockDoctl.close(r));
  });

  test('MA-2 mockGhServer responds to POST /login/device/code', async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');
    // Use http.request to POST /login/device/code, assert response shape matches cassette.
    // (Failing initially because the cassette file doesn't exist yet OR the helper isn't fully wired.)
  });

  // ... MA-3, MA-4 similarly ...

  test('MA-6 doctl auth init via PTY with token from inputs.secrets[env] succeeds', { timeout: 30000 }, async (t) => {
    if (!ptyAvailable()) return t.skip('node-pty unavailable');
    if (!doctlAvailable()) return t.skip('doctl unavailable');
    // Daemon spawn with DIGITALOCEAN_API_URL pointing at mockDoctl
    // Pending record: { cmd: 'doctl auth init', inputs: { secrets: [{ prompt_match: 'Enter your access token:', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' }] } }
    // Test env: DIGITALOCEAN_TOKEN='do-test-token-1234567890'
    // Assert done.status === 'done' AND done.exit_code === 0
  });
});
```

Run tests. The new MA-* tests should FAIL because cassette / mock-auth-servers / wiring isn't fully connected end-to-end.

5. Commit RED: `test(19-05): add failing PTY-path mock-auth e2e tests + cassette fixtures`.

# CRITICAL: Behavior list MUST be in a comment block at the top of the new describe block.
# CRITICAL: Existing 4 e2e tests must continue to pass throughout. Run after each step.
# GOTCHA: ptyAvailable() / ghAvailable() / doctlAvailable() helpers MUST gate every PTY-path test. CI may not have any of these.
# GOTCHA: Cassettes are read-only fixtures. Don't mutate them at runtime; only read.
# PATTERN: Match obj 1 TRD 01-06's cassette pattern — flat JSON with `_captured: true` flag and `entries` array.
  </action>
  <verify>
1. `ls plugins/devflow/devflow/bin/__fixtures__/` shows `mock-auth-servers.cjs` and `handoff-cassettes/` directory.
2. `ls plugins/devflow/devflow/bin/__fixtures__/handoff-cassettes/` shows `gh-auth-login.json` and `doctl-auth-init.json`.
3. `node -e "console.log(require('./plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs').mockGhServer)"` prints a function reference.
4. `node --test plugins/devflow/devflow/bin/handoff-e2e.test.cjs 2>&1 | tail -10` shows existing 4 tests passing + new MA-* tests failing OR skipping (failures expected; skips OK if test machine lacks gh/doctl/node-pty).
5. RED commit exists.
  </verify>
  <done>
- `mock-auth-servers.cjs` exists with `mockGhServer`, `mockDoctlServer`, `loadCassette` exports.
- Cassette JSON files exist with at least one `entries[]` item each, marked `_captured: true` (or `_hand_built: true` if option B was used).
- New `describe(..., (TRD 19-05)` block exists with 8-item behavior list + at least 4 failing/skipping skeleton tests.
- Existing 4 e2e tests still pass.
- RED commit exists.
  </done>
  <recovery>
- If real recording proves infeasible: use option B (hand-built cassette with `_hand_built: true` flag). The tests still exercise the wiring at the daemon level even if the cassette content is artificial. Document in SUMMARY for future re-recording.
- If `__fixtures__` directory pattern conflicts with existing test discovery (some test runners ignore `__fixtures__` automatically): verify the existing fixture pattern in `plugins/devflow/devflow/bin/lib/__fixtures__/`. Match that.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — wire mock servers into daemon e2e tests, prove mock-auth flow works end-to-end</name>
  <files>plugins/devflow/devflow/bin/handoff-e2e.test.cjs, plugins/devflow/devflow/bin/__fixtures__/mock-auth-servers.cjs</files>
  <action>
Make the failing MA-* tests pass.

Approach:

1. Implement MA-2/MA-3/MA-4 (mock-server-only tests) first — these are pure HTTP server tests. Use `http.request` from the test, POST/GET against the mock server's port, assert the JSON response matches the cassette. These should all pass once mock-auth-servers.cjs is correctly wired.

2. Extend `withDaemon` (or add `withDaemonAndMocks`) to set the env vars routing the daemon's PTY at the mock servers:

```js
async function withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken }, fn) {
  const child = spawn('node', [CLI, 'start',
    '--project', project,
    '--shell', 'bash',
    '--foreground',
  ], {
    env: {
      ...process.env,
      HOME: home,
      // Redirect gh + doctl at mocks
      GH_HOST: `127.0.0.1:${mockGhPort}`,
      DIGITALOCEAN_API_URL: `http://127.0.0.1:${mockDoctlPort}/`,
      DIGITALOCEAN_TOKEN: doToken || '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // ... existing PID poll ...
  return await runFnWithCleanup(fn, child);
}
```

3. Add allowlist for the test daemon to include `gh auth login` and `doctl auth init`. Update `TEST_ALLOW_JSON` at the top of the file:

```js
const TEST_ALLOW_JSON = JSON.stringify({
  commands: [
    { pattern: '^echo\\b', label: 'test:echo' },
    { pattern: '^printf\\b', label: 'test:printf' },
    { pattern: '^true\\b', label: 'test:true' },
    // NEW for 19-05:
    { pattern: '^gh\\s+auth\\s+login\\b', label: 'test:gh-auth-login' },
    { pattern: '^doctl\\s+auth\\s+init\\b', label: 'test:doctl-auth-init' },
  ],
});
```

4. Implement MA-5 (gh auth login full flow):

```js
test('MA-5 gh auth login via PTY succeeds against mock', { timeout: 60000 }, async (t) => {
  if (!ptyAvailable()) return t.skip('node-pty unavailable');
  if (!ghAvailable()) return t.skip('gh unavailable');

  await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: '' }, async () => {
    // Pending record: gh auth login + inputs.secrets to skip the host-selection prompt by using the env-var path
    fs.writeFileSync(
      path.join(project, '.devflow-handoff', 'pending', 'h-gh-001.json'),
      JSON.stringify({
        id: 'h-gh-001',
        cmd: 'gh auth login --hostname github.com --git-protocol https --web',  // hostname/proto pre-set to bypass interactive prompts
        cwd: project,
        status: 'pending',
        created_at: new Date().toISOString(),
        // No inputs.secrets needed if the gh flags pre-answer all prompts; otherwise add them
      }, null, 2)
    );
    const done = await waitForDoneRecord(project, 'h-gh-001', 30000);
    // gh against the mock should complete the device-code flow; assert done.status
    // (The exact assertion depends on whether the mock cassette covers all 3 expected requests)
    assert.match(done.status, /^(done|failed)$/);  // either way is data; tighten once cassette is finalized
  });
});
```

5. Implement MA-6 (doctl auth init with token):

```js
test('MA-6 doctl auth init via PTY with token from inputs.secrets[env] succeeds', { timeout: 30000 }, async (t) => {
  if (!ptyAvailable()) return t.skip('node-pty unavailable');
  if (!doctlAvailable()) return t.skip('doctl unavailable');

  const fakeToken = 'do-test-token-1234567890';
  await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: fakeToken }, async () => {
    fs.writeFileSync(
      path.join(project, '.devflow-handoff', 'pending', 'h-do-001.json'),
      JSON.stringify({
        id: 'h-do-001',
        cmd: 'doctl auth init',
        cwd: project,
        status: 'pending',
        created_at: new Date().toISOString(),
        inputs: {
          secrets: [
            { prompt_match: 'Enter your access token:', value_source: 'env', value_ref: 'DIGITALOCEAN_TOKEN' },
          ],
        },
      }, null, 2)
    );
    const done = await waitForDoneRecord(project, 'h-do-001', 20000);
    assert.equal(done.status, 'done');
    assert.equal(done.exit_code, 0);
    // Token should NOT appear in stdout (redaction)
    assert.doesNotMatch(done.stdout || '', new RegExp(fakeToken));
  });
});
```

6. Implement MA-7 (DIGITALOCEAN_TOKEN unset → secret resolution failure):

```js
test('MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN fails with clear stderr', { timeout: 20000 }, async (t) => {
  if (!ptyAvailable()) return t.skip('node-pty unavailable');
  if (!doctlAvailable()) return t.skip('doctl unavailable');

  await withDaemonAndMocks({ home, project, mockGhPort, mockDoctlPort, doToken: '' }, async () => {
    // Same pending record as MA-6 but doToken is empty
    fs.writeFileSync(/* ... same as MA-6 ... */);
    const done = await waitForDoneRecord(project, 'h-do-002', 15000);
    assert.equal(done.status, 'failed');
    assert.match(done.stderr, /secret resolution failed.*DIGITALOCEAN_TOKEN/);
  });
});
```

7. Implement MA-8 (mock returns 401 → doctl exits non-zero, daemon faithfully reports):

```js
test('MA-8 doctl auth init against mock returning 401 has non-zero exit_code', { timeout: 20000 }, async (t) => {
  // Use a different cassette OR override the mock response on this test.
  // Simplest: add a second cassette `doctl-auth-init-401.json` and a second mockDoctl server pointing at it.
  // Or: add a per-test mode flag to mockDoctlServer.
});
```

(MA-8 may be skipped if implementing requires an extra cassette; document the deferral if so.)

8. Run tests. ALL passing or cleanly skipping (gh/doctl/pty unavailable). Run `npm test` from repo root — total ≥ 1893 from 19-03 baseline + new (variable, depends on skips).

9. Commit GREEN: `feat(19-05): implement mock-auth e2e tests for PTY-path gh + doctl flows`. (May split into multiple commits per natural breakpoint per memory `feedback_executor_smaller_commits` — one commit for mock-server tests MA-2/3/4, one for daemon-integration MA-5/6/7.)

# CRITICAL: ALL tests must skip cleanly when their gating helper returns false. CI without gh/doctl/node-pty must still report 0 failures.
# CRITICAL: TEST_ALLOW_JSON extension must include the new gh + doctl patterns so the daemon doesn't reject them.
# CRITICAL: Token redaction (MA-6 last assertion) must hold — confirms 19-02's redaction is wired in the e2e flow.
# GOTCHA: gh has a host-selection interactive prompt — pass `--hostname github.com --git-protocol https` flags to skip it. Or add inputs.secrets[] for the prompt. The flags approach is cleaner.
# GOTCHA: gh's --web flag opens a browser; --device flag is preferred for headless flow. Use `--device` (where available) or `--with-token` (but that bypasses our test goal).
# GOTCHA: doctl auth init uses prompt "Validating token... Enter your access token:" — exact prompt_match string must be verified by inspecting real doctl output. Keep regex flexible: `/Enter your access token/i`.
# PATTERN: Match the existing handoff-e2e.test.cjs structure — beforeEach/afterEach for setup, withDaemon for daemon lifecycle, waitForDoneRecord for assertion.
  </action>
  <verify>
1. `node --test plugins/devflow/devflow/bin/handoff-e2e.test.cjs 2>&1 | tail -10` shows ALL existing 4 tests passing + new MA-* tests passing or skipping (no failures).
2. `npm test 2>&1 | tail -5` shows 0 failures vs. baseline.
3. `grep -n "MA-" plugins/devflow/devflow/bin/handoff-e2e.test.cjs` shows ≥6 implemented tests (MA-2/3/4/5/6/7; MA-1 is gating, MA-8 may be deferred).
4. `grep -n "REDACTED\|fakeToken" plugins/devflow/devflow/bin/handoff-e2e.test.cjs` confirms redaction is asserted in MA-6.
5. GREEN commit exists.
  </verify>
  <done>
- Mock servers wired into e2e tests with deterministic ephemeral ports.
- 4 mock-server-only tests pass (MA-2/3/4 + the gating helper test MA-1).
- 2-3 daemon-integration tests pass when gh/doctl/PTY available, skip cleanly otherwise (MA-5/6/7).
- Token redaction asserted at e2e level.
- Existing 4 e2e tests pass byte-identical.
- All other test suites zero regressions.
- ≥1 GREEN commit (split per natural breakpoint encouraged).
  </done>
  <recovery>
- If `gh auth login` flow doesn't work against the mock (gh gets confused by the redirect): verify GH_HOST format. gh expects `host:port` with NO scheme; if HTTPS is required, gh ignores HTTP overrides. Workaround: use `gh auth login --with-token < token-file` for MA-5 if device flow against mock proves brittle, BUT that bypasses the PTY path's value. Better: defer MA-5 to a separate follow-up TRD if the gh device flow against a mock is too brittle in v1.2.
- If doctl prompt regex doesn't match: capture the actual prompt by running `doctl auth init` locally once and grep stderr for the exact prompt string. Update `prompt_match` accordingly.
- If cassette is missing required entries: add them. Cassette should have ALL request/response pairs the flow needs; missing entries cause 404 from mock, daemon fails dispatch.
- If daemon dispatch hangs (timeout): the prompt_match regex isn't matching the actual PTY output. Add a short debug `console.log(done.stdout)` in the test, run once, inspect the buffer to find the actual prompt text.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
- `lib/__fixtures__/mock-auth-servers.cjs` exposes `mockGhServer`, `mockDoctlServer`, `loadCassette`
- Two cassette JSON files committed: `gh-auth-login.json`, `doctl-auth-init.json`
- New e2e test describe block with ≥6 implemented tests covering: mock-server endpoints, daemon-PTY-gh integration, daemon-PTY-doctl-with-token, secret resolution failure, token redaction at e2e level
- Tests skip cleanly without `gh`, `doctl`, or `node-pty` available
- Existing 4 e2e tests pass unchanged
- `npm test` reports 0 failures vs. baseline; new test count delta documented in SUMMARY
- Locked decision 8 satisfied: e2e validates the PTY path for TTY-required flows without real credentials
</verification>

<success_criteria>
- [ ] `mock-auth-servers.cjs` factory module exists with `mockGhServer` + `mockDoctlServer` + `loadCassette`
- [ ] Both cassette files exist (real or hand-built; flagged accordingly)
- [ ] At least 6 new MA-* tests implemented covering mock-server endpoints + daemon-PTY-integration
- [ ] All MA-* tests skip cleanly when their gating helper (ptyAvailable, ghAvailable, doctlAvailable) returns false
- [ ] Token redaction is asserted at the e2e level (MA-6 confirms 19-02 wiring through the full pipeline)
- [ ] Existing 4 e2e tests pass byte-identical
- [ ] `npm test` shows 0 failures vs. 19-03 baseline
- [ ] At least 2 atomic commits (RED, GREEN) — preferably split GREEN into mock-server-only and daemon-integration commits
</success_criteria>

<output>
After completion, create `.planning/objectives/19-pty-handoff-watcher/19-05-mock-auth-e2e-SUMMARY.md` per @/Users/markemerson/.claude/devflow/templates/summary.md. Document:
- Cassette source: real-recorded or hand-built (flag prominently for future re-record)
- Final list of MA-* tests implemented vs. deferred
- Total e2e test count (existing 4 + new MA-* count)
- Whether MA-5 (gh auth login via mock) was achievable — note any deferrals to a follow-up
- Any platform-specific issues encountered (e.g. CI runners without /dev/ptmx)
- Commit hashes for RED, GREEN-A (mock-server-only), GREEN-B (daemon-integration)
</output>
