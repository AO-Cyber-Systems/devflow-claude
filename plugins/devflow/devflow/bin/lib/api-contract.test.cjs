'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// IMPORTANT: this require will FAIL until api-contract.cjs is created.
// That is the RED phase signal.
const { sha256File, detectDrift } = require('./api-contract.cjs');

const FIXTURE_DIR = path.join(__dirname, '__fixtures__', 'api-contract');
const STABLE_PATH = path.join(FIXTURE_DIR, 'stable.txt');

// Pre-computed by `printf 'hello\n' | shasum -a 256`. Do not change without updating stable.txt.
const SHA_HELLO_NEWLINE = '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03';

test('Case A1 — sha256File returns correct SHA256 for known-content fixture', () => {
  const result = sha256File(STABLE_PATH);
  assert.strictEqual(result, SHA_HELLO_NEWLINE);
});

test('Case A2 — sha256File returns null for missing file (no exception)', () => {
  const missing = path.join(FIXTURE_DIR, 'does-not-exist.txt');
  const result = sha256File(missing);
  assert.strictEqual(result, null);
});

test('Case A3 — sha256File resolves relative path against cwd argument', () => {
  const relative = path.join('__fixtures__', 'api-contract', 'stable.txt');
  const result = sha256File(relative, __dirname);
  assert.strictEqual(result, SHA_HELLO_NEWLINE);
});

test('Case A4 — sha256File resolves absolute path directly, ignoring cwd', () => {
  const wrongCwd = path.join(__dirname, 'nonexistent-dir');
  const result = sha256File(STABLE_PATH, wrongCwd);
  assert.strictEqual(result, SHA_HELLO_NEWLINE);
});

// ===========================================================================
// Task 2 (REQ-10-08) — detectDrift + df-tools verify api-contract
// ===========================================================================

const SHA_DEADBEEF = 'deadbeef' + '0'.repeat(56);
const DRIFTED_PATH = path.join(FIXTURE_DIR, 'drifted.txt');
const MISSING_PATH = path.join(FIXTURE_DIR, 'does-not-exist.txt');

test('Case B1 — detectDrift empty contract → ok: true, no drift', () => {
  const result = detectDrift([]);
  assert.deepStrictEqual(result, { drift: [], ok: true });
});

test('Case B2 — detectDrift undefined contract → ok: true, no drift', () => {
  const result = detectDrift(undefined);
  assert.deepStrictEqual(result, { drift: [], ok: true });
});

test('Case B3 — detectDrift all entries match → ok: true', () => {
  const result = detectDrift([{ path: STABLE_PATH, sha: SHA_HELLO_NEWLINE }]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.drift.length, 0);
});

test('Case B4 — detectDrift DRIFTED when current SHA differs from expected', () => {
  const result = detectDrift([{ path: STABLE_PATH, sha: SHA_DEADBEEF }]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.drift.length, 1);
  assert.strictEqual(result.drift[0].status, 'DRIFTED');
  assert.strictEqual(result.drift[0].path, STABLE_PATH);
  assert.strictEqual(result.drift[0].expected, SHA_DEADBEEF);
  assert.strictEqual(result.drift[0].actual, SHA_HELLO_NEWLINE);
});

test('Case B5 — detectDrift MISSING when file does not exist', () => {
  const result = detectDrift([{ path: MISSING_PATH, sha: SHA_HELLO_NEWLINE }]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.drift.length, 1);
  assert.strictEqual(result.drift[0].status, 'MISSING');
  assert.strictEqual(result.drift[0].actual, null);
});

test('Case B6 — detectDrift mixed: match + DRIFTED + MISSING in one call', () => {
  const result = detectDrift([
    { path: STABLE_PATH, sha: SHA_HELLO_NEWLINE },  // match
    { path: DRIFTED_PATH, sha: SHA_DEADBEEF },      // drifted (drifted.txt is "world\n", not deadbeef)
    { path: MISSING_PATH, sha: SHA_HELLO_NEWLINE }, // missing
  ]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.drift.length, 2);
  const statuses = result.drift.map(d => d.status).sort();
  assert.deepStrictEqual(statuses, ['DRIFTED', 'MISSING']);
});

// --- df-tools verify api-contract integration ---

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

// Build a temp TRD fixture with api_contract block. Hand-built per habit 4 (no LLM-generated data).
function makeTempTrd(apiContractBlock) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'api-contract-trd-'));
  const trdPath = path.join(tmp, 'fake-TRD.md');
  fs.writeFileSync(trdPath,
`---
objective: 10-test
trd: 99
type: ui
${apiContractBlock || ''}must_haves:
  truths: []
  artifacts: []
  key_links: []
---
# body
`);
  return { trdPath, tmp };
}

test('Case C1 — df-tools verify api-contract --raw outputs JSON with {drift, ok, trd_path}', () => {
  const { trdPath } = makeTempTrd(
`api_contract:
  - path: ${STABLE_PATH}
    sha: ${SHA_HELLO_NEWLINE}
`);
  const out = execSync(`node ${DF_TOOLS} verify api-contract ${trdPath} --raw`, { encoding: 'utf-8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.ok, true);
  assert.deepStrictEqual(parsed.drift, []);
  assert.strictEqual(parsed.trd_path, trdPath);
});

test('Case C2 — df-tools verify api-contract exits 0 even on drift (advisory)', () => {
  const { trdPath } = makeTempTrd(
`api_contract:
  - path: ${STABLE_PATH}
    sha: ${SHA_DEADBEEF}
`);
  // execSync throws on non-zero exit. If this doesn't throw, exit was 0.
  const out = execSync(`node ${DF_TOOLS} verify api-contract ${trdPath} --raw`, { encoding: 'utf-8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.drift.length, 1);
  assert.strictEqual(parsed.drift[0].status, 'DRIFTED');
});

test('Case C3 — df-tools verify api-contract on TRD with no api_contract block returns ok:true', () => {
  const { trdPath } = makeTempTrd('');
  const out = execSync(`node ${DF_TOOLS} verify api-contract ${trdPath} --raw`, { encoding: 'utf-8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.ok, true);
  assert.deepStrictEqual(parsed.drift, []);
});
