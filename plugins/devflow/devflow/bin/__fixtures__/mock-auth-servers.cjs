'use strict';

/**
 * Mock HTTP servers for handoff-e2e PTY-path auth tests (TRD 19-05).
 *
 * Locked decision 8 of 19-CONTEXT.md: e2e validation of the PTY path for
 * TTY-required auth flows must run without real credentials and without
 * heavy mocking libraries (no Express, no msw, no nock). Vanilla
 * `http.createServer` is sufficient.
 *
 * Servers replay cassette JSON files committed under `handoff-cassettes/`.
 * Cassettes are read-only fixtures — re-record only with HANDOFF_INTEGRATION=1
 * + a one-shot live-record helper script (not implemented in v1.2).
 *
 * Cassette format (matches obj 1 TRD 01-06 gh-cassettes pattern):
 *   {
 *     "_captured": true | "_hand_built": true,
 *     "_captured_at": "ISO 8601 timestamp",
 *     "_note": "free-form provenance note",
 *     "entries": [
 *       { "method": "POST", "path": "^/login/device/code",
 *         "status": 200, "headers": {...}, "body": {...} | "string" }
 *     ]
 *   }
 *
 * Matching algorithm:
 *   1. method must equal request method exactly
 *   2. entry.path is treated as a JS regex; first match wins
 *   3. body matching is intentionally NOT performed — gh + doctl issue
 *      different bodies for the same logical step (different user_codes,
 *      different access_tokens). Method+path is the right granularity.
 *   4. No matching entry → 404 with descriptive JSON body
 *
 * Server lifecycle:
 *   const server = mockGhServer();
 *   await new Promise(r => server.listen(0, '127.0.0.1', r));
 *   const port = server.address().port;
 *   // ... use ...
 *   await new Promise(r => server.close(r));
 *
 * Servers bind to ephemeral ports (server.listen(0)) so tests can run in
 * parallel without port collisions. afterEach must close every server it
 * opened — leaked sockets bleed into the next test's port allocation.
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
  if (!cassette || !Array.isArray(cassette.entries)) return null;
  for (const entry of cassette.entries) {
    if (entry.method !== method) continue;
    let pattern;
    try { pattern = new RegExp(entry.path); }
    catch { continue; }
    if (pattern.test(urlPath)) return entry;
  }
  return null;
}

function makeServer(cassetteName, opts = {}) {
  const cassette = (opts && opts.cassette) ? opts.cassette : loadCassette(cassetteName);
  const onRequest = (opts && typeof opts.onRequest === 'function') ? opts.onRequest : null;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      // Optional request log hook for tests that want to assert request shape
      if (onRequest) {
        try { onRequest({ method: req.method, url: req.url, body }); } catch {}
      }
      const match = findResponse(cassette, req.method, req.url);
      if (!match) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: `mock-auth-servers: no cassette match for ${req.method} ${req.url}`,
        }));
        return;
      }
      res.statusCode = match.status || 200;
      const headers = match.headers || {};
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      const payload = (typeof match.body === 'string')
        ? match.body
        : JSON.stringify(match.body);
      res.end(payload);
    });
  });

  return server;
}

/**
 * Mock server for `gh auth login` device flow. Cassette:
 *   POST /login/device/code      → device_code + user_code
 *   POST /login/oauth/access_token → access_token (polling result)
 *   GET  /user                   → user info (gh confirms login)
 *
 * @param {object} [opts]
 * @param {object} [opts.cassette] — override cassette body (test injection)
 * @param {function} [opts.onRequest] — { method, url, body } observer
 * @returns {http.Server}
 */
function mockGhServer(opts = {}) {
  return makeServer('gh-auth-login', opts);
}

/**
 * Mock server for `doctl auth init` flow. Cassette:
 *   GET /v2/account → account info on token-validation success
 *
 * Override cassette to simulate 401 / 5xx by passing opts.cassette with
 * an entries[] entry whose status is the desired error code.
 *
 * @param {object} [opts]
 * @param {object} [opts.cassette] — override cassette body (test injection)
 * @param {function} [opts.onRequest] — { method, url, body } observer
 * @returns {http.Server}
 */
function mockDoctlServer(opts = {}) {
  return makeServer('doctl-auth-init', opts);
}

module.exports = {
  mockGhServer,
  mockDoctlServer,
  loadCassette,
  // Internal helpers exposed for tests that want to assert match logic
  // without spinning up a server.
  _findResponse: findResponse,
  _makeServer: makeServer,
};
