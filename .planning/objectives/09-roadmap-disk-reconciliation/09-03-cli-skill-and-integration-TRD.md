---
objective: 09-roadmap-disk-reconciliation
trd: 09-03
type: tdd
confidence: high
wave: 3
depends_on:
  - 09-02
files_modified:
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs
  - plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/skills/sync-roadmap/SKILL.md
autonomous: true
requirements:
  - SC-5
  - SC-6
  - SC-7
  - SC-8
  - SC-9
  - SC-10
must_haves:
  truths:
    - "df-tools sync-roadmap (default mode) walks ROADMAP and writes drift-corrections atomically"
    - "df-tools sync-roadmap --dry-run emits structured changes JSON without writing ROADMAP.md"
    - "df-tools sync-roadmap --interactive prompts y/N per drift via TTY readline; non-TTY falls back to write mode with warning"
    - "/devflow:sync-roadmap skill invokes df-tools sync-roadmap $ARGUMENTS and presents output"
    - "lib/roadmap-reconcile.cjs module.exports is locked at 8-entry surface with 'LOCKED by TRD 09-03' banner comment"
    - "Round-trip integration test: fixture with mismatched ROADMAP + SUMMARYs → reconcile → ROADMAP matches disk truth"
    - "Self-test against THIS repo's ROADMAP shows zero drift (manual maintenance baseline)"
    - "Idempotency e2e test: run sync-roadmap twice; second run produces zero changes"
    - "Self-test fake-breakage workflow: sed an [x] to [ ] → sync-roadmap --dry-run shows drift → write mode fixes it → re-run --dry-run shows zero drift"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs"
      provides: "Final locked module.exports + banner comment"
      contains: "LOCKED by TRD 09-03"
    - path: "plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs"
      provides: "cmdSyncRoadmapRoute with --dry-run, --interactive flags"
      contains: "cmdSyncRoadmapRoute"
    - path: "plugins/devflow/devflow/bin/df-tools.cjs"
      provides: "case 'sync-roadmap' arm dispatching to cmdSyncRoadmapRoute"
      contains: "case 'sync-roadmap'"
    - path: "plugins/devflow/skills/sync-roadmap/SKILL.md"
      provides: "Thin orchestrator skill invoking df-tools sync-roadmap $ARGUMENTS"
      contains: "df-tools sync-roadmap"
  key_links:
    - from: "plugins/devflow/skills/sync-roadmap/SKILL.md"
      to: "df-tools sync-roadmap"
      via: "$ARGUMENTS passthrough"
      pattern: "df-tools sync-roadmap \\$ARGUMENTS"
    - from: "df-tools.cjs case 'sync-roadmap'"
      to: "lib/roadmap-reconcile-cli.cjs::cmdSyncRoadmapRoute"
      via: "command dispatch"
      pattern: "cmdSyncRoadmapRoute"
    - from: "cmdSyncRoadmapRoute"
      to: "lib/roadmap-reconcile.cjs::reconcile"
      via: "library invocation"
      pattern: "reconcile\\("
    - from: "EX1 export-lock test"
      to: "module.exports key list"
      via: "deepStrictEqual"
      pattern: "deepStrictEqual"
    - from: "Self-test (E2E1)"
      to: "this repo's actual .planning/ROADMAP.md"
      via: "reconcile in dry-run mode against process.cwd()"
      pattern: "process\\.cwd\\(\\)"
---

<objective>
Final TRD for objective 9. Three concerns wrapped into one TRD per planning directives:

1. **CLI subcommand routing (standard task):** `lib/roadmap-reconcile-cli.cjs::cmdSyncRoadmapRoute` parses argv, calls `reconcile`, prints structured output. Wired into `df-tools.cjs` as `case 'sync-roadmap'`.
2. **Skill thin-orchestrator (standard task):** `/devflow:sync-roadmap` skill invokes `df-tools sync-roadmap $ARGUMENTS` and presents result.
3. **Export-surface lock + e2e integration tests (TDD task):** `module.exports` finalized with banner comment + EX1 deepStrictEqual test. E2E tests cover idempotency, fake-breakage workflow, and self-test against THIS repo's ROADMAP.

Purpose: SC-5 (CLI surface), SC-6 (skill), SC-7 (export surface lock + library API), SC-8 (round-trip integration), SC-9 (self-test against this repo), SC-10 (idempotency).
Output: CLI module + skill + locked module.exports + 4 new test groups.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── roadmap-reconcile.cjs                ← MODIFY (final module.exports + banner)
├── roadmap-reconcile.test.cjs           ← MODIFY (add EX/E2E groups)
├── roadmap-reconcile-cli.cjs            ← CREATE (cmdSyncRoadmapRoute + flag parser)
└── roadmap-reconcile-cli.test.cjs       ← CREATE (CLI test groups)

plugins/devflow/devflow/bin/
└── df-tools.cjs                         ← MODIFY (add case 'sync-roadmap')

plugins/devflow/skills/
└── sync-roadmap/
    └── SKILL.md                         ← CREATE (thin orchestrator)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
**CLI subcommand router (from `lib/initiatives-cli.cjs`, TRD 05-01):**

```js
'use strict';

const reconcile = require('./roadmap-reconcile.cjs');
const { output } = require('./helpers.cjs');

function _parseFlags(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--dry-run' || a === '--interactive' || a === '--raw') {
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

function cmdSyncRoadmapRoute(cwd, args, raw) {
  const { flags } = _parseFlags(args);
  let mode = 'write';
  if (flags['dry-run']) mode = 'dry-run';
  else if (flags['interactive']) mode = 'interactive';

  // Interactive mode: handled at CLI layer, NOT in reconcile
  if (mode === 'interactive') {
    if (!process.stdin.isTTY) {
      process.stderr.write(JSON.stringify({
        warning: 'non-TTY environment; falling back to write mode',
      }) + '\n');
      mode = 'write';
    } else {
      // Run dry-run first to collect changes, then prompt per change, then conditionally write
      return _runInteractive(cwd, raw);
    }
  }

  const result = reconcile.reconcile({ projectRoot: cwd, mode });
  output({
    mode,
    changes: result.changes,
    warnings: result.warnings,
    changes_count: result.changes.length,
    warnings_count: result.warnings.length,
  }, raw, _renderSummary(result));
}

function _renderSummary(result) {
  const lines = [];
  if (result.changes.length === 0 && result.warnings.length === 0) {
    lines.push('No drift detected. ROADMAP matches disk truth.');
    return lines.join('\n');
  }
  if (result.changes.length > 0) {
    lines.push(`Drift corrected: ${result.changes.length} change(s)`);
    for (const c of result.changes) {
      lines.push(`  [${c.kind}] ${c.objective_num || ''}/${c.trd_id || ''}`);
      if (c.before && c.after) {
        lines.push(`    - ${c.before}`);
        lines.push(`    + ${c.after}`);
      }
    }
  }
  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.length}`);
    for (const w of result.warnings) {
      lines.push(`  [${w.kind}] ${w.message || JSON.stringify(w)}`);
    }
  }
  return lines.join('\n');
}

function _runInteractive(cwd, raw) {
  // 1. Run dry-run, collect changes
  const dryResult = reconcile.reconcile({ projectRoot: cwd, mode: 'dry-run' });
  if (dryResult.changes.length === 0) {
    output({ mode: 'interactive', changes: [], warnings: dryResult.warnings, changes_count: 0 }, raw,
      'No drift detected.');
    return;
  }

  // 2. Prompt per change via readline (synchronous-ish via stdin readSync helper, OR
  //    use readline.createInterface w/ async iteration — pick one and document)
  const accepted = [];
  for (const change of dryResult.changes) {
    process.stderr.write(`\n[${change.kind}] ${change.objective_num || ''}/${change.trd_id || ''}\n`);
    process.stderr.write(`  - ${change.before}\n  + ${change.after}\n`);
    process.stderr.write('Apply? [y/N] ');
    const answer = _readlineSync(); // helper: blocks for one line via fs.readSync(0, ...)
    if (/^[yY]/.test(answer.trim())) accepted.push(change);
  }

  // 3. If any accepted, re-read ROADMAP and apply ONLY accepted changes
  if (accepted.length === 0) {
    output({ mode: 'interactive', changes: [], warnings: dryResult.warnings, changes_count: 0 }, raw,
      'No changes accepted.');
    return;
  }
  // For v1.1: re-read ROADMAP, apply each accepted change's `after` line at line_index
  // (changes carry path + before/after; line_index needs to be on change object — UPDATE 09-01 to include it
  //  OR re-walk in the apply step).
  _applyAcceptedChanges(cwd, accepted);
  output({ mode: 'interactive', changes: accepted, warnings: dryResult.warnings, changes_count: accepted.length },
    raw, `Applied ${accepted.length} change(s).`);
}
```

# CRITICAL: Interactive mode MUST collect changes via dry-run first, then prompt, then apply only accepted ones. NEVER prompt during the rule walk — that's a layering violation and breaks the engine's pure-logic guarantee.
# GOTCHA: For interactive prompting, use a synchronous read helper. Node's `readline` is async; use `require('readline-sync')` is NOT available (no extra deps). Implement `_readlineSync` via `fs.readSync(0, buffer, 0, 256)` reading from stdin fd 0. See pattern at lib/initiatives.cjs::_defaultConfirmDeleteStale for similar approach.
# GOTCHA: `change.line_index` must be added to the change object in TRD 09-01's reconcile (it's already in `entry.line_index` — just propagate it). If 09-01 didn't, this TRD adds it as a small reconcile patch alongside CLI work. Document the patch in SUMMARY.

**df-tools.cjs case arm (from existing pattern, e.g. line 778):**

```js
case 'sync-roadmap': {
  cmdSyncRoadmapRoute(cwd, args.slice(1), raw);
  break;
}
```

Add at the bottom of the switch block, alongside `case 'initiatives'`. Add the require at top of df-tools.cjs alongside other CLI module requires.

**Skill thin-orchestrator (from `plugins/devflow/skills/initiatives/SKILL.md`):**

```markdown
---
name: sync-roadmap
description: |
  Reconcile ROADMAP.md checkbox state against on-disk SUMMARY.md presence. Default mode silently corrects drift; --dry-run shows the diff without writing; --interactive prompts per change.
  Use when the user wants to update ROADMAP after a TRD ships, audit drift between ROADMAP claims and disk truth, or perform a one-off cleanup.
  Triggers on: "sync roadmap", "reconcile roadmap", "update roadmap checkboxes", "fix roadmap drift", "is the roadmap accurate".
argument-hint: "[--dry-run] [--interactive] [--raw]"
allowed-tools:
  - Bash
  - Read
---

<objective>
Reconcile `.planning/ROADMAP.md` against on-disk reality:

- TRD has `<id>-SUMMARY.md` → mark `[x]`
- TRD has `Self-Check: FAILED` in SUMMARY → mark `[ ]` and append `(failed)` annotation
- TRD listed in ROADMAP but no TRD file on disk → leave alone, surface warning (never auto-delete)

Plus objective-level rollup: when ALL TRDs in an objective are `[x]`, flip the objective's `**Status:**` line to `complete YYYY-MM-DD` (and update Progress table row if present).

Default behavior: walk + write atomically (tmp + rename). `--dry-run` shows the diff without writing. `--interactive` prompts y/N per drift (TTY only; non-TTY falls back to write mode).

Idempotent: running twice produces zero second-run changes.
</objective>

<execution_context>
@.planning/ROADMAP.md
</execution_context>

<process>
**Run the sync-roadmap CLI with arg passthrough:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs sync-roadmap $ARGUMENTS
```

The CLI:

1. Parses flags: `--dry-run`, `--interactive`, `--raw`.
2. Calls `reconcile({ projectRoot: cwd, mode })` from `lib/roadmap-reconcile.cjs`.
3. For `--dry-run`: emits structured changes JSON + warnings; never writes.
4. For default (write): atomically rewrites ROADMAP.md via tmp + rename when changes exist.
5. For `--interactive`: dry-run first → prompt y/N per drift → write only accepted changes.
6. Reports summary: N changes, N warnings, mode used.

**After the command runs, present the output to the user** — show changes table (kind / objective / TRD / before → after), warnings if any, and a one-line summary.

If no drift found, say "No drift detected. ROADMAP matches disk truth." and exit.
</process>

<context>
This skill is for manual recovery + post-TRD-ship cleanup. Future enhancement: post-execute hook auto-invocation (out of v1.1 scope). For now, run manually after a TRD ships if you want the ROADMAP checkbox updated automatically instead of editing by hand.

The reconciliation rules (from CONTEXT.md decision #2):

- `trd_summary_exists`: TRD has SUMMARY → `[x]`
- `trd_summary_failed`: SUMMARY contains `Self-Check: FAILED` → `[ ]` + `(failed)`
- `trd_orphan_warning`: TRD in ROADMAP but no TRD file → warning, no auto-flip

Plus objective-level rollup (CONTEXT.md decision #3) when ALL TRDs are `[x]`.

Limitations:
- **Single ROADMAP only.** No multi-repo, no nested ROADMAPs.
- **No GitHub side effects.** Use `df:gh-sync` for GH state sync.
- **No auto-deletion.** Orphan TRDs surface as warnings only — user manually decides.
- **Forward-only rollup.** Once an objective Status flips to `complete`, the reconciler doesn't auto-revert even if a TRD becomes `[ ] (failed)`. Edit manually.
</context>
```

**Export-lock banner pattern (from `lib/initiatives.cjs` TRD 05-05):**

```js
// ─── module.exports — LOCKED by TRD 09-03 (8-entry surface; SC-7) ───────────
//
// This block is the authoritative export surface for lib/roadmap-reconcile.cjs.
// Asserted by EX1 test: Object.keys(module.exports).sort() deepStrictEqual.
// DO NOT add or remove entries without updating the EX1 test + 09-CONTEXT.md §"Module surface".

module.exports = {
  // Public API (TRD 09-01 + extended in 09-02):
  reconcile,

  // Helpers (TRD 09-01 + 09-02):
  _walkTrdLines,
  _checkSummaryExists,
  _checkSummaryFailed,
  _writeReconciledRoadmap,
  _rollupObjectiveStatus,

  // Test hooks:
  _setRunFs,
  _resetMocks,
};
```

**EX1 export-lock test pattern:**

```js
test('EX1: module.exports surface is locked (deepStrictEqual on Object.keys)', () => {
  const expected = [
    '_checkSummaryExists',
    '_checkSummaryFailed',
    '_resetMocks',
    '_rollupObjectiveStatus',
    '_setRunFs',
    '_walkTrdLines',
    '_writeReconciledRoadmap',
    'reconcile',
  ];
  const reconciler = require('./roadmap-reconcile.cjs');
  assert.deepStrictEqual(Object.keys(reconciler).sort(), expected);
});

test('EX2: module.exports has banner comment', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('./roadmap-reconcile.cjs'), 'utf-8');
  assert.match(src, /─── module\.exports — LOCKED by TRD 09-03/);
});
```

**E2E self-test pattern (against THIS repo's ROADMAP):**

```js
test('E2E1: self-test — sync-roadmap --dry-run against repo root shows zero drift', () => {
  const reconciler = require('./roadmap-reconcile.cjs');
  // process.cwd() during test execution is the repo root
  const repoRoot = process.cwd();
  const result = reconciler.reconcile({ projectRoot: repoRoot, mode: 'dry-run' });
  // We maintain ROADMAP.md manually after each TRD ships, so zero drift is the baseline.
  // If this test fails, EITHER the manual maintenance broke OR the reconciler logic broke.
  // Capture both paths in the failure message.
  assert.strictEqual(result.changes.length, 0,
    `Expected zero drift in this repo's ROADMAP.md but got: ${JSON.stringify(result.changes)}`);
});
```

# CRITICAL: E2E1 is the SC-9 acceptance gate. It MUST run on every test execution (no env gate). If this test starts failing, the team must immediately decide: was ROADMAP maintenance missed, or did the reconciler regress?
# GOTCHA: process.cwd() at test time is repo root because npm test runs from there. If the test is invoked with a different cwd (e.g., from inside lib/), the test still works because we resolve from process.cwd(), not __dirname.
# PATTERN: Mirror obj 1 TRD 01-06 dogfood test pattern — assertion against this repo's actual artifacts.

**E2E fake-breakage test pattern:**

```js
test('E2E2: fake-breakage workflow — sed [x] to [ ], dry-run shows drift, write fixes it, re-run is clean', { timeout: 30000 }, () => {
  const fs = require('fs');
  const path = require('path');
  const reconciler = require('./roadmap-reconcile.cjs');

  // Use buildReconcileFixtures with a TRD that has a SUMMARY but ROADMAP shows [ ]
  const fixtures = require('./__fixtures__/awareness-fixtures.cjs');
  const { projectRoot, cleanup } = fixtures.buildReconcileFixtures({
    objectives: [{
      num: '01',
      slug: 'foo',
      title: 'Foo',
      status: 'in flight',
      trds: [
        { id: '01-01', desc: 'desc', summary: 'present', initial_checkbox: ' ' },
      ],
    }],
  });

  try {
    // Step 1: dry-run shows drift
    const r1 = reconciler.reconcile({ projectRoot, mode: 'dry-run' });
    assert.strictEqual(r1.changes.length, 1);
    assert.strictEqual(r1.changes[0].kind, 'trd_summary_exists');

    // Step 2: write mode applies it
    const r2 = reconciler.reconcile({ projectRoot, mode: 'write' });
    assert.strictEqual(r2.changes.length, 1);
    const roadmap = fs.readFileSync(path.join(projectRoot, '.planning', 'ROADMAP.md'), 'utf-8');
    assert.match(roadmap, /\[x\] 01-01-foo-TRD\.md/);

    // Step 3: re-run dry-run is clean (idempotency)
    const r3 = reconciler.reconcile({ projectRoot, mode: 'dry-run' });
    assert.strictEqual(r3.changes.length, 0);
  } finally {
    cleanup();
  }
});
```

# CRITICAL: Always wrap fixture-using tests in try/finally with cleanup() to avoid leaking tmpdirs.
</codebase_examples>

<anti_patterns>
- **Don't put interactive prompting logic in `reconcile`.** It's CLI-layer concern. The `mode: 'interactive'` is handled by `cmdSyncRoadmapRoute` which calls `reconcile` in `dry-run` mode first, prompts, then calls `reconcile` again in `write` mode with filtered changes (or directly applies the filtered changes). Engine stays pure.
- **Don't add new helpers to module.exports beyond the locked 8 entries.** If interactive mode needs an apply helper, keep it private to the CLI module (`_applyAcceptedChanges` lives in `roadmap-reconcile-cli.cjs`, not `roadmap-reconcile.cjs`).
- **Don't add `--force` or `--no-confirm` flags.** Locked decision #1: default is write (no questions asked). Use `--dry-run` to preview.
- **Don't make E2E1 (self-test) gated.** It MUST run on every `npm test`. The whole point is the team learns about drift the moment it appears.
- **Don't fail E2E1 silently.** If the assertion fails, the message must include the diff so the user can decide: "ROADMAP needs manual update" vs "reconciler regressed".
</anti_patterns>

<error_recovery>
- **df-tools.cjs case-arm collision:** Search df-tools.cjs for any existing `sync-roadmap` reference before adding. If unrelated existing usage is found, document and rename. (None expected — `sync-roadmap` is a new command.)
- **Skill name collision:** Check `plugins/devflow/skills/` for existing skill named `sync-roadmap`. (None expected.) If found, rename TRD's skill or merge.
- **Interactive readline blocks tests:** All tests run in non-TTY mode; the fallback path (write mode + warning) is exercised by CLI test C5. The TTY path is exercised by a separate test using stdin mocking — see `lib/initiatives.test.cjs` Group SF for readline mock pattern.
- **E2E1 fails on first run:** This means the current `.planning/ROADMAP.md` already has drift. Two options: (a) document baseline drift in CONTEXT.md as expected (NOT recommended), or (b) hand-fix the ROADMAP before this TRD lands so the baseline is clean (RECOMMENDED). Either way, decide explicitly before committing GREEN.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-CONTEXT.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-01-reconciler-engine-and-fixtures-SUMMARY.md
@.planning/objectives/09-roadmap-disk-reconciliation/09-02-objective-rollup-SUMMARY.md
@plugins/devflow/devflow/bin/lib/initiatives-cli.cjs
@plugins/devflow/skills/initiatives/SKILL.md
@plugins/devflow/devflow/bin/df-tools.cjs
</context>

<gotchas>
- **Test list propagation:** Append the EX/CLI/E2E test list to the existing top-of-file comment block in roadmap-reconcile.test.cjs (preserve TRD 09-01 + 09-02 lists; add 09-03 section).
- **CLI test isolation:** Each CLI test that exercises argv parsing must reset `_runFs` and `_resetMocks()` in afterEach to prevent test pollution.
- **`output()` helper exits process:** `helpers.cjs::output` calls `process.exit(0)` on success. CLI tests must spawn subprocess via `execSync('node df-tools.cjs sync-roadmap --dry-run', ...)` rather than calling `cmdSyncRoadmapRoute` in-process — otherwise the test process exits mid-run. See `lib/initiatives-cli.test.cjs` CLI subprocess pattern.
- **Skill discovery:** Skills are auto-loaded from `plugins/devflow/skills/<name>/SKILL.md`. The `sync-runtime` hook mirrors them to `~/.claude/devflow/skills/<name>/SKILL.md` on session start. After creating SKILL.md, the user must restart Claude Code OR the next session-start hook fires the mirror. Document in SUMMARY: "skill takes effect on next session restart."
- **Self-test passes RIGHT NOW only if ROADMAP is clean:** The current `.planning/ROADMAP.md` may have drift if any merged objective hasn't had its TRD checkboxes manually updated. Before E2E1 GREENs, manually flip any drift in this repo's ROADMAP. Document the pre-test cleanup in SUMMARY.
- **`change.line_index` propagation for interactive apply:** Verify TRD 09-01's `reconcile` includes `line_index` on every change object. If absent, this TRD adds it as a small patch alongside CLI work — note in SUMMARY.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: CLI module + df-tools integration + skill (standard task)</name>
  <files>
    plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs
    plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs
    plugins/devflow/devflow/bin/df-tools.cjs
    plugins/devflow/skills/sync-roadmap/SKILL.md
  </files>
  <action>
Create the CLI module + skill + wire into df-tools. This is a STANDARD task (per TDD playbook directives: CLI + skill = standard) — single feat commit covering all four files.

**Step 1: Create `lib/roadmap-reconcile-cli.cjs`** per the embedded skeleton:
- `_parseFlags(args)` — handles `--dry-run`, `--interactive`, `--raw`
- `cmdSyncRoadmapRoute(cwd, args, raw)` — main entry
- `_renderSummary(result)` — human-readable output
- `_runInteractive(cwd, raw)` — interactive mode (dry-run → prompt → conditional apply)
- `_readlineSync()` — sync stdin reader for interactive prompts
- `_applyAcceptedChanges(cwd, accepted)` — re-reads ROADMAP, applies only accepted changes by line_index, atomic write

**Step 2: Create `lib/roadmap-reconcile-cli.test.cjs`** with test groups:
```
Group CLI (subprocess-based, exercising df-tools sync-roadmap):
- CLI1: default mode + clean fixture → exit 0, "No drift detected"
- CLI2: default mode + drift fixture → exit 0, ROADMAP file rewritten
- CLI3: --dry-run flag → exit 0, ROADMAP unchanged on disk, JSON output has changes
- CLI4: --raw flag → JSON output to stdout
- CLI5: --interactive in non-TTY → warning + falls back to write mode
- CLI6: ROADMAP missing → warning emitted, exit 0 (graceful)

Group FP (flag parser unit tests):
- FP1: _parseFlags(['--dry-run']) → { flags: { 'dry-run': true } }
- FP2: _parseFlags(['--interactive', '--raw']) → both true
- FP3: _parseFlags([]) → { flags: {} }

Group RS (_renderSummary unit tests):
- RS1: empty result → 'No drift detected.'
- RS2: 1 change → table-style output with kind, before, after
- RS3: warnings → 'Warnings: N' line + per-warning detail
```

CLI tests use `execSync('node df-tools.cjs sync-roadmap ...', { cwd: tmpRoot })` subprocess pattern (see `lib/initiatives-cli.test.cjs::CLI2` for reference). FP/RS tests are in-process unit tests.

**Step 3: Wire into `df-tools.cjs`:**
- Add require near other CLI module requires: `const { cmdSyncRoadmapRoute } = require('./lib/roadmap-reconcile-cli.cjs');` (use the actual import pattern existing in df-tools.cjs — likely a single `require` block at top).
- Add case arm at the bottom of the main switch (alongside `case 'initiatives'`):
  ```js
  case 'sync-roadmap': {
    cmdSyncRoadmapRoute(cwd, args.slice(1), raw);
    break;
  }
  ```

**Step 4: Create `plugins/devflow/skills/sync-roadmap/SKILL.md`** per embedded skeleton. Mirror the initiatives skill pattern (frontmatter + objective + execution_context + process + context).

# CRITICAL: SKILL.md frontmatter MUST include `name: sync-roadmap`, `description: |`, `argument-hint`, `allowed-tools` per existing skill conventions. Validation: `cat plugins/devflow/skills/sync-roadmap/SKILL.md | head -10` should show frontmatter.
# GOTCHA: df-tools.cjs `require` pattern — check existing requires for whether they're at top-of-file or lazy-loaded. Match the existing pattern. Most CLI module requires in df-tools are top-of-file destructured imports.
# PATTERN: See obj 5 TRD 05-04 SUMMARY for skill thin-orchestrator pattern + obj 4 TRD 04-04 for how skills delegate to df-tools subcommands.

Commit: `feat(09-03): add sync-roadmap CLI subcommand and skill`. Include all 4 files in single commit per CONTEXT.md "standard TRDs single feat commit" guidance.
  </action>
  <verify>
1. `npm test` — CLI/FP/RS tests GREEN. Existing 09-01/09-02 tests remain green.
2. `node plugins/devflow/devflow/bin/df-tools.cjs sync-roadmap --dry-run` (run from repo root) succeeds and prints structured output.
3. `ls plugins/devflow/skills/sync-roadmap/SKILL.md` shows file present.
4. `head -10 plugins/devflow/skills/sync-roadmap/SKILL.md` shows YAML frontmatter with `name: sync-roadmap`.
  </verify>
  <done>
CLI module + tests + df-tools wiring + skill all in place. ~8-10 new tests GREEN. Single commit `feat(09-03): add sync-roadmap CLI subcommand and skill`. Manual smoke test of `df-tools sync-roadmap --dry-run` against repo root succeeds.
  </done>
  <recovery>
If CLI subprocess tests are flaky due to working directory mismatch, set `cwd: projectRoot` in the spawn options. If df-tools.cjs require ordering causes circular dependency, lazy-load: `function getCli() { return require('./lib/roadmap-reconcile-cli.cjs'); }` inside the case body.

If skill MIRROR doesn't pick up the new SKILL.md (because session-start hook didn't run), manually run `node plugins/devflow/hooks/sync-runtime.js` to trigger the mirror. Document in SUMMARY.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Export-lock RED test + integration test list (TDD task)</name>
  <files>plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs</files>
  <action>
Append RED tests for export-surface lock + e2e integration to `roadmap-reconcile.test.cjs`. These will FAIL until Task 3 lands the locked banner + change.line_index propagation.

**Test list (append):**

```
TEST LIST — TRD 09-03 export-lock + integration
================================================

Group EX (export-surface lock):
- EX1: module.exports surface is locked (deepStrictEqual on Object.keys vs expected 8-entry list)
- EX2: module.exports block has banner comment '─── module.exports — LOCKED by TRD 09-03'

Group E2E (round-trip integration):
- E2E1: SELF-TEST — reconcile in dry-run mode against process.cwd() (this repo's ROADMAP) returns changes=[]
- E2E2: fake-breakage workflow — fixture with SUMMARY but [ ] → dry-run shows drift → write fixes → re-run is clean
- E2E3: idempotency — run reconcile in write mode twice on same fixture; second call returns changes=[]
- E2E4: drift across multiple objectives — fixture with 2 objectives × 2 TRDs each, mixed [ ]/[x] vs SUMMARYs → reconcile produces correct per-TRD changes + correct rollup for fully-checked objectives
```

**Implementation:**

EX1 lists the expected exports alphabetically per pattern. EX2 reads the source file and asserts the banner regex matches.

E2E1 (SELF-TEST) — calls `reconcile({ projectRoot: process.cwd(), mode: 'dry-run' })` and asserts `result.changes.length === 0`. Failure message must include the changes JSON for diagnosis.

E2E2-E2E4 use `buildReconcileFixtures` with try/finally cleanup.

# CRITICAL: At RED time, EX1 may already pass if 09-01/09-02 happened to leave exactly the 8-entry surface (likely). EX2 is the gating RED — banner doesn't exist yet. Document in commit which tests were RED at this stage.
# GOTCHA: E2E1 (self-test) MIGHT FAIL at RED time if this repo's current ROADMAP has drift. If so, fix the ROADMAP manually FIRST (Task 0 below), then commit RED. Document the manual cleanup in SUMMARY.

Commit: `test(09-03): add export-lock + integration tests`.
  </action>
  <verify>
`npm test` shows new EX/E2E tests at expected RED status. Existing tests unchanged.
  </verify>
  <done>
~6 new tests added; FAILING as expected. Commit `test(09-03): ...`.
  </done>
  <recovery>
If E2E1 fails because this repo's ROADMAP has actual drift (because we shipped TRDs and didn't update ROADMAP manually before this objective started), do TASK 0 first:

```bash
# Audit: which TRDs have SUMMARYs but [ ] in ROADMAP?
grep -l "Self-Check" .planning/objectives/*/[0-9]*-SUMMARY.md | while read s; do
  trd=$(basename "$s" -SUMMARY.md)
  if grep -q "\[ \] $trd-TRD.md" .planning/ROADMAP.md; then
    echo "DRIFT: $trd has SUMMARY but ROADMAP says [ ]"
  fi
done
```

Hand-edit `.planning/ROADMAP.md` to fix any drift, commit `docs(09-03): manually flip ROADMAP checkboxes before reconciler self-test lands`. THEN proceed with E2E1 as designed. Document the cleanup in SUMMARY.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: GREEN — lock module.exports + add change.line_index + verify all green</name>
  <files>
    plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
    plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs
  </files>
  <action>
Final GREEN pass. Three concrete changes:

1. **Lock module.exports with banner** — replace current `module.exports = {...}` block with the LOCKED 8-entry surface + banner comment per embedded skeleton.

2. **Propagate `line_index` on change objects** — verify that 09-01's `reconcile` adds `line_index: entry.line_index` to every change object. If absent, add it. This is needed for `_runInteractive` to apply only accepted changes.

3. **Verify E2E1 GREEN** — run `node plugins/devflow/devflow/bin/df-tools.cjs sync-roadmap --dry-run` from repo root. If it shows drift, the ROADMAP needs manual cleanup (recovery branch in Task 2). After cleanup, E2E1 should be GREEN.

**Step-by-step:**

```bash
# Step 1: Lock module.exports (in-place edit of roadmap-reconcile.cjs)
# Step 2: Verify line_index on change objects
grep -n "line_index" plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs
# If 0 results inside push({...}) blocks, add line_index: entry.line_index to each push.

# Step 3: Run full test suite
npm test 2>&1 | tail -20
# Expected: all GREEN, total count up by ~16 from baseline (8 from CLI + 6 from EX/E2E + 2 from FP/RS)
```

# CRITICAL: After Task 3, the EX1 expected list MUST exactly match Object.keys(module.exports).sort(). If they don't match, fix EX1's expected list — DON'T add/remove from module.exports unless it's a genuine API change.
# GOTCHA: `change.line_index` is needed for the interactive-apply path. If 09-01's reconcile doesn't include it on every change push, this is the place to fix it. Document the patch in SUMMARY ("09-01 deviation: added line_index to change objects, needed for interactive mode in 09-03").

Commit: `feat(09-03): lock export surface and finalize integration`.
  </action>
  <verify>
1. `npm test` — ALL tests GREEN, including EX1, EX2, E2E1, E2E2, E2E3, E2E4.
2. `grep "LOCKED by TRD 09-03" plugins/devflow/devflow/bin/lib/roadmap-reconcile.cjs` matches the banner comment.
3. `node plugins/devflow/devflow/bin/df-tools.cjs sync-roadmap --dry-run` from repo root → "No drift detected."
4. Total test count increased by ~50 across all 3 TRDs in objective 9 (estimate).
  </verify>
  <done>
Banner comment present, `module.exports` locked at 8 entries, EX1+EX2 GREEN, E2E1-E2E4 GREEN, self-test passes against this repo's ROADMAP. Final commit `feat(09-03): lock export surface and finalize integration`.
  </done>
  <recovery>
If E2E1 fails AT GREEN TIME (after manual cleanup), there's a real reconciler regression. Bisect: which test combination is broken? Run `node --test plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs --test-name-pattern E2E1` for isolation. Inspect the changes JSON in the failure message — that's the actual diff the reconciler thinks ROADMAP needs.

If EX1 fails because Object.keys order doesn't match, the test uses `.sort()` so order shouldn't matter. Verify both expected and actual are sorted alphabetically. Common cause: typo in expected list.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `lib/roadmap-reconcile-cli.cjs` exists with `cmdSyncRoadmapRoute` + flag parser + interactive helpers.
2. `df-tools.cjs` has `case 'sync-roadmap'` arm; subprocess invocation succeeds.
3. `plugins/devflow/skills/sync-roadmap/SKILL.md` exists with valid YAML frontmatter (`name: sync-roadmap`, `description: |`, `argument-hint`, `allowed-tools`).
4. `lib/roadmap-reconcile.cjs` `module.exports` block has banner comment `LOCKED by TRD 09-03 (8-entry surface; SC-7)`.
5. EX1 (export-lock) + EX2 (banner-present) GREEN.
6. E2E1 (self-test against this repo) GREEN — zero drift.
7. E2E2 (fake-breakage workflow) GREEN — full diff/fix/verify cycle works.
8. E2E3 (idempotency) GREEN — second run = zero changes.
9. E2E4 (multi-objective rollup) GREEN — confirms rollup integration with rule loop.
10. Total commits this TRD: 3 (1 standard `feat:` for CLI/skill + `test:` for RED + `feat:` for GREEN).
</verification>

<success_criteria>
- [ ] SC-5 satisfied: `df-tools sync-roadmap [--dry-run] [--interactive]` works as documented
- [ ] SC-6 satisfied: `/devflow:sync-roadmap` skill exists and invokes the CLI
- [ ] SC-7 satisfied: `lib/roadmap-reconcile.cjs` exports stable 8-entry surface; banner comment present
- [ ] SC-8 satisfied: E2E2 round-trip integration passes (drift → reconcile → match disk)
- [ ] SC-9 satisfied: E2E1 self-test against this repo's ROADMAP shows zero drift
- [ ] SC-10 satisfied: E2E3 idempotency test passes (second run = zero changes)
- [ ] All tests GREEN; no regression in the 1097+ baseline + 09-01/09-02 additions
- [ ] Test list at top of test file enumerates all groups (F/WTL/CSE/CSF/WR/R/RU/RUI/EX/E2E + CLI/FP/RS in CLI test file)
- [ ] Manual smoke: `df-tools sync-roadmap --dry-run` from repo root says "No drift detected."
</success_criteria>

<output>
After completion, create `.planning/objectives/09-roadmap-disk-reconciliation/09-03-cli-skill-and-integration-SUMMARY.md` and `.planning/objectives/09-roadmap-disk-reconciliation/09-VERIFICATION.md`. Record:

**SUMMARY:**
- Test count delta (start of obj 9 → end of obj 9)
- All commits in this TRD with hashes
- Any deviations from locked design (especially: line_index addition, ROADMAP cleanup if needed)
- Manual smoke-test result: `df-tools sync-roadmap --dry-run` → output captured

**VERIFICATION:**
- Per-SC checklist (SC-1 through SC-10) with the test/commit/file evidence for each
- Self-test result: zero drift confirmed
- Idempotency result: second run zero changes confirmed
- Skill mirror status: pending session restart vs already mirrored
</output>
