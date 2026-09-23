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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const harness = require('./agent-shell-harness.cjs');

// ─── Scratch roots ────────────────────────────────────────────────────────────────────
//
// Registered BEFORE the first test that creates a root (TRD error_recovery): every root
// goes on a module-level array and one after() removes them all, so a FAILING test still
// cleans up. A harness that leaves directories behind is disabled within a month.
const ROOTS = [];

test.after(() => {
  for (const root of ROOTS) fs.rmSync(root, { recursive: true, force: true });
});

// realpath, because on macOS os.tmpdir() is a symlink (/var -> /private/var) and bash's
// $PWD is always the PHYSICAL path. Without this every call would look like a cwd leak
// and X2 could never pass.
function makeRoot() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harn-')));
  ROOTS.push(root);
  fs.mkdirSync(path.join(root, 'sub'));
  return root;
}

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

  // Case S2 — a trailing `\` continues the call onto the next line. The executor's real
  // `flutter drive` block is FOUR physical lines and ONE logical command; splitting it
  // would hand the harness three broken calls and a finding that means nothing.
  test('Case S2 — a line ending in a backslash continues: four physical lines, ONE call', () => {
    const block = [
      'flutter drive \\',
      '  --driver=test_driver/integration_test.dart \\',
      '  --target=integration_test/app_test.dart \\',
      '  -d chrome',
    ].join('\n');

    const calls = harness.splitCalls(block);

    assert.strictEqual(calls.length, 1, 'four physical lines, one logical command');
    assert.strictEqual(calls[0].line, 1, 'the call is reported at the line it STARTS on');
    assert.match(calls[0].call, /flutter drive/);
    assert.match(calls[0].call, /--driver=test_driver\/integration_test\.dart/);
    assert.match(calls[0].call, /--target=integration_test\/app_test\.dart/);
    assert.match(calls[0].call, /-d chrome/);
  });

  // Case S3 — annotation association. A full-line comment belongs to the call that
  // FOLLOWS it, which is how `# harness: expect <path>` reads in prose; 34-10's
  // `# harness:` vocabulary is built entirely on this rule. A trailing comment stays in
  // its own call's text (bash ignores it) AND is recorded as that call's annotation.
  test('Case S3 — full-line comments annotate the NEXT call; trailing comments stay on their own', () => {
    const block = [
      '# harness: expect marker.txt',
      '# and a second note on the same call',
      'touch marker.txt',
      'echo done  # trailing note',
    ].join('\n');

    const calls = harness.splitCalls(block);

    assert.strictEqual(calls.length, 2, 'comments are annotations, never calls of their own');

    assert.strictEqual(calls[0].call, 'touch marker.txt');
    assert.strictEqual(calls[0].line, 3, 'the call is at its own line, not the comment\'s');
    assert.deepStrictEqual(calls[0].annotations, [
      '# harness: expect marker.txt',
      '# and a second note on the same call',
    ], 'both preceding full-line comments attach to the NEXT call, in order');

    assert.match(calls[1].call, /echo done/);
    assert.match(calls[1].call, /# trailing note/, 'a trailing comment stays in the call text');
    assert.deepStrictEqual(calls[1].annotations, ['# trailing note'],
      'and is ALSO recorded as an annotation');
    assert.ok(!calls[1].annotations.includes('# and a second note on the same call'),
      'consumed annotations must not leak onto the following call');
  });

  // Case S4 — blank lines separate, they do not execute; and a heredoc is ONE call, not
  // one call per body line. Pinned even though the executor's current blocks have none,
  // because the gate-commits hook's heredoc handling shows this repo writes them — and a
  // heredoc split into five calls would produce five meaningless findings.
  test('Case S4 — blank lines are separators, not calls; a heredoc is ONE call', () => {
    const block = [
      'echo first',                                    // 1
      '',                                              // 2
      "cat > note.txt <<'EOF'",                        // 3
      'line one',                                      // 4
      '# not a comment, it is heredoc content',        // 5
      '',                                              // 6
      'line three',                                    // 7
      'EOF',                                           // 8
      '',                                              // 9
      'echo last',                                     // 10
    ].join('\n');

    const calls = harness.splitCalls(block);

    assert.strictEqual(calls.length, 3, 'two plain commands and one heredoc');
    assert.deepStrictEqual(calls.map(c => c.line), [1, 3, 10],
      'blank lines shift the line numbers but are never calls');

    assert.strictEqual(calls[0].call, 'echo first');
    assert.strictEqual(calls[2].call, 'echo last');

    const heredoc = calls[1].call;
    assert.match(heredoc, /^cat > note\.txt <<'EOF'/);
    assert.match(heredoc, /line one/);
    assert.match(heredoc, /line three/);
    assert.match(heredoc, /\nEOF$/, 'the heredoc call runs through its terminator');
    assert.deepStrictEqual(calls[1].annotations, [],
      'a `#` line inside a heredoc BODY is content, not an annotation');
    assert.deepStrictEqual(calls[2].annotations, [],
      'and it must not leak onto the call after the heredoc either');
  });

});

test.describe('agent-shell-harness — the runtime model (X)', () => {

  // Case X1 — the reason this TRD exists, negative direction. `cd sub` succeeds, and the
  // Bash tool would carry that directory into EVERY later call. The harness must detect
  // it and FAIL the section, naming the call and both working directories.
  test('Case X1 — a bare `cd sub` leaks the persisted cwd and FAILS the section', () => {
    const root = makeRoot();
    const sub = path.join(root, 'sub');

    const res = harness.runSection(harness.splitCalls('cd sub\ntouch marker.txt'), { root });

    assert.strictEqual(res.ok, false, 'a bare `cd X` must FAIL the section');
    assert.strictEqual(res.calls.length, 2, 'both calls are reported');

    const leak = res.calls[0].findings.find(f => f.type === 'cwd-leak');
    assert.ok(leak, 'call 1 must carry a cwd-leak finding');
    assert.ok(leak.message.includes(root), `the finding must name cwd_before: ${leak.message}`);
    assert.ok(leak.message.includes(sub), `the finding must name cwd_after: ${leak.message}`);
    assert.ok(leak.message.includes('cd sub'), 'the finding must name the offending call');

    assert.strictEqual(res.calls[0].cwd_before, root);
    assert.strictEqual(res.calls[0].cwd_after, sub);

    // The harness REPORTS the model, it does not correct it: call 2 really did run inside
    // sub. Resetting cwd to the root between calls would make X1 unfalsifiable.
    assert.strictEqual(res.calls[1].cwd_before, sub);
    assert.ok(fs.existsSync(path.join(sub, 'marker.txt')),
      'call 2 wrote into the leaked directory, exactly as the real Bash tool would');
  });

  // Case X2 — the same work, positive direction: the subshell form the executor is
  // required to use. cwd is unchanged, the section PASSES, and the file still lands in
  // sub/. Without this half, X1 would also pass on a harness that fails everything.
  test('Case X2 — `( cd sub && touch marker.txt )` leaves cwd unchanged and PASSES', () => {
    const root = makeRoot();

    const res = harness.runSection(harness.splitCalls('( cd sub && touch marker.txt )'), { root });

    assert.strictEqual(res.ok, true,
      `the subshell form must pass: ${JSON.stringify(res.findings || [])}`);
    assert.strictEqual(res.calls.length, 1);
    assert.strictEqual(res.calls[0].cwd_before, root);
    assert.strictEqual(res.calls[0].cwd_after, root, 'the subshell must not move the persisted cwd');
    assert.strictEqual(res.calls[0].status, 0);
    assert.deepStrictEqual(res.calls[0].findings, []);
    assert.ok(fs.existsSync(path.join(root, 'sub', 'marker.txt')),
      'and the work still happened inside sub/');
  });

  // Case X3 — the environment half of the model. Wave 0 spent three review rounds on
  // prose about variable persistence. This is the executable version: call 1 assigns,
  // call 2 reads, and because each call gets `set -u` and a FRESH env the failure is
  // REAL — bash itself says "unbound variable" — rather than simulated by the harness.
  test('Case X3 — a $VAR set in one call is UNSET in the next, with an unbound-variable finding', () => {
    const root = makeRoot();

    const res = harness.runSection(
      harness.splitCalls('REPO_ROOT=$(pwd)\necho "$REPO_ROOT"'), { root });

    assert.strictEqual(res.ok, false, 'environment must NOT persist between calls');
    assert.strictEqual(res.calls.length, 2);
    assert.strictEqual(res.calls[0].status, 0, 'the assignment call itself succeeds');
    assert.notStrictEqual(res.calls[1].status, 0, 'reading it in the NEXT call must fail');

    const unset = res.calls[1].findings.find(f => f.type === 'unset-variable');
    assert.ok(unset, `call 2 must carry an unset-variable finding: ${JSON.stringify(res.calls[1].findings)}`);
    assert.strictEqual(unset.variable, 'REPO_ROOT', 'the finding must NAME the variable');
    assert.ok(unset.message.includes('REPO_ROOT'));
    assert.match(res.calls[1].stderr, /REPO_ROOT: unbound variable/,
      'the diagnosis comes from bash, not from the harness guessing');
  });

  // Case X4 — the positive half. The same work, RE-DERIVED inside one call, passes.
  // Without it X3 would also pass on a harness that fails everything.
  test('Case X4 — the same work re-derived inside ONE call passes', () => {
    const root = makeRoot();

    const res = harness.runSection(
      harness.splitCalls('REPO_ROOT=$(pwd); echo "$REPO_ROOT"'), { root });

    assert.strictEqual(res.ok, true, `re-deriving in-call must pass: ${JSON.stringify(res.findings)}`);
    assert.strictEqual(res.calls.length, 1, 'one line is one call, `;` and all');
    assert.strictEqual(res.calls[0].status, 0);
    assert.strictEqual(res.calls[0].stdout.trim(), root,
      'and the value really is the working directory, captured off stdout uncorrupted');
  });

});
