'use strict';

/**
 * UI process metrics baseline (W0-6).
 *
 * Classifies conventional-commit subjects touching given paths since a date,
 * and reports the fix/feat ratio + "quick fix" count. Used to record the
 * "before" numbers for a UI-process redesign so later waves can prove
 * improvement against a real baseline instead of a guess.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { output, error, pluginVersion } = require('./helpers.cjs');

const DEFAULT_SINCE = '2026-06-01';
const DEFAULT_PATHS = ['flutter/lib'];
const DEFAULT_OUT = '.planning/ui-metrics-baseline.json';

const SUBJECT_TYPE_RE = /^(\w+)(\(|:)/;
const QUICK_FIX_RE = /quick-\d+/;
const KNOWN_TYPES = ['feat', 'fix', 'test', 'refactor'];

// Default git runner: `git log --format=%s --since=<since> -- <paths...>` via execFileSync.
// Injectable so tests can stub it, or point it at a real throwaway repo.
function defaultGitLog({ cwd, since, paths }) {
  const args = ['log', '--format=%s', `--since=${since}`, '--', ...paths];
  // stderr is piped (not inherited) so git's own `fatal:` line ends up on the
  // thrown error, where cmdUiMetrics turns it into one message — not on our stderr.
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Classifies a conventional-commit subject line into feat/fix/test/refactor/other.
// Anything that doesn't match `^(\w+)(\(|:)` (including merge commits) is "other".
function classifySubject(subject) {
  const m = subject.match(SUBJECT_TYPE_RE);
  if (!m) return 'other';
  const type = m[1].toLowerCase();
  return KNOWN_TYPES.includes(type) ? type : 'other';
}

function computeBaseline({ cwd, since = DEFAULT_SINCE, paths = DEFAULT_PATHS, git = defaultGitLog }) {
  const pathList = Array.isArray(paths) ? paths : [paths];
  const stdout = git({ cwd, since, paths: pathList });
  const subjects = stdout.split('\n').map(s => s.trim()).filter(Boolean);

  const commits = { feat: 0, fix: 0, test: 0, refactor: 0, other: 0 };
  let quick_fixes = 0;
  for (const subject of subjects) {
    commits[classifySubject(subject)]++;
    if (QUICK_FIX_RE.test(subject)) quick_fixes++;
  }

  const fix_per_feat = commits.feat === 0 ? null : Math.round((commits.fix / commits.feat) * 100) / 100;

  return { since, paths: pathList, commits, fix_per_feat, quick_fixes };
}

// Value for `--flag <value>`: the next arg, which must exist and not itself be
// a flag. Anything else is a usage error (helpers.error → stderr, exit 1).
function flagValue(args, flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const v = args[idx + 1];
  if (v === undefined || v.startsWith('--')) {
    error(`ui metrics: ${flag} requires a value (usage: ui metrics baseline [--since YYYY-MM-DD] [--paths p1,p2] [--out file])`);
  }
  return v;
}

// `git log` outside a repository throws with git's own stderr in the message.
// Report it as a one-line error rather than a stack trace.
function isNotARepo(err) {
  const text = `${err && err.stderr ? err.stderr : ''}${err && err.message ? err.message : ''}`;
  return /not a git repository/i.test(text);
}

// `ui metrics baseline [--since YYYY-MM-DD] [--paths p1,p2] [--out file]`
function cmdUiMetrics(cwd, args, raw) {
  const subcommand = args[0];
  if (subcommand !== 'baseline') {
    error(`Unknown ui metrics subcommand: ${subcommand}. Available: baseline`);
  }

  const since = flagValue(args, '--since', DEFAULT_SINCE);
  const pathsArg = flagValue(args, '--paths', DEFAULT_PATHS.join(','));
  const paths = pathsArg.split(',').map(p => p.trim()).filter(Boolean);
  if (paths.length === 0) {
    // `--paths ""` / `--paths ,` slips past flagValue (a defined, non-flag
    // string) but collapses to [] here — an empty `paths` would otherwise
    // reach computeBaseline, which passes no `--` scoping to `git log`, so
    // the whole repo gets measured while the JSON records `paths: []`.
    // Same usage error as a missing value.
    error(`ui metrics: --paths requires a value (usage: ui metrics baseline [--since YYYY-MM-DD] [--paths p1,p2] [--out file])`);
  }
  const outRel = flagValue(args, '--out', DEFAULT_OUT);

  let baseline;
  try {
    baseline = computeBaseline({ cwd, since, paths });
  } catch (e) {
    if (isNotARepo(e)) error(`ui metrics: not a git repository: ${cwd}`);
    throw e;
  }

  const result = {
    engine_version: pluginVersion(),
    schema_version: 1,
    since: baseline.since,
    paths: baseline.paths,
    commits: baseline.commits,
    fix_per_feat: baseline.fix_per_feat,
    quick_fixes: baseline.quick_fixes,
    generated_at: new Date().toISOString(),
  };

  const outPath = path.isAbsolute(outRel) ? outRel : path.join(cwd, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');

  output(result, raw, JSON.stringify(result));
}

module.exports = {
  computeBaseline,
  cmdUiMetrics,
  classifySubject,
};
