'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { extractFrontmatter, reconstructFrontmatter, spliceFrontmatter, FRONTMATTER_SCHEMAS } = require('./frontmatter.cjs');

test('extractFrontmatter — baseline parse (existing fields unchanged)', () => {
  const c = `---\nkind: api\ndefault_work: feature\n---\n\n# Test`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.kind, 'api');
  assert.strictEqual(fm.default_work, 'feature');
});

test('extractFrontmatter — PROJECT.md new fields', () => {
  const c = `---\nkind: plugin\ngithub_repo: AO-Cyber-Systems/devflow-claude\norg_project: PVT_kwDODwqLrc4BRsOP\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_repo, 'AO-Cyber-Systems/devflow-claude');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
});

test('extractFrontmatter — OBJECTIVE.md new fields with full ref', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: AO-Cyber-Systems/devflow-claude#9\norg_initiative: devflow-internal-alpha\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, 'AO-Cyber-Systems/devflow-claude#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
});

test('extractFrontmatter — OBJECTIVE.md shorthand parse', () => {
  // The # character makes the parser quote-handle it. Both quoted and unquoted should work.
  const cQuoted = `---\nwork: feature\nparent_issue: "#9"\n---\n\n# x`;
  const cUnquoted = `---\nwork: feature\nparent_issue: #9\n---\n\n# x`;
  const fmQ = extractFrontmatter(cQuoted);
  const fmU = extractFrontmatter(cUnquoted);
  assert.strictEqual(fmQ.parent_issue, '#9', 'quoted shorthand should yield #9 literal');
  assert.strictEqual(fmU.parent_issue, '#9', 'unquoted shorthand should yield #9 literal');
});

test('extractFrontmatter — absence of new fields is silent', () => {
  const c = `---\nwork: feature\n---\n\n# Existing file`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, undefined);
  assert.strictEqual(fm.parent_issue, undefined);
  assert.strictEqual(fm.org_initiative, undefined);
  assert.strictEqual(fm.org_project, undefined);
});

test('extractFrontmatter — TRD frontmatter per-TRD github_issue override', () => {
  const c = `---\nobjective: 01-test\ntrd: 01\ntype: tdd\ngithub_issue: AO-Cyber-Systems/devflow-claude#52\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#52');
});

test('reconstructFrontmatter — preserves new fields round-trip', () => {
  const orig = {
    work: 'feature',
    github_issue: 'AO-Cyber-Systems/devflow-claude#20',
    parent_issue: '#9',
  };
  const yaml = reconstructFrontmatter(orig);
  assert.match(yaml, /github_issue:.*devflow-claude#20/);
  assert.match(yaml, /parent_issue:.*"#9"/, 'shorthand should round-trip with quotes (parser quotes # values)');
});

test('extractFrontmatter — combined: all new + existing fields together', () => {
  const c = `---\nwork: feature\ngithub_issue: AO-Cyber-Systems/devflow-claude#20\nparent_issue: "#9"\norg_initiative: devflow-internal-alpha\norg_project: PVT_kwDODwqLrc4BRsOP\noverrides:\n  tdd: strict\n---\n\n# x`;
  const fm = extractFrontmatter(c);
  assert.strictEqual(fm.work, 'feature');
  assert.strictEqual(fm.github_issue, 'AO-Cyber-Systems/devflow-claude#20');
  assert.strictEqual(fm.parent_issue, '#9');
  assert.strictEqual(fm.org_initiative, 'devflow-internal-alpha');
  assert.strictEqual(fm.org_project, 'PVT_kwDODwqLrc4BRsOP');
  assert.deepStrictEqual(fm.overrides, { tdd: 'strict' });
});

// ── Flutter UI optional frontmatter fields (REQ-10-01) ──────────────────────
//
// These 12 cases document and guard the permissive extractFrontmatter parser's
// handling of the 6 new optional fields introduced for type: ui TRDs.
// Tests are expected to PASS on first run — this is regression-coverage of
// existing parser behavior, not test-driven introduction of new behavior.
//
// Fixture strings are hand-built inline template literals per CLAUDE.md
// TDD Playbook habit 4: no LLM-generated test data.
//
// Parser behavior notes for Cases 6-10:
//   The extractFrontmatter stack-based parser handles scalar fields, inline
//   arrays, and nested plain objects. Block-array items that contain nested
//   key-value sub-fields (e.g., api_contract: [{path, sha}]) are captured as
//   strings of the form "path: value" — the parser flattens "- key: val" to a
//   string literal. Downstream consumers that need structured artifact data use
//   parseMustHavesBlock() instead. These tests document that exact behavior so
//   any future parser change that breaks it is caught immediately.

// Shared fixture for Cases 1-10. Hand-built, deterministic.
const FLUTTER_UI_FIXTURE = `---
objective: 10-test
trd: 99
type: ui
stack: flutter
platform: [mobile, web]
state_management: riverpod
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [REQ-10-01]
api_contract:
  - path: lib/api/user_client.dart
    sha: ab12cd34ef
  - path: ../eden-biz-go/proto/users.proto
    sha: ef56gh78ij
must_haves:
  truths:
    - User sees loading spinner
  artifacts:
    - path: lib/screens/user_list_screen.dart
      provides: User list screen
      contains: AsyncValue
      states: [loading, data, error, empty]
      tests:
        widget: test/screens/user_list_screen_test.dart
        integration: integration_test/user_list_flow_test.dart
        maestro: .maestro/user_list.yaml
  key_links: []
---
# body
`;

test('Case 1 (REQ-10-01) — type: ui parses as string literal', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.strictEqual(fm.type, 'ui');
});

test('Case 2 (REQ-10-01) — stack: flutter parses as string literal', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.strictEqual(fm.stack, 'flutter');
});

test('Case 3 (REQ-10-01) — platform: [mobile, web] inline array parses as two-element array', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.deepStrictEqual(fm.platform, ['mobile', 'web']);
});

test('Case 4 (REQ-10-01) — platform: [mobile] single-element inline array parses as one-element array', () => {
  const mini = `---\nplatform: [mobile]\n---\n`;
  const fm = extractFrontmatter(mini);
  assert.deepStrictEqual(fm.platform, ['mobile']);
});

test('Case 5 (REQ-10-01) — state_management: riverpod parses as string literal', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.strictEqual(fm.state_management, 'riverpod');
});

test('Case 6 (REQ-10-01) — api_contract block array: parser captures dash-prefixed items as strings', () => {
  // extractFrontmatter treats "- key: value" array items as the string "key: value".
  // This documents the existing permissive parser behavior for block arrays whose
  // items contain nested key-value pairs. Consumers needing structured {path, sha}
  // objects must parse the raw YAML themselves; extractFrontmatter is intentionally
  // permissive rather than strict. This test guards against future regressions that
  // would silently drop or corrupt the api_contract field entirely.
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.ok(Array.isArray(fm.api_contract), 'api_contract should be parsed as an array');
  assert.strictEqual(fm.api_contract.length, 2, 'api_contract should contain 2 items');
  assert.ok(
    fm.api_contract[0].includes('lib/api/user_client.dart'),
    'first api_contract item should include the path value'
  );
  assert.ok(
    fm.api_contract[1].includes('eden-biz-go/proto/users.proto'),
    'second api_contract item should include the path value'
  );
});

test('Case 7 (REQ-10-01) — must_haves.artifacts: parser captures block-array items as strings', () => {
  // extractFrontmatter treats "- path: value" artifact items as string "path: value".
  // The states[] and tests{} sub-fields are not accessible via extractFrontmatter for
  // block-array items; use parseMustHavesBlock() for structured artifact access.
  // This test documents the behavior as a regression guard.
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.ok(Array.isArray(fm.must_haves.artifacts), 'artifacts should be parsed as an array');
  assert.strictEqual(fm.must_haves.artifacts.length, 1, 'should have 1 artifact item');
  assert.ok(
    fm.must_haves.artifacts[0].includes('lib/screens/user_list_screen.dart'),
    'artifact item should include the path value'
  );
});

test('Case 8 (REQ-10-01) — must_haves.truths: block array of simple strings parses correctly', () => {
  // Simple string block arrays (no nested key-value) parse into string arrays as expected.
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.deepStrictEqual(fm.must_haves.truths, ['User sees loading spinner']);
});

test('Case 9 (REQ-10-01) — must_haves.key_links: empty block array parses as empty array', () => {
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.deepStrictEqual(fm.must_haves.key_links, []);
});

test('Case 10 (REQ-10-01) — platform: [mobile, web] parses as two distinct values, not one merged string', () => {
  // Regression: inline array must not be parsed as a single string "[mobile, web]".
  const fm = extractFrontmatter(FLUTTER_UI_FIXTURE);
  assert.ok(!fm.platform.some(v => v.includes(',')), 'no platform item should contain a comma');
  assert.ok(fm.platform.includes('mobile'), 'platform array should contain "mobile"');
  assert.ok(fm.platform.includes('web'), 'platform array should contain "web"');
});

test('Case 11 (REQ-10-01) — back-compat: TRD without any Flutter UI fields parses unchanged', () => {
  // A standard TRD without any of the 6 new fields must parse identically to its
  // pre-objective-10 form: no extra keys, no error, baseline fields intact.
  const BASELINE_FIXTURE = `---
objective: 99-foo
trd: 01
type: standard
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [REQ-99-01]
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
# body
`;
  const fm = extractFrontmatter(BASELINE_FIXTURE);
  // No new Flutter UI fields present:
  assert.strictEqual(fm.stack, undefined, 'stack should be absent');
  assert.strictEqual(fm.platform, undefined, 'platform should be absent');
  assert.strictEqual(fm.state_management, undefined, 'state_management should be absent');
  assert.strictEqual(fm.api_contract, undefined, 'api_contract should be absent');
  // Baseline fields still parse correctly:
  assert.strictEqual(fm.type, 'standard');
  assert.strictEqual(fm.objective, '99-foo');
  assert.strictEqual(fm.trd, '01');
});

test('Case 12 (REQ-10-01) — FRONTMATTER_SCHEMAS.trd.required is unchanged (8 baseline fields)', () => {
  // Regression guard: if any new Flutter UI field is incorrectly added to the
  // required schema, non-Flutter TRDs would fail validation. This test catches
  // that immediately. The 8 required fields are fixed — new fields are optional
  // by design and enforced semantically by the planner (TRD 10-03).
  assert.deepStrictEqual(
    FRONTMATTER_SCHEMAS.trd.required.slice().sort(),
    ['autonomous', 'depends_on', 'files_modified', 'must_haves', 'objective', 'trd', 'type', 'wave'].sort()
  );
});
