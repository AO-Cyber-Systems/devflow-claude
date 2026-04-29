/**
 * Tests for gate-interactive PreToolUse hook
 *
 * Covers:
 *   - Each interactive pattern triggers when command sits at command position
 *   - Quoted-strings fix (1c334b0): commands inside echo "..." MUST NOT trigger
 *   - Shell separators (&&, ||, |, ;, &, (, newline) are valid command positions
 *   - skipIf flags suppress detection (e.g. gh auth login --with-token)
 *   - Subprocess invocation produces well-formed PreToolUse deny JSON
 *   - Escape hatch env var disables the hook
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, 'gate-interactive.js');
const { detectInteractive, INTERACTIVE_PATTERNS } = require('./gate-interactive.js');

// ---------------------------------------------------------------------------
// Unit tests: detectInteractive() pattern matching
// ---------------------------------------------------------------------------

describe('detectInteractive — interactive commands at command position', () => {
  const cases = [
    { cmd: 'doctl auth init', label: 'doctl auth init' },
    { cmd: 'gcloud auth login', label: 'gcloud auth login' },
    { cmd: 'gh auth login', label: 'gh auth login' },
    { cmd: 'aws configure', label: 'aws configure' },
    { cmd: 'op signin', label: 'op signin' },
    { cmd: 'npm login', label: 'npm login' },
    { cmd: 'vault login', label: 'vault login' },
    { cmd: 'passwd', label: 'passwd' },
    { cmd: 'ssh-keygen', label: 'ssh-keygen (no -N)' },
  ];

  for (const c of cases) {
    test(`triggers on bare ${c.label}`, () => {
      const hit = detectInteractive(c.cmd);
      assert.ok(hit, `expected detection for: ${c.cmd}`);
      assert.ok(hit.reason, 'detection result should include a reason');
    });
  }

  test('all 9 patterns are present', () => {
    assert.equal(INTERACTIVE_PATTERNS.length, 9,
      'pattern count regression — adjust this assertion if intentionally added/removed');
  });
});

describe('detectInteractive — skipIf flags suppress detection', () => {
  const skipCases = [
    { cmd: 'doctl auth init --access-token abc123', label: 'doctl --access-token' },
    { cmd: 'doctl auth init --access-token=abc123', label: 'doctl --access-token=' },
    { cmd: 'gcloud auth login --cred-file=/tmp/cred.json', label: 'gcloud --cred-file' },
    { cmd: 'gh auth login --with-token < token.txt', label: 'gh --with-token' },
    { cmd: 'vault login -method=token foo', label: 'vault -method=token' },
    { cmd: 'ssh-keygen -t ed25519 -N "" -f /tmp/key', label: 'ssh-keygen -N ""' },
  ];

  for (const c of skipCases) {
    test(`does NOT trigger on ${c.label}`, () => {
      const hit = detectInteractive(c.cmd);
      assert.equal(hit, null, `expected no detection for: ${c.cmd}`);
    });
  }

  test('aws configure get/list/set/import/export/sso are NOT interactive', () => {
    for (const sub of ['get', 'list', 'set', 'import', 'export', 'sso']) {
      const cmd = `aws configure ${sub} foo`;
      assert.equal(detectInteractive(cmd), null, `aws configure ${sub} should pass`);
    }
  });
});

describe('detectInteractive — quoted-strings fix (1c334b0)', () => {
  // Note: heredoc bodies (`cat <<EOF\ndoctl auth init\nEOF`) DO trigger the
  // hook because the regex treats `\n` as a command-position separator. This
  // is a known limitation — distinguishing heredoc content from real commands
  // requires multi-line shell parsing. The DEVFLOW_SKIP_INTERACTIVE_GATE=1
  // escape hatch covers this case.
  const quotedCases = [
    'echo "doctl auth init"',
    "echo 'gcloud auth login'",
    'echo "I would run gh auth login but I am not"',
    'grep "passwd" /etc/services',
    'echo "--- doctl auth init ---"',
    'rg "op signin" docs/',
    'echo "to authenticate run: gh auth login"',
  ];

  for (const cmd of quotedCases) {
    test(`does NOT trigger inside quoted/text context: ${cmd.slice(0, 40)}…`, () => {
      const hit = detectInteractive(cmd);
      assert.equal(hit, null,
        `quoted-strings fix regression — should not trigger inside text: ${cmd}`);
    });
  }
});

describe('detectInteractive — shell separators are valid command positions', () => {
  const separatorCases = [
    { cmd: 'true && doctl auth init', label: '&&' },
    { cmd: 'false || doctl auth init', label: '||' },
    { cmd: 'echo before; gh auth login', label: ';' },
    { cmd: 'echo before | gh auth login', label: '|' },
    { cmd: 'echo before & gh auth login', label: '&' },
    { cmd: '(gh auth login)', label: 'subshell (' },
    { cmd: 'echo before\ngh auth login', label: 'newline' },
    { cmd: '   gh auth login', label: 'leading whitespace' },
  ];

  for (const c of separatorCases) {
    test(`detects after ${c.label}`, () => {
      const hit = detectInteractive(c.cmd);
      assert.ok(hit, `expected detection after ${c.label}: ${c.cmd}`);
    });
  }
});

describe('detectInteractive — false-position guards', () => {
  test('does NOT trigger on substring inside another word', () => {
    // e.g. an envvar named DOCTL_AUTH_INIT_TOKEN — no separator before it
    const cases = [
      'export MY_DOCTL_AUTH_INIT_TOKEN=foo',
      'echo my-gh-auth-login-script',
    ];
    for (const cmd of cases) {
      const hit = detectInteractive(cmd);
      assert.equal(hit, null, `false-positive on: ${cmd}`);
    }
  });

  test('does NOT trigger when interactive command is the value of a flag', () => {
    // e.g. --message="run gh auth login first"
    const cmd = 'git commit --message="run gh auth login first"';
    assert.equal(detectInteractive(cmd), null);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: subprocess invocation
// ---------------------------------------------------------------------------

function runHook(payload, env = {}, cwd) {
  const tmp = cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-'));
  const result = spawnSync('node', [HOOK_PATH], {
    cwd: tmp,
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return { tmp, result };
}

describe('hook integration — subprocess', () => {
  test('emits PreToolUse deny JSON for interactive command', () => {
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'gh auth login' },
    });

    assert.equal(result.status, 0, `non-zero exit: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /TTY/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /! gh auth login/);

    // Pending record written
    const pendingDir = path.join(tmp, '.devflow-handoff', 'pending');
    const files = fs.readdirSync(pendingDir);
    assert.equal(files.length, 1, 'expected one pending record');
    const record = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    assert.equal(record.cmd, 'gh auth login');
    assert.equal(record.status, 'pending');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through (no output) on non-interactive command', () => {
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '', 'expected no output for pass-through');
    assert.ok(!fs.existsSync(path.join(tmp, '.devflow-handoff')),
      'no handoff dir should be created on pass-through');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through on non-Bash tool', () => {
    const { tmp, result } = runHook({
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.txt' },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through on empty/missing command', () => {
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: '' },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('passes through on malformed input', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-'));
    const result = spawnSync('node', [HOOK_PATH], {
      cwd: tmp,
      input: 'not json at all',
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('escape hatch DEVFLOW_SKIP_INTERACTIVE_GATE=1 bypasses', () => {
    const { tmp, result } = runHook(
      { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
      { DEVFLOW_SKIP_INTERACTIVE_GATE: '1' }
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '', 'should produce no output when bypassed');
    assert.ok(!fs.existsSync(path.join(tmp, '.devflow-handoff')),
      'no handoff dir should be created when bypassed');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('reason includes the offending command verbatim', () => {
    const cmd = 'doctl auth init';
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: cmd },
    });

    const out = JSON.parse(result.stdout);
    assert.match(out.hookSpecificOutput.permissionDecisionReason,
      new RegExp('! ' + cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'reason should include the verbatim ! cmd');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
