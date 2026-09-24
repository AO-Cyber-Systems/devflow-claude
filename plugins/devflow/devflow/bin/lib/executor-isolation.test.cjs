'use strict';

/**
 * executor-isolation.test.cjs — issue #86, the prose half.
 *
 * The defect lived in one frontmatter line (`isolation: worktree` in
 * agents/executor.md) and in orchestrator prose that told the executor nothing
 * about which repository or which commit it was supposed to be standing on.
 * Fixing the tool without fixing the wiring would leave `df-tools exec-context`
 * as a command nobody runs — so these are mechanical checks on the prose, of
 * the same kind as agent-tools.test.cjs.
 *
 * Every executor in the UI Oracle Loop programme had to be dispatched as a
 * plain general-purpose subagent to work around the forced isolation. These
 * assertions are what "the workaround is no longer needed" looks like.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', '..', '..');
const EXECUTOR = path.join(PLUGIN, 'agents', 'executor.md');
const EXECUTE_OBJECTIVE = path.join(PLUGIN, 'devflow', 'workflows', 'execute-objective.md');
const QUICK = path.join(PLUGIN, 'devflow', 'workflows', 'quick.md');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function frontmatter(p) { return read(p).split('---')[1] || ''; }

describe('executor isolation wiring (issue #86)', () => {
  test('executor.md does not force platform worktree isolation', () => {
    const fm = frontmatter(EXECUTOR);
    assert.ok(!/^isolation:/m.test(fm),
      'executor.md frontmatter still declares `isolation:` — the harness then resolves ' +
      'the repo from the controller session and the base from the default branch, which ' +
      'is exactly issue #86. Isolation must be provisioned explicitly by the orchestrator ' +
      '(`df-tools exec-context worktree`) instead.');
  });

  test('executor.md runs the repo/base preflight before doing any work', () => {
    const body = read(EXECUTOR);
    assert.match(body, /df-tools\.cjs exec-context check --repo/,
      'executor.md must run `exec-context check --repo ...` as its first step');
    assert.match(body, /exec-context check[^\n]*--base/,
      'the preflight must assert the base too, not only the repo');
    // The preflight is worthless if the agent is not told to stop on failure.
    assert.match(body, /exit(?:s)? 1|non-zero|STOP/i,
      'executor.md must say to stop when the preflight fails');
  });

  test('the preflight appears before the first commit instruction', () => {
    const body = read(EXECUTOR);
    const preflight = body.indexOf('exec-context check');
    const firstCommit = body.indexOf('df-tools.cjs commit');
    assert.ok(preflight !== -1 && firstCommit !== -1);
    assert.ok(preflight < firstCommit,
      'the repo/base preflight must come before any instruction that writes a commit');
  });

  test('execute-objective.md tells each executor which repo and which base', () => {
    const body = read(EXECUTE_OBJECTIVE);
    assert.match(body, /exec-context check --repo/,
      'the dispatch must carry the repo/base preflight into the executor prompt');
    assert.match(body, /exec-context worktree --repo/,
      'parallel waves must provision isolation explicitly, in the target repo');
    assert.match(body, /WAVE_BASE|wave base|--base/,
      'the wave base must be stated, not implied');
  });

  test('execute-objective.md no longer claims isolation branches from the default branch', () => {
    const body = read(EXECUTE_OBJECTIVE);
    assert.ok(!/branches from the DEFAULT branch/.test(body),
      'the stale caution about platform worktrees branching from the default branch must ' +
      'be replaced — that behaviour is what #86 removes, and leaving the note tells a ' +
      'reader the defect is still live');
  });

  // ── issue #100 Group B — the guard pointed at the wrong tree ───────────────

  test('#100 finding 1: the executor writes relative to `checkout`, not `repo_root`', () => {
    const body = read(EXECUTOR);
    // `check` reports repo_root = the REPOSITORY's main checkout, and checkout =
    // the tree this spawn is standing in. For a wave provisioned into
    // `.df-worktrees/<repo>/<id>` they are different directories, and repo_root
    // is the SHARED one. Telling the executor "every path you write is absolute
    // from repo_root" sends every parallel wave into the same tree.
    assert.match(body, /`?checkout`?/,
      'executor.md must name the `checkout` field the preflight returns');
    assert.doesNotMatch(body, /absolute from (?:it|`?repo_root`?)/i,
      'executor.md must not tell the executor to write relative to `repo_root` — ' +
      'in a linked worktree that is the shared main checkout');
  });

  test('#100 finding 3: the no-REPO_ROOT fallback does not self-certify', () => {
    const body = read(EXECUTOR);
    // Running the guard against the spawn's OWN toplevel compares the repo with
    // itself, so it can never fail. A guard that cannot fail is not a guard.
    assert.doesNotMatch(body, /exec-context check --repo \$\(git rev-parse --show-toplevel\)/,
      'the fallback must not run the check against the session\'s own repo root');
    assert.match(body, /unproven|cannot be proven|not proven/i,
      'a dispatch with no REPO_ROOT must be reported as UNPROVEN, not quietly self-certified');
  });

  test('quick.md dispatches its executor with the same repo preflight', () => {
    const body = read(QUICK);
    assert.match(body, /exec-context check --repo/,
      'quick.md spawns the same executor and needs the same guarantee');
  });
});
