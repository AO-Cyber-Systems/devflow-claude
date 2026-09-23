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
