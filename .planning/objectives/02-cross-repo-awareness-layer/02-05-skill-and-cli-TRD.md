---
objective: 02-cross-repo-awareness-layer
trd: 02-05
title: /devflow:awareness skill + df-tools awareness CLI subcommand routing
type: standard
confidence: high
wave: 5
depends_on: [02-02, 02-03, 02-04]
files_modified:
  - plugins/devflow/skills/awareness/SKILL.md
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/awareness-cli.cjs
  - plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs
autonomous: true
requirements: [SC-6]
verification_commands:
  - "npm test -- --grep awareness"
  - "test -f plugins/devflow/skills/awareness/SKILL.md"
  - "node plugins/devflow/devflow/bin/df-tools.cjs awareness --help 2>&1 | grep -q awareness"
  - "node plugins/devflow/devflow/bin/df-tools.cjs awareness scan-peer --no-fetch --raw 2>&1 | head -1 | grep -q '{'"

must_haves:
  truths:
    - "Skill file plugins/devflow/skills/awareness/SKILL.md exists with YAML frontmatter (name, description, argument-hint, allowed-tools)"
    - "Skill description includes triggers like 'who else is working on this', 'what's in flight', 'org progress'"
    - "Skill body invokes `df-tools awareness show $ARGUMENTS` with arg passthrough"
    - "df-tools.cjs has a new `awareness` subcommand router with subcommands: scan-peer, scan-org, show"
    - "df-tools awareness show is the renderer entry: reads cache (TTL-honored), refreshes if stale OR --refresh, formats markdown OR raw JSON"
    - "df-tools awareness show honors --peer-only, --org-only, --quarter Q, --product P, --refresh [peer|org], --no-fetch, --raw flags"
    - "df-tools awareness scan-peer + scan-org emit raw JSON to stdout (no formatting)"
    - "When auth fails on scan-org / show with org enabled, structured JSON error to stderr + exit 1 (mirrors obj 1's cmdGhResolve)"
    - "Markdown output sorts peer branches by last_commit.timestamp DESC (most recent first)"
    - "Markdown output groups org items by Product × Quarter (uses aggregateOrgByProductQuarter from TRD 02-01)"
    - "Markdown output documents the stale=invisible limitation (locked decision #9) in a footer line when peer section is shown"
    - "lib/awareness-cli.cjs exports cmdAwarenessShow, cmdAwarenessScanPeer, cmdAwarenessScanOrg + helper renderMarkdown(sections, opts)"
  artifacts:
    - path: "plugins/devflow/skills/awareness/SKILL.md"
      provides: "User-invocable /devflow:awareness slash command"
      contains: "name: awareness"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "New `awareness` subcommand router (case 'awareness': ...)"
    - path: "plugins/devflow/devflow/bin/lib/awareness-cli.cjs"
      provides: "CLI handlers cmdAwarenessShow, cmdAwarenessScanPeer, cmdAwarenessScanOrg + renderMarkdown helper"
      exports: ["cmdAwarenessShow", "cmdAwarenessScanPeer", "cmdAwarenessScanOrg", "renderMarkdown", "parseShowFlags"]
    - path: "plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs"
      provides: "Test coverage for parseShowFlags + renderMarkdown (pure functions)"
      min_lines: 80
  key_links:
    - from: "plugins/devflow/skills/awareness/SKILL.md"
      to: "df-tools.cjs awareness show"
      via: "Bash invocation in <process>"
      pattern: "df-tools\\.cjs awareness show"
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "lib/awareness-cli.cjs"
      via: "require + dispatch in main router"
      pattern: "require.*awareness-cli"
    - from: "plugins/devflow/devflow/bin/lib/awareness-cli.cjs"
      to: "lib/awareness.cjs (scanPeer, scanOrg, readCache, writeCache, isStale, aggregateOrgByProductQuarter)"
      via: "require"
      pattern: "require.*awareness\\.cjs"
---

<objective>
Ship the user-facing surface: a `/devflow:awareness` slash command + a `df-tools awareness <subcommand>` CLI router. The skill is a thin invocation; all logic lives in `lib/awareness-cli.cjs`. CLI handlers compose `scanPeer`, `scanOrg`, cache helpers, and a markdown renderer. Filter flags + refresh flags honor locked-decision-5 namespaced cache semantics.

Purpose: SC-6 — single skill, two sections (peer + org). This TRD wires the bottom (lib functions from earlier waves) to the top (slash command). It is mostly glue; the testable surface is `parseShowFlags` (CLI flag parser) and `renderMarkdown` (pure formatter). Both are unit-testable without invoking the scanners.

Output: Skill markdown, CLI subcommand routing, and a small CLI handler module with tests for the pure helpers.
</objective>

<file_tree>
plugins/devflow/skills/
└── awareness/
    └── SKILL.md                                ← CREATE  (skill prompt)

plugins/devflow/devflow/bin/
├── df-tools.cjs                                ← MODIFY  (add `case 'awareness':`)
└── lib/
    ├── awareness-cli.cjs                       ← CREATE  (CLI handlers)
    └── awareness-cli.test.cjs                  ← CREATE  (tests for parseShowFlags + renderMarkdown)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing skill template** — `plugins/devflow/skills/check-todos/SKILL.md`:

```markdown
---
name: check-todos
description: |
  Browse pending todos and pick one to work on.
  Use when the user wants to see their todo list, check pending items, or pick something to work on.
  Triggers on: "what's on my todo list?", "pending todos", "show todos", "any todos?", "what tasks are saved?"
argument-hint: [area filter]
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.
</objective>

<execution_context>
@.planning/STATE.md
@.planning/ROADMAP.md
</execution_context>

<process>
**Follow the check-todos workflow** from `@~/.claude/devflow/workflows/check-todos.md`.
</process>
```

**Existing skill that uses df-tools directly** — `plugins/devflow/skills/gh-sync/SKILL.md`:

```markdown
<process>
1. Check `.planning/config.json` for `github.enabled`...

2. Run the requested operation:

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh sync-objectives
```

3. Report the result to the user — include issue numbers...
</process>
```

**Existing df-tools subcommand router pattern** — from `df-tools.cjs`:

```js
case 'gh': {
  const subcommand = args[1];
  if (subcommand === 'status') {
    cmdGhStatus(cwd, raw);
  } else if (subcommand === 'sync-objectives') {
    cmdGhSyncObjectives(cwd, raw);
  } else if (subcommand === 'comment') {
    cmdGhComment(cwd, args[2], args[3], raw);
  } else if (subcommand === 'sync-release') {
    cmdGhSyncRelease(cwd, args[2], raw);
  } else if (subcommand === 'resolve') {
    cmdGhResolve(cwd, args[2], raw);
  } else if (subcommand === 'sync') {
    if (args[2]) cmdGhSyncObjective(cwd, args[2], raw);
    else cmdGhSyncObjectives(cwd, raw);
  } else {
    error('Unknown gh subcommand. Available: status, sync, sync-objectives, resolve, comment, close-issue, sync-release');
  }
  break;
}
```

Mirror exactly: dispatch by `args[1]`, plain `error()` on unknown subcommand.

**Existing flag parsing pattern** — from `helpers.cjs::parseIncludeFlag` (referenced in df-tools.cjs main):

```js
const rawIndex = args.indexOf('--raw');
const raw = rawIndex !== -1;
if (rawIndex !== -1) args.splice(rawIndex, 1);
```

Splice the flag and consume its value (if any) from the args array. parseShowFlags follows this pattern.

</codebase_examples>

<anti_patterns>

- **Do NOT put scanner logic in the skill.** Skill body is markdown that invokes `df-tools awareness show $ARGUMENTS`. Period. All logic is in `awareness-cli.cjs`.
- **Do NOT treat this TRD as TDD-strict for the SKILL.md.** Markdown isn't unit-testable; rely on the CLI handler tests + a smoke test (`df-tools awareness --help` exits 0).
- **Do NOT introduce a flag-parsing library.** Use the existing splice-and-consume pattern from helpers.cjs.
- **Do NOT call requireGhAuth from the peer-only path.** `df-tools awareness scan-peer` and `df-tools awareness show --peer-only` MUST work offline (no gh auth needed). Only the org path calls `scanOrg` which itself calls requireGhAuth.
- **Do NOT swallow GhAuthError silently in cmdAwarenessShow.** When org section is requested and auth fails, exit 1 with structured JSON to stderr (mirror cmdGhResolve / cmdGhSyncObjective pattern).
- **Do NOT auto-write cache on every show invocation.** Only write when fresh data was fetched (cache miss or --refresh). If reading from valid cache, no disk write.
- **Do NOT log to stdout for the markdown renderer.** Stdout is the markdown OR raw JSON; informational logs go to stderr.

</anti_patterns>

<error_recovery>

- If `scanPeer` returns warnings (e.g., git fetch failed), include them in the markdown output under a "Warnings" footer. Don't fail the command.
- If `scanOrg` throws GhAuthError on `df-tools awareness show` (default mode = both sections), check whether peer section was successfully fetched. If yes, render peer-only with a warning that org failed. If no, full failure (exit 1, structured stderr).
- If user passes both `--peer-only` and `--org-only`, error out (`error('Cannot pass both --peer-only and --org-only')`). parseShowFlags catches this.
- If `--quarter` or `--product` filter matches zero items, render an empty Org section with the filter line documented (don't suppress).
- Per project memory `feedback_executor_smaller_commits`: this TRD is small enough for 2 commits (SKILL.md + lib/cli + df-tools change as a single feat commit, then test commit). Or 3 commits if RED→GREEN for the lib helpers. Prefer 3.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/02-cross-repo-awareness-layer/02-CONTEXT.md
@plugins/devflow/skills/check-todos/SKILL.md
@plugins/devflow/skills/gh-sync/SKILL.md
@plugins/devflow/devflow/bin/df-tools.cjs
@plugins/devflow/devflow/bin/lib/awareness.cjs
</context>

<gotchas>

- **Skill files are at `plugins/devflow/skills/<name>/SKILL.md`** (not `.../<name>.md`). Each skill is a directory with a single SKILL.md. Create the directory first.
- **The skill name in YAML frontmatter must match the directory name**: directory `plugins/devflow/skills/awareness/` → frontmatter `name: awareness`. Slash command becomes `/devflow:awareness`.
- **`$ARGUMENTS` substitution**: in skill body, write `$ARGUMENTS` literally — Claude Code's runtime substitutes the user's arg string. Don't try to parse args in the skill body.
- **CLI subcommand routing**: `df-tools awareness <sub>` adds `case 'awareness':` to the main router in df-tools.cjs. The case can dispatch via `if (args[1] === 'show')` style, OR it can require a router function from awareness-cli.cjs (cleaner). Prefer the latter — `cmdAwarenessRoute(cwd, args.slice(1), raw)`.
- **Pure-function testing**: `parseShowFlags(args)` is pure (in→out). `renderMarkdown(sections, opts)` is pure (in→out). Both are unit-testable without spawning processes. Cmd handlers (`cmdAwarenessShow`) wrap I/O around these pure cores; they're harder to test but tests can mock readCache/writeCache.
- **The skill description triggers**: include synonyms users might type — "who else is working on this", "what's in flight org-wide", "show org progress", "any teammates working on related stuff", "is anyone else on this".

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Create lib/awareness-cli.cjs with parseShowFlags + renderMarkdown + command handlers</name>
  <files>
    plugins/devflow/devflow/bin/lib/awareness-cli.cjs
  </files>
  <action>
Create the CLI handler module. Structure:

```js
'use strict';

/**
 * Awareness CLI handlers (df-tools awareness <subcommand>).
 * Composes scanPeer + scanOrg + cache helpers; renders markdown OR raw JSON.
 */

const { output, error } = require('./helpers.cjs');
const aw = require('./awareness.cjs');
const gh = require('./gh.cjs');

// ─── Flag parsing (pure) ────────────────────────────────────────────────────

/**
 * Parse `df-tools awareness show` flags from args array.
 * Returns { peer_only, org_only, quarter, product, refresh, no_fetch, errors }.
 *
 * `refresh` value: null (no flag), 'all' (just --refresh), 'peer', or 'org'.
 */
function parseShowFlags(args) {
  const out = { peer_only: false, org_only: false, quarter: null, product: null,
                refresh: null, no_fetch: false, errors: [] };
  const a = args.slice();
  while (a.length > 0) {
    const t = a.shift();
    if (t === '--peer-only') out.peer_only = true;
    else if (t === '--org-only') out.org_only = true;
    else if (t === '--no-fetch') out.no_fetch = true;
    else if (t === '--quarter') {
      out.quarter = a.shift() || null;
      if (!out.quarter) out.errors.push('--quarter requires a value');
    } else if (t === '--product') {
      out.product = a.shift() || null;
      if (!out.product) out.errors.push('--product requires a value');
    } else if (t === '--refresh') {
      const next = a[0];
      if (next === 'peer' || next === 'org') {
        out.refresh = next; a.shift();
      } else {
        out.refresh = 'all';
      }
    } else if (t.startsWith('--')) {
      out.errors.push(`Unknown flag: ${t}`);
    }
    // else: positional arg — silently ignored for now
  }
  if (out.peer_only && out.org_only) {
    out.errors.push('Cannot pass both --peer-only and --org-only');
  }
  return out;
}

// ─── Markdown renderer (pure) ───────────────────────────────────────────────

/**
 * Render { peer, org } cache sections as markdown.
 * `opts`: { peer_only, org_only, quarter, product }.
 *
 * Returns the full markdown string. Pure; no I/O.
 */
function renderMarkdown(sections, opts = {}) {
  const lines = ['# DevFlow awareness', ''];

  // Peer section
  if (!opts.org_only && sections.peer) {
    lines.push('## Peer activity (this repo)', '');
    const branches = (sections.peer.branches || []).slice().sort((a, b) => {
      const ta = (a.last_commit && a.last_commit.timestamp) || '';
      const tb = (b.last_commit && b.last_commit.timestamp) || '';
      return tb.localeCompare(ta); // DESC
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
    lines.push('_Stale = invisible: branches not pushed within 30 days are filtered out. Push for visibility._', '');
  }

  // Org section
  if (!opts.peer_only && sections.org) {
    lines.push('## Org progress (Product Roadmap)', '');
    let items = sections.org.items || [];
    if (opts.quarter) {
      const q = opts.quarter.toLowerCase();
      items = items.filter(i => (i.quarter || '').toLowerCase().includes(q));
    }
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
          lines.push(`**${quarter}** — ${grouped[product][quarter].length} item(s)`);
          for (const item of grouped[product][quarter]) {
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

  // Warnings
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

// ─── Command handlers (I/O) ─────────────────────────────────────────────────

function cmdAwarenessScanPeer(cwd, args, raw) {
  const no_fetch = args.includes('--no-fetch');
  const result = aw.scanPeer({ cwd, no_fetch });
  // Optional: write to cache for downstream show invocations
  aw.writeCache(cwd, { peer: result });
  output(result, raw, JSON.stringify(result, null, 2));
}

function cmdAwarenessScanOrg(cwd, args, raw) {
  try {
    const result = aw.scanOrg();
    aw.writeCache(cwd, { org: result });
    output(result, raw, JSON.stringify(result, null, 2));
  } catch (e) {
    if (e && e.name === 'GhAuthError') {
      process.stderr.write(JSON.stringify({
        error: e.message, remediation: e.remediation, scopes_missing: e.scopes_missing,
      }, null, 2) + '\n');
      process.exit(1);
      return;
    }
    throw e;
  }
}

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

  // Determine which sections to refresh
  const wantPeer = !flags.org_only;
  const wantOrg = !flags.peer_only;

  // Read awareness config (TTL, etc.) from .planning/config.json
  let cfg = {};
  try {
    cfg = JSON.parse(require('fs').readFileSync(require('path').join(cwd, '.planning', 'config.json'), 'utf-8')).awareness || {};
  } catch {}
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
          // If user wanted ONLY org, hard-fail. If they wanted both, warn and continue with peer-only.
          if (flags.org_only || !sections.peer) {
            process.stderr.write(JSON.stringify({
              error: e.message, remediation: e.remediation, scopes_missing: e.scopes_missing,
            }, null, 2) + '\n');
            process.exit(1);
            return;
          }
          // Soft-fail: render peer-only with warning
          sections.org = { items: [], warnings: [`org section unavailable: ${e.message}. Run: ${e.remediation}`] };
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

// ─── Subcommand router ──────────────────────────────────────────────────────

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
      '  --product DevFlow                 Filter org by product (exact match)',
      '  --refresh [peer|org]              Force re-fetch of one or both',
      '  --no-fetch                        Skip git fetch (peer side)',
      '  --raw                             Emit raw JSON instead of markdown',
      '',
    ].join('\n'));
    process.exit(sub ? 0 : 1);
    return;
  }
  if (sub === 'scan-peer') return cmdAwarenessScanPeer(cwd, rest, raw);
  if (sub === 'scan-org') return cmdAwarenessScanOrg(cwd, rest, raw);
  if (sub === 'show') return cmdAwarenessShow(cwd, rest, raw);
  error(`Unknown awareness subcommand: ${sub}`);
}

module.exports = {
  cmdAwarenessRoute,
  cmdAwarenessScanPeer,
  cmdAwarenessScanOrg,
  cmdAwarenessShow,
  parseShowFlags,
  renderMarkdown,
};
```

# CRITICAL: cmdAwarenessShow soft-fails on org auth errors when peer is available — preserves the "show what we can" UX. Hard-fail only when org_only or peer also unavailable.
# GOTCHA: parseShowFlags must NOT consume the `--raw` flag — that's stripped earlier in df-tools.cjs main(). It only sees args AFTER --raw is removed.
# PATTERN: cmdAwarenessRoute mirrors the gh subcommand router structure (else-if chain → error).
  </action>
  <verify>
1. Module loads: `node -e 'require("./plugins/devflow/devflow/bin/lib/awareness-cli.cjs"); console.log("OK")'`
2. Exports verified: `node -e 'const c=require("./plugins/devflow/devflow/bin/lib/awareness-cli.cjs"); for (const k of ["cmdAwarenessRoute","cmdAwarenessScanPeer","cmdAwarenessScanOrg","cmdAwarenessShow","parseShowFlags","renderMarkdown"]) if (typeof c[k] !== "function") throw new Error(k); console.log("OK")'`
3. Smoke test: `node -e 'const c=require("./plugins/devflow/devflow/bin/lib/awareness-cli.cjs"); const r=c.parseShowFlags(["--peer-only","--quarter","Q2-2026"]); if (r.peer_only !== true || r.quarter !== "Q2-2026") throw new Error("parse failed"); console.log("OK")'`
  </verify>
  <done>
awareness-cli.cjs exists with all 6 exports. Pure helpers unit-callable. Cmd handlers ready for df-tools wiring.
  </done>
  <recovery>
If `process.exit` interferes with tests, refactor to throw an error and let the caller in df-tools handle it. For this TRD, accept process.exit in handlers (matches obj 1's cmdGhResolve / cmdGhSyncObjective pattern).
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Wire into df-tools.cjs + add tests for parseShowFlags + renderMarkdown</name>
  <files>
    plugins/devflow/devflow/bin/df-tools.cjs
    plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs
  </files>
  <action>
**Step A — Wire df-tools.cjs:**

Add at top with other requires:
```js
const { cmdAwarenessRoute } = require('./lib/awareness-cli.cjs');
```

Add a new case to the main switch (after `case 'gh':` and before `default:`):

```js
case 'awareness': {
  cmdAwarenessRoute(cwd, args.slice(1), raw);
  break;
}
```

Update the top-level usage string (the one in `error()` at line ~198) to include "awareness":

```js
error('Usage: df-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-objective, commit, ..., awareness, init');
```

**Step B — Write tests for parseShowFlags + renderMarkdown:**

Create `plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseShowFlags, renderMarkdown } = require('./awareness-cli.cjs');

// ─── parseShowFlags tests ──────────────────────────────────────────────────

test('parseShowFlags: empty args → defaults', () => {
  const r = parseShowFlags([]);
  assert.strictEqual(r.peer_only, false);
  assert.strictEqual(r.org_only, false);
  assert.strictEqual(r.refresh, null);
  assert.strictEqual(r.no_fetch, false);
  assert.deepStrictEqual(r.errors, []);
});

test('parseShowFlags: --peer-only', () => {
  const r = parseShowFlags(['--peer-only']);
  assert.strictEqual(r.peer_only, true);
});

test('parseShowFlags: --quarter Q2-2026', () => {
  const r = parseShowFlags(['--quarter', 'Q2-2026']);
  assert.strictEqual(r.quarter, 'Q2-2026');
});

test('parseShowFlags: --refresh alone → all', () => {
  const r = parseShowFlags(['--refresh']);
  assert.strictEqual(r.refresh, 'all');
});

test('parseShowFlags: --refresh peer', () => {
  const r = parseShowFlags(['--refresh', 'peer']);
  assert.strictEqual(r.refresh, 'peer');
});

test('parseShowFlags: --refresh org', () => {
  const r = parseShowFlags(['--refresh', 'org']);
  assert.strictEqual(r.refresh, 'org');
});

test('parseShowFlags: --refresh followed by another flag → all', () => {
  const r = parseShowFlags(['--refresh', '--peer-only']);
  assert.strictEqual(r.refresh, 'all');
  assert.strictEqual(r.peer_only, true);
});

test('parseShowFlags: both --peer-only and --org-only → error', () => {
  const r = parseShowFlags(['--peer-only', '--org-only']);
  assert.ok(r.errors.length > 0);
});

test('parseShowFlags: --quarter without value → error', () => {
  const r = parseShowFlags(['--quarter']);
  assert.ok(r.errors.length > 0);
});

test('parseShowFlags: unknown flag → error', () => {
  const r = parseShowFlags(['--bogus']);
  assert.ok(r.errors.length > 0);
});

// ─── renderMarkdown tests ──────────────────────────────────────────────────

test('renderMarkdown: empty sections → header only', () => {
  const md = renderMarkdown({});
  assert.match(md, /# DevFlow awareness/);
});

test('renderMarkdown: peer with 1 branch', () => {
  const md = renderMarkdown({
    peer: { branches: [{ branch: 'feature/foo', objective: '2 — Test', trd: '02-05',
                          last_commit: { timestamp: '2026-05-04T12:00:00Z', sha: 'abc', subject: 'x' },
                          developer: 'mark', github_issue: 'AO/test#1' }] }
  });
  assert.match(md, /## Peer activity/);
  assert.match(md, /feature\/foo/);
  assert.match(md, /by mark/);
  assert.match(md, /Stale = invisible/);
});

test('renderMarkdown: peer-only mode hides org section', () => {
  const md = renderMarkdown(
    { peer: { branches: [] }, org: { items: [{ product: 'DevFlow', quarter: 'Q2 2026', title: 'X', issue_ref: 'a/b#1' }] } },
    { peer_only: true }
  );
  assert.match(md, /## Peer activity/);
  assert.doesNotMatch(md, /## Org progress/);
});

test('renderMarkdown: org with 1 item grouped by product/quarter', () => {
  const md = renderMarkdown({
    org: { items: [
      { product: 'DevFlow', quarter: 'Q2 2026', title: 'Internal Alpha', issue_ref: 'AO/devflow#30',
        status: 'In Progress', sub_issues: [{ ref: 'AO/devflow-claude#10', title: 'GH layer', state: 'CLOSED' }] }
    ] }
  });
  assert.match(md, /## Org progress/);
  assert.match(md, /### DevFlow/);
  assert.match(md, /\*\*Q2 2026\*\*/);
  assert.match(md, /Internal Alpha/);
  assert.match(md, /\[x\] AO\/devflow-claude#10/);
});

test('renderMarkdown: --quarter filter applied', () => {
  const md = renderMarkdown(
    { org: { items: [
      { product: 'DevFlow', quarter: 'Q2 2026', title: 'A', issue_ref: 'a/b#1' },
      { product: 'AODex', quarter: 'Q3 2026', title: 'B', issue_ref: 'a/b#2' },
    ] } },
    { quarter: 'Q2-2026' }
  );
  assert.match(md, /Q2 2026/);
  // Q3 item filtered out
  assert.doesNotMatch(md, /Q3 2026/);
});

test('renderMarkdown: warnings rendered if any', () => {
  const md = renderMarkdown({
    peer: { branches: [], warnings: ['fetch failed'] },
    org: { items: [], warnings: ['auth error'] },
  });
  assert.match(md, /## Warnings/);
  assert.match(md, /fetch failed/);
  assert.match(md, /auth error/);
});
```

After tests written, run `npm test`. All ~16 awareness-cli tests pass.

Commit BOTH (one feat commit since this is a `standard` TRD, not strict TDD per CONTEXT.md §"TRD types"):

```bash
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-05): add /devflow:awareness skill + CLI subcommand routing + tests" \
  --files plugins/devflow/devflow/bin/lib/awareness-cli.cjs plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs plugins/devflow/devflow/bin/df-tools.cjs
```

# CRITICAL: This is a standard (not tdd) TRD per CONTEXT.md §"TRD types". Tests are GREEN-only per Task 1+2; no separate test: commit needed. Standard TRDs commit feat + test in one commit.
# GOTCHA: When committing files via df-tools, list each file explicitly. The skill file (Task 3) is in a separate commit because it's a different surface (skill vs CLI).
  </action>
  <verify>
1. df-tools router accepts new subcommand: `node plugins/devflow/devflow/bin/df-tools.cjs awareness --help 2>&1 | grep -q awareness`
2. `npm test` count rises by ~16 (parseShowFlags + renderMarkdown tests)
3. No regression in existing tests
4. Commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-05\):'`
  </verify>
  <done>
df-tools.cjs routes `awareness` subcommand. awareness-cli.test.cjs has 16 unit tests, all passing. Single commit per standard-TRD pattern.
  </done>
  <recovery>
If `awareness --help` exits 0 instead of 1 in tests, accept either exit code (some smoke checks use `2>&1 | grep`, doesn't care about exit code). If df-tools.cjs's main() pattern requires a different routing shape (e.g., default case complains), wire awareness BEFORE the default case.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Create plugins/devflow/skills/awareness/SKILL.md</name>
  <files>
    plugins/devflow/skills/awareness/SKILL.md
  </files>
  <action>
Create the skill file. Content:

```markdown
---
name: awareness
description: |
  Show cross-repo awareness: who else is working on what (peer view) and how the work fits into org-wide progress (Product Roadmap view). Renders both views by default.
  Use when the user wants to know if anyone else is working on related stuff, where their work fits in the org's larger progress, or simply "what's in flight".
  Triggers on: "who else is working on this", "what's in flight", "anyone else on this", "show org progress", "show parallel sessions", "what's everyone doing", "what teammates are working on", "is this work overlapping with anyone".
argument-hint: "[--peer-only|--org-only] [--quarter Q] [--product P] [--refresh [peer|org]] [--no-fetch] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Render two awareness views side-by-side:

1. **Peer (this repo, git-branch-based)** — branches in `origin/*` with active `.planning/STATE.md` showing teammate's current objective + TRD + last commit.
2. **Org (Product Roadmap project)** — items grouped by Product × Quarter, with each item's direct sub-issues (or task-list bullets when no native sub-issues exist).

Both views are pull-only (no daemon). Cache lives at `.planning/.awareness-cache.json` with 10-minute TTL per section. The cache file is gitignored.

Limitations (locked):
- **Stale = invisible (peer side)**: branches not pushed in 30 days don't show. Push for visibility.
- **Local-repo scope (peer side)**: only branches in THIS repo's origin show — teammates working in other repos appear via the org view, not the peer view.
- **No handoff state**: the `df:handoff` watcher (already shipped) handles "blocked on user" — awareness here is purely informational.
</objective>

<execution_context>
@.planning/STATE.md
@.planning/.awareness-cache.json
</execution_context>

<process>
**Run the awareness CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs awareness show $ARGUMENTS
```

The CLI:
1. Reads `.planning/.awareness-cache.json` (creates if missing).
2. For each section requested (peer, org, or both):
   - If TTL-expired OR `--refresh` flag, re-runs scanner and writes cache.
   - Otherwise, serves from cache.
3. Renders markdown to stdout (or raw JSON with `--raw`).

If org-side gh auth fails:
- With `--org-only`: structured JSON error to stderr + exit 1.
- Default mode (both sections): renders peer-only with a warning about org failure.

**After the command runs, present the output to the user.** Don't summarize — show the markdown verbatim so the user can scan branches + projects.
</process>

<context>
The cache file `.planning/.awareness-cache.json` is gitignored (TRD 02-04). It's safe to commit accidentally — the gitignore prevents it.

Subcommand options:
- `df-tools awareness scan-peer [--no-fetch]` — Walk origin/*, emit JSON. Used directly by tests + the SessionStart cache populator hook.
- `df-tools awareness scan-org` — Walk org Product Roadmap, emit JSON. Requires `gh` auth scopes: project, read:project, repo.
- `df-tools awareness show` — Combined view (this skill's default).

Filter flags:
- `--peer-only` / `--org-only` — Show one section only.
- `--quarter Q2-2026` — Filter org section by quarter (substring match, case-insensitive).
- `--product DevFlow` — Filter org section by product (exact match, case-insensitive).
- `--refresh` — Force re-fetch of both sections (bypass TTL).
- `--refresh peer` / `--refresh org` — Force re-fetch of just one section.
- `--no-fetch` — Skip `git fetch --all --prune` for the peer scanner (offline mode).
- `--raw` — Emit raw JSON to stdout instead of formatted markdown.

This skill is the read-side aggregation layer for cross-repo awareness. It doesn't write anything beyond the cache file. The data lives where it always lived: git refs (peer side) + the org Product Roadmap project (org side).
</context>
```

# CRITICAL: The skill file MUST live at `plugins/devflow/skills/awareness/SKILL.md` (directory + SKILL.md). NOT a flat file.
# GOTCHA: `$ARGUMENTS` is the literal substitution token. Don't escape it.
# PATTERN: Mirror gh-sync/SKILL.md structure (frontmatter + objective + execution_context + process + context).

Commit:
```bash
mkdir -p plugins/devflow/skills/awareness
# Then write SKILL.md via Write tool to plugins/devflow/skills/awareness/SKILL.md
node /Users/markemerson/.claude/devflow/bin/df-tools.cjs commit "feat(02-05): add /devflow:awareness slash command" \
  --files plugins/devflow/skills/awareness/SKILL.md
```
  </action>
  <verify>
1. File exists at the right path: `test -f plugins/devflow/skills/awareness/SKILL.md`
2. YAML frontmatter parses: `node -e 'const fm=require("./plugins/devflow/devflow/bin/lib/frontmatter.cjs"); const c=require("fs").readFileSync("plugins/devflow/skills/awareness/SKILL.md","utf-8"); const p=fm.extractFrontmatter(c); if (p.name !== "awareness") throw new Error("name mismatch"); console.log("OK")'`
3. Skill body invokes df-tools: `grep -q "df-tools.cjs awareness show" plugins/devflow/skills/awareness/SKILL.md`
4. Commit landed: `git log --oneline -1 | grep -E '^[a-f0-9]+ feat\(02-05\):'`
  </verify>
  <done>
SKILL.md exists at plugins/devflow/skills/awareness/SKILL.md with valid YAML frontmatter + body that invokes `df-tools awareness show $ARGUMENTS`. Commit landed.
  </done>
  <recovery>
If the skill name (`awareness`) collides with anything in the marketplace.json or plugin.json, append a unique prefix `df-awareness`. But check first — there's no existing skill at this name in the codebase.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
After all tasks ship:

1. `plugins/devflow/skills/awareness/SKILL.md` exists with frontmatter `name: awareness`
2. `df-tools awareness --help` exits and prints usage
3. `df-tools awareness show --raw` works (may emit cache + warnings if no auth, but doesn't crash)
4. `lib/awareness-cli.cjs` exports cmdAwarenessRoute, cmdAwarenessShow, cmdAwarenessScanPeer, cmdAwarenessScanOrg, parseShowFlags, renderMarkdown
5. ~16 new unit tests for parseShowFlags + renderMarkdown pass
6. Two commits landed: feat(02-05) for the lib/CLI, feat(02-05) for the skill file
7. SC-6 covered: skill renders both views; filters work; --refresh peer / --refresh org honored
</verification>

<success_criteria>
- SC-6 fully met: single skill, two sections, filter + refresh flags
- Pure-function tests for parseShowFlags + renderMarkdown lock the contract
- Skill file at the canonical path; df-tools router augmented; existing tests preserved
- 2 atomic commits per standard-TRD pattern (one feat per surface — lib/cli, then skill)
</success_criteria>

<output>
After completion, create `.planning/objectives/02-cross-repo-awareness-layer/02-05-skill-and-cli-SUMMARY.md`
</output>
