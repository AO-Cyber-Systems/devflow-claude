'use strict';
// agent-shell-harness.test.cjs (TRD 34-09) — the executable check for agent prose
// that encodes runtime shell semantics (proposal §21 amendment 1).
//
// Every markdown input in this file is HAND-WRITTEN (CLAUDE.md habit 4 — no generated
// or LLM-invented test data). The harness points at NO real agent file: 34-10 aims it at
// `agents/executor.md`, adds the scratch monorepo fixture and the CI job.
//
// Test list (written before any test code — TRD 34-09 <test_list>), outside-in:
//   Extraction guards FIRST, because a harness that finds nothing and reports green is
//   worse than no harness (the verifier-ui-eval-invocation V4 lesson):
//     E1 — named section absent            -> ERROR naming the section, never {ok:true}
//     E2 — section present, zero bash      -> MISSING with a reason, never `pass`
//     E3 — extraction bounded by the NEXT heading at the same or higher level
//     E4 — non-bash fences ignored; ```bash with attributes IS collected
//   Call splitting:
//     S1 — three single-line commands -> three calls, in order, 1-based source lines
//     S2 — trailing `\` continuation  -> ONE call
//     S3 — full-line comments annotate the NEXT call; trailing comments stay on theirs
//     S4 — blank lines are separators, not calls; a heredoc is ONE call
//   The runtime model (the point of the TRD):
//     X1 — `cd sub` leaks the persisted cwd -> section FAILS, finding names both cwds
//     X2 — `( cd sub && touch marker.txt )` -> cwd unchanged, section PASSES
//     X3 — $VAR set in call 1, read in call 2 -> unbound-variable failure (set -u, fresh env)
//     X4 — the same work RE-DERIVED inside one call -> PASSES (the positive half of X3)
//     X5 — a call writing outside the scratch root -> containment finding, section FAILS
//     X6 — checkSection result shape; EVERY call reported, passing ones too

const test = require('node:test');
const assert = require('node:assert');

const harness = require('./agent-shell-harness.cjs');

// ─── Hand-written markdown factory ────────────────────────────────────────────────────
//
// makeDoc({sections: [{heading, text?, blocks: [{lang, body}]}]}) -> markdown string.
// A factory, not a corpus: each test states its own sections and block bodies inline so
// the fixture is readable next to the assertion it feeds.
function makeDoc({ sections }) {
  const lines = [];
  for (const s of sections) {
    lines.push(s.heading, '');
    if (s.text) lines.push(s.text, '');
    for (const b of s.blocks || []) {
      lines.push('```' + (b.lang || ''));
      lines.push(...b.body.split('\n'));
      lines.push('```', '');
    }
  }
  return lines.join('\n');
}

// 1-based line number of the first line equal to `needle` — used to pin startLine
// against the fixture rather than against a hard-coded integer that drifts.
function lineOf(md, needle) {
  const idx = md.split('\n').indexOf(needle);
  assert.notStrictEqual(idx, -1, `fixture must contain the line ${JSON.stringify(needle)}`);
  return idx + 1;
}

test.describe('agent-shell-harness — extraction guards (E)', () => {

  // Case E1 — the guard written FIRST. A section that is not in the document must be an
  // ERROR naming the section. `{ok:true, calls:[]}` here is the wave-0 lag-check defect
  // with a new name: a regex that matches zero times and an assertion that iterates zero
  // times is a green test proving nothing.
  test('Case E1 — a named section that does not exist is an error, not an empty pass', () => {
    const md = makeDoc({
      sections: [{ heading: '## Web', blocks: [{ lang: 'bash', body: 'echo web' }] }],
    });

    const res = harness.extractBashBlocks(md, '## Flutter');

    assert.strictEqual(res.ok, false, 'a missing section must not report ok:true');
    assert.notStrictEqual(res.ok, true, 'explicitly: never {ok:true} for a section that was never found');
    assert.ok(res.error, 'a missing section must carry an error');
    assert.match(res.error, /Flutter/, 'the error must NAME the missing section');
    assert.strictEqual((res.blocks || []).length, 0, 'a missing section yields no blocks');
  });

  // Case E2 — "found but empty" must be distinguishable from "not found", and must not
  // read as pass. 34-10's CI job reports on exactly this distinction.
  test('Case E2 — a section with zero bash blocks reports MISSING with a reason', () => {
    const md = makeDoc({
      sections: [{ heading: '## Flutter', text: 'Prose only. No fenced bash here.' }],
    });

    const res = harness.extractBashBlocks(md, '## Flutter');

    assert.notStrictEqual(res.ok, true, 'an empty section must never read as pass');
    assert.ok(res.missing, 'an empty section must report `missing` with a reason');
    assert.strictEqual(res.missing, 'no bash blocks in section');
    assert.strictEqual((res.blocks || []).length, 0);
  });

  // Case E3 — the boundary. A ```bash block in the FOLLOWING section is not collected.
  // Two sections, each with a distinguishable block body.
  test('Case E3 — extraction stops at the next heading of the same or higher level', () => {
    const md = makeDoc({
      sections: [
        { heading: '## Web', blocks: [{ lang: 'bash', body: 'echo WEB_MARKER' }] },
        { heading: '## Flutter', blocks: [{ lang: 'bash', body: 'echo FLUTTER_MARKER' }] },
      ],
    });

    const res = harness.extractBashBlocks(md, '## Web');

    assert.strictEqual(res.ok, true, `extraction must succeed: ${res.error || res.missing || ''}`);
    assert.strictEqual(res.blocks.length, 1, 'only the Web section\'s block is in scope');
    assert.match(res.blocks[0].body, /WEB_MARKER/);
    assert.doesNotMatch(res.blocks[0].body, /FLUTTER_MARKER/, 'the next section\'s block must NOT be collected');
    assert.strictEqual(res.blocks[0].startLine, lineOf(md, '```bash'),
      'startLine is the 1-based line of the opening fence');
  });

  // Case E4 — fence selection. Only fences whose info string's FIRST token is `bash`,
  // and an info string with attributes still counts.
  test('Case E4 — non-bash fences are ignored; ```bash with attributes is collected', () => {
    const md = makeDoc({
      sections: [{
        heading: '## Flutter',
        blocks: [
          { lang: 'yaml', body: 'key: value' },
          { lang: '', body: 'plain fenced text' },
          { lang: 'markdown', body: '# not a heading, it is fenced' },
          { lang: 'bash', body: 'echo PLAIN_BASH' },
          { lang: 'bash title=capture', body: 'echo ATTRIBUTED_BASH' },
        ],
      }],
    });

    const res = harness.extractBashBlocks(md, '## Flutter');

    assert.strictEqual(res.ok, true, `extraction must succeed: ${res.error || res.missing || ''}`);
    assert.strictEqual(res.blocks.length, 2, 'exactly the two bash fences, in document order');
    assert.match(res.blocks[0].body, /PLAIN_BASH/);
    assert.match(res.blocks[1].body, /ATTRIBUTED_BASH/);
    // The fenced `# not a heading` line must not have been mistaken for a section boundary.
    assert.doesNotMatch(res.blocks[0].body, /not a heading/);
  });

});

test.describe('agent-shell-harness — call splitting (S)', () => {

  // Case S1 — the baseline of the model: the Bash tool makes ONE call per logical
  // command, in order. `line` is 1-based within the block so a finding can point a
  // reviewer at the prose that produced it.
  test('Case S1 — three single-line commands become three calls, in order, with 1-based lines', () => {
    const block = [
      'flutter pub get',
      'flutter analyze',
      'flutter test',
    ].join('\n');

    const calls = harness.splitCalls(block);

    assert.strictEqual(calls.length, 3, 'three commands, three Bash-tool calls');
    assert.deepStrictEqual(calls.map(c => c.call), ['flutter pub get', 'flutter analyze', 'flutter test']);
    assert.deepStrictEqual(calls.map(c => c.line), [1, 2, 3], '1-based source lines, in order');
    assert.deepStrictEqual(calls.map(c => c.index), [0, 1, 2]);
  });

});
