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

  test('all 23 patterns present (10 TTY + 13 shell-flow, post-TRD-01-06)', () => {
    assert.equal(INTERACTIVE_PATTERNS.length, 23,
      'pattern count regression — adjust this assertion if intentionally added/removed');
    const tty = INTERACTIVE_PATTERNS.filter(p => p.category === 'tty').length;
    const shellFlow = INTERACTIVE_PATTERNS.filter(p => p.category === 'shell-flow').length;
    assert.equal(tty, 10, 'TTY-interactive pattern count');
    assert.equal(shellFlow, 13, 'shell-flow pattern count');
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

describe('detectInteractive — shell-flow patterns (TRD 01-06)', () => {
  const shellFlowCases = [
    'nvm use 18',
    'nvm install 20',
    'pyenv shell 3.11',
    'pyenv install 3.12',
    'conda activate myenv',
    'direnv exec . make build',
    'direnv allow',
    'mise use node@20',
    'mise install',
    'mise run test',
    'asdf shell ruby 3.2',
    'asdf install',
    'rbenv shell 3.2',
  ];
  for (const cmd of shellFlowCases) {
    test(`detects (shell-flow): ${cmd}`, () => {
      const hit = detectInteractive(cmd);
      assert.ok(hit, `expected detection for: ${cmd}`);
      assert.equal(hit.category, 'shell-flow');
    });
  }

  test('aws sso login is detected as TTY (browser auth, not shell-flow)', () => {
    const hit = detectInteractive('aws sso login');
    assert.ok(hit);
    assert.equal(hit.category, 'tty');
  });

  test('quoted shell-flow commands still NOT triggered (1c334b0 still applies)', () => {
    assert.equal(detectInteractive('echo "nvm use 18"'), null);
    assert.equal(detectInteractive('echo "mise use node"'), null);
  });
});

function withFakePidFile({ alive }, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-'));
  const pidFile = path.join(tmp, 'devflow-watch.pid');
  // alive=true → use OUR pid (test process is alive). alive=false → unused pid.
  const pid = alive ? process.pid : 999999;
  fs.writeFileSync(pidFile, JSON.stringify({
    pid, version: '0.1.0', shell: 'zsh', watching: [], started_at: new Date().toISOString(),
  }));
  try {
    return fn(pidFile);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('hook subprocess — daemon-aware deny message (TRD 01-06)', () => {
  test('watcher LIVE: deny says "queued for daemon", does NOT instruct paste', () => {
    withFakePidFile({ alive: true }, (pidFile) => {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { DEVFLOW_HANDOFF_PID_FILE: pidFile },
      );
      assert.equal(result.status, 0);
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /queued/);
      assert.match(reason, /devflow-watch daemon/);
      assert.ok(!/Tell the user verbatim/.test(reason),
        'should NOT instruct user paste when daemon is live');
      assert.ok(!/`! gh auth login`/.test(reason),
        'should NOT include the ! prefix line when daemon is live');
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  test('watcher absent: deny instructs paste (Approach A)', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    try {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { HOME: fakeHome },
      );
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /! gh auth login/);
      assert.match(reason, /not running/);
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('stale PID (process dead) → not-live → Approach A reason', () => {
    withFakePidFile({ alive: false }, (pidFile) => {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { DEVFLOW_HANDOFF_PID_FILE: pidFile },
      );
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /! gh auth login/);
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  });

  test('malformed PID file → not-live → Approach A reason', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pid-bad-'));
    const pidFile = path.join(tmpDir, 'devflow-watch.pid');
    fs.writeFileSync(pidFile, 'not json');
    try {
      const { tmp, result } = runHook(
        { tool_name: 'Bash', tool_input: { command: 'gh auth login' } },
        { DEVFLOW_HANDOFF_PID_FILE: pidFile },
      );
      const reason = JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason;
      assert.match(reason, /! gh auth login/);
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('hook integration — subprocess', () => {
  test('emits PreToolUse deny JSON for interactive command (Approach A — no watcher)', () => {
    // Sandbox HOME so isWatcherLive() doesn't see a real daemon if one is running.
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-int-home-'));
    const { tmp, result } = runHook({
      tool_name: 'Bash',
      tool_input: { command: 'gh auth login' },
    }, { HOME: fakeHome });

    assert.equal(result.status, 0, `non-zero exit: ${result.stderr}`);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /shell/);
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /! gh auth login/);

    // Pending record written with new fields
    const pendingDir = path.join(tmp, '.devflow-handoff', 'pending');
    const files = fs.readdirSync(pendingDir);
    assert.equal(files.length, 1, 'expected one pending record');
    const record = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    assert.equal(record.cmd, 'gh auth login');
    assert.equal(record.status, 'pending');
    assert.equal(record.source, 'hook');
    assert.equal(typeof record.timeout_ms, 'number');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
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
