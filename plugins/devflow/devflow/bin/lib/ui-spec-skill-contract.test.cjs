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

  // (b) Every devflow reference file the new prose names — either by a `references/<name>.md`
  //     path or as a bare backticked `<name>.md` basename — must exist under
  //     plugins/devflow/devflow/references/.
  //
  //     The two patterns are deliberately narrow. A greedy `` `…<name>.md` `` would also swallow
  //     the app-repo template paths (c) owns — `refs/<surface>/pattern-mapping.md` would be
  //     demanded under devflow/references/, where it will never exist — and the case would then
  //     fail for CORRECT prose. Same lesson, one level over, as 34-07's P2 regex: an extraction
  //     that cannot tell two shapes apart is worse than one that matches less.
  const regions = newProseRegions({ partial: true });
  const referenced = new Set();
  for (const text of Object.values(regions)) {
    for (const m of text.matchAll(/(?:~\/\.claude\/devflow\/)?references\/([a-z0-9-]+\.md)/g)) referenced.add(m[1]);
    for (const m of text.matchAll(/`([a-z0-9-]+\.md)`/g)) referenced.add(m[1]);
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

// ═══════════════════════════════════════════════════════════════════════════════════════
// S — build mode's Surface Spec step
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Every top-level numbered step in build mode, as {num, title}, in file order. */
function buildModeSteps() {
  const { section } = buildModeSection();
  return [...section.matchAll(/^(\d+)\. \*\*([^*]+)\*\*/gm)].map((m) => ({ num: Number(m[1]), title: m[2] }));
}

// S7's baseline, captured from the pre-TRD file at commit f3e0cb3^ by extracting
// `^\d+\. \*\*(…)\*\*` from the `## Build Mode` section. Titles, not numbers: this TRD
// renumbers, and a renumbering that silently drops the pre-flight step would be a real loss.
const PRE_TRD_BUILD_STEPS = [
  'Read project theme',
  'State the design read',
  'Detect greenfield vs redesign',
  'Understand the request',
  'Check eden-ui-flutter for matching widgets',
  'Plan the composition',
  'Generate Dart files',
  'Verify',
  'Run the pre-flight check',
];

test('Case S1 — the step names `flutter/ui_spec/` and the `ui spec validate` arm', () => {
  const step = surfaceSpecStep();
  assert.match(step, /flutter\/ui_spec\//, 'the step must name where a Surface Spec lives');
  assert.ok(
    extractUiArms(step).includes('spec validate'),
    'the step must name `df-tools … ui spec validate` — the arm that decides whether the spec is reviewable',
  );
});

test('Case S2 — THE REFUSAL: composition does not proceed when `ok` is false or `lock` is not `held`', () => {
  // This is the plan's definition-of-done clause for this row. A step 0 that drafts a spec but
  // composes anyway when the lock is cleared adds a document and changes no behaviour.
  const step = surfaceSpecStep();

  const refusalSentences = step
    .split(/(?<=\.)\s+|\n\n/)
    .filter((s) => /do not compose/i.test(s));
  assert.ok(refusalSentences.length > 0, 'the step must contain a flat "Do not compose" imperative');

  // One unambiguous sentence carrying BOTH conditions — `ok` false AND a lock that is not `held`.
  const both = refusalSentences.find((s) => /\bok\b/.test(s) && /`held`/.test(s));
  assert.ok(
    both,
    'one sentence must state BOTH refusal conditions together (`ok: false` and a lock other than '
    + `\`held\`); found only: ${JSON.stringify(refusalSentences)}`,
  );

  // Imperative, not advisory. A gate that asks permission to gate is not a gate.
  assert.doesNotMatch(step, /consider whether to (proceed|compose)/i, 'the refusal must not be softened into "consider whether"');
  assert.doesNotMatch(step, /you (may|might) want to stop/i, 'the refusal must not be softened into a suggestion');

  // `PAT000`/`HIT000` MISSING must be called out as NOT blocking, or someone adds a
  // belt-and-braces `errors.length` check and blocks every surface in the repo (34-04).
  assert.match(step, /PAT000/, 'the step must say that a MISSING pattern-catalogue row does not block composition');
  assert.match(
    step, /do not (set `?ok: false`?|block)/i,
    'the step must state explicitly that a MISSING check is not a violation',
  );
});

test('Case S3 — the step names the drafting inputs: pattern library, router table, mockup/donor, design read', () => {
  const step = surfaceSpecStep();
  assert.match(step, /pattern library/i, 'the pattern library supplies control defaults and `must_not` rules');
  assert.match(step, /router table/i, 'the router table supplies routes that already exist');
  assert.match(step, /mockup|donor/i, 'the mockup or donor is the visual input');
  assert.match(step, /design[ _-]read/i, 'the design read is carried into the spec, not re-derived');
  assert.match(
    step, /verbatim/i,
    'the step must say the design-read sentence is carried VERBATIM — asking for a second read is how the two drift',
  );
});

test('Case S4 — the look-lock procedure is REFERENCED, not restated', () => {
  const step = surfaceSpecStep();

  // It points at the one place the procedure lives.
  assert.match(step, /checkpoints\.md/, 'the step must point at checkpoints.md');
  assert.match(step, /look-lock/, 'the step must name the look-lock variant by name');
  const checkpoints = fs.readFileSync(CHECKPOINTS_MD, 'utf-8');
  assert.match(checkpoints, /### look-lock variant/, 'checkpoints.md must carry the look-lock variant section (34-07)');

  // It does NOT carry a second copy of the procedure. These three are the procedure's own
  // load-bearing clauses; each lives in checkpoints.md and must live there only.
  assert.doesNotMatch(step, /no lock is written/i, 'the rejection rule belongs to checkpoints.md');
  assert.doesNotMatch(step, /never blind-approved/i, 'the autonomous-mode rule belongs to checkpoints.md');
  assert.doesNotMatch(step, /missing\[\]/, 'the four things the human is shown belong to checkpoints.md');

  // If the step cites the approval command at all, it must be the SAME string checkpoints.md
  // names — two copies of a command string is the drift class objective 33 closed.
  const cited = [...step.matchAll(/`[^`]*df-tools(?:\.cjs)?\s+ui\s+lock[^`]*`/g)].map((m) => m[0].slice(1, -1));
  for (const c of cited) {
    const flags = [...c.matchAll(/--[a-z-]+/g)].map((m) => m[0]).sort();
    const inCheckpoints = [...checkpoints.matchAll(/df-tools(?:\.cjs)?\s+ui\s+lock[^\n`]*/g)]
      .map((m) => [...m[0].matchAll(/--[a-z-]+/g)].map((f) => f[0]).sort().join(' '));
    assert.ok(
      inCheckpoints.includes(flags.join(' ')),
      `the step cites \`${c}\`, whose flags (${flags.join(' ') || 'none'}) match no form of the approval `
      + `command in checkpoints.md (${JSON.stringify(inCheckpoints)}) — the two copies have drifted`,
    );
  }
});

test('Case S5 — the Surface Spec step sits AFTER the design read and BEFORE composition planning', () => {
  const steps = buildModeSteps();
  const idx = (title) => steps.findIndex((s) => s.title === title);

  const designRead = idx('State the design read');
  const detection = idx('Detect greenfield vs redesign');
  const specStep = idx('Locate or draft the Surface Spec');
  const composition = idx('Plan the composition');

  assert.ok(designRead !== -1 && detection !== -1 && composition !== -1, 'the pre-existing anchors must still be present');
  assert.ok(specStep !== -1, 'the Surface Spec step must be a numbered build-mode step, not a floating paragraph');

  // A spec drafted before the design read has no `design_read` value to carry; one drafted before
  // greenfield/redesign detection has no `mode`.
  assert.ok(specStep > designRead, 'the Surface Spec step must come AFTER the design read');
  assert.ok(specStep > detection, 'the Surface Spec step must come AFTER greenfield/redesign detection');
  assert.ok(specStep < composition, 'the Surface Spec step must come BEFORE composition planning — it is the gate on it');

  // Numbering is contiguous and ascending after the renumber.
  const nums = steps.map((s) => s.num);
  assert.deepStrictEqual(
    nums, nums.slice().sort((a, b) => a - b),
    `build-mode step numbers must ascend after renumbering: ${nums.join(', ')}`,
  );
  assert.strictEqual(new Set(nums).size, nums.length, `build-mode step numbers must be unique: ${nums.join(', ')}`);
});

test('Case S6 — the port path names the pattern-mapping page (§8.1)', () => {
  const step = surfaceSpecStep();
  assert.match(step, /redesign/, 'the step must name the `mode: redesign` path');
  assert.match(
    step, /refs\/<surface>\/pattern-mapping\.md/,
    'a port writes the pattern-mapping page (donor screen -> Eden pattern -> deltas) FIRST — §8.1',
  );
});

test('Case S7 — every pre-TRD build-mode step survives the renumbering', () => {
  const titles = buildModeSteps().map((s) => s.title);
  for (const expected of PRE_TRD_BUILD_STEPS) {
    assert.ok(
      titles.includes(expected),
      `the pre-TRD build-mode step "${expected}" is gone — a renumbering that silently drops a step `
      + `(the pre-flight check, say) is a real loss. Now: ${JSON.stringify(titles)}`,
    );
  }
  // And the mode headings themselves.
  const md = fs.readFileSync(SKILL_MD, 'utf-8');
  for (const heading of ['## Build Mode', '## Review Mode', '## Visual Mode']) {
    assert.ok(md.includes(heading), `the "${heading}" heading must survive`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// R — design-stack-flutter.md's two new sections
// ═══════════════════════════════════════════════════════════════════════════════════════

// R3's baseline, captured from the pre-TRD file at commit f3e0cb3^ by extracting `^## ` from
// design-stack-flutter.md. The two new sections APPEND; they do not reorganise.
const PRE_TRD_STACK_SECTIONS = [
  '## 1. Typography',
  '## 2. Colour',
  '## 3. Icons',
  '## 4. Layout mechanics',
  '## 5. Motion',
  '## 6. Interactive states',
  '## 7. Performance',
  '## 8. Dependency verification',
];

test('Case R1 — `## Composition and semantics` states the four composition rules', () => {
  const section = stackSection(COMPOSITION_HEADING);
  assert.ok(section.length > 400, 'the section must actually say something');

  // A control's semantics identifier IS its Surface Spec control id. The probe finds controls
  // by identifier; a mismatch reads as `present` failing — "the control does not exist".
  assert.match(section, /semantics identifier/i, 'it must name the semantics identifier');
  assert.match(section, /control id/i, 'it must say the identifier equals the spec control id');

  // Exactly one tap action per identified control — the ExcludeSemantics + Semantics(onTap:)
  // double-declaration trap, which fires twice per activation.
  assert.match(section, /ExcludeSemantics/, 'it must name the ExcludeSemantics half of the trap');
  assert.match(section, /Semantics\(onTap:/, 'it must name the Semantics(onTap:) half of the trap');
  assert.match(section, /fire twice per activation/, "it must name the spec's own `must_not` string for this defect");

  // Sibling control hit rects are disjoint.
  assert.match(section, /hit[ _]rect/i, 'it must state the hit-rect rule');
  assert.match(section, /disjoint/i, 'sibling control hit rects must be disjoint');
  assert.match(section, /disjoint_from/, 'it must name the spec key that declares a genuine nesting');

  // The geometry note: a SemanticsNode.rect is read from the node itself, through its transform.
  assert.match(section, /SemanticsNode\.rect/, 'it must name SemanticsNode.rect');
  assert.match(section, /container: true/, 'it must name the `container: true` that a nested Semantics needs');
  assert.match(section, /transform/i, 'the rect must be walked through the node transform, not taken from the parent');
});

test('Case R2 — `## Surface Spec` states the one-file rule and the re-lock rule', () => {
  const section = stackSection(SURFACE_SPEC_HEADING);
  assert.ok(section.length > 300, 'the section must actually say something');

  // What it is and where it lives.
  assert.match(section, /flutter\/ui_spec\/<surface>\.md/, 'it must name where a spec lives');
  assert.match(section, /front matter/i, 'it must say the front matter is the machine truth');

  // The one-file rule: everything else is DERIVED, never hand-edited.
  assert.match(section, /derived/i, 'the one-file rule: the manifest, sheet and capture list are derived');
  assert.match(section, /never hand-edited|not hand-edited/i, 'the one-file rule must forbid hand-editing the derived artefacts');
  assert.ok(
    extractUiArms(section).includes('spec render'),
    'it must name the arm that does the deriving — `df-tools … ui spec render`',
  );

  // The re-lock rule: a shape change clears the lock; a prose change does not. BOTH directions,
  // or the rule is half-stated and the half that is missing is the one people get wrong.
  assert.match(section, /routes/, 're-lock rule: `routes`');
  assert.match(section, /controls/, 're-lock rule: `controls`');
  assert.match(section, /states/, 're-lock rule: `states`');
  assert.match(section, /locked_sheet|clears the lock/i, 'it must say what a shape change clears');
  assert.match(
    section, /prose (change )?does not|not.*prose/i,
    'it must say a PROSE change does NOT clear the lock — the half of the rule that keeps the gate usable',
  );
});

test('Case R3 — the eight pre-existing sections are present, in order, and the two new ones append', () => {
  const md = fs.readFileSync(STACK_MD, 'utf-8');
  const headings = [...md.matchAll(/^## .*$/gm)].map((m) => m[0]);

  const positions = PRE_TRD_STACK_SECTIONS.map((h) => {
    const i = headings.indexOf(h);
    assert.ok(i !== -1, `the pre-existing section "${h}" is gone — this TRD appends, it does not reorganise`);
    return i;
  });
  assert.deepStrictEqual(
    positions, positions.slice().sort((a, b) => a - b),
    `the eight pre-existing sections must stay in their original order: ${headings.join(' | ')}`,
  );

  // The two new sections come after all eight.
  for (const h of [COMPOSITION_HEADING, SURFACE_SPEC_HEADING]) {
    const i = headings.indexOf(h);
    assert.ok(i !== -1, `the new section "${h}" must exist`);
    assert.ok(i > Math.max(...positions), `"${h}" must APPEND after the eight existing sections, not interleave`);
  }
});
