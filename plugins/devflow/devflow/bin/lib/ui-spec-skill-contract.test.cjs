'use strict';
// ui-spec-skill-contract.test.cjs (TRD 34-08)
//
// Executable assertions over TWO PROSE FILES:
//   plugins/eden-ui-flutter/skills/frontend-design/SKILL.md   (build mode's Surface Spec step)
//   plugins/devflow/devflow/references/design-stack-flutter.md (the two new sections)
//
// The plan's gate for this row is "review". Proposal §21 amendment 1 raises that bar for prose
// that encodes RUNTIME SEMANTICS, and "run this command" is exactly such a claim. The wave-0
// failure class was prose naming a command that did not exist — a lag check that passed every
// test and was dead on the real path. So E1 does not assert that a command STRING is present:
// it extracts each one and EXECUTES it.
//
// Structure and lessons copied from `verifier-ui-eval-invocation.test.cjs`:
//   - the extraction guard is written FIRST (its case V4), because a regex that matches zero
//     times and an assertion that iterates zero times is a green test proving nothing;
//   - the prose names the MIRROR binary (`~/.claude/devflow/bin/df-tools.cjs`) because that is
//     what a skill actually invokes at runtime; the test substitutes the LOCAL binary and keeps
//     the ARGUMENTS (that file's lines 38-42: substitute the BINARY, keep the ARGUMENTS).
//
// E1's execution net reuses 34-07's P2 approach (`ui-spec-lock.test.cjs`) rather than inventing
// a second one — including its hard-won regex lesson: `ui spec <sub>` is a TWO-LEVEL arm and
// must be captured whole, or correct prose naming `ui spec validate` gets run as `ui spec <file>`
// and reads back "Unknown ui spec subcommand" — a net that fails for correct prose and can never
// tell that artefact from a genuinely missing second-level arm. P2 covers `checkpoints.md` and
// `executor.md`; this file covers the two files 34-08 writes. Disjoint sources, one pattern.
//
// Test list (written before any test code — see the TRD's <test_list>):
//   G1, G2  extraction guards        — written FIRST
//   E1      every df-tools string in the new prose is a REAL arm, proven by EXECUTING it
//   E2      every path the new prose names resolves (or is a declared app-repo template path)
//   E3      the lock vocabulary in the prose === the set the real tool can emit
//   S1-S7   build mode's Surface Spec step: content, the REFUSAL, ordering, no regression
//   R1-R3   design-stack-flutter.md: Composition and semantics, Surface Spec, the eight intact

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ─── Paths ────────────────────────────────────────────────────────────────────────────
// __dirname = plugins/devflow/devflow/bin/lib
const DEVFLOW_ROOT = path.join(__dirname, '..', '..');                 // plugins/devflow/devflow
const PLUGINS_ROOT = path.join(DEVFLOW_ROOT, '..', '..');             // plugins/
const REPO_ROOT = path.join(PLUGINS_ROOT, '..');                      // checkout root

// CRITICAL: the LOCAL binary, never `~/.claude/devflow/bin/df-tools.cjs` — the mirror lags this
// worktree, and a test that ran the mirror would be scoring a different build than the one under
// test. The prose keeps the mirror path because that is what the skill runs.
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

const SKILL_MD = path.join(PLUGINS_ROOT, 'eden-ui-flutter', 'skills', 'frontend-design', 'SKILL.md');
const STACK_MD = path.join(DEVFLOW_ROOT, 'references', 'design-stack-flutter.md');
const CHECKPOINTS_MD = path.join(DEVFLOW_ROOT, 'references', 'checkpoints.md');
const POSITIVE_CONTROL = path.join(__dirname, '__fixtures__', 'ui-spec', 'projects-rail.md');

const TMP_DIRS = [];
test.after(() => {
  for (const dir of TMP_DIRS) fs.rmSync(dir, { recursive: true, force: true });
});
function tmpdir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(dir);
  return dir;
}

// ─── Guarded extraction helpers ───────────────────────────────────────────────────────

const BUILD_MODE_HEADING = '## Build Mode';
const SPEC_STEP_MARKER = '**Locate or draft the Surface Spec**';

/** The `## Build Mode` section of SKILL.md, bounded by the next `## ` heading. */
function buildModeSection() {
  const md = fs.readFileSync(SKILL_MD, 'utf-8');
  const start = md.indexOf(BUILD_MODE_HEADING);
  assert.ok(start !== -1, `SKILL.md must contain a "${BUILD_MODE_HEADING}" heading`);
  const rest = md.slice(start + BUILD_MODE_HEADING.length);
  const next = rest.search(/\n## /);
  assert.ok(next !== -1, 'build mode must be bounded by a following "## " heading (Review Mode)');
  return { section: BUILD_MODE_HEADING + rest.slice(0, next), start, end: start + BUILD_MODE_HEADING.length + next };
}

/**
 * The Surface Spec step inside build mode: from its numbered-step line to the next top-level
 * numbered step (`^\d+\. **`) or the end of the section.
 */
function surfaceSpecStep() {
  const { section } = buildModeSection();
  const markerIdx = section.indexOf(SPEC_STEP_MARKER);
  assert.ok(
    markerIdx !== -1,
    `build mode must contain a step titled ${SPEC_STEP_MARKER} — the Phase A gate on the composition path`,
  );
  // Back up to the start of that step's own line.
  const lineStart = section.lastIndexOf('\n', markerIdx) + 1;
  const rest = section.slice(lineStart + SPEC_STEP_MARKER.length);
  const next = rest.search(/\n\d+\. \*\*/);
  return section.slice(lineStart, next === -1 ? section.length : lineStart + SPEC_STEP_MARKER.length + next);
}

const COMPOSITION_HEADING = '## Composition and semantics';
const SURFACE_SPEC_HEADING = '## Surface Spec';

/** A `## ` section of design-stack-flutter.md, bounded by the next `## ` heading or EOF. */
function stackSection(heading) {
  const md = fs.readFileSync(STACK_MD, 'utf-8');
  const start = md.indexOf(`\n${heading}\n`);
  assert.ok(start !== -1, `design-stack-flutter.md must contain a "${heading}" heading`);
  const rest = md.slice(start + heading.length + 2);
  const next = rest.search(/\n## /);
  return heading + rest.slice(0, next === -1 ? rest.length : next);
}

/**
 * Every prose region this TRD adds, labelled. E1/E2/E3 all read from here so that a command or a
 * path added to one of the three regions can never escape the nets.
 *
 * `partial: true` lets the R-cases' regions be absent while the S-cases are still RED — the
 * E-cases assert over whatever regions exist, and their own guards refuse an empty result.
 */
function newProseRegions({ partial = false } = {}) {
  const regions = {};
  const add = (label, fn) => {
    try {
      regions[label] = fn();
    } catch (e) {
      if (!partial) throw e;
    }
  };
  add('SKILL.md build-mode Surface Spec step', surfaceSpecStep);
  add('design-stack-flutter.md ## Composition and semantics', () => stackSection(COMPOSITION_HEADING));
  add('design-stack-flutter.md ## Surface Spec', () => stackSection(SURFACE_SPEC_HEADING));
  return regions;
}

/**
 * Extract `df-tools[.cjs] ui <arm>` strings. Accepts the bare `df-tools ui …` naming form as well
 * as the invocable `node ~/.claude/devflow/bin/df-tools.cjs ui …` form — prose uses both, and a
 * net that only saw one of them would let the other rot.
 */
function extractUiArms(text) {
  return [...text.matchAll(/df-tools(?:\.cjs)?\s+ui\s+(spec\s+[a-z-]+|[a-z-]+)/g)]
    .map((m) => m[1].replace(/\s+/g, ' '));
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// G — the extraction guards, written FIRST
// ═══════════════════════════════════════════════════════════════════════════════════════

test('Case G1 — build mode is locatable by heading and bounded by the next `## ` heading', () => {
  const { section, start, end } = buildModeSection();
  assert.ok(start !== -1 && end > start, 'both bounds must be found — not one of them');
  assert.ok(section.length > 500, 'the bounded build-mode section must actually contain the steps');
  // The bound must not have swallowed the neighbouring modes.
  assert.doesNotMatch(section, /## Review Mode/, 'the bound must stop before Review Mode');
  assert.doesNotMatch(section, /## Visual Mode/, 'the bound must stop before Visual Mode');
});

test('Case G2 — the Surface Spec step exists and names at least one `df-tools … ui …` command', () => {
  const step = surfaceSpecStep();
  const arms = extractUiArms(step);
  assert.ok(
    arms.length > 0,
    `the Surface Spec step names no \`df-tools … ui …\` command — E1 cannot pin what it cannot find. Step was:\n${step}`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// E — the executable claims: the ones that can be dead on the real path
// ═══════════════════════════════════════════════════════════════════════════════════════

test('Case E1 — every `df-tools … ui …` command the new prose names is a REAL registered arm, proven by EXECUTING it', () => {
  const regions = newProseRegions({ partial: true });
  const found = [];
  for (const [label, text] of Object.entries(regions)) {
    for (const arm of extractUiArms(text)) found.push({ label, arm });
  }
  assert.ok(
    found.length > 0,
    'the extraction found no `df-tools … ui …` command anywhere in the new prose — E1 cannot pin what it cannot find',
  );

  // Run each with a nonexistent spec. A REGISTERED arm refuses by name ("not found"); an
  // unregistered one refuses with "Unknown ui subcommand" — the wave-0 defect class, caught.
  for (const { label, arm } of found) {
    const argv = ['ui', ...arm.split(' '), '/nonexistent/spec-that-does-not-exist.md'];
    const r = spawnSync('node', [DF_TOOLS, ...argv], { encoding: 'utf-8' });
    const combined = `${r.stdout || ''}${r.stderr || ''}`;
    assert.doesNotMatch(
      combined, /Unknown ui subcommand/,
      `${label} names \`ui ${arm}\`, which df-tools does not register at the first level`,
    );
    assert.doesNotMatch(
      combined, /Unknown ui spec subcommand/,
      `${label} names \`ui ${arm}\`, which df-tools does not register at the second level`,
    );
    assert.match(
      combined, /not found/,
      `\`ui ${arm}\` (named in ${label}) should refuse a nonexistent spec by name; got: ${combined}`,
    );
  }
});

test('Case E2 — every path the new prose names resolves, or is a declared app-repo template path', () => {
  // (a) Every `@path` reference in SKILL.md resolves. `@~/.claude/devflow/<rest>` is the MIRROR,
  //     whose source in this checkout is plugins/devflow/devflow/<rest>. `plugins/eden-ui-flutter/`
  //     is NOT mirrored — SKILL.md is read from the plugin directory — so a repo-relative `@path`
  //     is checked against the checkout directly.
  const skillMd = fs.readFileSync(SKILL_MD, 'utf-8');
  const atRefs = [...skillMd.matchAll(/^@(\S+)$/gm)].map((m) => m[1]);
  assert.ok(atRefs.length > 0, 'SKILL.md must carry @path references — E2 cannot pin what it cannot find');
  for (const ref of atRefs) {
    const resolved = ref.startsWith('~/.claude/devflow/')
      ? path.join(DEVFLOW_ROOT, ref.slice('~/.claude/devflow/'.length))
      : path.join(REPO_ROOT, ref);
    assert.ok(fs.existsSync(resolved), `@${ref} does not resolve (looked at ${resolved})`);
  }

  // (b) Every devflow reference file the new prose names by `references/<name>.md` or by bare
  //     `<name>.md` must exist under plugins/devflow/devflow/references/.
  const regions = newProseRegions({ partial: true });
  const referenced = new Set();
  for (const text of Object.values(regions)) {
    for (const m of text.matchAll(/`[^`]*?(?:references\/)?([a-z0-9-]+\.md)`/g)) referenced.add(m[1]);
    for (const m of text.matchAll(/(?:~\/\.claude\/devflow\/)?references\/([a-z0-9-]+\.md)/g)) referenced.add(m[1]);
  }
  assert.ok(referenced.size > 0, 'the new prose must name at least one reference file — E2 cannot pin what it cannot find');
  for (const name of referenced) {
    assert.ok(
      fs.existsSync(path.join(DEVFLOW_ROOT, 'references', name)),
      `the new prose names \`${name}\`, which does not exist under plugins/devflow/devflow/references/`,
    );
  }

  // (c) App-repo template paths cannot exist in THIS checkout (they live in the Flutter app repo),
  //     so they are pinned against the canonical set the amended proposal declares — §4.1 for the
  //     spec and refs layout, §8.1 for the pattern-mapping page. A typo'd
  //     `flutter/specs/<surface>.md` is exactly as dead as an unregistered arm, and this is the
  //     only check that can see it.
  const CANONICAL_TEMPLATE_PATHS = new Set([
    'flutter/ui_spec/<surface>.md',
    'flutter/ui_spec/refs/<surface>/',
    'refs/<surface>/pattern-mapping.md',
    'refs/<surface>/donor/',
    'refs/<surface>/locked/',
  ]);
  const templates = new Set();
  for (const text of Object.values(regions)) {
    for (const m of text.matchAll(/`([^`]*<surface>[^`]*)`/g)) {
      // Strip a leading `node …df-tools.cjs …` invocation so a command string contributes only
      // the path argument it names.
      for (const p of m[1].split(/\s+/)) if (p.includes('<surface>')) templates.add(p);
    }
  }
  assert.ok(templates.size > 0, 'the new prose must name the spec path template — E2 cannot pin what it cannot find');
  for (const t of templates) {
    assert.ok(
      CANONICAL_TEMPLATE_PATHS.has(t),
      `the new prose names the app-repo path \`${t}\`, which is not one of the canonical paths the amended proposal §4.1/§8.1 declares: ${[...CANONICAL_TEMPLATE_PATHS].join(', ')}`,
    );
  }
});

test('Case E3 — the `lock` vocabulary in the prose is exactly the set the real tool can emit', () => {
  // Derive the tool's vocabulary by RUNNING it over four real spec states, not by reading the
  // implementation's string literals. A skill telling the user to look for a status the tool
  // never emits is a dead branch, and only execution can tell them apart.
  const dir = tmpdir('ui-spec-skill-contract-');
  const base = fs.readFileSync(POSITIVE_CONTROL, 'utf-8');

  const validate = (file) => {
    const r = spawnSync('node', [DF_TOOLS, 'ui', 'spec', 'validate', file], { encoding: 'utf-8' });
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.lock && typeof parsed.lock.lock === 'string', `validate must report a lock block for ${file}`);
    return parsed.lock.lock;
  };

  // MISSING — the committed positive control: an acceptance block with no `locked_shape_hash`.
  const missingFile = path.join(dir, 'missing.md');
  fs.writeFileSync(missingFile, base, 'utf-8');

  // absent — the same spec with its acceptance block removed.
  const absentFile = path.join(dir, 'absent.md');
  fs.writeFileSync(absentFile, base.replace(/^acceptance:\n(?:[ \t]+.*\n)+/m, ''), 'utf-8');

  // held — really locked, through the real `ui lock` arm.
  const heldFile = path.join(dir, 'held.md');
  fs.writeFileSync(heldFile, base, 'utf-8');
  const lockRun = spawnSync('node', [
    DF_TOOLS, 'ui', 'lock', heldFile,
    '--sheet-hash', 'a'.repeat(64), '--by', 'contract-test@example.test', '--at', '2026-09-22',
  ], { encoding: 'utf-8' });
  assert.strictEqual(lockRun.status, 0, `ui lock must succeed on the positive control: ${lockRun.stdout}${lockRun.stderr}`);

  // cleared — the locked spec with one control's `kind` changed (a shape change).
  const clearedFile = path.join(dir, 'cleared.md');
  fs.writeFileSync(clearedFile, fs.readFileSync(heldFile, 'utf-8').replace('kind: disclosure-header', 'kind: button'), 'utf-8');

  const emitted = new Set([validate(missingFile), validate(absentFile), validate(heldFile), validate(clearedFile)]);
  assert.deepStrictEqual(
    [...emitted].sort(), ['MISSING', 'absent', 'cleared', 'held'],
    'sanity: the four fixture states must really produce the four statuses',
  );

  // Now the prose. Extract every backticked lock value from the Surface Spec step.
  const step = surfaceSpecStep();
  const named = new Set(
    [...step.matchAll(/`(held|cleared|absent|MISSING)`/g)].map((m) => m[1]),
  );
  assert.ok(named.size > 0, 'the step names no lock values — E3 cannot pin what it cannot find');
  assert.deepStrictEqual(
    [...named].sort(), [...emitted].sort(),
    'the step must name exactly the four lock values the tool emits — collapsing `absent` into `cleared`, '
    + 'or naming a fifth, produces advice a human cannot act on',
  );
});
