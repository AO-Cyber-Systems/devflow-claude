/**
 * Tests for handoff CLI library + df-tools handoff subcommand.
 *
 * Covers:
 *   - create writes a pending record with stable shape
 *   - list returns pending and done counts
 *   - complete moves pending → done with metadata
 *   - get retrieves from pending or done
 *   - missing-id error paths
 *   - unique id generation across rapid creates
 *   - SKILL flow: hook denies → record exists → user runs → handoff complete
 *
 * TRD 19-02: validateInputsSchema + cmdHandoffCreate --inputs-json extension
 *
 *   Behavior list — validateInputsSchema(inputs):
 *     VS-1:  returns {ok:true} for empty/missing secrets ({}, {secrets:[]})
 *     VS-2:  rejects value_source='keyring' with v1.3+ deferral message
 *     VS-3:  rejects non-object inputs (null, number, string, array)
 *     VS-4:  rejects malformed prompt_match regex (e.g. '[invalid')
 *     VS-5:  rejects entry missing prompt_match
 *     VS-6:  rejects entry missing value_ref
 *     VS-7:  rejects unknown value_source ('vault', 'op', etc.)
 *     VS-8:  accepts valid stash entry
 *     VS-9:  accepts valid env entry
 *     VS-10: accepts multiple valid entries (mix of stash + env)
 *     VS-11: rejects when ANY entry in array is invalid (fail-on-first)
 *     VS-12: rejects empty value_ref string
 *
 *   Behavior list — cmdHandoffCreate --inputs-json extension:
 *     HC-1:  without inputs writes record without `inputs` key (back-compat)
 *     HC-2:  with valid --inputs-json writes record WITH `inputs` field
 *     HC-3:  with malformed --inputs-json exits with code 2 + stderr message
 *     HC-4:  with inputs failing validation exits with code 2 + reason
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');
const HOOK_PATH = path.join(__dirname, '..', '..', '..', 'hooks', 'gate-interactive.js');
const handoffLib = require('./handoff.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));
}

function rmTmp(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runTool(args, cwd) {
  try {
    const out = execFileSync('node', [TOOLS_PATH, ...args], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: out, stderr: '' };
  } catch (e) {
    return {
      ok: false,
      stdout: e.stdout?.toString() || '',
      stderr: e.stderr?.toString() || e.message,
      code: e.status,
    };
  }
}

// ---------------------------------------------------------------------------
// handoff create
// ---------------------------------------------------------------------------

describe('df-tools handoff create', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('writes a pending record and returns id+path', () => {
    const r = runTool(['handoff', 'create', 'gh', 'auth', 'login'], tmp);
    assert.ok(r.ok, `create failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.match(out.id, /^h-[0-9a-f]{8}$/, 'id should be h-<hex8>');
    assert.equal(out.record.status, 'pending');
    assert.equal(out.record.cmd, 'gh auth login');
    assert.ok(out.record.created_at, 'has created_at');
    assert.equal(out.path, `.devflow-handoff/pending/${out.id}.json`);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, out.path), 'utf-8'));
    assert.deepEqual(onDisk, out.record);
  });

  test('errors when no command is given', () => {
    const r = runTool(['handoff', 'create'], tmp);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /requires a command/);
  });

  test('generates unique ids across rapid creates', () => {
    const ids = new Set();
    for (let i = 0; i < 5; i++) {
      const r = runTool(['handoff', 'create', `cmd-${i}`], tmp);
      assert.ok(r.ok);
      ids.add(JSON.parse(r.stdout).id);
    }
    assert.equal(ids.size, 5, 'all 5 ids should be unique');
  });

  test('joins multi-word command into a single string', () => {
    const r = runTool(['handoff', 'create', 'doctl', 'auth', 'init', '--context=foo'], tmp);
    assert.ok(r.ok);
    const out = JSON.parse(r.stdout);
    assert.equal(out.record.cmd, 'doctl auth init --context=foo');
  });
});

// ---------------------------------------------------------------------------
// handoff list
// ---------------------------------------------------------------------------

describe('df-tools handoff list', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('returns empty arrays when no records exist', () => {
    const r = runTool(['handoff', 'list'], tmp);
    assert.ok(r.ok);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.pending, []);
    assert.deepEqual(out.done, []);
    assert.deepEqual(out.counts, { pending: 0, done: 0 });
  });

  test('shows pending records in chronological order', () => {
    const r1 = runTool(['handoff', 'create', 'cmd-a'], tmp);
    const r2 = runTool(['handoff', 'create', 'cmd-b'], tmp);
    assert.ok(r1.ok && r2.ok);

    const list = JSON.parse(runTool(['handoff', 'list'], tmp).stdout);
    assert.equal(list.counts.pending, 2);
    assert.equal(list.pending[0].cmd, 'cmd-a');
    assert.equal(list.pending[1].cmd, 'cmd-b');
  });
});

// ---------------------------------------------------------------------------
// handoff complete
// ---------------------------------------------------------------------------

describe('df-tools handoff complete', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('moves pending → done with completed_at', () => {
    const create = JSON.parse(runTool(['handoff', 'create', 'cmd-x'], tmp).stdout);
    const r = runTool(['handoff', 'complete', create.id], tmp);
    assert.ok(r.ok, `complete failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.record.status, 'done');
    assert.ok(out.record.completed_at, 'has completed_at');

    // Pending file gone, done file exists
    assert.ok(!fs.existsSync(path.join(tmp, '.devflow-handoff', 'pending', `${create.id}.json`)));
    assert.ok(fs.existsSync(path.join(tmp, '.devflow-handoff', 'done', `${create.id}.json`)));

    // Show in done list, not pending
    const list = JSON.parse(runTool(['handoff', 'list'], tmp).stdout);
    assert.equal(list.counts.pending, 0);
    assert.equal(list.counts.done, 1);
  });

  test('captures --exit-code', () => {
    const c = JSON.parse(runTool(['handoff', 'create', 'cmd-y'], tmp).stdout);
    const r = runTool(['handoff', 'complete', c.id, '--exit-code', '1'], tmp);
    assert.ok(r.ok);
    assert.equal(JSON.parse(r.stdout).record.exit_code, 1);
  });

  test('captures --output', () => {
    const c = JSON.parse(runTool(['handoff', 'create', 'cmd-z'], tmp).stdout);
    const r = runTool(['handoff', 'complete', c.id, '--output', 'hello world'], tmp);
    assert.ok(r.ok);
    assert.equal(JSON.parse(r.stdout).record.output, 'hello world');
  });

  test('captures --output-file content', () => {
    const c = JSON.parse(runTool(['handoff', 'create', 'cmd-z'], tmp).stdout);
    const outFile = path.join(tmp, 'cmd-output.txt');
    fs.writeFileSync(outFile, 'authenticated as alice');
    const r = runTool(['handoff', 'complete', c.id, '--output-file', outFile], tmp);
    assert.ok(r.ok);
    assert.equal(JSON.parse(r.stdout).record.output, 'authenticated as alice');
  });

  test('errors on missing id', () => {
    const r = runTool(['handoff', 'complete'], tmp);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /requires an id/);
  });

  test('errors on unknown id', () => {
    const r = runTool(['handoff', 'complete', 'h-deadbeef'], tmp);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /No pending handoff/);
  });
});

// ---------------------------------------------------------------------------
// handoff get
// ---------------------------------------------------------------------------

describe('df-tools handoff get', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('retrieves from pending', () => {
    const c = JSON.parse(runTool(['handoff', 'create', 'cmd-p'], tmp).stdout);
    const r = runTool(['handoff', 'get', c.id], tmp);
    assert.ok(r.ok);
    assert.equal(JSON.parse(r.stdout).status, 'pending');
  });

  test('retrieves from done after completion', () => {
    const c = JSON.parse(runTool(['handoff', 'create', 'cmd-d'], tmp).stdout);
    runTool(['handoff', 'complete', c.id], tmp);
    const r = runTool(['handoff', 'get', c.id], tmp);
    assert.ok(r.ok);
    assert.equal(JSON.parse(r.stdout).status, 'done');
  });

  test('errors on missing id arg', () => {
    const r = runTool(['handoff', 'get'], tmp);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /requires an id/);
  });

  test('errors on unknown id', () => {
    const r = runTool(['handoff', 'get', 'h-nope'], tmp);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /No handoff found/);
  });
});

// ---------------------------------------------------------------------------
// Top-level error handling
// ---------------------------------------------------------------------------

describe('df-tools handoff (subcommand routing)', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('unknown subcommand errors', () => {
    const r = runTool(['handoff', 'bogus'], tmp);
    assert.equal(r.ok, false);
    assert.match(r.stderr, /Unknown handoff subcommand/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: hook denies → record present → df-tools sees it → complete works
// ---------------------------------------------------------------------------

describe('end-to-end SKILL flow', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('hook record is consumable by df-tools list/get/complete', () => {
    // 1. Hook fires (Claude's Bash attempt is blocked) — writes a pending record
    const hookResult = spawnSync('node', [HOOK_PATH], {
      cwd: tmp,
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'gh auth login' },
      }),
      encoding: 'utf-8',
    });
    assert.equal(hookResult.status, 0);
    const denyOut = JSON.parse(hookResult.stdout);
    assert.equal(denyOut.hookSpecificOutput.permissionDecision, 'deny');

    // Pull the id out of the deny reason text
    const idMatch = denyOut.hookSpecificOutput.permissionDecisionReason.match(/handoff id: (h-[0-9a-f]{8})/);
    assert.ok(idMatch, 'reason text should include handoff id');
    const id = idMatch[1];

    // 2. df-tools sees the same record (hook's writePendingRecord and lib.cmdHandoffCreate
    //    both write to .devflow-handoff/pending/<id>.json with the same shape)
    const list = JSON.parse(runTool(['handoff', 'list'], tmp).stdout);
    assert.equal(list.counts.pending, 1);
    assert.equal(list.pending[0].id, id);
    assert.equal(list.pending[0].cmd, 'gh auth login');

    const got = JSON.parse(runTool(['handoff', 'get', id], tmp).stdout);
    assert.equal(got.id, id);

    // 3. After user runs `! gh auth login`, the SKILL flow can mark it done
    const completed = JSON.parse(runTool(
      ['handoff', 'complete', id, '--exit-code', '0', '--output', 'Logged in as alice.'],
      tmp,
    ).stdout);
    assert.equal(completed.record.status, 'done');

    const finalList = JSON.parse(runTool(['handoff', 'list'], tmp).stdout);
    assert.deepEqual(finalList.counts, { pending: 0, done: 1 });
  });
});

// ---------------------------------------------------------------------------
// TRD 19-02: validateInputsSchema unit tests
// ---------------------------------------------------------------------------

describe('validateInputsSchema (TRD 19-02)', () => {
  test('VS-1: returns {ok:true} for empty/missing secrets', () => {
    assert.deepEqual(handoffLib.validateInputsSchema({}), { ok: true });
    assert.deepEqual(handoffLib.validateInputsSchema({ secrets: [] }), { ok: true });
  });

  test('VS-2: rejects value_source="keyring" with v1.3+ deferral message', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ prompt_match: 'Token:', value_source: 'keyring', value_ref: 'gh-token' }],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /keyring/);
    assert.match(r.reason, /v1\.3\+/);
  });

  test('VS-3: rejects non-object inputs (null, number, string, array)', () => {
    for (const bad of [null, 42, 'string', [1, 2, 3]]) {
      const r = handoffLib.validateInputsSchema(bad);
      assert.equal(r.ok, false, `expected reject for: ${JSON.stringify(bad)}`);
      assert.match(r.reason, /inputs must be an object/);
    }
  });

  test('VS-4: rejects malformed prompt_match regex', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ prompt_match: '[invalid', value_source: 'env', value_ref: 'GH_TOKEN' }],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /invalid regex/);
  });

  test('VS-5: rejects entry missing prompt_match', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ value_source: 'env', value_ref: 'GH_TOKEN' }],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /prompt_match required/);
  });

  test('VS-6: rejects entry missing value_ref', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ prompt_match: 'Token:', value_source: 'env' }],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /value_ref required/);
  });

  test('VS-7: rejects unknown value_source', () => {
    for (const src of ['vault', 'op', 'unknown', '']) {
      const r = handoffLib.validateInputsSchema({
        secrets: [{ prompt_match: 'Token:', value_source: src, value_ref: 'foo' }],
      });
      assert.equal(r.ok, false, `expected reject for value_source: ${src}`);
      assert.match(r.reason, /value_source/);
    }
  });

  test('VS-8: accepts valid stash entry', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ prompt_match: 'Enter token:', value_source: 'stash', value_ref: 'do-token' }],
    });
    assert.deepEqual(r, { ok: true });
  });

  test('VS-9: accepts valid env entry', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ prompt_match: 'Enter token:', value_source: 'env', value_ref: 'GH_TOKEN' }],
    });
    assert.deepEqual(r, { ok: true });
  });

  test('VS-10: accepts multiple valid entries (mix of stash + env)', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [
        { prompt_match: 'GH token:', value_source: 'env', value_ref: 'GH_TOKEN' },
        { prompt_match: 'DO token:', value_source: 'stash', value_ref: 'do-token' },
      ],
    });
    assert.deepEqual(r, { ok: true });
  });

  test('VS-11: rejects when ANY entry in array is invalid (fail-on-first)', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [
        { prompt_match: 'GH token:', value_source: 'env', value_ref: 'GH_TOKEN' },
        { prompt_match: 'DO token:', value_source: 'keyring', value_ref: 'do-token' },
      ],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /keyring/);
  });

  test('VS-12: rejects empty value_ref string', () => {
    const r = handoffLib.validateInputsSchema({
      secrets: [{ prompt_match: 'Token:', value_source: 'env', value_ref: '' }],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /value_ref required/);
  });
});

// ---------------------------------------------------------------------------
// TRD 19-02: cmdHandoffCreate --inputs-json extension
// ---------------------------------------------------------------------------

describe('df-tools handoff create --inputs-json (TRD 19-02)', () => {
  let tmp;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { rmTmp(tmp); });

  test('HC-1: create without --inputs-json writes record without `inputs` key (back-compat)', () => {
    const r = runTool(['handoff', 'create', 'gh', 'auth', 'login'], tmp);
    assert.ok(r.ok, `create failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.record.inputs, undefined, 'record should NOT have inputs key when flag absent');
    // Re-read from disk to confirm absence
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, out.path), 'utf-8'));
    assert.ok(!('inputs' in onDisk), 'disk record should not include inputs key');
  });

  test('HC-2: create with valid --inputs-json writes record WITH `inputs` field', () => {
    const inputsJson = JSON.stringify({
      secrets: [
        { prompt_match: 'Enter your access token:', value_source: 'env', value_ref: 'DO_TOKEN' },
      ],
    });
    const r = runTool(['handoff', 'create', 'doctl', 'auth', 'init', '--inputs-json', inputsJson], tmp);
    assert.ok(r.ok, `create failed: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.ok(out.record.inputs, 'record should include inputs field');
    assert.equal(out.record.inputs.secrets.length, 1);
    assert.equal(out.record.inputs.secrets[0].value_source, 'env');
    assert.equal(out.record.inputs.secrets[0].value_ref, 'DO_TOKEN');
    // Confirm the cmd field still strips the --inputs-json flag (or excludes it)
    assert.ok(!out.record.cmd.includes('--inputs-json'),
      'cmd field should not include --inputs-json flag itself');
  });

  test('HC-3: create with malformed --inputs-json exits with code 2 + stderr message', () => {
    const r = runTool(['handoff', 'create', 'doctl', 'auth', 'init', '--inputs-json', 'not-json{{{'], tmp);
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /invalid --inputs-json/);
  });

  test('HC-4: create with inputs failing validation exits with code 2 + reason from validation', () => {
    const inputsJson = JSON.stringify({
      secrets: [{ prompt_match: 'Token:', value_source: 'keyring', value_ref: 'gh-token' }],
    });
    const r = runTool(['handoff', 'create', 'gh', 'auth', 'login', '--inputs-json', inputsJson], tmp);
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /inputs schema invalid/);
    assert.match(r.stderr, /keyring/);
  });
});
