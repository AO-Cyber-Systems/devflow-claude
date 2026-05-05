'use strict';

/**
 * CLI subcommand router for `df-tools org-awareness <subcommand>`.
 *
 * Wired into df-tools.cjs via `case 'org-awareness':` arm.
 *
 * TRD 03-01 ships: scan-siblings (wired to scanSiblings).
 * Stubs for scan-libs / scan-org-overlap / considerations (filled by 03-02/03-03/03-04).
 */

const fsBase = require('fs');
const pathBase = require('path');
const oa = require('./org-awareness.cjs');
const { output } = require('./helpers.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// Read `.planning/config.json` awareness block. Returns {} on any read/parse error.
function _loadAwarenessConfig(cwd) {
  try {
    const cfgPath = pathBase.join(cwd, '.planning', 'config.json');
    const raw = fsBase.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg.awareness || {};
  } catch {
    return {};
  }
}

// Extract richer tokens for an objective by reading on-disk artifacts.
//
// Bare `objective_id` like "03" tokenizes to nothing (length filter). The directory
// NAME (e.g. "03-planning-time-org-awareness") + OBJECTIVE.md frontmatter give the
// real signal. Fall back to objective_id tokens when nothing on disk.
function _extractObjectiveTokens(cwd, objective_id) {
  const tokens = new Set();
  const tokenize = oa._tokenize || (() => new Set());

  // Always tokenize the bare objective_id (may be empty if length<3)
  for (const t of tokenize(objective_id)) tokens.add(t);

  try {
    const objDir = pathBase.join(cwd, '.planning', 'objectives');
    if (!fsBase.existsSync(objDir)) return tokens;
    const entries = fsBase.readdirSync(objDir);
    const sub = entries.find((n) => n.startsWith(`${objective_id}-`) || n === objective_id);
    if (!sub) return tokens;

    // Directory name is the most reliable rich-keyword source
    for (const t of tokenize(sub)) tokens.add(t);

    // OBJECTIVE.md frontmatter (when present): title + files_modified
    const objMd = pathBase.join(objDir, sub, 'OBJECTIVE.md');
    if (fsBase.existsSync(objMd)) {
      const fm = extractFrontmatter(fsBase.readFileSync(objMd, 'utf-8')) || {};
      if (fm.title) for (const t of tokenize(fm.title)) tokens.add(t);
      if (Array.isArray(fm.files_modified)) {
        for (const f of fm.files_modified) for (const t of tokenize(f)) tokens.add(t);
      }
    }

    // CONTEXT.md first H1/H2 heading (cheap title fallback)
    for (const ctxName of [`${objective_id}-CONTEXT.md`, 'CONTEXT.md']) {
      const ctxMd = pathBase.join(objDir, sub, ctxName);
      if (fsBase.existsSync(ctxMd)) {
        const content = fsBase.readFileSync(ctxMd, 'utf-8');
        const m = content.match(/^#+\s+(.+)$/m);
        if (m) for (const t of tokenize(m[1])) tokens.add(t);
        break;
      }
    }
  } catch {
    // best-effort; fall back to whatever's already in tokens
  }

  return tokens;
}

// ─── cmdOrgAwarenessScanSiblings ──────────────────────────────────────────────

function cmdOrgAwarenessScanSiblings(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-siblings <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }
  const cfg = _loadAwarenessConfig(cwd);
  const result = oa.scanSiblings({ objective_id, cwd, config_paths: cfg.sibling_repos });
  output(result, raw);
}

// ─── cmdOrgAwarenessScanLibs ──────────────────────────────────────────────────

function cmdOrgAwarenessScanLibs(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-libs <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }
  const current_tokens = _extractObjectiveTokens(cwd, objective_id);
  const result = oa.scanLibs({ current_tokens, cwd });
  output(result, raw);
}

function cmdOrgAwarenessScanOrgOverlap(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-org-overlap <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }

  // Read PROJECT.md frontmatter to populate projectCtx (best-effort — misfiling check advisory only)
  const fs = require('fs');
  const path = require('path');
  let projectCtx = {};
  let frontmatter = {};

  try {
    const { extractFrontmatter } = require('./frontmatter.cjs');
    const projectMd = fs.readFileSync(path.join(cwd, '.planning', 'PROJECT.md'), 'utf-8');
    const fm = extractFrontmatter(projectMd) || {};
    projectCtx = {
      github_repo: fm.github_repo || null,
      org_project: fm.org_project || null,
    };
  } catch { /* PROJECT.md absent or unreadable — misfiling check returns null silently */ }

  const current_tokens = _extractObjectiveTokens(cwd, objective_id);

  const result = oa.scanOrgOverlap({
    objective_id,
    current_tokens,
    sibling_repos: [],  // CLI invocation: empty sibling_repos; compose with scanSiblings at considerations level (TRD 03-04)
    frontmatter,
    projectCtx,
  });

  // Graceful degradation: exit 0 whether scan ran or skipped — result.skipped indicates auth state
  output(result, raw);
}

function cmdOrgAwarenessConsiderations(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness considerations <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }

  const fs = require('fs');
  const path = require('path');
  const { extractFrontmatter } = require('./frontmatter.cjs');

  // Read PROJECT.md frontmatter for projectCtx (best-effort)
  let projectCtx = {};
  try {
    const content = fs.readFileSync(path.join(cwd, '.planning', 'PROJECT.md'), 'utf-8');
    const fm = extractFrontmatter(content) || {};
    projectCtx = { github_repo: fm.github_repo || null, org_project: fm.org_project || null };
  } catch { /* PROJECT.md missing — projectCtx stays empty */ }

  // Read OBJECTIVE.md frontmatter for chain-walk (best-effort)
  let frontmatter = {};
  try {
    const objDir = path.join(cwd, '.planning', 'objectives');
    if (fs.existsSync(objDir)) {
      const entries = fs.readdirSync(objDir);
      const sub = entries.find(n => n.startsWith(`${objective_id}-`) || n === objective_id);
      if (sub) {
        const objMd = path.join(objDir, sub, 'OBJECTIVE.md');
        if (fs.existsSync(objMd)) {
          const content = fs.readFileSync(objMd, 'utf-8');
          const fm = extractFrontmatter(content) || {};
          if (fm.github_issue) frontmatter.github_issue = fm.github_issue;
          if (fm.parent_issue) frontmatter.parent_issue = fm.parent_issue;
          if (fm.org_initiative) frontmatter.org_initiative = fm.org_initiative;
          if (fm.org_project) frontmatter.org_project = fm.org_project;
        }
      }
    }
  } catch { /* OBJECTIVE.md absent — frontmatter stays empty */ }

  // Run all three scanners independently (failure in one does not block others)
  const scans = {};

  // Load awareness config (sibling_repos override) once for considerations
  const considCfg = _loadAwarenessConfig(cwd);

  try {
    scans.siblings = oa.scanSiblings({ objective_id, cwd, config_paths: considCfg.sibling_repos });
  } catch (e) {
    scans.siblings = { matches: [], warnings: [`scanSiblings error: ${e.message}`], scanned_repos: 0 };
  }

  // Rich token extraction (directory name + frontmatter title + files_modified + heading)
  const current_tokens = _extractObjectiveTokens(cwd, objective_id);

  try {
    scans.libs = oa.scanLibs({ current_tokens, cwd });
  } catch (e) {
    scans.libs = { candidates: [], warnings: [`scanLibs error: ${e.message}`], scanned: false, path: null };
  }

  // Derive sibling_repos for chain-match boost from sibling matches (best-effort)
  const sibling_repos = [];
  for (const m of (scans.siblings.matches || [])) {
    try {
      const sibProjContent = fs.readFileSync(path.join(m.path, 'PROJECT.md'), 'utf-8');
      const sibFm = extractFrontmatter(sibProjContent) || {};
      if (sibFm.github_repo) sibling_repos.push(sibFm.github_repo);
    } catch { /* silently skip */ }
  }

  // scanOrgOverlap last (may fail on auth — graceful degradation handled inside)
  try {
    scans.org_overlap = oa.scanOrgOverlap({
      objective_id,
      current_tokens,
      sibling_repos,
      frontmatter,
      projectCtx,
    });
  } catch (e) {
    scans.org_overlap = { items: [], warnings: [`scanOrgOverlap error: ${e.message}`], skipped: true, misfiling: null };
  }

  if (raw) {
    output(scans, true);
    return;
  }

  process.stdout.write(oa.formatConsiderations(scans) + '\n');
}

// ─── cmdOrgAwarenessRoute ─────────────────────────────────────────────────────

function cmdOrgAwarenessRoute(cwd, args, raw) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write([
      'Usage: df-tools org-awareness <subcommand> [args]',
      '',
      'Subcommands:',
      '  scan-siblings <objective_id> [--raw]       Walk sibling repos under ~/Source/*/ for keyword overlap',
      '  scan-libs <objective_id> [--raw]           Scan eden-libs for reusable exports (TRD 03-02)',
      '  scan-org-overlap <objective_id> [--raw]    Walk org Product Roadmap for overlapping work (TRD 03-03)',
      '  considerations <objective_id> [--raw]      Run all three scans + render Markdown section (TRD 03-04+)',
      '',
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }

  if (sub === 'scan-siblings') return cmdOrgAwarenessScanSiblings(cwd, rest, raw);
  if (sub === 'scan-libs') return cmdOrgAwarenessScanLibs(cwd, rest, raw);
  if (sub === 'scan-org-overlap') return cmdOrgAwarenessScanOrgOverlap(cwd, rest, raw);
  if (sub === 'considerations') return cmdOrgAwarenessConsiderations(cwd, rest, raw);

  process.stderr.write(`Unknown org-awareness subcommand: ${sub}\nRun df-tools org-awareness --help for usage.\n`);
  process.exit(1);
}

module.exports = {
  cmdOrgAwarenessRoute,
  cmdOrgAwarenessScanSiblings,
  cmdOrgAwarenessScanLibs,
  cmdOrgAwarenessScanOrgOverlap,
  cmdOrgAwarenessConsiderations,
};
