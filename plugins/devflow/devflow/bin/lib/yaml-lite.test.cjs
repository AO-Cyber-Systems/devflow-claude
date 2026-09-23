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

// ─── Refusals — the load-bearing half ─────────────────────────────────────────
//
// A refusal case that throws the wrong error type is green and worthless. Every case below
// asserts `err.name === 'YamlLiteError'` AND a NUMERIC `err.line`, never `assert.throws(fn)`
// alone — a TypeError from deep inside the builder would satisfy the latter and prove nothing.

function refuses(yaml, { line, match }) {
  let thrown = null;
  try {
    parseYamlLite(yaml);
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, `expected parseYamlLite to throw, got a value instead`);
  assert.strictEqual(thrown.name, 'YamlLiteError', `expected a YamlLiteError, got ${thrown.name}: ${thrown.message}`);
  assert.ok(thrown instanceof YamlLiteError, 'expected an instance of the exported YamlLiteError');
  assert.strictEqual(typeof thrown.line, 'number', '.line must be a NUMBER, not only text in the message');
  assert.strictEqual(thrown.line, line);
  assert.match(thrown.message, match);
  return thrown;
}

test('Case Y8 — anchors, aliases and the merge key are refused', () => {
  refuses('base: &b {x: 1}\n', { line: 1, match: /anchor/i });

  refuses(['surface: rail', 'copy: *b', ''].join('\n'), { line: 2, match: /alias|anchor/i });

  refuses(
    ['defaults: {x: 1}', 'states:', '  <<: *defaults', '  extra: 2', ''].join('\n'),
    { line: 3, match: /merge key/i }
  );
});

test('Case Y9 — block scalars (`|`, `>`) and tags (`!!`) are refused', () => {
  refuses(['surface: rail', 'prose: |', '  a literal block', ''].join('\n'),
    { line: 2, match: /block scalar/i });

  refuses(['surface: rail', 'prose: >', '  a folded block', ''].join('\n'),
    { line: 2, match: /block scalar/i });

  refuses(['surface: rail', 'prose: |-', '  a stripped literal block', ''].join('\n'),
    { line: 2, match: /block scalar/i });

  refuses(['surface: rail', 'when: !!str 1', ''].join('\n'), { line: 2, match: /tag/i });

  // A `!` inside quotes is content, not a tag — the refusal must not fire here.
  assert.deepStrictEqual(parseYamlLite('title: "watch out!! really"\n'), { title: 'watch out!! really' });
});

// Case Y9b — a `!` in UNQUOTED prose is a character, not a tag.
//
// `TAG_RE` carried the exact bug shape finding 5 fixed for `&`/`*`: it fired on
// "after any whitespace", anywhere in a value. A tag is structural only where a scalar
// BEGINS — `when: !!str 1`, `- !Thing`, `[!a]` — and everywhere else in a value it is a
// character a human typed. The Surface Spec is prose-heavy (`does`, `rule`, `must_show`,
// `reason_shown`), so this refused legitimate specs on the one field class the format
// exists to carry, and the message pointed at YAML tags rather than at the exclamation
// mark. Quoting was the only workaround, and nothing told the author that.
test('Case Y9b — `!` inside unquoted prose is a character, not a tag', () => {
  for (const [src, want] of [
    ['does: Shows the !important badge\n', { does: 'Shows the !important badge' }],
    ['rule: names ellipsize!\n', { rule: 'names ellipsize!' }],
    ['does: Confirm!! then dismiss\n', { does: 'Confirm!! then dismiss' }],
    ['must_show:\n  - Saved!\n', { must_show: ['Saved!'] }],
    ['must_show: [Saved!, Done!]\n', { must_show: ['Saved!', 'Done!'] }],
  ]) {
    assert.deepStrictEqual(parseYamlLite(src), want, `should parse as prose: ${JSON.stringify(src)}`);
  }

  // The refusal must still fire where a tag really is structural — at a scalar head,
  // in a block value, in a block-sequence item, and inside a flow collection.
  refuses('when: !!str 1\n', { line: 1, match: /tag/i });
  refuses('items:\n  - !Thing x\n', { line: 2, match: /tag/i });
  refuses('items: [!Thing]\n', { line: 1, match: /tag/i });
});

test('Case Y10 — indentation faults: a TAB, and a dedent to a column that matches no open block', () => {
  // (a) TAB used for indentation. Written as an explicit \t so the case survives an editor
  // that helpfully converts tabs to spaces on save.
  refuses(['references:', '\tmockup: refs/x.png', ''].join('\n'), { line: 2, match: /tab/i });

  // (b) a dedent to a column no open block sits at: 4 -> 2, but the only open columns are 4 and 0.
  refuses(
    ['states:', '    - id: empty', '      does: nothing', '  id: stray', ''].join('\n'),
    { line: 4, match: /indent/i }
  );

  // (c) the same fault one level up: a top-level key indented by one space after a nested block.
  refuses(
    ['references:', '  mockup: refs/x.png', ' kind: rail', ''].join('\n'),
    { line: 3, match: /indent/i }
  );
});

test('Case Y11a — a duplicate key at the same level is refused, not silently last-wins', () => {
  // JS object semantics would keep the last `does:` without comment, which would make 34-03's
  // "a state declares exactly one `does`" invariant unreachable — the second one would simply
  // never be seen. So it throws.
  refuses(['does: opens the rail', 'does: closes the rail', ''].join('\n'),
    { line: 2, match: /duplicate key/i });

  refuses(
    ['states:', '  - id: empty', '    does: nothing', '    does: something', ''].join('\n'),
    { line: 4, match: /duplicate key/i }
  );

  refuses('expect: {route: a, route: b}\n', { line: 1, match: /duplicate key/i });

  // The same key at DIFFERENT levels is fine — this must not over-fire.
  assert.deepStrictEqual(
    parseYamlLite(['id: outer', 'inner:', '  id: nested', ''].join('\n')),
    { id: 'outer', inner: { id: 'nested' } }
  );
});

test('Case Y11b — an implicit single-pair map inside a flow sequence is refused, naming the supported form', () => {
  const err = refuses('activation: [pointer, keyboard: [Enter, Space]]\n',
    { line: 1, match: /implicit single-pair map/i });

  // 34-02 normalises §4.2's `activation:` line because of this refusal and quotes the message,
  // so the supported form has to appear in the message VERBATIM.
  assert.ok(
    err.message.includes('[pointer, {keyboard: [Enter, Space]}]'),
    `message must name the supported form verbatim; got: ${err.message}`
  );

  // The explicit form it names is the one that parses.
  assert.deepStrictEqual(
    parseYamlLite('activation: [pointer, {keyboard: [Enter, Space]}]\n'),
    { activation: ['pointer', { keyboard: ['Enter', 'Space'] }] }
  );
});

// ─── Prose in a plain scalar — ONE table, because these three interact ────────
//
// A Surface Spec is PROSE-HEAVY by design: `does`, `rule`, `design_read`, `reason_shown` and
// every `must_show` entry are sentences a human wrote. Three separate defects all landed on
// that one input class — an apostrophe read as an opening quote, `&word`/`*word` read as an
// anchor/alias, and a block-sequence item keeping its trailing comment — and they cannot be
// fixed independently: each of the three touches how a line is scanned for structural
// characters, so a patch that fixes one and regresses another is worse than the bug. Hence ONE
// table, asserted in both directions.
//
// The load-bearing half is the SECOND table. Every structural character that stops being
// structural inside prose must STILL be structural where YAML says it is — a parser that stops
// refusing anchors is not a fix, it is the same silent-mis-parse failure wearing a new hat.

test('Case Y15a — prose punctuation in a plain scalar is CONTENT, not structure', () => {
  const table = [
    // ── apostrophes (finding 4) ──────────────────────────────────────────────
    ["does: Shows the user's projects",
      { does: "Shows the user's projects" }],
    ["rule: names ellipsize; the rail's width is unchanged",
      { rule: "names ellipsize; the rail's width is unchanged" }],
    // In a BLOCK SEQUENCE item, which takes a different code path from a mapping value.
    ["must_show:\n  - the project's name\n  - You don't have access",
      { must_show: ["the project's name", "You don't have access"] }],
    // In a FLOW sequence element.
    ["must_show: [alpha, the user's name]",
      { must_show: ['alpha', "the user's name"] }],
    // In a trailing COMMENT — the trap 34-02's transcription had to route around by rewording
    // two comments in the positive control.
    ['surface: projects-rail  # MUST equal the widget\'s semantics identifier',
      { surface: 'projects-rail' }],
    // A quote that DOES open a scalar still opens one, `''` and all.
    ["does: 'the user''s projects'",
      { does: "the user's projects" }],

    // ── `&` and `*` in prose (finding 5) ─────────────────────────────────────
    ['does: Tools &settings sit side by side',
      { does: 'Tools &settings sit side by side' }],
    ['must_show: rating *stars* shown',
      { must_show: 'rating *stars* shown' }],
    // After a comma at depth 0 — a comma is only a separator INSIDE a flow collection.
    ['does: Shows tags, *starred* first',
      { does: 'Shows tags, *starred* first' }],
    ['must_show:\n  - rating *stars* shown\n  - Tools &settings',
      { must_show: ['rating *stars* shown', 'Tools &settings'] }],

    // ── trailing comments on a block-sequence item (finding 3) ───────────────
    ['affordances:\n  - Enter  # the keyboard key\n  - Space',
      { affordances: ['Enter', 'Space'] }],
    ['affordances:\n  - [a, b] # a flow item with a trailing comment',
      { affordances: [['a', 'b']] }],
    ['affordances:\n  - {keyboard: Enter} # a flow map with a trailing comment',
      { affordances: [{ keyboard: 'Enter' }] }],
    // `#` NOT preceded by whitespace, and `#` at the head of an item value, are both content —
    // the same rule a mapping value already follows (case Y7).
    ['tags:\n  - "#1 priority"\n  - #fff\n  - a#b',
      { tags: ['#1 priority', '#fff', 'a#b'] }],
    // A `#` inside a quoted item is content; the SECOND one is the comment.
    ['tags:\n  - "a # b"  # and a real comment',
      { tags: ['a # b'] }]
  ];

  for (const [yaml, expected] of table) {
    let got;
    try {
      got = parseYamlLite(`${yaml}\n`);
    } catch (e) {
      assert.fail(`refused legal prose ${JSON.stringify(yaml)}: ${e.message}`);
    }
    assert.deepStrictEqual(got, expected, `parsed ${JSON.stringify(yaml)} wrong`);
  }
});

test('Case Y15b — the SAME characters are still structural where YAML says they are', () => {
  // The differential control for Y15a. Each line below is the prose case with the character
  // moved to a position where it really is structure. If Y15a's fix over-reached, these go red.
  const stillRefused = [
    ['base: &b {x: 1}', 1, /anchor/i],                      // an anchor at the value head
    ['surface: rail\ncopy: *b', 2, /alias/i],               // an alias at the value head
    ['tags:\n  - &anchored item', 2, /anchor/i],            // at the head of a sequence item
    ['tags:\n  - *aliased', 2, /alias/i],                   // ditto
    ['tags: [alpha, *aliased]', 1, /alias/i],               // after a comma INSIDE a flow list
    ['expect: {route: *aliased}', 1, /alias/i],             // after `: ` inside a flow map
    ['defaults: {x: 1}\nstates:\n  <<: *defaults', 3, /merge key/i]
  ];

  for (const [yaml, line, match] of stillRefused) {
    refuses(`${yaml}\n`, { line, match });
  }

  // A quote that really does open a scalar and is never closed is still a refusal — with the
  // line number, because `ui spec validate` reports it as SPEC000 and the author needs the line.
  refuses('surface: rail\nbad: "unterminated\n', { line: 2, match: /unterminated double/i });
  refuses("surface: rail\nbad: 'unterminated\n", { line: 2, match: /unterminated single/i });

  // And quoting still masks structure, exactly as case Y4/Y7 pin it.
  assert.deepStrictEqual(
    parseYamlLite('note: "a # b"\ntitle: "{project.name}: overview"\nmust_show: ["#1 priority"]\n'),
    { note: 'a # b', title: '{project.name}: overview', must_show: ['#1 priority'] }
  );
});

// ─── Regression guard (must stay green) ───────────────────────────────────────

test('Case Y12 — the module is require-able with zero side effects and pulls in NO dependency', () => {
  const mod = require('./yaml-lite.cjs');
  assert.deepStrictEqual(Object.keys(mod).sort(), ['YamlLiteError', 'parseYamlLite']);
  assert.strictEqual(typeof mod.parseYamlLite, 'function');
  assert.strictEqual(typeof mod.YamlLiteError, 'function');

  // The whole reason yaml-lite exists instead of `require('js-yaml')` is that this repo carries
  // exactly one npm dependency. Assert that in code rather than trusting it.
  const raw = fs.readFileSync(path.join(__dirname, 'yaml-lite.cjs'), 'utf-8');
  // Scan CODE, not prose: the module's own header comment explains why it is not
  // `require('js-yaml')`, and a guard that reads that sentence as a dependency is measuring
  // the wrong thing. Block comments and whole-line `//` comments come out first.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
  const requireCalls = [...src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'assert', 'util', 'crypto', 'child_process']);
  for (const req of requireCalls) {
    assert.ok(
      req.startsWith('node:') || NODE_BUILTINS.has(req),
      `require('${req}') is neither a node builtin nor absent — yaml-lite must depend on nothing`
    );
  }
  // As shipped there are none at all: yaml-lite needs no builtin and no local module either.
  assert.deepStrictEqual(requireCalls, []);

  // And the manifest itself: one dependency, node-pty, unchanged by this objective.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'package.json'), 'utf-8')
  );
  assert.deepStrictEqual(Object.keys(manifest.dependencies), ['node-pty']);
});

// ─── Audit cases (beyond the planned Y1-Y12) ──────────────────────────────────
//
// The TRD requires the SUMMARY to state that no construct is "neither supported nor refused".
// Auditing for that turned up two silent mis-parses that the planned test list did not name,
// so they are pinned here rather than written up as a caveat.

test('Case Y13 — a quoted block key is unquoted, like a quoted flow key already was', () => {
  // Before this case, `"a b": 1` parsed to { '"a b"': 1 } — the quotes ended up IN the key,
  // silently, while the same key inside a flow map came out clean. Two spellings, two answers.
  assert.deepStrictEqual(parseYamlLite('"a b": 1\n'), { 'a b': 1 });
  assert.deepStrictEqual(parseYamlLite("'a b': 1\n"), { 'a b': 1 });
  assert.deepStrictEqual(parseYamlLite('"a: b": 1\n'), { 'a: b': 1 });
  assert.deepStrictEqual(parseYamlLite('a: {"x y": 1}\n'), { a: { 'x y': 1 } });
});

test('Case Y14 — nested inline sequences, document markers and explicit keys are refused by name', () => {
  // Before this case, `- - x` parsed to the STRING '- x' — the exact failure mode this parser
  // exists to prevent: neither supported nor refused.
  refuses(['a:', '  - - x', ''].join('\n'), { line: 2, match: /nested inline (block )?sequence/i });

  refuses(['---', 'surface: rail', ''].join('\n'), { line: 1, match: /document marker/i });
  refuses(['surface: rail', '...', ''].join('\n'), { line: 2, match: /document marker/i });
  refuses(['? complex', ': value', ''].join('\n'), { line: 1, match: /explicit key/i });

  // And a document whose top level is not a mapping says so, instead of blaming indentation.
  refuses('just a bare scalar\n', { line: 1, match: /top level|mapping/i });
});
