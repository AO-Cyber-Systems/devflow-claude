'use strict';

/**
 * CLI subcommand router for `df-tools initiatives <subcommand>`.
 *
 * TRD 05-01: list + show wired; sync stub returns exit-1 with "filled by TRD 05-02".
 * TRD 05-02: replaces sync stub with real implementation.
 * TRD 05-03: adds --force flag handling to sync.
 */

const init = require('./initiatives.cjs');
const { output } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--home' || a === '--initiative' || a === '--project-id' || a === '--repo') {
      flags[a.slice(2)] = args[i + 1];
      i += 2;
    } else if (a === '--raw' || a === '--force') {
      flags[a.slice(2)] = true;
      i++;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
      i++;
    } else {
      positional.push(a);
      i++;
    }
  }
  return { flags, positional };
}

function cmdInitiativesList(cwd, args) {
  const { flags } = _parseFlags(args);
  const home = flags.home || init.defaultInitiativesHome();
  const initiatives = init.loadInitiatives({ home });
  const summary = initiatives.map(i => ({
    slug: i.slug,
    github_issue: i.github_issue,
    key_repos: i.key_repos,
    updated_at: i.updated_at,
  }));
  output(summary, flags.raw, JSON.stringify(summary, null, 2));
}

function cmdInitiativesShow(cwd, args) {
  const { flags, positional } = _parseFlags(args);
  const slug = positional[0];
  if (!slug) {
    process.stderr.write(JSON.stringify({ error: 'Usage: initiatives show <slug>' }) + '\n');
    process.exit(1);
    return;
  }
  const home = flags.home || init.defaultInitiativesHome();
  const initiatives = init.loadInitiatives({ home });
  const found = initiatives.find(i => i.slug === slug);
  if (!found) {
    process.stderr.write(JSON.stringify({
      error: `initiative not found: ${slug}`,
      available: initiatives.map(i => i.slug),
    }) + '\n');
    process.exit(1);
    return;
  }
  if (flags.raw) {
    process.stdout.write(JSON.stringify(found, null, 2));
    process.exit(0);
    return;
  }
  // Human-readable: re-render from parsed data
  const lines = [];
  lines.push(`# ${found.slug}`);
  lines.push(`Tracks: ${found.github_issue}`);
  lines.push(`Key repos: ${(found.key_repos || []).join(', ')}`);
  lines.push('');
  if (found.why) { lines.push('## Why'); lines.push(''); lines.push(found.why); lines.push(''); }
  if (found.open_questions && found.open_questions.length > 0) {
    lines.push('## Open Questions');
    lines.push('');
    for (const q of found.open_questions) lines.push(`- ${q}`);
    lines.push('');
  }
  if (found.sub_issues && found.sub_issues.length > 0) {
    lines.push('## Linked Sub-issues');
    lines.push('');
    for (const si of found.sub_issues) lines.push(`- ${si.ref} — ${si.title} (${si.state})`);
    lines.push('');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

async function cmdInitiativesSync(cwd, args) {
  const { flags } = _parseFlags(args);
  try {
    const result = await init.syncInitiatives({
      home: flags.home,
      project_id: flags['project-id'],
      initiative: flags.initiative,
      force: flags.force === true,
    });
    if (!result.ok) {
      process.stderr.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(1);
      return;
    }
    output(result, flags.raw, JSON.stringify(result, null, 2));
  } catch (e) {
    if (e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }, null, 2) + '\n');
    process.exit(1);
  }
}

function cmdInitiativesFormatForPlanner(cwd, args) {
  const { flags } = _parseFlags(args);
  const repo = flags.repo;
  if (!repo) {
    process.stderr.write(JSON.stringify({ error: 'Usage: initiatives format-for-planner --repo <github_repo>' }) + '\n');
    process.exit(1);
    return;
  }
  const home = flags.home || init.defaultInitiativesHome();
  const initiatives = init.loadInitiatives({ home });
  const matching = init.matchByRepo(initiatives, repo);
  if (matching.length === 0) {
    process.stdout.write('_(no matching initiatives for this repo)_\n');
    process.exit(0);
    return;
  }
  const blocks = matching.map(i => init.formatInitiativeForPlanner(i));
  process.stdout.write(blocks.join('\n\n---\n\n') + '\n');
  process.exit(0);
}

function cmdInitiativesRoute(cwd, args) {
  const sub = args[0];
  if (!sub) {
    process.stderr.write(JSON.stringify({
      error: 'Usage: initiatives <sync|list|show|format-for-planner>',
    }, null, 2) + '\n');
    process.exit(1);
    return;
  }
  switch (sub) {
    case 'list': return cmdInitiativesList(cwd, args.slice(1));
    case 'show': return cmdInitiativesShow(cwd, args.slice(1));
    case 'sync': return cmdInitiativesSync(cwd, args.slice(1));
    case 'format-for-planner': return cmdInitiativesFormatForPlanner(cwd, args.slice(1));
    default:
      process.stderr.write(JSON.stringify({
        error: `Unknown initiatives subcommand: ${sub}. Available: sync, list, show, format-for-planner`,
      }, null, 2) + '\n');
      process.exit(1);
  }
}

module.exports = {
  cmdInitiativesRoute,
  cmdInitiativesList,
  cmdInitiativesShow,
  cmdInitiativesSync,
  cmdInitiativesFormatForPlanner,
};
