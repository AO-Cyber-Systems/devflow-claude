'use strict';

/**
 * Awareness CLI handlers (df-tools awareness <subcommand>).
 * Composes scanPeer + scanOrg + cache helpers; renders markdown OR raw JSON.
 *
 * TRD 02-05: Skill + CLI surface — pure helpers parseShowFlags + renderMarkdown
 * are unit-testable without invoking scanners. Cmd handlers wrap I/O around them.
 */

const { output, error } = require('./helpers.cjs');
const aw = require('./awareness.cjs');

// ─── Flag parsing (pure) ──────────────────────────────────────────────────────

/**
 * Parse `df-tools awareness show` flags from args array.
 * Returns { peer_only, org_only, quarter, product, refresh, no_fetch, errors }.
 *
 * `refresh` value: null (no flag), 'all' (just --refresh), 'peer', or 'org'.
 *
 * NOTE: --raw is already stripped by df-tools.cjs main() before dispatch.
 * parseShowFlags does NOT consume --raw.
 *
 * @param {string[]} args
 * @returns {{ peer_only: boolean, org_only: boolean, quarter: string|null,
 *             product: string|null, refresh: 'all'|'peer'|'org'|null,
 *             no_fetch: boolean, errors: string[] }}
 */
function parseShowFlags(args) {
  const out = {
    peer_only: false,
    org_only: false,
    quarter: null,
    product: null,
    refresh: null,
    no_fetch: false,
    errors: [],
  };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--peer-only') {
      out.peer_only = true;
    } else if (t === '--org-only') {
      out.org_only = true;
    } else if (t === '--no-fetch') {
      out.no_fetch = true;
    } else if (t === '--quarter') {
      out.quarter = a.shift() || null;
      if (!out.quarter) out.errors.push('--quarter requires a value');
    } else if (t === '--product') {
      out.product = a.shift() || null;
      if (!out.product) out.errors.push('--product requires a value');
    } else if (t === '--refresh') {
      const next = a[0];
      if (next === 'peer' || next === 'org') {
        out.refresh = next;
        a.shift();
      } else {
        out.refresh = 'all';
      }
    } else if (t.startsWith('--')) {
      out.errors.push(`Unknown flag: ${t}`);
    }
    // positional args silently ignored
  }
  if (out.peer_only && out.org_only) {
    out.errors.push('Cannot pass both --peer-only and --org-only');
  }
  return out;
}

// ─── Markdown renderer (pure) ─────────────────────────────────────────────────

/**
 * Render { peer, org } cache sections as markdown.
 * `opts`: { peer_only, org_only, quarter, product }.
 *
 * Returns the full markdown string. Pure; no I/O.
 *
 * Locked decision #9: stale=invisible footer is shown whenever peer section renders.
 *
 * @param {{ peer?: object, org?: object }} sections
 * @param {{ peer_only?: boolean, org_only?: boolean, quarter?: string|null,
 *           product?: string|null }} [opts]
 * @returns {string}
 */
function renderMarkdown(sections, opts = {}) {
  const lines = ['# DevFlow awareness', ''];

  // ── Peer section ────────────────────────────────────────────────────────────
  if (!opts.org_only && sections.peer) {
    lines.push('## Peer activity (this repo)', '');
    const branches = (sections.peer.branches || []).slice().sort((a, b) => {
      const ta = (a.last_commit && a.last_commit.timestamp) || '';
      const tb = (b.last_commit && b.last_commit.timestamp) || '';
      return tb.localeCompare(ta); // DESC — most recent first
    });
    if (branches.length === 0) {
      lines.push('_No active branches found. Push your branch for visibility._', '');
    } else {
      for (const b of branches) {
        const obj = b.objective || '(no objective)';
        const trd = b.trd ? `, TRD ${b.trd}` : '';
        const dev = b.developer ? ` by ${b.developer}` : '';
        const when = (b.last_commit && b.last_commit.timestamp) || '?';
        const issue = b.github_issue ? ` — ${b.github_issue}` : '';
        lines.push(`- **\`${b.branch}\`**${dev} — ${obj}${trd}${issue}`);
        lines.push(`  _last commit ${when}_`);
      }
      lines.push('');
    }
    // Locked decision #9: stale=invisible footer always shown for peer section
    lines.push(
      '_Stale = invisible: branches not pushed within 30 days are filtered out.' +
      ' Push for visibility._',
      ''
    );
  }

  // ── Org section ─────────────────────────────────────────────────────────────
  if (!opts.peer_only && sections.org) {
    lines.push('## Org progress (Product Roadmap)', '');
    let items = sections.org.items || [];

    // Apply quarter filter (substring match, case-insensitive; normalize dash/space)
    if (opts.quarter) {
      const q = opts.quarter.toLowerCase();
      items = items.filter(i => {
        const quarter = (i.quarter || '').toLowerCase();
        // Normalize: "Q2-2026" matches "Q2 2026" and vice versa
        const qNorm = q.replace(/-/g, ' ').replace(/\s+/g, ' ');
        const itemNorm = quarter.replace(/-/g, ' ').replace(/\s+/g, ' ');
        return itemNorm.includes(qNorm);
      });
    }

    // Apply product filter (exact match, case-insensitive)
    if (opts.product) {
      const p = opts.product.toLowerCase();
      items = items.filter(i => (i.product || '').toLowerCase() === p);
    }

    const grouped = aw.aggregateOrgByProductQuarter(items);
    const products = Object.keys(grouped).sort();

    if (products.length === 0) {
      lines.push('_No items match the filters._', '');
    } else {
      for (const product of products) {
        lines.push(`### ${product}`, '');
        const quarters = Object.keys(grouped[product]).sort();
        for (const quarter of quarters) {
          const qItems = grouped[product][quarter];
          lines.push(`**${quarter}** — ${qItems.length} item(s)`);
          for (const item of qItems) {
            const ref = item.issue_ref || '(draft)';
            const status = item.status ? ` [${item.status}]` : '';
            lines.push(`- ${ref}${status} — ${item.title}`);
            if (item.sub_issues && item.sub_issues.length > 0) {
              for (const s of item.sub_issues) {
                const stateMark = s.state === 'CLOSED' ? 'x' : ' ';
                const subRef = s.ref || '?';
                const subTitle = s.title ? ` — ${s.title}` : '';
                lines.push(`  - [${stateMark}] ${subRef}${subTitle}`);
              }
            }
          }
          lines.push('');
        }
      }
    }
  }

  // ── Warnings ─────────────────────────────────────────────────────────────────
  const warnings = [
    ...((sections.peer && sections.peer.warnings) || []),
    ...((sections.org && sections.org.warnings) || []),
  ];
  if (warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Command handlers (I/O) ───────────────────────────────────────────────────

/**
 * df-tools awareness scan-peer [--no-fetch] [--raw]
 * Walk origin/* refs; emit JSON to stdout. Writes to cache.
 */
function cmdAwarenessScanPeer(cwd, args, raw) {
  const no_fetch = args.includes('--no-fetch');
  const result = aw.scanPeer({ cwd, no_fetch });
  aw.writeCache(cwd, { peer: result });
  output(result, raw, JSON.stringify(result, null, 2));
}

/**
 * df-tools awareness scan-org [--raw]
 * Walk org Product Roadmap; emit JSON. Hard-fail on auth error (mirrors cmdGhResolve).
 */
function cmdAwarenessScanOrg(cwd, args, raw) {
  try {
    const result = aw.scanOrg();
    aw.writeCache(cwd, { org: result });
    output(result, raw, JSON.stringify(result, null, 2));
  } catch (e) {
    if (e && e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message,
        remediation: e.remediation,
        scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e;
  }
}

/**
 * df-tools awareness show [flags]
 * Render combined markdown view (or raw JSON with --raw).
 *
 * Soft-fail on org auth error when peer is available — render peer-only + warning.
 * Hard-fail on org auth error when org_only OR peer also unavailable.
 */
function cmdAwarenessShow(cwd, args, raw) {
  const flags = parseShowFlags(args);
  if (flags.errors.length > 0) {
    process.stderr.write(flags.errors.join('\n') + '\n');
    process.exit(1);
    return;
  }

  // Read existing cache
  const existing = aw.readCache(cwd) || {};
  const sections = { peer: existing.peer, org: existing.org };

  const wantPeer = !flags.org_only;
  const wantOrg = !flags.peer_only;

  // Read awareness TTL from .planning/config.json (optional)
  let cfg = {};
  try {
    const fs = require('fs');
    const path = require('path');
    cfg = JSON.parse(
      fs.readFileSync(path.join(cwd, '.planning', 'config.json'), 'utf-8')
    ).awareness || {};
  } catch { /* config optional */ }
  const ttl = cfg.cache_ttl_minutes != null ? cfg.cache_ttl_minutes : aw.DEFAULT_TTL_MINUTES;

  // Refresh peer if needed
  if (wantPeer) {
    const stalePeer = aw.isStale(sections.peer && sections.peer.fetched_at, ttl);
    const force = flags.refresh === 'all' || flags.refresh === 'peer';
    if (force || stalePeer || !sections.peer) {
      sections.peer = aw.scanPeer({ cwd, no_fetch: flags.no_fetch });
      aw.writeCache(cwd, { peer: sections.peer });
    }
  }

  // Refresh org if needed
  if (wantOrg) {
    const staleOrg = aw.isStale(sections.org && sections.org.fetched_at, ttl);
    const force = flags.refresh === 'all' || flags.refresh === 'org';
    if (force || staleOrg || !sections.org) {
      try {
        sections.org = aw.scanOrg();
        aw.writeCache(cwd, { org: sections.org });
      } catch (e) {
        if (e && e.name === 'GhAuthError') {
          // Hard-fail: org_only requested, or peer also unavailable
          if (flags.org_only || !sections.peer) {
            process.stderr.write(JSON.stringify({
              error: e.message,
              remediation: e.remediation,
              scopes_missing: e.scopes_missing,
            }, null, 2) + '\n');
            process.exit(1);
            return;
          }
          // Soft-fail: render peer-only with warning about org failure
          sections.org = {
            items: [],
            warnings: [
              `org section unavailable: ${e.message}. Run: ${e.remediation}`,
            ],
          };
        } else {
          throw e;
        }
      }
    }
  }

  if (raw) {
    output(sections, true);
    return;
  }
  process.stdout.write(renderMarkdown(sections, flags) + '\n');
}

// ─── Subcommand router ────────────────────────────────────────────────────────

/**
 * Entry point called from df-tools.cjs `case 'awareness':`.
 * args[0] is the subcommand; rest are flags.
 */
function cmdAwarenessRoute(cwd, args, raw) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === '--help' || sub === '-h') {
    process.stderr.write([
      'Usage: df-tools awareness <subcommand> [args]',
      '',
      'Subcommands:',
      '  scan-peer [--no-fetch] [--raw]    Walk origin/* refs; emit JSON',
      '  scan-org [--raw]                  Walk org Product Roadmap; emit JSON',
      '  show [flags]                      Render combined markdown view',
      '',
      'Show flags:',
      '  --peer-only / --org-only          Filter to one section',
      '  --quarter Q2-2026                 Filter org by quarter substring',
      '  --product DevFlow                 Filter org by product (exact match, case-insensitive)',
      '  --refresh [peer|org]              Force re-fetch of one or both sections',
      '  --no-fetch                        Skip git fetch (peer side only)',
      '  --raw                             Emit raw JSON instead of markdown',
      '',
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }

  if (sub === 'scan-peer') return cmdAwarenessScanPeer(cwd, rest, raw);
  if (sub === 'scan-org') return cmdAwarenessScanOrg(cwd, rest, raw);
  if (sub === 'show') return cmdAwarenessShow(cwd, rest, raw);
  error(`Unknown awareness subcommand: ${sub}. Available: scan-peer, scan-org, show`);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdAwarenessRoute,
  cmdAwarenessScanPeer,
  cmdAwarenessScanOrg,
  cmdAwarenessShow,
  parseShowFlags,
  renderMarkdown,
};
