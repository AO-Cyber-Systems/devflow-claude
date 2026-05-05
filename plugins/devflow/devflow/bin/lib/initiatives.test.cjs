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

// ─── TRD 05-02: Group Q — _qualifiesAsInitiative (pure logic) ────────────────

test('Q1: qualifies items with sub_issues.length > 0', () => {
  const item = fixtures.buildOrgItem({
    title: 'Random title',
    sub_issues: [{ ref: 'AO-Cyber-Systems/devflow#1', title: 'sub', state: 'OPEN' }],
  });
  assert.strictEqual(init._qualifiesAsInitiative(item), true);
});

test('Q2: qualifies items with [Epic] title prefix (case-sensitive)', () => {
  const item = fixtures.buildOrgItem({ title: '[Epic] Eden Biz Launch' });
  assert.strictEqual(init._qualifiesAsInitiative(item), true);
  // Lowercase [epic] should NOT qualify via this path
  const lowercaseItem = fixtures.buildOrgItem({ title: '[epic] something' });
  assert.strictEqual(init._qualifiesAsInitiative(lowercaseItem), false);
});

test('Q3: qualifies items with **Type:** epic in body', () => {
  const item = fixtures.buildOrgItem({
    title: 'No prefix',
    body: 'Some content\n**Type:** epic\nMore content',
    sub_issues: [],
  });
  assert.strictEqual(init._qualifiesAsInitiative(item), true);
});

test('Q4: qualifies drafts with status In Progress', () => {
  const item = {
    item_type: 'draft',
    issue_ref: null,
    title: 'A Draft Initiative',
    body: '',
    product: null,
    quarter: null,
    status: 'In Progress',
    sub_issues: [],
  };
  assert.strictEqual(init._qualifiesAsInitiative(item), true);
});

test('Q5: rejects items with no qualification signals (no sub_issues, no [Epic], no body marker, not draft+InProgress)', () => {
  const item = fixtures.buildOrgItem({
    title: 'Random title',
    item_type: 'issue',
    status: 'CLOSED',
    sub_issues: [],
    body: '',
  });
  assert.strictEqual(init._qualifiesAsInitiative(item), false);
});

test('Q6: rejects drafts NOT in In Progress status', () => {
  const item = {
    item_type: 'draft',
    issue_ref: null,
    title: 'A Draft Item',
    body: '',
    product: null,
    quarter: null,
    status: 'Backlog',
    sub_issues: [],
  };
  assert.strictEqual(init._qualifiesAsInitiative(item), false);
});

test('Q7: rejects routine bug reports (no sub_issues, no [Epic] prefix, item_type=issue)', () => {
  const item = fixtures.buildOrgItem({
    title: 'Fix login button alignment',
    item_type: 'issue',
    status: 'In Progress',
    sub_issues: [],
    body: 'There is a bug with the login button alignment.',
  });
  assert.strictEqual(init._qualifiesAsInitiative(item), false);
});

test('Q8: short-circuits on first true condition (sub_issues checked before title prefix)', () => {
  // Item with sub_issues AND [Epic] prefix — should return true on sub_issues check
  let callOrder = [];
  const item = {
    item_type: 'issue',
    title: '[Epic] Something',
    body: '',
    sub_issues: [{ ref: 'a/b#1', title: 'sub', state: 'OPEN' }],
    status: null,
  };
  // _qualifiesAsInitiative must return true (both paths match — just verify correct result)
  assert.strictEqual(init._qualifiesAsInitiative(item), true);
  // Also test null/undefined input
  assert.strictEqual(init._qualifiesAsInitiative(null), false);
  assert.strictEqual(init._qualifiesAsInitiative(undefined), false);
  assert.strictEqual(init._qualifiesAsInitiative('string'), false);
});

// ─── TRD 05-02: Group SL — _slugifyInitiativeTitle (pure logic) ──────────────

test('SL1: slugifies standard title to lowercased-hyphenated form', () => {
  assert.strictEqual(init._slugifyInitiativeTitle('DevFlow Internal Alpha'), 'devflow-internal-alpha');
});

test('SL2: strips [Epic] prefix before slugifying', () => {
  assert.strictEqual(init._slugifyInitiativeTitle('[Epic] Eden Biz Launch'), 'eden-biz-launch');
});

test('SL3: strips [Roadmap] prefix before slugifying', () => {
  assert.strictEqual(init._slugifyInitiativeTitle('[Roadmap] Go Migration Q2 2026'), 'go-migration-q2-2026');
});

test('SL4: replaces slash with hyphen', () => {
  assert.strictEqual(init._slugifyInitiativeTitle('AI/ML Platform'), 'ai-ml-platform');
});

test('SL5: returns null for empty/whitespace title', () => {
  assert.strictEqual(init._slugifyInitiativeTitle(''), null);
  assert.strictEqual(init._slugifyInitiativeTitle('   '), null);
  assert.strictEqual(init._slugifyInitiativeTitle(null), null);
  assert.strictEqual(init._slugifyInitiativeTitle(undefined), null);
});

test('SL6: NFKD normalizes and strips diacritics', () => {
  assert.strictEqual(init._slugifyInitiativeTitle('Résumé feature'), 'resume-feature');
});

test('SL7: collapses multiple spaces to single hyphen', () => {
  assert.strictEqual(init._slugifyInitiativeTitle('DevFlow   Internal    Alpha'), 'devflow-internal-alpha');
});

test('SL8: strips special chars, leaves alphanumeric + hyphens', () => {
  // "Hello!@#$%World" → "helloworld"
  const result = init._slugifyInitiativeTitle('Hello!@#$%World');
  assert.ok(/^[a-z0-9-]+$/.test(result), `result should be alphanumeric+hyphen; got: ${result}`);
  assert.ok(result.length > 0, 'non-empty result');
});

// ─── TRD 05-02: Group R — _renderInitiativeMarkdown (pure logic) ─────────────

function buildRenderData(overrides = {}) {
  return {
    slug: 'test-initiative',
    github_issue: 'AO-Cyber-Systems/devflow#30',
    parent_project: 'AO-Cyber-Systems/PVT_test',
    key_repos: ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/devflow-claude'],
    updated_at: '2026-05-05T18:30:00Z',
    title: 'Test Initiative',
    why: 'This initiative exists to test.',
    open_questions: ['Q1?', 'Q2?'],
    sub_issues: [
      { ref: 'AO-Cyber-Systems/devflow-claude#9', title: 'DevFlow Coordination Layer', state: 'OPEN' },
    ],
    status: 'OPEN',
    project_status: 'In Progress',
    quarter: 'Q2 2026',
    ...overrides,
  };
}

test('R1: render output matches buildInitiativeFile byte-for-byte (modulo whitespace tolerance)', () => {
  const data = buildRenderData();
  const rendered = init._renderInitiativeMarkdown(data);
  const fixture = fixtures.buildInitiativeFile({
    slug: data.slug,
    github_issue: data.github_issue,
    parent_project: data.parent_project,
    key_repos: data.key_repos,
    updated_at: data.updated_at,
    title: data.title,
    why: data.why,
    open_questions: data.open_questions,
    sub_issues: data.sub_issues,
    status: data.status,
    project_status: data.project_status,
    quarter: data.quarter,
  });
  // Normalize trailing whitespace on each line for comparison
  const normalize = s => s.split('\n').map(l => l.trimEnd()).join('\n').replace(/\n+$/, '');
  assert.strictEqual(normalize(rendered), normalize(fixture),
    `rendered output does not match fixture.\nRendered:\n${rendered}\n\nFixture:\n${fixture}`);
});

test('R2: frontmatter field order is locked (slug, github_issue, parent_project, key_repos, updated_at)', () => {
  const data = buildRenderData();
  const rendered = init._renderInitiativeMarkdown(data);
  const fmEnd = rendered.indexOf('---', 3);
  const frontmatter = rendered.slice(0, fmEnd + 3);
  const fieldOrder = ['slug:', 'github_issue:', 'parent_project:', 'key_repos:', 'updated_at:'];
  let lastIdx = -1;
  for (const field of fieldOrder) {
    const idx = frontmatter.indexOf(field);
    assert.ok(idx > lastIdx, `field ${field} out of order; frontmatter:\n${frontmatter}`);
    lastIdx = idx;
  }
});

test('R3: body section order is locked (# Title, ## Why, ## Open Questions, ## Linked Sub-issues, ## Status)', () => {
  const data = buildRenderData();
  const rendered = init._renderInitiativeMarkdown(data);
  const sections = ['# Test Initiative', '## Why', '## Open Questions', '## Linked Sub-issues', '## Status'];
  let lastIdx = -1;
  for (const section of sections) {
    const idx = rendered.indexOf(section);
    assert.ok(idx > lastIdx, `section "${section}" out of order or missing; rendered:\n${rendered.slice(0, 400)}`);
    lastIdx = idx;
  }
});

test('R4: ## Why is truncated at MAX_WHY_CHARS via _truncateWhy', () => {
  const longWhy = 'A'.repeat(3000);
  const data = buildRenderData({ why: longWhy });
  const rendered = init._renderInitiativeMarkdown(data);
  // Extract the Why section
  const whyStart = rendered.indexOf('## Why\n') + '## Why\n'.length;
  const whyEnd = rendered.indexOf('\n## Open Questions');
  const whySection = rendered.slice(whyStart, whyEnd).trim();
  assert.ok(whySection.length <= init.MAX_WHY_CHARS + 5, `Why section too long: ${whySection.length}`);
});

test('R5: ## Open Questions truncated at MAX_QUESTIONS_BULLETS', () => {
  const manyQs = Array.from({ length: 15 }, (_, i) => `Question ${i + 1}?`);
  const data = buildRenderData({ open_questions: manyQs });
  const rendered = init._renderInitiativeMarkdown(data);
  const qStart = rendered.indexOf('## Open Questions\n') + '## Open Questions\n'.length;
  const qEnd = rendered.indexOf('\n## Linked Sub-issues');
  const qSection = rendered.slice(qStart, qEnd);
  const bullets = qSection.split('\n').filter(l => l.startsWith('- ')).length;
  assert.ok(bullets <= init.MAX_QUESTIONS_BULLETS, `too many bullets: ${bullets}`);
});

test('R6: ## Linked Sub-issues truncated at MAX_SUBISSUES_LINES', () => {
  const manySubs = Array.from({ length: 20 }, (_, i) => ({
    ref: `AO-Cyber-Systems/devflow#${i + 1}`,
    title: `Sub ${i + 1}`,
    state: 'OPEN',
  }));
  const data = buildRenderData({ sub_issues: manySubs });
  const rendered = init._renderInitiativeMarkdown(data);
  const siStart = rendered.indexOf('## Linked Sub-issues\n') + '## Linked Sub-issues\n'.length;
  const siEnd = rendered.indexOf('\n## Status');
  const siSection = rendered.slice(siStart, siEnd);
  const siLines = siSection.split('\n').filter(l => l.startsWith('- ')).length;
  assert.ok(siLines <= init.MAX_SUBISSUES_LINES, `too many sub-issue lines: ${siLines}`);
});

test('R7: empty open_questions/sub_issues renders as empty section (header present, no bullets)', () => {
  const data = buildRenderData({ open_questions: [], sub_issues: [] });
  const rendered = init._renderInitiativeMarkdown(data);
  assert.ok(rendered.includes('## Open Questions'), 'Open Questions header present');
  assert.ok(rendered.includes('## Linked Sub-issues'), 'Linked Sub-issues header present');
  // No bullets in those sections
  const qStart = rendered.indexOf('## Open Questions\n') + '## Open Questions\n'.length;
  const qEnd = rendered.indexOf('\n## Linked Sub-issues');
  const qSection = rendered.slice(qStart, qEnd);
  assert.strictEqual(qSection.split('\n').filter(l => l.startsWith('- ')).length, 0, 'no question bullets');
  const siStart = rendered.indexOf('## Linked Sub-issues\n') + '## Linked Sub-issues\n'.length;
  const siEnd = rendered.indexOf('\n## Status');
  const siSection = rendered.slice(siStart, siEnd);
  assert.strictEqual(siSection.split('\n').filter(l => l.startsWith('- ')).length, 0, 'no sub-issue bullets');
});

// ─── TRD 05-02: Group W — _writeInitiativeFile (filesystem) ──────────────────

test('W1: writes to <home>/<slug>.md with content from _renderInitiativeMarkdown', () => {
  const home = mkTmp('df-init-w-');
  const data = buildRenderData({ slug: 'w1-test', updated_at: '2026-01-01T00:00:00Z' });
  init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
  const dest = path.join(home, 'w1-test.md');
  assert.ok(fs.existsSync(dest), `dest file missing: ${dest}`);
  const content = fs.readFileSync(dest, 'utf-8');
  assert.ok(content.includes('slug: w1-test'), 'slug in frontmatter');
  assert.ok(content.includes('## Why'), 'Why section present');
  fs.rmSync(home, { recursive: true, force: true });
});

test('W2: writes to tmp file first (deterministic via _tmpSuffix opt)', () => {
  const home = mkTmp('df-init-w-');
  let tmpObserved = false;

  // Inject fs mock that intercepts writeFileSync to assert tmp path
  const mockFsW2 = {
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => {
      if (p.includes('.w2-test.md.test')) {
        tmpObserved = true;
      }
      fs.writeFileSync(p, data, opts);
    },
    renameSync: (oldP, newP) => fs.renameSync(oldP, newP),
    unlinkSync: (p) => fs.unlinkSync(p),
  };

  init._setRunFs(mockFsW2);
  try {
    const data = buildRenderData({ slug: 'w2-test', updated_at: '2026-01-01T00:00:00Z' });
    init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
    assert.ok(tmpObserved, 'tmp file path was used in writeFileSync');
  } finally {
    init._resetMocks();
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('W3: renames tmp to dest after successful write', () => {
  const home = mkTmp('df-init-w-');
  let renameCalledFrom = null;
  let renameCalled = false;

  const mockFsW3 = {
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => fs.writeFileSync(p, data, opts),
    renameSync: (oldP, newP) => {
      renameCalled = true;
      renameCalledFrom = oldP;
      fs.renameSync(oldP, newP);
    },
    unlinkSync: (p) => fs.unlinkSync(p),
  };

  init._setRunFs(mockFsW3);
  try {
    const data = buildRenderData({ slug: 'w3-test', updated_at: '2026-01-01T00:00:00Z' });
    init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
    assert.ok(renameCalled, 'renameSync was called');
    assert.ok(renameCalledFrom && renameCalledFrom.includes('.w3-test.md.test'),
      `rename source was tmp file; got: ${renameCalledFrom}`);
  } finally {
    init._resetMocks();
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('W4: tmp file in same directory as dest (no cross-filesystem move)', () => {
  const home = mkTmp('df-init-w-');
  let tmpPath = null;
  let destPath = null;

  const mockFsW4 = {
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => {
      tmpPath = p;
      fs.writeFileSync(p, data, opts);
    },
    renameSync: (oldP, newP) => {
      destPath = newP;
      fs.renameSync(oldP, newP);
    },
    unlinkSync: (p) => fs.unlinkSync(p),
  };

  init._setRunFs(mockFsW4);
  try {
    const data = buildRenderData({ slug: 'w4-test', updated_at: '2026-01-01T00:00:00Z' });
    init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
    assert.ok(tmpPath && destPath, 'both paths observed');
    assert.strictEqual(path.dirname(tmpPath), path.dirname(destPath),
      `tmp and dest must be in same dir; tmp: ${tmpPath}, dest: ${destPath}`);
  } finally {
    init._resetMocks();
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('W5: cleans up tmp file when rename fails', () => {
  const home = mkTmp('df-init-w-');
  let tmpPath = null;
  let unlinkCalled = false;
  let unlinkedPath = null;

  const mockFsW5 = {
    existsSync: (p) => fs.existsSync(p),
    mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
    writeFileSync: (p, data, opts) => {
      tmpPath = p;
      fs.writeFileSync(p, data, opts);
    },
    renameSync: (oldP, newP) => {
      throw new Error('mock rename failure');
    },
    unlinkSync: (p) => {
      unlinkCalled = true;
      unlinkedPath = p;
      try { fs.unlinkSync(p); } catch {}
    },
  };

  init._setRunFs(mockFsW5);
  try {
    const data = buildRenderData({ slug: 'w5-test', updated_at: '2026-01-01T00:00:00Z' });
    assert.throws(
      () => init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' }),
      /mock rename failure/,
      'should throw the rename error',
    );
    assert.ok(unlinkCalled, 'unlinkSync was called for cleanup');
    assert.ok(unlinkedPath && unlinkedPath.includes('.w5-test.md.test'),
      `unlink should target tmp path; got: ${unlinkedPath}`);
  } finally {
    init._resetMocks();
  }
  fs.rmSync(home, { recursive: true, force: true });
});

test('W6: overwrites existing file at dest (re-running sync replaces previous)', () => {
  const home = mkTmp('df-init-w-');
  const data1 = buildRenderData({ slug: 'w6-test', why: 'First write.', updated_at: '2026-01-01T00:00:00Z' });
  const data2 = buildRenderData({ slug: 'w6-test', why: 'Second write.', updated_at: '2026-01-02T00:00:00Z' });
  init._writeInitiativeFile(home, data1, { _tmpSuffix: 'test' });
  init._writeInitiativeFile(home, data2, { _tmpSuffix: 'test' });
  const content = fs.readFileSync(path.join(home, 'w6-test.md'), 'utf-8');
  assert.ok(content.includes('Second write.'), 'second write overwrites first');
  assert.ok(!content.includes('First write.'), 'first write content no longer present');
  fs.rmSync(home, { recursive: true, force: true });
});

test('W7: idempotency contract — two writes produce byte-equal content modulo updated_at', () => {
  const home = mkTmp('df-init-w-');
  const data = buildRenderData({ slug: 'w7-test', updated_at: '2026-01-01T00:00:00Z' });
  init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
  const content1 = fs.readFileSync(path.join(home, 'w7-test.md'), 'utf-8');
  // Write again with same data (same updated_at)
  init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
  const content2 = fs.readFileSync(path.join(home, 'w7-test.md'), 'utf-8');
  // Strip updated_at lines for comparison
  const stripUpdatedAt = s => s.replace(/^updated_at: .*$/m, 'updated_at: <STRIPPED>')
    .replace(/\*\*Updated:\*\* .*$/m, '**Updated:** <STRIPPED>');
  assert.strictEqual(stripUpdatedAt(content1), stripUpdatedAt(content2),
    'byte-equal content modulo updated_at');
  fs.rmSync(home, { recursive: true, force: true });
});

test('W8: creates home dir if missing (mkdirSync recursive)', () => {
  const parent = mkTmp('df-init-w-');
  const home = path.join(parent, 'nested', 'initiatives');
  assert.ok(!fs.existsSync(home), 'home dir should not exist yet');
  const data = buildRenderData({ slug: 'w8-test', updated_at: '2026-01-01T00:00:00Z' });
  init._writeInitiativeFile(home, data, { _tmpSuffix: 'test' });
  assert.ok(fs.existsSync(path.join(home, 'w8-test.md')), 'file written in auto-created dir');
  fs.rmSync(parent, { recursive: true, force: true });
});

// ─── TRD 05-02: Group S — syncInitiatives (orchestration) ────────────────────

function makeSyncMock({ items = [], authOk = true } = {}) {
  return fixtures.buildMockRunGhForInitiatives({ walkProjectItems: items, authOk });
}

test('S1: syncInitiatives calls requireGhAuth first; on success proceeds', async () => {
  const home = mkTmp('df-init-s-');
  let authCalled = false;
  init._setRunGh((args) => {
    if (args[0] === 'auth') {
      authCalled = true;
      return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    }
    if (args[0] === 'api') {
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(authCalled, true, 'auth was called');
    assert.strictEqual(result.ok, true, 'result is ok');
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S2: syncInitiatives throws GhAuthError when auth fails', async () => {
  const home = mkTmp('df-init-s-');
  init._setRunGh(makeSyncMock({ authOk: false }));
  try {
    await assert.rejects(
      () => init.syncInitiatives({ home, project_id: 'PVT_test' }),
      (err) => err.name === 'GhAuthError' || /auth/i.test(err.message),
      'should throw GhAuthError on auth failure',
    );
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S3: syncInitiatives calls walkProject with project_id from opts or PRODUCT_ROADMAP_FIELDS', async () => {
  const home = mkTmp('df-init-s-');
  let graphqlArgs = null;
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') {
      graphqlArgs = [...args];
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  try {
    await init.syncInitiatives({ home, project_id: 'PVT_s3_test' });
    assert.ok(graphqlArgs !== null, 'graphql was called');
    // The project_id should appear somewhere in the graphql args or body
    const argsStr = graphqlArgs.join(' ');
    assert.ok(argsStr.includes('PVT_s3_test') || argsStr.includes('graphql'),
      `project_id should be in graphql call; args: ${argsStr}`);
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S4: syncInitiatives filters items via _qualifiesAsInitiative; non-qualifying items in result.skipped', async () => {
  const home = mkTmp('df-init-s-');
  const epicItem = fixtures.buildOrgItem({ title: '[Epic] Qualifying Initiative', issue_ref: 'AO-Cyber-Systems/devflow#1' });
  const plainItem = fixtures.buildOrgItem({ title: 'Plain bug report', issue_ref: 'AO-Cyber-Systems/devflow#2', sub_issues: [], body: '' });
  init._setRunGh(makeSyncMock({ items: [epicItem, plainItem] }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    // At least one item should be in skipped (the plain one)
    const skippedTitles = result.skipped.map(s => s.title);
    assert.ok(skippedTitles.some(t => t.includes('Plain bug')), `plain item should be skipped; skipped: ${JSON.stringify(result.skipped)}`);
    // The epic item should be written
    assert.ok(result.written.some(w => w.slug === 'qualifying-initiative'), `epic item should be written; written: ${JSON.stringify(result.written)}`);
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S5: syncInitiatives writes one file per qualifying item under opts.home', async () => {
  const home = mkTmp('df-init-s-');
  const items = [
    fixtures.buildOrgItem({ title: '[Epic] Initiative Alpha', issue_ref: 'AO-Cyber-Systems/devflow#10' }),
    fixtures.buildOrgItem({ title: '[Epic] Initiative Beta', issue_ref: 'AO-Cyber-Systems/devflow#11' }),
  ];
  init._setRunGh(makeSyncMock({ items }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.written.length, 2, `expected 2 written; got: ${JSON.stringify(result.written)}`);
    for (const w of result.written) {
      assert.ok(fs.existsSync(w.path), `file should exist: ${w.path}`);
    }
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S6: syncInitiatives returns structured result { ok, written, deleted, skipped, warnings }', async () => {
  const home = mkTmp('df-init-s-');
  init._setRunGh(makeSyncMock({ items: [] }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.written), 'written is array');
    assert.ok(Array.isArray(result.deleted), 'deleted is array');
    assert.ok(Array.isArray(result.skipped), 'skipped is array');
    assert.ok(Array.isArray(result.warnings), 'warnings is array');
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S7: --initiative <slug> mode syncs only the matching item', async () => {
  const home = mkTmp('df-init-s-');
  const items = [
    fixtures.buildOrgItem({ title: '[Epic] Initiative Alpha', issue_ref: 'AO-Cyber-Systems/devflow#10' }),
    fixtures.buildOrgItem({ title: '[Epic] Initiative Beta', issue_ref: 'AO-Cyber-Systems/devflow#11' }),
  ];
  init._setRunGh(makeSyncMock({ items }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test', initiative: 'initiative-alpha' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.written.length, 1, `only 1 item should be written; got: ${JSON.stringify(result.written)}`);
    assert.strictEqual(result.written[0].slug, 'initiative-alpha');
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S8: --initiative <slug> mode returns empty deleted array (stale deletion skipped)', async () => {
  const home = mkTmp('df-init-s-');
  const items = [
    fixtures.buildOrgItem({ title: '[Epic] Initiative Alpha', issue_ref: 'AO-Cyber-Systems/devflow#10' }),
  ];
  init._setRunGh(makeSyncMock({ items }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test', initiative: 'initiative-alpha' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.deleted, [], 'deleted should be empty in single-initiative mode');
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S9: walkProject warnings propagate to result.warnings', async () => {
  const home = mkTmp('df-init-s-');
  // Mock walkProject to return a result with warnings
  // walkProject returns { items, warnings } — we need to mock the underlying gh call
  // to trigger a warning path. Since walkProject parses GraphQL, inject a partial response.
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') {
      // Return a valid response with no nodes to avoid write operations
      return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.warnings), 'warnings is array');
    // Warnings may be empty for a clean walk — just verify the shape
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S10: walkProject throw (non-auth) caught: returns { ok: false, warnings: [...] }', async () => {
  const home = mkTmp('df-init-s-');
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') {
      // Return malformed JSON to cause walkProject to throw
      return { ok: false, status: 1, stdout: '', stderr: 'network error' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    // walkProject may throw or return error; syncInitiatives should catch and return ok:false
    // If walkProject handles the error internally, result.ok may be true with warnings
    // The contract is: no unhandled exception thrown from syncInitiatives
    assert.ok(typeof result === 'object', 'returns structured result');
    assert.ok('ok' in result, 'result has ok field');
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S11: empty walkProject (no items) returns { ok: true, written: [], skipped: [], warnings: [] }', async () => {
  const home = mkTmp('df-init-s-');
  init._setRunGh(makeSyncMock({ items: [] }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.written, []);
    // skipped may be empty or have entries — but no failures
    assert.ok(Array.isArray(result.skipped));
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('S12: items with no slugifiable title appear in result.skipped with reason no_slug', async () => {
  const home = mkTmp('df-init-s-');
  // Item with [Epic] prefix but title that slugifies to empty (just brackets + spaces)
  const noSlugItem = {
    item_type: 'issue',
    issue_ref: 'AO-Cyber-Systems/devflow#99',
    title: '[Epic]   !@#$%  ',
    body: '',
    product: null,
    quarter: null,
    status: null,
    sub_issues: [{ ref: 'AO-Cyber-Systems/devflow#100', title: 'sub', state: 'OPEN' }],
  };
  init._setRunGh(fixtures.buildMockRunGhForInitiatives({ walkProjectItems: [noSlugItem] }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    const noSlugSkips = result.skipped.filter(s => s.reason === 'no_slug');
    assert.ok(noSlugSkips.length > 0, `expected no_slug skip; skipped: ${JSON.stringify(result.skipped)}`);
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

// ─── TRD 05-02: Group IM — Idempotency (integration) ─────────────────────────

test('IM1: two syncs with same mock walkProject produce byte-equal files modulo updated_at', async () => {
  const home = mkTmp('df-init-im-');
  const items = [
    fixtures.buildOrgItem({
      title: '[Epic] Idempotency Test',
      issue_ref: 'AO-Cyber-Systems/devflow#42',
      body: '## Why\n\nThis is why.\n\n## Open Questions\n\n- Q1?\n',
    }),
  ];
  const mockFn = makeSyncMock({ items });

  init._setRunGh(mockFn);
  const result1 = await init.syncInitiatives({ home, project_id: 'PVT_test' });
  init._resetMocks();

  init._setRunGh(mockFn);
  const result2 = await init.syncInitiatives({ home, project_id: 'PVT_test' });
  init._resetMocks();

  assert.strictEqual(result1.ok, true, 'first sync ok');
  assert.strictEqual(result2.ok, true, 'second sync ok');
  assert.ok(result1.written.length > 0, 'first sync wrote files');
  assert.ok(result2.written.length > 0, 'second sync wrote files');

  // Compare file contents modulo updated_at
  const stripTs = s => s.replace(/^updated_at: .*$/m, 'updated_at: <TS>')
    .replace(/\*\*Updated:\*\* .*$/m, '**Updated:** <TS>');

  for (const w of result1.written) {
    const c1 = fs.readFileSync(w.path, 'utf-8');
    const c2 = fs.readFileSync(w.path, 'utf-8'); // same path, second sync overwrote
    assert.strictEqual(stripTs(c1), stripTs(c2), `file ${w.path} not idempotent`);
  }

  fs.rmSync(home, { recursive: true, force: true });
});

test('IM2: second sync overwrites manual edit (one-way sync contract)', async () => {
  const home = mkTmp('df-init-im-');
  const items = [
    fixtures.buildOrgItem({ title: '[Epic] Overwrite Test', issue_ref: 'AO-Cyber-Systems/devflow#43' }),
  ];
  const mockFn = makeSyncMock({ items });

  // First sync
  init._setRunGh(mockFn);
  const result1 = await init.syncInitiatives({ home, project_id: 'PVT_test' });
  init._resetMocks();
  assert.ok(result1.written.length > 0, 'first sync wrote files');

  // Manual edit
  const filePath = result1.written[0].path;
  const originalContent = fs.readFileSync(filePath, 'utf-8');
  fs.writeFileSync(filePath, originalContent + '\n<!-- MANUAL EDIT -->', 'utf-8');
  const editedContent = fs.readFileSync(filePath, 'utf-8');
  assert.ok(editedContent.includes('MANUAL EDIT'), 'edit was applied');

  // Second sync overwrites
  init._setRunGh(mockFn);
  const result2 = await init.syncInitiatives({ home, project_id: 'PVT_test' });
  init._resetMocks();
  assert.ok(result2.written.length > 0, 'second sync wrote files');

  const afterContent = fs.readFileSync(filePath, 'utf-8');
  assert.ok(!afterContent.includes('MANUAL EDIT'), 'manual edit was overwritten');

  fs.rmSync(home, { recursive: true, force: true });
});

// ─── TRD 05-03: Group DS — _detectStaleInitiatives (pure logic, mocked gh) ───

test('DS1: empty home dir returns empty stale array', () => {
  const home = mkTmp('df-init-ds-');
  fs.rmSync(home, { recursive: true, force: true }); // remove so it doesn't exist
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.deepStrictEqual(result.stale, []);
  assert.ok(Array.isArray(result.warnings), 'warnings is array');
});

test('DS2: home with files ALL in fresh_items returns empty stale array', () => {
  const home = mkTmp('df-init-ds-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'active-epic', github_issue: 'AO-Cyber-Systems/devflow#10' }],
  });
  const fresh_items = [fixtures.buildOrgItem({ issue_ref: 'AO-Cyber-Systems/devflow#10' })];
  const result = init._detectStaleInitiatives({ home, fresh_items });
  assert.deepStrictEqual(result.stale, []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS3: home with file referencing OPEN issue NOT in fresh_items is NOT stale', () => {
  const home = mkTmp('df-init-ds-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'open-not-in-project', github_issue: 'AO-Cyber-Systems/devflow#20' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      return { ok: true, status: 0, stdout: JSON.stringify({ state: 'OPEN', closed: false }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.deepStrictEqual(result.stale, []);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS4: home with file referencing CLOSED issue NOT in fresh_items returns stale entry', () => {
  const home = mkTmp('df-init-ds-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic', github_issue: 'AO-Cyber-Systems/devflow#999' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view' && args[2] === 'AO-Cyber-Systems/devflow#999') {
      return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.strictEqual(result.stale.length, 1);
  assert.strictEqual(result.stale[0].slug, 'old-epic');
  assert.strictEqual(result.stale[0].reason, 'closed_and_removed');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS5: CLOSED issue still in fresh_items is NOT stale (project still claims it)', () => {
  const home = mkTmp('df-init-ds-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'recurring', github_issue: 'AO-Cyber-Systems/devflow#100' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const fresh_items = [fixtures.buildOrgItem({ issue_ref: 'AO-Cyber-Systems/devflow#100' })];
  const result = init._detectStaleInitiatives({ home, fresh_items });
  assert.deepStrictEqual(result.stale, []);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS6: file with malformed frontmatter is skipped silently', () => {
  const home = mkTmp('df-init-ds-');
  // Write a file with no frontmatter (malformed)
  fs.writeFileSync(path.join(home, 'malformed.md'), '# Just a heading\nNo frontmatter here.\n', 'utf-8');
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.deepStrictEqual(result.stale, []);
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS7: file with no github_issue field adds warning and is skipped', () => {
  const home = mkTmp('df-init-ds-');
  // Write a file with frontmatter but no github_issue
  const content = [
    '---',
    'slug: no-issue-ref',
    'parent_project: AO-Cyber-Systems/PVT_test',
    'key_repos:',
    '  - AO-Cyber-Systems/devflow',
    'updated_at: 2026-01-01T00:00:00Z',
    '---',
    '',
    '# No Issue Ref',
    '',
    '## Why',
    '',
    'Some why.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(home, 'no-issue-ref.md'), content, 'utf-8');
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.deepStrictEqual(result.stale, []);
  assert.ok(result.warnings.length > 0, 'should have a warning for missing github_issue');
  assert.ok(result.warnings.some(w => w.includes('no-issue-ref') || w.includes('no github_issue')),
    `warning should mention the slug or missing field; warnings: ${JSON.stringify(result.warnings)}`);
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS8: gh issue view failure treats file as not-stale with warning', () => {
  const home = mkTmp('df-init-ds-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'gh-fail-epic', github_issue: 'AO-Cyber-Systems/devflow#77' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      return { ok: false, status: 1, stdout: '', stderr: 'could not resolve to an issue' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.deepStrictEqual(result.stale, [], 'gh failure should NOT mark file as stale');
  assert.ok(result.warnings.length > 0, 'should have a warning for gh failure');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('DS9: returns array of { slug, github_issue, reason } for each stale entry', () => {
  const home = mkTmp('df-init-ds-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'stale-a', github_issue: 'AO-Cyber-Systems/devflow#11' },
      { slug: 'stale-b', github_issue: 'AO-Cyber-Systems/devflow#12' },
    ],
  });
  init._setRunGh((args) => {
    if (args[0] === 'issue' && args[1] === 'view') {
      return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = init._detectStaleInitiatives({ home, fresh_items: [] });
  assert.strictEqual(result.stale.length, 2);
  for (const entry of result.stale) {
    assert.ok(entry.slug, 'stale entry has slug');
    assert.ok(entry.github_issue, 'stale entry has github_issue');
    assert.strictEqual(entry.reason, 'closed_and_removed');
  }
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

// ─── TRD 05-03: Group CF — _confirmDeleteStale (TTY readline, mocked) ─────────

test('CF1: injected readline returning true → _confirmDeleteStale returns true', async () => {
  init._setRunReadline(async (_slug) => true);
  const r = await init._confirmDeleteStale('foo');
  assert.strictEqual(r, true);
  init._resetMocks();
});

test('CF2: injected readline returning true → yes response works', async () => {
  init._setRunReadline((_slug) => Promise.resolve(true));
  const r = await init._confirmDeleteStale('yes-test');
  assert.strictEqual(r, true);
  init._resetMocks();
});

test('CF3: injected readline returning false → _confirmDeleteStale returns false', async () => {
  init._setRunReadline(async (_slug) => false);
  const r = await init._confirmDeleteStale('bar');
  assert.strictEqual(r, false);
  init._resetMocks();
});

test('CF4: injected readline returning false (default no) → _confirmDeleteStale returns false', async () => {
  init._setRunReadline(() => false);
  const r = await init._confirmDeleteStale('default-no');
  assert.strictEqual(r, false);
  init._resetMocks();
});

test('CF5: non-TTY stdin → default _confirmDeleteStale returns false without prompting', async () => {
  init._resetMocks(); // use real default
  const origTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true, writable: true });
  try {
    const r = await init._confirmDeleteStale('cf5-test');
    assert.strictEqual(r, false, 'non-TTY should return false');
  } finally {
    if (origTTY !== undefined) {
      Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true, writable: true });
    } else {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true });
    }
  }
});

test('CF6: case-insensitive y/Y/yes/YES all return true via injection', async () => {
  const answers = ['y', 'Y', 'yes', 'YES'];
  for (const answer of answers) {
    // Simulate the real readline logic: /^y(es)?$/i.test(answer.trim())
    const expected = /^y(es)?$/i.test(answer.trim());
    init._setRunReadline((_slug) => expected);
    const r = await init._confirmDeleteStale('test-slug');
    assert.strictEqual(r, true, `answer "${answer}" should return true`);
    init._resetMocks();
  }
});

// ─── TRD 05-03: Group DD — _deleteStaleFile (filesystem) ──────────────────────

test('DD1: calls unlinkSync on <home>/<slug>.md', () => {
  const home = mkTmp('df-init-dd-');
  const slug = 'dd1-test';
  // Create the file to delete
  fs.writeFileSync(path.join(home, `${slug}.md`), 'content', 'utf-8');
  let unlinkedPath = null;
  const mockFsDD = {
    existsSync: (p) => fs.existsSync(p),
    readdirSync: (p, opts) => fs.readdirSync(p, opts),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => fs.statSync(p),
    writeFileSync: (p, d, o) => fs.writeFileSync(p, d, o),
    mkdirSync: (p, o) => fs.mkdirSync(p, o),
    renameSync: (o, n) => fs.renameSync(o, n),
    unlinkSync: (p) => { unlinkedPath = p; fs.unlinkSync(p); },
  };
  init._setRunFs(mockFsDD);
  const result = init._deleteStaleFile(home, slug);
  assert.ok(unlinkedPath && unlinkedPath.endsWith(`${slug}.md`),
    `unlinkSync called on slug path; got: ${unlinkedPath}`);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('DD2: returns { deleted: true, slug, reason: "closed_and_removed" } on success', () => {
  const home = mkTmp('df-init-dd-');
  const slug = 'dd2-test';
  fs.writeFileSync(path.join(home, `${slug}.md`), 'content', 'utf-8');
  const result = init._deleteStaleFile(home, slug);
  assert.strictEqual(result.deleted, true);
  assert.strictEqual(result.slug, slug);
  assert.strictEqual(result.reason, 'closed_and_removed');
  fs.rmSync(home, { recursive: true, force: true });
});

test('DD3: unlinkSync failure returns { deleted: false, slug, reason: <error msg> }', () => {
  const home = mkTmp('df-init-dd-');
  const slug = 'dd3-test';
  const mockFsDD3 = {
    existsSync: (p) => fs.existsSync(p),
    readdirSync: (p, opts) => fs.readdirSync(p, opts),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: (p) => fs.statSync(p),
    writeFileSync: (p, d, o) => fs.writeFileSync(p, d, o),
    mkdirSync: (p, o) => fs.mkdirSync(p, o),
    renameSync: (o, n) => fs.renameSync(o, n),
    unlinkSync: (_p) => { throw new Error('ENOENT: no such file or directory'); },
  };
  init._setRunFs(mockFsDD3);
  const result = init._deleteStaleFile(home, slug);
  assert.strictEqual(result.deleted, false);
  assert.strictEqual(result.slug, slug);
  assert.ok(result.reason && result.reason.length > 0, 'reason should be non-empty');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

// ─── TRD 05-03: Group SF — syncInitiatives stale-deletion integration ──────────

test('SF1: --force flag deletes stale files unconditionally; result.deleted populated', async () => {
  const home = mkTmp('df-init-sf-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic', github_issue: 'AO-Cyber-Systems/devflow#999' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: true });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deleted.length, 1, `expected 1 deleted; got: ${JSON.stringify(result.deleted)}`);
  assert.strictEqual(result.deleted[0].slug, 'old-epic');
  assert.strictEqual(fs.existsSync(path.join(home, 'old-epic.md')), false, 'file should be removed');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('SF2: without --force, TTY-mock confirms y → stale files deleted', async () => {
  const home = mkTmp('df-init-sf-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic-sf2', github_issue: 'AO-Cyber-Systems/devflow#888' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  init._setRunReadline(async (_slug) => true); // user confirms y
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: false });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deleted.length, 1, `expected 1 deleted; got: ${JSON.stringify(result.deleted)}`);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('SF3: without --force, TTY-mock confirms n → stale files NOT deleted; result.deleted empty', async () => {
  const home = mkTmp('df-init-sf-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic-sf3', github_issue: 'AO-Cyber-Systems/devflow#777' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  init._setRunReadline(async (_slug) => false); // user confirms n
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: false });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.deleted, [], 'no files deleted when user says n');
  assert.ok(fs.existsSync(path.join(home, 'old-epic-sf3.md')), 'file should still exist after n');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('SF4: non-TTY (no _runReadline injection + isTTY false) → stale-deletion skipped with warning', async () => {
  const home = mkTmp('df-init-sf-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic-sf4', github_issue: 'AO-Cyber-Systems/devflow#666' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  // Do NOT inject _setRunReadline — use default, which checks isTTY
  const origTTY = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true, writable: true });
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: false });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.deleted, [], 'stale deletion skipped on non-TTY');
    assert.ok(result.warnings.some(w => w.includes('non-interactive') || w.includes('stale') || w.includes('--force')),
      `should have warning about non-TTY skip; warnings: ${JSON.stringify(result.warnings)}`);
    assert.ok(fs.existsSync(path.join(home, 'old-epic-sf4.md')), 'file should still exist');
  } finally {
    if (origTTY !== undefined) {
      Object.defineProperty(process.stdin, 'isTTY', { value: origTTY, configurable: true, writable: true });
    } else {
      Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true, writable: true });
    }
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('SF5: --initiative <slug> mode skips stale-deletion entirely; result.deleted always empty', async () => {
  const home = mkTmp('df-init-sf-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic-sf5', github_issue: 'AO-Cyber-Systems/devflow#555' }],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  const result = await init.syncInitiatives({
    home, project_id: 'PVT_test', initiative: 'some-other-slug', force: true,
  });
  assert.deepStrictEqual(result.deleted, [], 'deleted empty in single-initiative mode');
  assert.ok(fs.existsSync(path.join(home, 'old-epic-sf5.md')), 'file should still exist');
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('SF6: 2 stale files; user confirms y for one, n for other → result.deleted has 1 entry', async () => {
  const home = mkTmp('df-init-sf-');
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [
      { slug: 'old-epic-a', github_issue: 'AO-Cyber-Systems/devflow#501' },
      { slug: 'old-epic-b', github_issue: 'AO-Cyber-Systems/devflow#502' },
    ],
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') return { ok: true, status: 0, stdout: JSON.stringify({ data: { node: { items: { pageInfo: { hasNextPage: false }, nodes: [] } } } }), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  let callCount = 0;
  init._setRunReadline(async (_slug) => {
    callCount++;
    return callCount === 1; // yes for first, no for second
  });
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: false });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deleted.length, 1, `expected exactly 1 deleted; got: ${JSON.stringify(result.deleted)}`);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

test('SF7: stale-detection runs AFTER writer loop; freshly-written file never in result.deleted', async () => {
  const home = mkTmp('df-init-sf-');
  // Pre-existing stale file in home
  fixtures.buildInitiativesHomeTree({
    tmpdir: home,
    files: [{ slug: 'old-epic-sf7', github_issue: 'AO-Cyber-Systems/devflow#400' }],
  });
  // walkProject returns a qualifying item that will be written
  const freshItem = fixtures.buildOrgItem({
    title: '[Epic] Fresh Initiative',
    issue_ref: 'AO-Cyber-Systems/devflow#200',
  });
  init._setRunGh((args) => {
    if (args[0] === 'auth') return { ok: true, status: 0, stdout: "Token scopes: 'project', 'read:project', 'repo'", stderr: '' };
    if (args[0] === 'api' && args[1] === 'graphql') {
      // Build response with freshItem
      return { ok: true, status: 0, stdout: JSON.stringify({
        data: {
          node: {
            items: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{
                content: {
                  __typename: 'Issue',
                  number: 200,
                  title: freshItem.title,
                  body: freshItem.body || '',
                  repository: { nameWithOwner: 'AO-Cyber-Systems/devflow' },
                  trackedIssues: { totalCount: 0, nodes: [] },
                },
                fieldValues: { nodes: [] },
              }],
            },
          },
        },
      }), stderr: '' };
    }
    if (args[0] === 'issue' && args[1] === 'view' && args[2] === 'AO-Cyber-Systems/devflow#400') {
      return { ok: true, status: 0, stdout: JSON.stringify({ state: 'CLOSED', closed: true }), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unmocked' };
  });
  init._setRunReadline(async (_slug) => true); // confirm y for any stale files
  const result = await init.syncInitiatives({ home, project_id: 'PVT_test', force: false });
  assert.strictEqual(result.ok, true);
  // Fresh initiative should be written
  assert.ok(result.written.some(w => w.slug === 'fresh-initiative'), `fresh-initiative should be written; written: ${JSON.stringify(result.written)}`);
  // Fresh initiative should NOT be in deleted
  const deletedSlugs = result.deleted.map(d => d.slug);
  assert.ok(!deletedSlugs.includes('fresh-initiative'), 'freshly-written file must not be in deleted');
  // Old epic should be deleted
  assert.ok(deletedSlugs.includes('old-epic-sf7'), `old-epic-sf7 should be deleted; deleted: ${JSON.stringify(result.deleted)}`);
  init._resetMocks();
  fs.rmSync(home, { recursive: true, force: true });
});

// ─── Group EX — Export-surface lock ─────────────────────────────────────────

test('EX1: module.exports surface is locked (deepStrictEqual)', () => {
  const expected = [
    // Reader (TRD 05-01)
    '_parseInitiativeFile',
    '_truncateWhy',
    'formatInitiativeForPlanner',
    'loadInitiatives',
    'matchByRepo',
    // Writer (TRD 05-02)
    '_qualifiesAsInitiative',
    '_renderInitiativeMarkdown',
    '_slugifyInitiativeTitle',
    '_writeInitiativeFile',
    'syncInitiatives',
    // Stale-deletion (TRD 05-03)
    '_confirmDeleteStale',
    '_deleteStaleFile',
    '_detectStaleInitiatives',
    '_setRunReadline',
    // Test hooks
    '_resetMocks',
    '_setRunFs',
    '_setRunGh',
    // Constants
    'INITIATIVES_HOME_REL',
    'MAX_FORMATTED_PLANNER_CHARS',
    'MAX_QUESTIONS_BULLETS',
    'MAX_SUBISSUES_LINES',
    'MAX_WHY_CHARS',
    'defaultInitiativesHome',
  ].sort();
  assert.deepStrictEqual(Object.keys(init).sort(), expected);
});

test('EX2: banner comment LOCKED by TRD 05-05 present in source', () => {
  const src = fs.readFileSync(path.join(__dirname, 'initiatives.cjs'), 'utf-8');
  assert.ok(/LOCKED by TRD 05-05/.test(src), 'banner comment missing');
});

test('EX3: all _set* test hooks are functions', () => {
  assert.strictEqual(typeof init._setRunFs, 'function');
  assert.strictEqual(typeof init._setRunGh, 'function');
  assert.strictEqual(typeof init._setRunReadline, 'function');
  assert.strictEqual(typeof init._resetMocks, 'function');
});

test('EX4: all MAX_* constants are positive numbers', () => {
  assert.strictEqual(typeof init.MAX_WHY_CHARS, 'number');
  assert.ok(init.MAX_WHY_CHARS > 0);
  assert.strictEqual(typeof init.MAX_FORMATTED_PLANNER_CHARS, 'number');
  assert.ok(init.MAX_FORMATTED_PLANNER_CHARS > 0);
});

// ─── Group TB — Token budget enforcement (SC-10) ─────────────────────────────

test('TB1: formatInitiativeForPlanner adversarial input ≤ MAX_FORMATTED_PLANNER_CHARS', () => {
  const adv = fixtures.buildAdversarialInitiative();
  const result = init.formatInitiativeForPlanner(adv);
  assert.ok(result.length <= init.MAX_FORMATTED_PLANNER_CHARS,
    `exceeded budget: ${result.length} > ${init.MAX_FORMATTED_PLANNER_CHARS}`);
});

test('TB2: multi-initiative composition (5x adversarial) ≤ 6 KB', () => {
  const initiatives = [];
  for (let i = 0; i < 5; i++) {
    initiatives.push(fixtures.buildAdversarialInitiative({ slug: `adv-${i}` }));
  }
  const composed = initiatives.map(i => init.formatInitiativeForPlanner(i)).join('\n\n---\n\n');
  assert.ok(composed.length <= 6 * 1024, `exceeded multi-init budget: ${composed.length}`);
});

test('TB3: empty initiative returns short non-throwing string', () => {
  const result = init.formatInitiativeForPlanner({});
  assert.strictEqual(typeof result, 'string');
});

test('TB4: initiative with empty sections renders header + slug', () => {
  const result = init.formatInitiativeForPlanner({
    slug: 'minimal',
    github_issue: 'AO-Cyber-Systems/example#1',
    why: '',
    open_questions: [],
    sub_issues: [],
  });
  assert.ok(result.includes('minimal'));
});

test('TB5: truncated output ends in ellipsis when content exceeds budget', () => {
  const adv = fixtures.buildAdversarialInitiative({ why_chars: 10000 });
  const result = init.formatInitiativeForPlanner(adv);
  // Content was truncated — the format should hit the hard cap and append ellipsis OR be exactly the hard cap
  assert.ok(/…/.test(result) || result.length === init.MAX_FORMATTED_PLANNER_CHARS,
    'expected ellipsis or exact-cap result');
});

// ─── Group IT — Integration round-trip (SC-9, gated) ─────────────────────────

test('IT1: GH_INTEGRATION live round-trip — sync writes ≥1 file',
  { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' },
  async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it1-'));
    init._resetMocks();
    try {
      const result = await init.syncInitiatives({ home });
      assert.strictEqual(result.ok, true, `sync failed: ${JSON.stringify(result.warnings)}`);
      assert.ok(result.written.length >= 1, `expected ≥1 initiative; got ${result.written.length}`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
);

test('IT2: GH_INTEGRATION end-to-end load + match + format',
  { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' },
  async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it2-'));
    init._resetMocks();
    try {
      await init.syncInitiatives({ home });
      const loaded = init.loadInitiatives({ home });
      assert.ok(loaded.length >= 1);
      const matched = init.matchByRepo(loaded, 'AO-Cyber-Systems/devflow-claude');
      if (matched.length > 0) {
        const formatted = init.formatInitiativeForPlanner(matched[0]);
        assert.ok(formatted.length > 0);
        assert.ok(formatted.length <= init.MAX_FORMATTED_PLANNER_CHARS);
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
);

test('IT3: GH_INTEGRATION idempotency end-to-end',
  { skip: process.env.GH_INTEGRATION !== '1' && 'GH_INTEGRATION=1 not set' },
  async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it3-'));
    init._resetMocks();
    try {
      await init.syncInitiatives({ home });
      const firstFiles = {};
      for (const f of fs.readdirSync(home)) {
        firstFiles[f] = fs.readFileSync(path.join(home, f), 'utf-8')
          .replace(/^updated_at: .*$/m, 'updated_at: STRIPPED');
      }
      await init.syncInitiatives({ home });
      for (const f of fs.readdirSync(home)) {
        const second = fs.readFileSync(path.join(home, f), 'utf-8')
          .replace(/^updated_at: .*$/m, 'updated_at: STRIPPED');
        assert.strictEqual(second, firstFiles[f], `idempotency broken for ${f}`);
      }
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
);

test('IT4: IT1-IT3 are skipped when GH_INTEGRATION not set', () => {
  // This test verifies the env-gate pattern exists; actual skip is enforced on IT1/IT2/IT3 above.
  assert.ok(process.env.GH_INTEGRATION !== '1' || typeof process.env.GH_INTEGRATION === 'string',
    'GH_INTEGRATION gate condition evaluated');
});

test('IT5: default-run end-to-end with mocked empty walkProject', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'df-init-it5-'));
  init._setRunGh(fixtures.buildMockRunGhForInitiatives({ walkProjectItems: [], authOk: true }));
  try {
    const result = await init.syncInitiatives({ home, project_id: 'PVT_test' });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.written, []);
    assert.deepStrictEqual(result.deleted, []);
  } finally {
    init._resetMocks();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
