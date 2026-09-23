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
const path = require('path');

const { COMMANDS, commandUsage, topLevelUsage } = require('./help.cjs');

const TOOLS_PATH = path.join(__dirname, '..', 'df-tools.cjs');

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
