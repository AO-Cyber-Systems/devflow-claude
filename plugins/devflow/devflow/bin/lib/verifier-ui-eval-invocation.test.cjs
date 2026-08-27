'use strict';
// verifier-ui-eval-invocation.test.cjs (TRD 33-02, aodex#485 defect 5)
//
// The load-bearing test for objective 33: it does not copy the `verify flutter-ui-eval`
// command into this file. It reads `agents/verifier.md`, EXTRACTS the real invocation out
// of Step 8c's bash block, substitutes a hermetic fixture objective id for `$OBJECTIVE`,
// and EXECUTES it — proving (or, pre-fix, disproving) that Step 8c's own prose resolves to
// something the engine can load. A hard-coded copy of the command string would re-create
// the exact drift this objective exists to close.
//
// Test list (outside-in, CLAUDE.md habit 5 — this IS the outermost layer: the real CLI,
// invoked with the real command string taken out of the real agent prompt):
//   V4 (extraction guard, written FIRST — it guards V1)
//   V1 (the load-bearing case — RED task; only V4+V1 exist until GREEN task adds V2/V3)
//   V2 (resolved + a real scoreRun rollup)                         [added in GREEN task]
//   V3 (absent, exit 0, searched[] non-empty)                      [added in GREEN task]
//
// RED (task 1): V1 is OBSERVED to fail against the pre-fix handler, returning the legacy
// `{"error":"manifest/captureResults not found",...}` payload — recorded verbatim in
// 33-02-SUMMARY.md and in the task 1 commit body.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

// CRITICAL: run the LOCAL df-tools.cjs, not the `~/.claude/devflow/bin/` path verifier.md's
// prose contains — that path points at the synced plugin cache, which lags this worktree.
// Substitute the BINARY, keep the ARGUMENTS extracted from Step 8c — the arguments are what
// this objective is about.
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');
const VERIFIER_MD = path.join(__dirname, '..', '..', '..', 'agents', 'verifier.md');

const TMP_DIRS = [];

// ─── Fixture builder (hand-built factory, CLAUDE.md habit 4 — no generated data) ──────
//
// makeFixtureObjective({ id, slug, manifestJSON, labelsJSON })
//   -> { root, objectiveId }   built under fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-ui-eval-'))
//   Always writes a `type: ui` + `stack: flutter` TRD (that is this whole test file's
//   applicability precondition — a non-UI fixture belongs to 33-01's own suite, not here).
//   When manifestJSON is provided, also writes it to
//   <root>/.planning/objectives/<id>-<slug>/evidence/ui_eval/manifest.json (+ labels.json
//   alongside, when given) so the fixture can resolve all the way to 'resolved'.

function frontmatterBlock(fm) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('---', '', '# TRD', '');
  return lines.join('\n');
}

function makeFixtureObjective({ id, slug = 'verifier-invocation-fixture', manifestJSON, labelsJSON } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verifier-ui-eval-'));
  TMP_DIRS.push(root);

  const objectiveDirName = `${id}-${slug}`;
  const objectiveDir = path.join(root, '.planning', 'objectives', objectiveDirName);
  fs.mkdirSync(objectiveDir, { recursive: true });

  fs.writeFileSync(
    path.join(objectiveDir, `${id}-01-TRD.md`),
    frontmatterBlock({ objective: objectiveDirName, trd: '"01"', type: 'ui', stack: 'flutter' }),
    'utf-8',
  );

  if (manifestJSON !== undefined) {
    const tier2Dir = path.join(objectiveDir, 'evidence', 'ui_eval');
    fs.mkdirSync(tier2Dir, { recursive: true });
    fs.writeFileSync(path.join(tier2Dir, 'manifest.json'), manifestJSON, 'utf-8');
    if (labelsJSON !== undefined) {
      fs.writeFileSync(path.join(tier2Dir, 'labels.json'), labelsJSON, 'utf-8');
    }
  }

  return { root, objectiveId: id };
}

test.after(() => {
  for (const dir of TMP_DIRS) fs.rmSync(dir, { recursive: true, force: true });
});

// ─── Extraction (shared by V1 and V4) ─────────────────────────────────────────────────
//
// Narrow to Step 8c so a match in Step 8d's design-review block can't be mistaken for it.

function extractStep8cInvocations() {
  const md = fs.readFileSync(VERIFIER_MD, 'utf-8');
  const startIdx = md.indexOf('### Step 8c');
  const endIdx = md.indexOf('### Step 8d');
  assert.ok(startIdx !== -1, 'verifier.md must contain a "### Step 8c" heading');
  assert.ok(endIdx !== -1 && endIdx > startIdx, 'verifier.md must contain a "### Step 8d" heading after Step 8c');
  const step8c = md.slice(startIdx, endIdx);
  return [...step8c.matchAll(/df-tools\.cjs\s+verify\s+flutter-ui-eval\s+([^\n)]*)/g)];
}

test.describe('verifier-ui-eval-invocation (TRD 33-02, aodex#485 defect 5)', () => {

  // Case V4 — the extraction guard. Written FIRST because V1 cannot pin anything it
  // cannot find: a regex that matches zero times and an assertion that iterates zero
  // times is a green test proving nothing (this file's own anti-pattern list).
  test('Case V4 — Step 8c contains exactly one `verify flutter-ui-eval` invocation', () => {
    const matches = extractStep8cInvocations();
    assert.strictEqual(
      matches.length, 1,
      'Step 8c must contain exactly one `verify flutter-ui-eval` invocation — V1 cannot pin what it cannot find.',
    );
  });

  // Case V1 — the load-bearing case. Executes the SAME command string Step 8c's bash
  // block contains, with only $OBJECTIVE substituted for a hermetic fixture id and the
  // binary path swapped for this worktree's local df-tools.cjs. Asserts the result is
  // NOT the legacy collapsed-error shape and carries a real `resolution` field.
  test('Case V1 — Step 8c\'s own invocation resolves to something the engine can load (objective 33)', () => {
    const matches = extractStep8cInvocations();
    assert.ok(matches.length >= 1, 'V4 should have already failed if this is not true — guard tripped');

    const argTail = matches[0][1].trim(); // e.g. `"$OBJECTIVE" --raw`
    const argv = argTail.replace(/"\$OBJECTIVE"|\$OBJECTIVE/g, 'FIXTURE_OBJECTIVE_ID_PLACEHOLDER');

    const { root, objectiveId } = makeFixtureObjective({ id: '77', slug: 'v1-fixture' });
    const finalArgv = argv.replace(/FIXTURE_OBJECTIVE_ID_PLACEHOLDER/g, objectiveId);

    let stdout;
    try {
      stdout = execSync(`node ${DF_TOOLS} verify flutter-ui-eval ${finalArgv}`, { cwd: root, encoding: 'utf-8' });
    } catch (e) {
      // A non-zero exit here would itself be evidence of a defect (Step 8c's contract is
      // "never a hard fail") — but read stdout regardless so the assertion below is about
      // the PAYLOAD, not about execSync's throw-on-nonzero behavior.
      stdout = e.stdout;
    }

    assert.ok(stdout, 'the invocation must produce stdout to assert against');
    const parsed = JSON.parse(stdout);

    assert.notDeepStrictEqual(
      { error: parsed.error, ok: parsed.ok },
      { error: 'manifest/captureResults not found', ok: false },
      "Step 8c's invocation must resolve to something the engine can load (objective 33)",
    );
    assert.strictEqual(
      typeof parsed.resolution, 'string',
      "Step 8c's invocation must resolve to something the engine can load (objective 33)",
    );
    assert.ok(
      ['not_applicable', 'absent', 'invalid', 'resolved'].includes(parsed.resolution),
      `resolution must be one of the four honest statuses, got: ${parsed.resolution}`,
    );
  });

});
