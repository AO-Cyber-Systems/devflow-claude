'use strict';

/**
 * CLI subcommand router for `df-tools org-awareness <subcommand>`.
 *
 * Wired into df-tools.cjs via `case 'org-awareness':` arm.
 *
 * TRD 03-01 ships: scan-siblings (wired to scanSiblings).
 * Stubs for scan-libs / scan-org-overlap / considerations (filled by 03-02/03-03/03-04).
 */

const oa = require('./org-awareness.cjs');
const { output } = require('./helpers.cjs');

// ─── cmdOrgAwarenessScanSiblings ──────────────────────────────────────────────

function cmdOrgAwarenessScanSiblings(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness scan-siblings <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }
  const result = oa.scanSiblings({ objective_id, cwd });
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
  // Tokenize objective_id as best-effort current_tokens
  // (richer extraction from OBJECTIVE.md frontmatter lands in TRD 03-04+)
  const current_tokens = oa._tokenize ? oa._tokenize(objective_id) : new Set();
  const result = oa.scanLibs({ current_tokens, cwd });
  output(result, raw);
}

function cmdOrgAwarenessScanOrgOverlap(cwd, args, raw) {
  // TRD 03-03 fills this in
  process.stderr.write('scan-org-overlap not yet implemented (TRD 03-03)\n');
  process.exit(1);
}

function cmdOrgAwarenessConsiderations(cwd, args, raw) {
  // TRD 03-04/03-05 fills this in
  process.stderr.write('considerations not yet implemented (TRD 03-04)\n');
  process.exit(1);
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
