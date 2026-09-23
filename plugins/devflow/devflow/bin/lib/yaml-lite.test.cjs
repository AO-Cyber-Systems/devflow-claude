'use strict';
// Tests for yaml-lite.cjs (objective 34-01 — the subset YAML parser, and everything it refuses).
//
// parseYamlLite(text) parses the YAML subset Surface Spec front matter is allowed to use:
// block maps, block lists (of scalars and of maps), inline (flow) maps/lists, quoted and bare
// scalars, and comments. Every construct OUTSIDE that subset throws a YamlLiteError carrying a
// 1-based `.line` and naming the construct — a subset parser that silently mis-parses is worse
// than no parser at all.
//
// Hand-written fixtures only (CLAUDE.md habit 4 / fixture_strategy: generators): every YAML
// string below is a literal typed by hand, shaped like the real §4.2 front matter so the cases
// double as documentation of the supported subset. No fixture files, no generated data.
//
// RED (task 1): this require fails until yaml-lite.cjs is created.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { parseYamlLite, YamlLiteError } = require('./yaml-lite.cjs');

// ─── Structure ────────────────────────────────────────────────────────────────

test('Case Y1 — block map: nested two-space-indented map, then a dedent back to top level', () => {
  const Y1 = [
    'surface: projects-rail',
    'references:',
    '  mockup: refs/projects-rail.png',
    '  sheet: refs/projects-rail-sheet.png',
    'kind: rail',
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y1), {
    surface: 'projects-rail',
    references: {
      mockup: 'refs/projects-rail.png',
      sheet: 'refs/projects-rail-sheet.png'
    },
    kind: 'rail'
  });
});

test('Case Y2a — block list of scalars', () => {
  const Y2a = [
    'patterns:',
    '  - master-detail',
    '  - persistent-rail',
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y2a), {
    patterns: ['master-detail', 'persistent-rail']
  });
});

test('Case Y2b — block list of MAPS: `- id: x` plus continuation lines is an array of objects', () => {
  // The shape `routes`, `controls`, `states` and `flows` all use. If this yields an array of
  // strings — or an array of one-key objects — everything downstream in objective 34 is wrong.
  const Y2b = [
    'routes:',
    '  - id: project.conversations',
    '    path: /projects/:id/conversations',
    '    reachable_from_nav: true',
    '  - id: conversations.all',
    '    path: /conversations',
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y2b), {
    routes: [
      { id: 'project.conversations', path: '/projects/:id/conversations', reachable_from_nav: true },
      { id: 'conversations.all', path: '/conversations' }
    ]
  });
});

test('Case Y3 — inline (flow) collections, including a flow map nested in a flow list in a block list item', () => {
  assert.deepStrictEqual(
    parseYamlLite('a: {b: 1, c: [x, y]}\n'),
    { a: { b: 1, c: ['x', 'y'] } }
  );

  const Y3b = [
    'flows:',
    '  - id: open-project',
    '    steps:',
    '      - {click: rail.header, expect: {route: project.conversations}}',
    '      - {click: rail.item, expect: {route: project.conversations, params: [id]}}',
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y3b), {
    flows: [
      {
        id: 'open-project',
        steps: [
          { click: 'rail.header', expect: { route: 'project.conversations' } },
          { click: 'rail.item', expect: { route: 'project.conversations', params: ['id'] } }
        ]
      }
    ]
  });
});

// ─── Scalars ──────────────────────────────────────────────────────────────────

test('Case Y4 — quoted strings: `: ` and `#` inside quotes survive; escapes; quotes inside a flow list', () => {
  const Y4 = [
    'title: "{project.name}: overview # 1"',
    "subtitle: 'it''s the rail'",
    'escaped: "say \\"hi\\" twice"',
    "must_show: [\"{project.name}\", 'plain text, quoted']",
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y4), {
    title: '{project.name}: overview # 1',
    subtitle: "it's the rail",
    escaped: 'say "hi" twice',
    must_show: ['{project.name}', 'plain text, quoted']
  });
});

test('Case Y5 — a colon NOT followed by a space is content, not a key separator', () => {
  // YAML separates on `': '` (colon-space) or a line-terminal `:`. A colon glued to the next
  // character is part of the value. `path: /projects/:id/conversations` is the single most
  // common value shape in `routes`; `locked_sheet: sha256:…` is the second.
  const Y5 = [
    'locked_sheet: sha256:9f2b1c4ae0d3',
    'path: /projects/:id/conversations',
    'at: 12:30',
    'ratio: 16:9',
    'digests:',
    '  - sha256:9f2b1c4ae0d3',
    '  - sha256:0011aa22bb33',
    'paths: [/projects/:id, /conversations]',
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y5), {
    locked_sheet: 'sha256:9f2b1c4ae0d3',
    path: '/projects/:id/conversations',
    at: '12:30',
    ratio: '16:9',
    // A block-list item is where a naive `:` separator does real damage: it would turn each
    // digest into the one-key map {sha256: '9f2b…'} instead of leaving it a string.
    digests: ['sha256:9f2b1c4ae0d3', 'sha256:0011aa22bb33'],
    paths: ['/projects/:id', '/conversations']
  });
});

test('Case Y6 — scalar typing is explicit: dates and dimensions stay STRINGS', () => {
  const Y6 = [
    'count: 1',
    'offset: -3',
    'ratio: 1.5',
    'enabled: true',
    'hidden: false',
    'nothing: null',
    'also_nothing: ~',
    'locked_at: 2026-09-18',
    'viewport: 390x844',
    'blank: ""',
    'numeric_string: "1"',
    'guards:',
    'must_not_show: []',
    ''
  ].join('\n');

  const parsed = parseYamlLite(Y6);
  assert.deepStrictEqual(parsed, {
    count: 1,
    offset: -3,
    ratio: 1.5,
    enabled: true,
    hidden: false,
    nothing: null,
    also_nothing: null,
    locked_at: '2026-09-18',
    viewport: '390x844',
    blank: '',
    numeric_string: '1',
    guards: null,
    must_not_show: []
  });
  // deepStrictEqual already pins the types, but these are the two that a JSON-coercion
  // shortcut would silently get wrong, so say so out loud.
  assert.strictEqual(typeof parsed.locked_at, 'string');
  assert.strictEqual(typeof parsed.numeric_string, 'string');
});

test('Case Y7 — comments: full-line and trailing are stripped; inside quotes and at a value start they are content', () => {
  const Y7 = [
    '# the surface this spec locks',
    'surface: projects-rail   # trailing comment, stripped',
    'color: #fff',
    'accent: #fff # a hex value AND a trailing comment',
    'note: "a # b"',
    '  # an indented full-line comment',
    'tags: [alpha, beta]   # after a flow list',
    'must_show: ["#1 priority"]',
    ''
  ].join('\n');

  assert.deepStrictEqual(parseYamlLite(Y7), {
    surface: 'projects-rail',
    color: '#fff',
    accent: '#fff',
    note: 'a # b',
    tags: ['alpha', 'beta'],
    must_show: ['#1 priority']
  });
});
