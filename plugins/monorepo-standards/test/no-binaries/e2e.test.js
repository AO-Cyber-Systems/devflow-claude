'use strict';

/**
 * End-to-end tests for the no-binaries hook.
 *
 * Each test:
 *   1. Spins up a throwaway git repo in a tmp dir
 *   2. Stages a file (text / binary / oversize / image / etc.)
 *   3. Pipes a synthetic PreToolUse payload (`git commit -m ...`) into
 *      hooks/no-binaries.js
 *   4. Asserts the hook's stdout — either silent pass or `deny` JSON
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '..', '..', 'hooks', 'no-binaries.js');

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-bin-e2e-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  return dir;
}

function writeFile(repo, rel, data) {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  execFileSync('git', ['add', '--', rel], { cwd: repo });
}

function runHook(repo, cmd, env = {}) {
  const payload = JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command: cmd, cwd: repo }
  });
  const res = spawnSync(process.execPath, [HOOK], {
    input: payload,
    cwd: repo,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return res;
}

function expectAllow(res) {
  assert.strictEqual(res.status, 0, `hook exited ${res.status}: ${res.stderr}`);
  const out = res.stdout.trim();
  if (!out) return; // silent pass
  try {
    const parsed = JSON.parse(out);
    assert.notStrictEqual(
      parsed.hookSpecificOutput && parsed.hookSpecificOutput.permissionDecision,
      'deny',
      `expected allow but got deny: ${parsed.hookSpecificOutput.permissionDecisionReason}`
    );
  } catch {
    assert.fail(`hook produced unexpected output: ${out}`);
  }
}

function expectDeny(res, reasonRegex) {
  assert.strictEqual(res.status, 0, `hook exited ${res.status}: ${res.stderr}`);
  const parsed = JSON.parse(res.stdout);
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'deny');
  if (reasonRegex) {
    assert.match(parsed.hookSpecificOutput.permissionDecisionReason, reasonRegex);
  }
}

// --------- tests --------------------------------------------------------

test('e2e: passes a normal source commit', () => {
  const repo = mkRepo();
  writeFile(repo, 'main.go', 'package main\n\nfunc main() {}\n');
  const res = runHook(repo, 'git commit -m "feat: hello"');
  expectAllow(res);
});

test('e2e: blocks a Mach-O binary at repo root', () => {
  const repo = mkRepo();
  // Fabricate a Mach-O header — first 4 bytes are enough for detection.
  const buf = Buffer.concat([
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
    Buffer.alloc(4096)
  ]);
  writeFile(repo, 'server', buf);
  const res = runHook(repo, 'git commit -m "compiled binary"');
  expectDeny(res, /Mach-O|native/);
});

test('e2e: blocks a file > 5MB', () => {
  const repo = mkRepo();
  writeFile(repo, 'big.dat', Buffer.alloc(6 * 1024 * 1024, 0x20));
  const res = runHook(repo, 'git commit -m "huge"');
  expectDeny(res, /exceeds size limit/);
});

test('e2e: allows assets/logo.png', () => {
  const repo = mkRepo();
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(1024)
  ]);
  writeFile(repo, 'assets/logo.png', png);
  const res = runHook(repo, 'git commit -m "add logo"');
  expectAllow(res);
});

test('e2e: blocks .exe even if tiny', () => {
  const repo = mkRepo();
  writeFile(repo, 'tools/helper.exe', Buffer.from('not really an exe'));
  const res = runHook(repo, 'git commit -m "tool"');
  expectDeny(res, /deny list|exe/);
});

test('e2e: bypass via DEVFLOW_ALLOW_BINARIES=1', () => {
  const repo = mkRepo();
  writeFile(repo, 'tools/helper.exe', Buffer.from('not an exe'));
  const res = runHook(repo, 'git commit -m "tool"', { DEVFLOW_ALLOW_BINARIES: '1' });
  expectAllow(res);
});

test('e2e: respects .devflow/no-binaries.yml allowed_paths', () => {
  const repo = mkRepo();
  fs.mkdirSync(path.join(repo, '.devflow'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.devflow', 'no-binaries.yml'),
    [
      'enabled: true',
      'max_size_mb: 5',
      'allowed_paths:',
      '  - "vendored/**"'
    ].join('\n') + '\n'
  );
  execFileSync('git', ['add', '.devflow/no-binaries.yml'], { cwd: repo });
  const elf = Buffer.concat([
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    Buffer.alloc(1024)
  ]);
  writeFile(repo, 'vendored/libfoo.so', elf);
  const res = runHook(repo, 'git commit -m "vendor"');
  expectAllow(res);
});

test('e2e: enabled: false disables the hook entirely', () => {
  const repo = mkRepo();
  fs.mkdirSync(path.join(repo, '.devflow'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.devflow', 'no-binaries.yml'),
    'enabled: false\n'
  );
  execFileSync('git', ['add', '.devflow/no-binaries.yml'], { cwd: repo });
  writeFile(repo, 'tools/helper.exe', Buffer.alloc(100));
  const res = runHook(repo, 'git commit -m "disabled"');
  expectAllow(res);
});

test('e2e: non-git-commit commands pass through', () => {
  const repo = mkRepo();
  writeFile(repo, 'tools/helper.exe', Buffer.alloc(100));
  const res = runHook(repo, 'git status');
  expectAllow(res);
});

test('e2e: commit outside any git repo is silently allowed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no-bin-no-repo-'));
  const res = runHook(tmp, 'git commit -m "x"');
  expectAllow(res);
});

test('e2e: deletion-only commit passes (no staged blobs to inspect)', () => {
  const repo = mkRepo();
  writeFile(repo, 'README.md', '# hi\n');
  execFileSync('git', ['commit', '-q', '-m', 'init', '--no-gpg-sign'], { cwd: repo });
  execFileSync('git', ['rm', '--', 'README.md'], { cwd: repo });
  const res = runHook(repo, 'git commit -m "delete readme"');
  expectAllow(res);
});

test('e2e: deny message includes specific path and remediation hints', () => {
  const repo = mkRepo();
  writeFile(repo, 'cmd/server/server',
    Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(1024)]));
  const res = runHook(repo, 'git commit -m "x"');
  const parsed = JSON.parse(res.stdout);
  const msg = parsed.hookSpecificOutput.permissionDecisionReason;
  assert.match(msg, /cmd\/server\/server/);
  assert.match(msg, /\.gitignore/);
  assert.match(msg, /release artifact|gh release/);
});
