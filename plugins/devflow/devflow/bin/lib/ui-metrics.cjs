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
const { output, pluginVersion } = require('./helpers.cjs');

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
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
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

// `ui metrics baseline [--since YYYY-MM-DD] [--paths p1,p2] [--out file]`
function cmdUiMetrics(cwd, args, raw) {
  const subcommand = args[0];
  if (subcommand !== 'baseline') {
    output({ ok: false, error: `Unknown ui metrics subcommand: ${subcommand}. Available: baseline` }, raw, '');
    return;
  }

  const sinceIdx = args.indexOf('--since');
  const pathsIdx = args.indexOf('--paths');
  const outIdx = args.indexOf('--out');

  const since = sinceIdx !== -1 ? args[sinceIdx + 1] : DEFAULT_SINCE;
  const pathsArg = pathsIdx !== -1 ? args[pathsIdx + 1] : DEFAULT_PATHS.join(',');
  const paths = pathsArg.split(',').map(p => p.trim()).filter(Boolean);
  const outRel = outIdx !== -1 ? args[outIdx + 1] : DEFAULT_OUT;

  const baseline = computeBaseline({ cwd, since, paths });

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
