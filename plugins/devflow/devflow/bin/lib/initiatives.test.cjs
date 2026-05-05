'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtures = require('./__fixtures__/awareness-fixtures.cjs');

// MUST require the module under test — will fail (RED) until Task 3 creates it
const init = require('./initiatives.cjs');

// ─── Helper: tmpdir lifecycle ────────────────────────────────────────────────
function mkTmp(prefix = 'df-init-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ─── Group L — loadInitiatives ───────────────────────────────────────────────

test('L1: loadInitiatives returns [] when home dir missing', () => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'does-not-exist');
  const result = init.loadInitiatives({ home });
  assert.deepStrictEqual(result, []);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('L2: loadInitiatives returns [] when home is empty (no .md files)', () => {
  const home = mkTmp();
  const result = init.loadInitiatives({ home });
  assert.deepStrictEqual(result, []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('L3: loadInitiatives reads 2 well-formed files and returns 2 initiatives', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'alpha', title: 'Alpha Initiative' },
      { slug: 'beta', title: 'Beta Initiative' },
    ],
  });
  const result = init.loadInitiatives({ home });
  assert.strictEqual(result.length, 2);
  const slugs = result.map(r => r.slug).sort();
  assert.deepStrictEqual(slugs, ['alpha', 'beta']);
  // Each entry has the locked frontmatter fields
  for (const r of result) {
    assert.ok(r.github_issue, 'github_issue present');
    assert.ok(Array.isArray(r.key_repos), 'key_repos is array');
    assert.ok(r.parent_project, 'parent_project present');
    assert.ok(r.updated_at, 'updated_at present');
    assert.ok(typeof r.body === 'string', 'body is string');
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('L4: loadInitiatives ignores non-.md files (README, .DS_Store)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }],
  });
  // Write non-.md files
  fs.writeFileSync(path.join(home, 'README'), 'not an initiative', 'utf-8');
  fs.writeFileSync(path.join(home, '.DS_Store'), 'mac junk', 'utf-8');
  fs.writeFileSync(path.join(home, 'notes.txt'), 'text file', 'utf-8');
  const result = init.loadInitiatives({ home });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].slug, 'alpha');
  fs.rmSync(home, { recursive: true, force: true });
});

test('L5: loadInitiatives skips malformed-frontmatter file with stderr warning, returns well-formed siblings', () => {
  const home = mkTmp();
  // Write one valid initiative
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'good-initiative', title: 'Good One' }],
  });
  // Write a malformed file (no frontmatter)
  fs.writeFileSync(path.join(home, 'bad-initiative.md'), '# Just a heading\nNo frontmatter here.\n', 'utf-8');

  // Capture stderr
  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrChunks.push(String(chunk));
    return origWrite(chunk, ...rest);
  };

  let result;
  try {
    result = init.loadInitiatives({ home });
  } finally {
    process.stderr.write = origWrite;
  }

  assert.strictEqual(result.length, 1, 'only well-formed initiative returned');
  assert.strictEqual(result[0].slug, 'good-initiative');

  const stderrOutput = stderrChunks.join('');
  assert.ok(
    stderrOutput.includes('bad-initiative'),
    `stderr should mention the offending slug; got: ${stderrOutput}`,
  );
  fs.rmSync(home, { recursive: true, force: true });
});

test('L6: loadInitiatives defaults home to defaultInitiativesHome() when omitted', () => {
  // Test that defaultInitiativesHome() returns a path containing '.claude/devflow/initiatives'
  const defaultHome = init.defaultInitiativesHome();
  assert.ok(typeof defaultHome === 'string', 'defaultHome is a string');
  assert.ok(
    defaultHome.includes(path.join('.claude', 'devflow', 'initiatives')),
    `defaultHome should include .claude/devflow/initiatives; got: ${defaultHome}`,
  );
  // Calling loadInitiatives() without home uses the default path gracefully (returns [] if missing)
  const result = init.loadInitiatives({});
  assert.ok(Array.isArray(result), 'returns array even when default home may not exist');
});

test('L7: loadInitiatives is fault-tolerant: unreadable file is silently skipped with warning', () => {
  const home = mkTmp();
  // Write one valid initiative
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'good-initiative' }],
  });

  // Use _setRunFs to mock a file read failure for 'bad-initiative.md'
  const origFs = {
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    readdirSync: (p, opts) => fs.readdirSync(p, opts),
    existsSync: (p) => fs.existsSync(p),
    statSync: (p) => fs.statSync(p),
  };

  // Inject a mock that returns entries including 'bad-initiative.md' but throws on reading it
  const mockFs = {
    existsSync: (p) => fs.existsSync(p),
    readdirSync: (p, opts) => {
      const entries = fs.readdirSync(p, opts);
      // Add a phantom 'bad-initiative.md' entry
      return [...entries, 'bad-initiative.md'];
    },
    readFileSync: (p, enc) => {
      if (p.includes('bad-initiative.md')) {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      }
      return fs.readFileSync(p, enc);
    },
    statSync: (p) => fs.statSync(p),
  };

  init._setRunFs(mockFs);

  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    stderrChunks.push(String(chunk));
    return origWrite(chunk, ...rest);
  };

  let result;
  try {
    result = init.loadInitiatives({ home });
  } finally {
    init._setRunFs(null); // reset to real fs
    process.stderr.write = origWrite;
  }

  assert.strictEqual(result.length, 1, 'only readable initiative returned');
  assert.strictEqual(result[0].slug, 'good-initiative');
  const stderrOutput = stderrChunks.join('');
  assert.ok(stderrOutput.length > 0, 'warning emitted to stderr');
  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Group M — matchByRepo ───────────────────────────────────────────────────

test('M1: matchByRepo returns initiatives whose key_repos contains github_repo (exact match)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'alpha', key_repos: ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/devflow-claude'] },
      { slug: 'beta', key_repos: ['AO-Cyber-Systems/aodex'] },
    ],
  });
  const all = init.loadInitiatives({ home });
  const matched = init.matchByRepo(all, 'AO-Cyber-Systems/devflow');
  assert.strictEqual(matched.length, 1);
  assert.strictEqual(matched[0].slug, 'alpha');
  fs.rmSync(home, { recursive: true, force: true });
});

test('M2: matchByRepo([], github_repo) returns [] (empty input)', () => {
  const result = init.matchByRepo([], 'AO-Cyber-Systems/devflow');
  assert.deepStrictEqual(result, []);
});

test('M3: matchByRepo(initiatives, null) returns [] (null repo)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'alpha' }],
  });
  const all = init.loadInitiatives({ home });
  const result = init.matchByRepo(all, null);
  assert.deepStrictEqual(result, []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('M4: matchByRepo is case-sensitive (AO-Cyber-Systems/devflow != ao-cyber-systems/devflow)', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'alpha', key_repos: ['AO-Cyber-Systems/devflow'] },
    ],
  });
  const all = init.loadInitiatives({ home });
  const matchedCorrect = init.matchByRepo(all, 'AO-Cyber-Systems/devflow');
  const matchedLower = init.matchByRepo(all, 'ao-cyber-systems/devflow');
  assert.strictEqual(matchedCorrect.length, 1, 'exact case matches');
  assert.strictEqual(matchedLower.length, 0, 'wrong case does not match');
  fs.rmSync(home, { recursive: true, force: true });
});

test('M5: matchByRepo returns multiple matches when github_repo appears in multiple initiatives', () => {
  const home = mkTmp();
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'alpha', key_repos: ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/shared'] },
      { slug: 'beta', key_repos: ['AO-Cyber-Systems/shared', 'AO-Cyber-Systems/other'] },
      { slug: 'gamma', key_repos: ['AO-Cyber-Systems/unrelated'] },
    ],
  });
  const all = init.loadInitiatives({ home });
  const matched = init.matchByRepo(all, 'AO-Cyber-Systems/shared');
  assert.strictEqual(matched.length, 2);
  const matchedSlugs = matched.map(m => m.slug).sort();
  assert.deepStrictEqual(matchedSlugs, ['alpha', 'beta']);
  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Group F — formatInitiativeForPlanner ────────────────────────────────────

function buildParsedInitiative(overrides = {}) {
  return {
    slug: 'devflow-internal-alpha',
    github_issue: 'AO-Cyber-Systems/devflow#30',
    parent_project: 'AO-Cyber-Systems/PVT_kwDODwqLrc4BRsOP',
    key_repos: ['AO-Cyber-Systems/devflow'],
    updated_at: '2026-05-05T18:30:00Z',
    body: '',
    why: 'This initiative advances DevFlow adoption across AO Cyber Systems.',
    open_questions: ['How do we handle stale initiatives?', 'What is the sync cadence?'],
    sub_issues: [
      { ref: 'AO-Cyber-Systems/devflow-claude#9', title: 'DevFlow Coordination Layer', state: 'OPEN' },
      { ref: 'AO-Cyber-Systems/aodex#33', title: 'Go Backend Migration', state: 'OPEN' },
    ],
    status: '- **GitHub:** OPEN\n- **Project status:** In Progress\n- **Quarter:** Q2 2026',
    ...overrides,
  };
}

test('F1: formatInitiativeForPlanner returns markdown with slug heading and Why section', () => {
  const initiative = buildParsedInitiative();
  const result = init.formatInitiativeForPlanner(initiative);
  assert.ok(typeof result === 'string', 'returns string');
  assert.ok(result.includes('devflow-internal-alpha'), 'includes slug');
  assert.ok(result.includes('Why'), 'includes Why section');
});

test('F2: formatInitiativeForPlanner output <= MAX_FORMATTED_PLANNER_CHARS (1500) even with 5000-char Why', () => {
  const longWhy = 'A'.repeat(5000);
  const initiative = buildParsedInitiative({ why: longWhy });
  const result = init.formatInitiativeForPlanner(initiative);
  assert.ok(
    result.length <= init.MAX_FORMATTED_PLANNER_CHARS,
    `output length ${result.length} exceeds MAX_FORMATTED_PLANNER_CHARS (${init.MAX_FORMATTED_PLANNER_CHARS})`,
  );
});

test('F3: formatInitiativeForPlanner drops ## Status section entirely', () => {
  const initiative = buildParsedInitiative();
  const result = init.formatInitiativeForPlanner(initiative);
  assert.ok(!result.includes('**GitHub:**'), 'Status field not in output');
  assert.ok(!result.includes('Project status:'), 'Project status not in output');
});

test('F4: formatInitiativeForPlanner truncates Why to first paragraph (~500 chars max)', () => {
  const longWhy = 'Para one content. '.repeat(40) + '\n\nParagraph two starts here. ' + 'B'.repeat(1000);
  const initiative = buildParsedInitiative({ why: longWhy });
  const result = init.formatInitiativeForPlanner(initiative);
  // Should not include paragraph 2
  assert.ok(!result.includes('Paragraph two starts here'), 'second paragraph not included');
});

test('F5: formatInitiativeForPlanner lists at most 5 sub-issues; longer lists truncated with …and N more', () => {
  const manySubs = [
    { ref: 'Org/repo#1', title: 'Sub 1', state: 'OPEN' },
    { ref: 'Org/repo#2', title: 'Sub 2', state: 'OPEN' },
    { ref: 'Org/repo#3', title: 'Sub 3', state: 'OPEN' },
    { ref: 'Org/repo#4', title: 'Sub 4', state: 'OPEN' },
    { ref: 'Org/repo#5', title: 'Sub 5', state: 'OPEN' },
    { ref: 'Org/repo#6', title: 'Sub 6', state: 'OPEN' },
    { ref: 'Org/repo#7', title: 'Sub 7', state: 'OPEN' },
  ];
  const initiative = buildParsedInitiative({ sub_issues: manySubs });
  const result = init.formatInitiativeForPlanner(initiative);
  // Should mention "…and 2 more" since we have 7 and show max 5
  assert.ok(result.includes('…and 2 more') || result.includes('and 2 more'), `truncation message not found; result: ${result.slice(0, 500)}`);
  // Sub 6 and 7 should not appear by name
  assert.ok(!result.includes('Sub 6'), 'Sub 6 should be truncated');
});

test('F6: formatInitiativeForPlanner contains slug + github_issue ref for planner cross-reference', () => {
  const initiative = buildParsedInitiative();
  const result = init.formatInitiativeForPlanner(initiative);
  assert.ok(result.includes('devflow-internal-alpha'), 'slug present');
  assert.ok(result.includes('AO-Cyber-Systems/devflow#30'), 'github_issue ref present');
});

test('F7: formatInitiativeForPlanner renders gracefully with empty Why and Open Questions', () => {
  const initiative = buildParsedInitiative({ why: '', open_questions: [], sub_issues: [] });
  const result = init.formatInitiativeForPlanner(initiative);
  assert.ok(typeof result === 'string', 'returns string');
  assert.ok(result.length > 0, 'not empty');
  // No orphan headers — Why section should not appear if empty
  const lines = result.split('\n');
  const orphanHeaders = lines.filter((l, i) => {
    if (!l.startsWith('**')) return false;
    // check if next non-empty line is another header
    const next = lines.slice(i + 1).find(x => x.trim() !== '');
    return next && next.startsWith('**');
  });
  assert.strictEqual(orphanHeaders.length, 0, `found orphan headers: ${JSON.stringify(orphanHeaders)}`);
});

// ─── Group P — _parseInitiativeFile ─────────────────────────────────────────

test('P1: _parseInitiativeFile parses well-formed file with all 4 body sections', () => {
  const content = fixtures.buildInitiativeFile({
    slug: 'parse-test',
    github_issue: 'AO-Cyber-Systems/devflow#42',
    key_repos: ['AO-Cyber-Systems/devflow'],
    why: 'Because testing matters.',
    open_questions: ['Q1?', 'Q2?'],
    sub_issues: [{ ref: 'AO-Cyber-Systems/devflow#1', title: 'Sub One', state: 'OPEN' }],
    status: 'OPEN',
    project_status: 'In Progress',
  });
  const result = init._parseInitiativeFile(content);
  assert.ok(result !== null, 'result is not null');
  assert.strictEqual(result.slug, 'parse-test');
  assert.strictEqual(result.github_issue, 'AO-Cyber-Systems/devflow#42');
  assert.ok(Array.isArray(result.key_repos), 'key_repos is array');
  assert.ok(typeof result.body === 'string', 'body is string');
  assert.ok(typeof result.why === 'string', 'why is string');
  assert.ok(result.why.includes('testing matters'), 'why content correct');
  assert.ok(Array.isArray(result.open_questions), 'open_questions is array');
  assert.ok(Array.isArray(result.sub_issues), 'sub_issues is array');
  assert.ok(typeof result.status === 'string', 'status is string');
});

test('P2: _parseInitiativeFile returns null on missing/malformed frontmatter', () => {
  const noFrontmatter = '# Just a heading\n\nSome content without frontmatter.\n';
  const result = init._parseInitiativeFile(noFrontmatter);
  assert.strictEqual(result, null);

  // Missing slug field
  const missingSlug = '---\ngithub_issue: AO-Cyber-Systems/devflow#1\n---\n\n# Title\n';
  const result2 = init._parseInitiativeFile(missingSlug);
  assert.strictEqual(result2, null);
});

test('P3: _parseInitiativeFile correctly extracts body sections in any order', () => {
  // Build content with sections in reversed order (Status first, Why last)
  const content = [
    '---',
    'slug: order-test',
    'github_issue: AO-Cyber-Systems/devflow#99',
    'parent_project: AO-Cyber-Systems/PVT_test',
    'key_repos:',
    '  - AO-Cyber-Systems/devflow',
    'updated_at: 2026-01-01T00:00:00Z',
    '---',
    '',
    '# Order Test',
    '',
    '## Status',
    '',
    '- **GitHub:** OPEN',
    '',
    '## Linked Sub-issues',
    '',
    '- AO-Cyber-Systems/devflow#5 — Sub Five (OPEN)',
    '',
    '## Open Questions',
    '',
    '- Is order preserved?',
    '',
    '## Why',
    '',
    'Why content here.',
    '',
  ].join('\n');

  const result = init._parseInitiativeFile(content);
  assert.ok(result !== null, 'parsed successfully despite non-standard section order');
  assert.ok(result.why.includes('Why content here'), `why: ${result.why}`);
  assert.ok(result.open_questions.length > 0, 'open_questions extracted');
  assert.ok(result.sub_issues.length > 0, 'sub_issues extracted');
});

test('P4: _parseInitiativeFile returns null/empty for missing body section, not null for whole result', () => {
  // File with frontmatter but no body sections
  const content = [
    '---',
    'slug: no-sections',
    'github_issue: AO-Cyber-Systems/devflow#1',
    'parent_project: AO-Cyber-Systems/PVT_test',
    'key_repos:',
    '  - AO-Cyber-Systems/devflow',
    'updated_at: 2026-01-01T00:00:00Z',
    '---',
    '',
    '# Minimal Initiative',
    '',
    'Some body text but no ## sections.',
    '',
  ].join('\n');
  const result = init._parseInitiativeFile(content);
  assert.ok(result !== null, 'result not null — slug + fm present');
  assert.strictEqual(result.slug, 'no-sections');
  // Missing sections return empty string or empty array, not null for whole result
  assert.strictEqual(result.why, '', `why should be empty string; got: ${JSON.stringify(result.why)}`);
  assert.deepStrictEqual(result.open_questions, [], 'open_questions should be empty array');
  assert.deepStrictEqual(result.sub_issues, [], 'sub_issues should be empty array');
});

test('P5: _parseInitiativeFile sub-issues parser handles checkbox and non-checkbox bullets', () => {
  const content = [
    '---',
    'slug: checkbox-test',
    'github_issue: AO-Cyber-Systems/devflow#1',
    'parent_project: AO-Cyber-Systems/PVT_test',
    'key_repos:',
    '  - AO-Cyber-Systems/devflow',
    'updated_at: 2026-01-01T00:00:00Z',
    '---',
    '',
    '# Checkbox Test',
    '',
    '## Why',
    '',
    'Testing.',
    '',
    '## Open Questions',
    '',
    '- Q1?',
    '',
    '## Linked Sub-issues',
    '',
    '- AO-Cyber-Systems/devflow-claude#9 — DevFlow Coordination Layer (OPEN)',
    '- [ ] AO-Cyber-Systems/aodex#33 — Go Backend Migration (OPEN)',
    '- [x] AO-Cyber-Systems/aosentry#20 — Commercial Launch (CLOSED)',
    '',
    '## Status',
    '',
    '- **GitHub:** OPEN',
    '',
  ].join('\n');
  const result = init._parseInitiativeFile(content);
  assert.ok(result !== null);
  assert.strictEqual(result.sub_issues.length, 3, `expected 3 sub_issues, got: ${JSON.stringify(result.sub_issues)}`);
  assert.strictEqual(result.sub_issues[0].ref, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(result.sub_issues[1].ref, 'AO-Cyber-Systems/aodex#33');
  assert.strictEqual(result.sub_issues[2].ref, 'AO-Cyber-Systems/aosentry#20');
  assert.strictEqual(result.sub_issues[2].state, 'CLOSED');
});

// ─── Group T — _truncateWhy ──────────────────────────────────────────────────

test('T1: _truncateWhy returns input unchanged when <= MAX_WHY_CHARS', () => {
  const short = 'Short text.';
  const result = init._truncateWhy(short);
  assert.strictEqual(result, short);
});

test('T2: _truncateWhy truncates at last paragraph break <= MAX_WHY_CHARS and appends ellipsis', () => {
  // Construct text where paragraph break falls at a good boundary:
  // p1 = 800 chars (> 750, which is 50% of 1500), p2 starts at 802, p3 starts at 1204
  // _truncateWhy slices at 1500, finds last \n\n before 1500 — the one at position 800
  // Result should stop at end of p1 (not include p2 or p3)
  const paragraph1 = 'A'.repeat(800);
  const paragraph2 = 'B'.repeat(200);
  const paragraph3 = 'C'.repeat(2000);
  const text = paragraph1 + '\n\n' + paragraph2 + '\n\n' + paragraph3;

  // text is > MAX_WHY_CHARS (1500), should truncate at a paragraph break
  const result = init._truncateWhy(text);
  assert.ok(result.length <= init.MAX_WHY_CHARS + 10, `result too long: ${result.length}`);
  assert.ok(result.endsWith('…') || result.endsWith('\n\n…'), `should end with ellipsis; got: ${result.slice(-20)}`);
  // The p1 content (800 A's) should be preserved, p3 (C's) should not appear
  assert.ok(result.includes('A'), 'first paragraph content preserved');
  assert.ok(!result.includes('C'), 'third paragraph content not in output');
});

test('T3: _truncateWhy falls back to hard truncation when no paragraph break exists', () => {
  const longLine = 'A'.repeat(3000);
  const result = init._truncateWhy(longLine);
  assert.ok(result.length <= init.MAX_WHY_CHARS + 5, `result too long: ${result.length}`);
  assert.ok(result.endsWith('…'), `should end with ellipsis; got: ${result.slice(-10)}`);
});

test('T4: _truncateWhy custom max argument overrides default', () => {
  const text = 'Hello world, this is a test sentence. ' + 'X'.repeat(200);
  const result = init._truncateWhy(text, 50);
  assert.ok(result.length <= 55, `result too long for custom max: ${result.length}`);
  assert.ok(result.endsWith('…'), 'ends with ellipsis');
});
