'use strict';

/**
 * CHANGELOG.md updater for DevFlow.
 *
 * Generates Keep-a-Changelog format entries from git log between two tags
 * (or from the previous tag to HEAD) and prepends them to CHANGELOG.md
 * under [Unreleased] or under a new [vX.Y.Z] header.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { output } = require('./helpers.cjs');

const TYPE_LABELS = {
  feat: 'Added',
  fix: 'Fixed',
  perf: 'Performance',
  refactor: 'Changed',
  chore: 'Chore',
  docs: 'Docs',
  test: 'Tests',
  security: 'Security',
};
const TYPE_ORDER = ['feat', 'fix', 'security', 'perf', 'refactor', 'docs', 'test', 'chore', 'other'];

function git(args, cwd) {
  const r = spawnSync('git', args, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function previousTag(cwd, ref) {
  // Find the tag immediately before `ref` (default HEAD). Returns null if none.
  const args = ref ? ['describe', '--tags', '--abbrev=0', `${ref}^`] : ['describe', '--tags', '--abbrev=0', 'HEAD^'];
  const r = git(args, cwd);
  return r.ok ? r.stdout : null;
}

function tagExists(cwd, tag) {
  return git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], cwd).ok;
}

function commitsBetween(cwd, from, to) {
  const range = from ? `${from}..${to || 'HEAD'}` : (to || 'HEAD');
  const r = git(['log', range, '--no-merges', '--pretty=format:%h\x1f%s'], cwd);
  if (!r.ok) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [sha, subject] = line.split('\x1f');
      const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!?):\s*(.+)$/);
      if (m) {
        return { sha, type: m[1].toLowerCase(), scope: m[2] || null, breaking: m[3] === '!', subject: m[4] };
      }
      return { sha, type: 'other', scope: null, breaking: false, subject };
    });
}

function groupCommits(commits) {
  const groups = {};
  for (const c of commits) {
    // Skip release-bump and CHANGELOG-update commits (avoid recursion noise)
    if (/^chore\(release\)/.test(c.subject) || /update changelog/i.test(c.subject)) continue;
    const bucket = TYPE_LABELS[c.type] ? c.type : 'other';
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(c);
  }
  return groups;
}

function renderEntry(version, dateISO, commits) {
  const groups = groupCommits(commits);
  const lines = [`## [${version}] - ${dateISO}`, ''];

  const breaking = commits.filter(c => c.breaking);
  if (breaking.length > 0) {
    lines.push('### Breaking');
    for (const c of breaking) {
      lines.push(`- ${c.subject}${c.scope ? ` (${c.scope})` : ''} (${c.sha})`);
    }
    lines.push('');
  }

  for (const type of TYPE_ORDER) {
    if (!groups[type] || groups[type].length === 0) continue;
    const label = TYPE_LABELS[type] || 'Other';
    lines.push(`### ${label}`);
    for (const c of groups[type]) {
      const scope = c.scope ? `**${c.scope}**: ` : '';
      lines.push(`- ${scope}${c.subject} (${c.sha})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function readChangelog(cwd) {
  const p = path.join(cwd, 'CHANGELOG.md');
  if (!fs.existsSync(p)) {
    return {
      path: p,
      header: '# Changelog\n\nAll notable changes to DevFlow will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).\n\n## [Unreleased]\n\n',
      body: '',
    };
  }
  const content = fs.readFileSync(p, 'utf-8');
  const split = content.match(/^([\s\S]*?)(## \[(?!Unreleased)[^\]]+\][\s\S]*)$/);
  if (split) {
    return { path: p, header: split[1], body: split[2] };
  }
  return { path: p, header: content, body: '' };
}

function hasVersionEntry(cwd, version) {
  const p = path.join(cwd, 'CHANGELOG.md');
  if (!fs.existsSync(p)) return false;
  const content = fs.readFileSync(p, 'utf-8');
  const versionRe = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm');
  return versionRe.test(content);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdChangelogUpdate(cwd, opts, raw) {
  const { version, from, to, dryRun } = opts;
  if (!version) {
    output({ ok: false, error: 'version is required (--version vX.Y.Z or X.Y.Z)' }, raw, '');
    return;
  }
  const v = version.replace(/^v/, '');

  if (hasVersionEntry(cwd, v)) {
    output({ ok: false, skipped: true, reason: `CHANGELOG already has entry for ${v}` }, raw, '');
    return;
  }

  // Resolve range
  let fromRef = from;
  let toRef = to || 'HEAD';
  if (!fromRef) {
    // If `to` is a tag that exists, find tag before it; otherwise use latest tag
    if (toRef !== 'HEAD' && tagExists(cwd, toRef)) {
      fromRef = previousTag(cwd, toRef);
    } else {
      const latest = git(['describe', '--tags', '--abbrev=0'], cwd);
      fromRef = latest.ok ? latest.stdout : null;
    }
  }

  const commits = commitsBetween(cwd, fromRef, toRef);
  if (commits.length === 0) {
    output({ ok: false, reason: `No commits found in range ${fromRef || '(start)'}..${toRef}` }, raw, '');
    return;
  }

  // Date — use tag date if `to` is a tag, otherwise today
  let dateISO = new Date().toISOString().slice(0, 10);
  if (toRef !== 'HEAD' && tagExists(cwd, toRef)) {
    const tagDate = git(['log', '-1', '--format=%cs', toRef], cwd);
    if (tagDate.ok && tagDate.stdout) dateISO = tagDate.stdout;
  }

  const entry = renderEntry(v, dateISO, commits);

  if (dryRun) {
    output({ ok: true, dryRun: true, version: v, from: fromRef, to: toRef, commit_count: commits.length, entry }, raw, entry);
    return;
  }

  const cl = readChangelog(cwd);
  // Inject the entry between header and existing body
  const newContent = cl.header.trimEnd() + '\n\n' + entry.trim() + '\n\n' + cl.body.trimStart() + (cl.body ? '\n' : '');
  fs.writeFileSync(cl.path, newContent);

  output(
    { ok: true, version: v, from: fromRef, to: toRef, commit_count: commits.length, path: cl.path },
    raw,
    `Updated ${cl.path} with ${commits.length} commits for ${v}`
  );
}

function cmdChangelogCheck(cwd, version, raw) {
  if (!version) {
    output({ ok: false, error: 'version required' }, raw, '');
    return;
  }
  const v = version.replace(/^v/, '');
  const present = hasVersionEntry(cwd, v);
  output({ ok: true, version: v, present }, raw, present ? 'present' : 'missing');
}

module.exports = {
  cmdChangelogUpdate,
  cmdChangelogCheck,
  hasVersionEntry,
  // Exposed for tests
  groupCommits,
  renderEntry,
  commitsBetween,
};
