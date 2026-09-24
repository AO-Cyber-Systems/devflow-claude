'use strict';

/**
 * help.test.cjs — the help table must stay in step with the dispatcher.
 *
 * Issue #87's hole was that `--help` reached a subcommand as data. The
 * dispatcher now answers it first, which only helps if every command HAS an
 * answer: a command missing from the table would print the top-level listing
 * instead of its own usage — a quieter version of the same "you asked a
 * question and got something else" failure. These are mechanical guards so the
 * next command added cannot drift.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { COMMANDS, commandUsage, topLevelUsage, hasTopLevelHelpFlag } = require('./help.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

function run(argv, cwd) {
  const r = spawnSync(process.execPath, [TOOLS_PATH, ...argv],
    { cwd: cwd || os.tmpdir(), encoding: 'utf-8', timeout: 30000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// Top-level dispatcher arms are indented exactly four spaces; nested switches
// (e.g. `init`'s workflow switch) are deeper and must not be picked up.
function dispatcherCommands() {
  const src = fs.readFileSync(TOOLS_PATH, 'utf8');
  const names = [];
  for (const line of src.split('\n')) {
    const m = /^ {4}case '([^']+)':/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

describe('df-tools help table (issue #87)', () => {
  test('every dispatcher command has a help entry', () => {
    const missing = dispatcherCommands().filter(c => !COMMANDS[c]);
    assert.deepStrictEqual(missing, [],
      `commands with no help entry in lib/help.cjs: ${missing.join(', ')}`);
  });

  test('every help entry names a real dispatcher command', () => {
    const real = new Set(dispatcherCommands());
    const orphans = Object.keys(COMMANDS).filter(c => !real.has(c));
    assert.deepStrictEqual(orphans, [],
      `help entries for commands the dispatcher does not have: ${orphans.join(', ')}`);
  });

  test('each usage line starts with "df-tools <command>"', () => {
    for (const [name, spec] of Object.entries(COMMANDS)) {
      assert.ok(spec.usage.startsWith(`df-tools ${name}`),
        `${name}: usage must start with "df-tools ${name}"; got "${spec.usage}"`);
      assert.ok(spec.summary && spec.summary.length > 0, `${name}: summary required`);
    }
  });

  test('commandUsage renders a Usage: line; an unknown command renders nothing', () => {
    assert.match(commandUsage('commit'), /^Usage: df-tools commit /);
    assert.strictEqual(commandUsage('no-such-command'), null);
  });

  test('the top-level listing marks writing commands and includes commit', () => {
    const text = topLevelUsage();
    assert.match(text, /^Usage: df-tools <command>/);
    assert.match(text, /\n {2}commit\s+\*\s+/, 'commit must be listed and marked as writing');
    assert.match(text, /\n {2}progress\s{2,}\s+/, 'a read-only command must be listed unmarked');
  });
});

/**
 * Issue #100 findings 6 and 7 — the cost of answering `--help` for the WHOLE
 * argv. The scan was a flat `args.some(isHelpFlag)`, which cannot tell a flag
 * addressed to df-tools from one that df-tools is merely CARRYING.
 */
describe('the global help scan knows what is data and what is addressed to it (issue #100)', () => {
  test('finding 6: a flag in a forwarded command line is data, not a question', () => {
    // `handoff create <command...>` joins its tail into a command line handed
    // to the user's shell. `--help` there belongs to `gh auth login`. The scan
    // used to swallow it, print df-tools' own handoff usage, exit 0, and QUEUE
    // NOTHING — the handoff silently never happened.
    assert.strictEqual(
      hasTopLevelHelpFlag(['handoff', 'create', 'gh', 'auth', 'login', '--help']), false,
      'a help flag inside a forwarded command line must not be read as a question to df-tools');
    // The scan still stops at the tail, not at the subcommand name itself.
    assert.strictEqual(hasTopLevelHelpFlag(['handoff', 'create', '--help']), true);
    assert.strictEqual(hasTopLevelHelpFlag(['handoff', '--help']), true);
    assert.strictEqual(hasTopLevelHelpFlag(['handoff', 'list', '--help']), true);
  });

  test('finding 6: `--` ends the flag region everywhere', () => {
    assert.strictEqual(hasTopLevelHelpFlag(['commit', '--', '--help']), false);
    assert.strictEqual(hasTopLevelHelpFlag(['commit', '--help', '--', 'x']), true);
  });

  test('finding 6 (end to end): handoff create actually queues the forwarded command', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-help-handoff-'));
    try {
      fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
      const r = run(['handoff', 'create', 'gh', 'auth', 'login', '--help'], dir);
      assert.doesNotMatch(r.out, /^Usage: df-tools handoff/m,
        `df-tools answered for gh: ${r.out}`);
      assert.match(r.out, /gh auth login --help/,
        `the forwarded command line must survive intact: ${r.out}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('finding 7: no command at all is an error, not a success', () => {
    // A script building a command name dynamically that produces an empty one
    // must not read `rc=0`. This exited 1 before the #87 help scan landed.
    const r = run([]);
    assert.strictEqual(r.status, 1, `df-tools with no arguments must exit non-zero: ${r.out}`);
    assert.match(r.out, /Usage: df-tools <command>/);
  });

  test('finding 7: a typo with --help is a typo, not a question', () => {
    const r = run(['bogus-command', '--help']);
    assert.strictEqual(r.status, 1,
      `an unknown command must exit non-zero even with --help: ${r.out}`);
    assert.match(r.out, /bogus-command/,
      'the unknown name must be echoed so the typo is visible');
  });

  test('a real command with --help still exits 0 and prints its own usage', () => {
    const r = run(['commit', '--help']);
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.out, /^Usage: df-tools commit /m);
  });

  test('bare --help still exits 0 with the top-level listing', () => {
    const r = run(['--help']);
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.out, /^Usage: df-tools <command>/m);
  });
});
