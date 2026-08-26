'use strict';

/**
 * session-audit.test.cjs — TRD 31-03
 *
 * The single most important test here is `prose about gates is not an event`.
 * The original audit's first pass keyword-matched raw transcript text and
 * counted 899 "hook-blocked" hits that were planning documents DISCUSSING the
 * gates. That inflated the headline number and would have pointed the whole
 * remediation programme at a phantom. Classification must only ever run on a
 * structured failed tool_result.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classify, accumulate, summarize, newAccumulator, DEVFLOW_OWNED,
} = require('./session-audit.cjs');

// Built at runtime so this source file does not itself contain the raw-commit
// phrase — the commit gate matches on it (see TRD 27-04, which fixed exactly
// this false positive but only ships once the plugin cache is re-synced).
const RAW_COMMIT_MSG = 'DevFlow project detected. Raw `' + 'git ' + 'commit` is blocked.';

const errResult = (text, extra = {}) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', is_error: true, content: text }] },
  ...extra,
});
const okResult = text => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', is_error: false, content: text }] },
});

describe('classify() — real gate messages', () => {
  const cases = [
    ['DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.', 'devflow-edit-gate'],
    [RAW_COMMIT_MSG, 'devflow-commit-gate'],
    ['This agent is isolated in the worktree /x, but this command is too complex', 'worktree-isolation'],
    ['Skill devflow:objective cannot be used with Skill tool due to disable-model-invocation', 'skill-not-invocable'],
    ['Error: No such tool available: Edit.', 'tool-not-available'],
    ['Grep is not enabled in this context', 'tool-not-available'],
    ["The user doesn't want to proceed with this tool use.", 'permission-denial'],
    ['File has not been read yet. Read it first', 'read-before-write'],
    ['Command timed out after 2m 0s', 'command-timeout'],
    ['File does not exist. Note: your current working directory is /x', 'file-not-found'],
    ['File content (5.1KB) exceeds maximum allowed size', 'output-too-large'],
    ['CHANGELOG.md lacks ## [2.5.0]', 'devflow-changelog-gate'],
  ];
  for (const [text, expected] of cases) {
    test(`"${text.slice(0, 44)}..." maps to ${expected}`, () => {
      assert.equal(classify(text), expected);
    });
  }

  test('an unrecognised failure is bucketed, not dropped', () => {
    assert.equal(classify('some novel failure'), 'other-tool-error');
  });
});

describe('accumulate() — only structured errors count', () => {
  test('prose ABOUT gates is NOT an event (the 899-false-hit bug)', () => {
    const acc = newAccumulator();
    // a planning doc read back through a SUCCESSFUL Read — the exact shape that
    // fooled the original keyword pass
    accumulate(acc, okResult(
      '# Notes\n\ngate-edits.js denies Edit in ambient mode; DevFlow ambient mode active ' +
      'is the message. ' + RAW_COMMIT_MSG
    ), 's1');
    assert.equal(acc.events.length, 0, 'discussion of a gate must never count as a gate event');
  });

  test('assistant prose mentioning a gate is not an event either', () => {
    const acc = newAccumulator();
    accumulate(acc, {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'The DevFlow ambient mode active message means...' }] },
    }, 's1');
    assert.equal(acc.events.length, 0);
  });

  test('a failed tool_result IS an event', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.'), 's1');
    assert.equal(acc.events.length, 1);
    assert.equal(acc.events[0].category, 'devflow-edit-gate');
  });

  test('sidechain origin is recorded', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('is isolated in the worktree /x', { isSidechain: true }), 's1');
    assert.equal(acc.events[0].sidechain, true);
  });

  test('malformed rows never throw', () => {
    const acc = newAccumulator();
    for (const bad of [null, undefined, 'str', 7, {}, { message: null }, { message: { content: 'x' } }]) {
      assert.doesNotThrow(() => accumulate(acc, bad, 's'));
    }
    assert.equal(acc.events.length, 0);
  });
});

describe('summarize() — the programme verdict', () => {
  test('counts DevFlow-owned categories separately from harness ones', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.'), 's1');
    accumulate(acc, errResult('This agent is isolated in the worktree /x'), 's1');
    const s = summarize(acc);
    // the worktree guard is the harness's, not DevFlow's — it must not be claimed
    assert.equal(s.devflow_owned_events, 1);
    assert.equal(s.total_events, 2);
    assert.match(s.verdict, /1 DevFlow-owned/);
  });

  test('a clean window reports zero DevFlow-owned blocks', () => {
    const acc = newAccumulator();
    accumulate(acc, errResult('This agent is isolated in the worktree /x'), 's1');
    const s = summarize(acc);
    assert.equal(s.devflow_owned_events, 0);
    assert.match(s.verdict, /no DevFlow-owned blocks/);
  });

  test('sessions_with_blocks_pct reflects only sessions that actually blocked', () => {
    const acc = newAccumulator();
    accumulate(acc, okResult('nothing wrong'), 'clean-session');
    accumulate(acc, errResult('Command timed out after 2m 0s'), 'bad-session');
    const s = summarize(acc);
    assert.equal(s.sessions, 2);
    assert.equal(s.sessions_with_blocks, 1);
    assert.equal(s.sessions_with_blocks_pct, 50);
  });

  test('events are bucketed by period for trend comparison', () => {
    const acc = newAccumulator();
    accumulate(acc, { ...errResult('Command timed out after 2m 0s'), timestamp: '2026-08-01T00:00:00Z' }, 's');
    accumulate(acc, { ...errResult('Command timed out after 2m 0s'), timestamp: '2026-09-01T00:00:00Z' }, 's');
    const s = summarize(acc);
    assert.equal(s.by_period['2026-08']['command-timeout'], 1);
    assert.equal(s.by_period['2026-09']['command-timeout'], 1);
  });

  test('an empty corpus summarizes without dividing by zero', () => {
    const s = summarize(newAccumulator());
    assert.equal(s.total_events, 0);
    assert.equal(s.sessions_with_blocks_pct, 0);
    assert.equal(s.sidechain_pct, 0);
  });

  test('DEVFLOW_OWNED excludes the harness worktree guard', () => {
    assert.equal(DEVFLOW_OWNED.has('worktree-isolation'), false,
      'claiming the harness guard as ours would overstate what this programme fixed');
  });
});
