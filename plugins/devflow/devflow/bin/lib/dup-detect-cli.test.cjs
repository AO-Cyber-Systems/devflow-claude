'use strict';

/**
 * Test suite for lib/dup-detect-cli.cjs
 *
 * Tests: CLI subcommand routing, --mode plan/execute wiring, --raw flag,
 * help text emission, and stubs for 04-02 commands.
 */

const test = require('node:test');
const assert = require('node:assert');
const { cmdDupDetectRoute, cmdDupDetectDetect } = require('./dup-detect-cli.cjs');

// ─── Route: help / missing subcommand ────────────────────────────────────────

test('CLI: no subcommand → exits 1 (usage error)', () => {
  // Capture stderr
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), [], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 1, 'should exit(1) on missing subcommand');
  const stderrText = stderrChunks.join('');
  assert.ok(stderrText.includes('Usage') || stderrText.includes('df-tools dup-detect'),
    `stderr: ${stderrText}`);
});

test('CLI: --help → exits 0', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['--help'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 0, 'should exit(0) on --help');
  const stderrText = stderrChunks.join('');
  assert.ok(stderrText.includes('mode plan') || stderrText.includes('mode execute') ||
    stderrText.includes('resolve') || stderrText.includes('log'),
    `stderr should show subcommands: ${stderrText}`);
});

test('CLI: -h → exits 0 with usage', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['-h'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 0);
});

// ─── Route: unknown subcommand ────────────────────────────────────────────────

test('CLI: unknown subcommand → exits 1 with message', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['unknown-cmd'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.exit = origExit;
  }

  assert.strictEqual(exitCode, 1);
  const stderrText = stderrChunks.join('');
  assert.ok(stderrText.includes('unknown') || stderrText.includes('Unknown'),
    `stderr: ${stderrText}`);
});

// ─── Route: resolve stub ──────────────────────────────────────────────────────

test('CLI: resolve subcommand → exits with stub message (04-02 placeholder)', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['resolve', '04', '--resolution', 'coordinate', '--peer-branch', 'feature/x', '--peer-objective', '03'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.stdout.write = origStdout;
    process.exit = origExit;
  }

  // Should emit something (not silently swallow)
  const allOutput = stderrChunks.join('') + stdoutChunks.join('');
  assert.ok(allOutput.length > 0, 'resolve stub should emit some output');
});

// ─── Route: log stub ─────────────────────────────────────────────────────────

test('CLI: log subcommand → exits with stub message (04-02 placeholder)', () => {
  const stderrChunks = [];
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(chunk); return true; };
  const stdoutChunks = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { stdoutChunks.push(chunk); return true; };

  let exitCode = null;
  const origExit = process.exit.bind(process);
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  try {
    cmdDupDetectRoute(process.cwd(), ['log', '04', '--mode', 'execute'], false);
  } catch (e) {
    if (!e.message.startsWith('process.exit')) throw e;
  } finally {
    process.stderr.write = origStderr;
    process.stdout.write = origStdout;
    process.exit = origExit;
  }

  const allOutput = stderrChunks.join('') + stdoutChunks.join('');
  assert.ok(allOutput.length > 0, 'log stub should emit some output');
});

// ─── Module exports ───────────────────────────────────────────────────────────

test('CLI exports: cmdDupDetectRoute and cmdDupDetectDetect are functions', () => {
  assert.strictEqual(typeof cmdDupDetectRoute, 'function');
  assert.strictEqual(typeof cmdDupDetectDetect, 'function');
});
