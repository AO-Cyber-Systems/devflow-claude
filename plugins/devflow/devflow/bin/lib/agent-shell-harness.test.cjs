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
const { execFileSync } = require('node:child_process');

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

  // Case X5 — containment. The harness must be safe to point at arbitrary agent prose:
  // one day it runs in CI against a file someone just edited. A call naming an absolute
  // path outside the scratch root is BLOCKED — not merely reported after the fact.
  test('Case X5 — a call writing outside the scratch root is blocked with a containment finding', () => {
    const root = makeRoot();
    const outside = '/tmp/harn-outside-marker';
    fs.rmSync(outside, { force: true });

    try {
      const res = harness.runSection(harness.splitCalls(`touch ${outside}`), { root });

      assert.strictEqual(res.ok, false, 'escaping the scratch root must FAIL the section');
      const contained = res.calls[0].findings.find(f => f.type === 'containment');
      assert.ok(contained, `a containment finding is required: ${JSON.stringify(res.calls[0].findings)}`);
      assert.ok(contained.message.includes(outside), 'the finding must name the offending path');
      assert.strictEqual(res.calls[0].status, 'blocked', 'the call must not have been executed');
      assert.strictEqual(res.calls[0].cwd_after, root, 'a blocked call moves nothing');
      assert.ok(!fs.existsSync(outside),
        'containment PREVENTS the write — it does not just describe it afterwards');
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  // The other half of containment: HOME and TMPDIR are inside the root, so a call that
  // writes to "$HOME" (as real tooling does — caches, config) stays contained and passes.
  test('Case X5b — HOME and TMPDIR point inside the scratch root, so $HOME writes are contained', () => {
    const root = makeRoot();

    const res = harness.runSection(harness.splitCalls('touch "$HOME/cache-marker"'), { root });

    assert.strictEqual(res.ok, true, `a $HOME write must be contained, not blocked: ${JSON.stringify(res.findings)}`);
    assert.ok(fs.existsSync(path.join(root, '.home', 'cache-marker')),
      'and it landed inside the scratch root');
  });

  // Case X6 — the result shape 34-10's CI job renders. EVERY call is reported, passing
  // ones included: a harness that prints only failures cannot show a reviewer what it
  // actually ran, and "nothing printed" then reads identically to "nothing ran".
  test('Case X6 — checkSection reports every call in a stable shape, passing ones too', () => {
    const root = makeRoot();
    const md = [
      '## Flutter',                                //  1
      '',                                          //  2
      '```bash',                                   //  3
      '# note: the first call passes',            //  4
      'echo alpha',                                //  5
      'cd sub',                                    //  6
      'echo beta',                                 //  7
      '```',                                       //  8
      '',                                          //  9
      '## Web',                                    // 10
      '',                                          // 11
      '```bash',                                   // 12
      'echo not-collected',                        // 13
      '```',                                       // 14
      '',
    ].join('\n');
    const mdPath = path.join(root, 'prose.md');
    fs.writeFileSync(mdPath, md);

    const res = harness.checkSection(mdPath, '## Flutter', { root });

    assert.strictEqual(res.section, 'Flutter');
    assert.strictEqual(res.missing, null, 'a section that ran is not MISSING');
    assert.strictEqual(res.ok, false, 'the `cd sub` call leaks the persisted cwd');
    assert.ok(res.engine_version, 'the result is stamped with the engine that produced it');

    assert.strictEqual(res.calls.length, 3, 'the Web section\'s block is not collected');
    const FIELDS = ['index', 'line', 'call', 'annotations', 'cwd_before', 'cwd_after',
                    'status', 'stdout', 'stderr', 'findings'];
    for (const c of res.calls) {
      for (const f of FIELDS) {
        assert.ok(Object.prototype.hasOwnProperty.call(c, f), `every call record carries \`${f}\``);
      }
      assert.ok(Array.isArray(c.findings));
    }

    // The passing calls are present WITH an empty findings list — not omitted.
    assert.deepStrictEqual(res.calls[0].findings, []);
    assert.strictEqual(res.calls[0].status, 0);
    assert.strictEqual(res.calls[0].stdout.trim(), 'alpha');
    assert.deepStrictEqual(res.calls[0].annotations, ['# note: the first call passes'],
      'the annotation attached to the call that FOLLOWS the comment');
    assert.strictEqual(res.calls[0].line, 5, 'lines are absolute in the markdown FILE');

    assert.ok(res.calls[1].findings.some(f => f.type === 'cwd-leak'));
    assert.strictEqual(res.calls[1].line, 6);

    assert.deepStrictEqual(res.calls[2].findings, [], 'the third call passed and is still reported');
    assert.strictEqual(res.calls[2].cwd_before, path.join(root, 'sub'),
      'and it ran inside the leaked directory, exactly as the Bash tool would');
  });

  // Honest output: a section the harness could not execute is MISSING with the reason,
  // never `pass` — asserted at the checkSection level, where 34-10's CI job reads it.
  test('Case X6b — checkSection never reports pass for a section it could not execute', () => {
    const root = makeRoot();
    const mdPath = path.join(root, 'prose.md');
    fs.writeFileSync(mdPath, ['## Flutter', '', 'Prose only.', ''].join('\n'));

    const absent = harness.checkSection(mdPath, '## Nope', { root });
    assert.strictEqual(absent.ok, false);
    assert.ok(absent.missing, 'a section that is not there must carry a reason');
    assert.match(absent.missing, /Nope/, 'and the reason must name it');
    assert.deepStrictEqual(absent.calls, []);

    const empty = harness.checkSection(mdPath, '## Flutter', { root });
    assert.strictEqual(empty.ok, false);
    assert.strictEqual(empty.missing, 'no bash blocks in section');
    assert.deepStrictEqual(empty.calls, []);
  });

});

// ══════════════════════════════════════════════════════════════════════════════════════
// TRD 34-10 — the harness meets real prose.
//
// Test list (TRD 34-10 <test_list>, written before any test code), outside-in — the real
// file LAST, because it is the integration case and everything before it is what makes
// it diagnosable:
//   Scratch repo and stubs (F)
//     F1 — makeScratchRepo() builds a monorepo by hand: flutter/pubspec.yaml, lib/,
//          integration_test/, test_driver/integration_test.dart, .planning/objectives/
//          34-demo/, and a git repo with one commit
//     F2 — the REAL `df-tools verify flutter-ui-bootstrap` resolves packageDir to
//          <root>/flutter, ABSOLUTE (the W0-4 contract executor.md's prose relies on)
//     F3 — the three stubs accept exactly the invocations executor.md makes, emit
//          plausible artifacts, and exit NON-ZERO with their argv otherwise
//     F4 — with the stub PATH NOT prepended, the harness reports MISSING naming the
//          absent binary, and ok is not true
//   Annotations (A1-A7), evidence landing (E1-E2), the real file (R1-R5), CI (C1-C2)
//   follow in their own describes.
// ══════════════════════════════════════════════════════════════════════════════════════

const factory = require('./__fixtures__/agent-shell/scratch-repo/factory.cjs');

// Hand-built, never copied from a real project and never generated: every path below is
// written out in factory.cjs by name (CLAUDE.md habit 4).
function makeScratchRepo() {
  const root = factory.makeScratchRepo();
  ROOTS.push(root);
  return root;
}

test.describe('agent-shell-harness — the scratch monorepo and the stubs (F)', () => {

  test('Case F1 — makeScratchRepo builds a monorepo with a git repo and one commit', () => {
    const root = makeScratchRepo();

    assert.ok(path.isAbsolute(root), 'the factory returns an absolute, realpath-ed root');
    assert.strictEqual(root, fs.realpathSync(root), 'realpath-ed, or every call looks like a cwd leak');

    for (const rel of [
      'flutter/pubspec.yaml',
      'flutter/lib/main.dart',
      'flutter/integration_test/app_test.dart',
      'flutter/test_driver/integration_test.dart',
      'flutter/.maestro/flow.yaml',
    ]) {
      assert.ok(fs.existsSync(path.join(root, rel)), `${rel} must exist`);
    }
    assert.ok(fs.statSync(path.join(root, '.planning/objectives/34-demo')).isDirectory(),
      'the objective dir the evidence mv lands under');

    // `git rev-parse --show-toplevel` is executor.md's re-derivation path for $REPO_ROOT.
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf-8' }).trim();
    assert.strictEqual(fs.realpathSync(top), root, 'git rev-parse --show-toplevel must return the root');

    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim();
    assert.strictEqual(count, '1', 'exactly one commit — a hand-built repo, not a copied history');
  });

  test('Case F2 — the REAL bootstrap detector resolves packageDir to <root>/flutter, absolute', () => {
    const root = makeScratchRepo();
    const dfTools = path.join(__dirname, '..', 'df-tools.cjs');
    const out = execFileSync('node', [dfTools, 'verify', 'flutter-ui-bootstrap', '.', '--raw'],
      { cwd: root, encoding: 'utf-8' });
    const j = JSON.parse(out);

    assert.ok(path.isAbsolute(j.packageDir), 'W0-4 contract: packageDir is already absolute');
    assert.strictEqual(fs.realpathSync(j.packageDir), path.join(root, 'flutter'));
    assert.strictEqual(j.prefix, 'flutter', 'the monorepo layout executor.md documents');
    assert.strictEqual(j.action, 'skip', 'the fixture carries all the infra, so the detector skips');
  });

  test('Case F3 — each stub accepts only what executor.md invokes, and rejects the rest with its argv', () => {
    const root = makeScratchRepo();
    const pkg = path.join(root, 'flutter');
    const bin = factory.stubBinDir();
    const env = { PATH: bin + path.delimiter + process.env.PATH, HOME: path.join(root, '.home') };
    fs.mkdirSync(env.HOME, { recursive: true });
    const run = (cmd, args, cwd) =>
      execFileSync(path.join(bin, cmd), args, { cwd: cwd || pkg, env, encoding: 'utf-8' });

    assert.match(run('flutter', ['analyze', '--no-pub', '--no-fatal-warnings']), /No issues found!/,
      'analyze prints ONE deterministic line, so a baseline diff is stable');

    run('flutter', ['test', 'integration_test/app_test.dart']);
    run('flutter', ['test', 'integration_test/']);
    assert.ok(fs.existsSync(path.join(pkg, 'build/integration_test_screenshots/shot.png')),
      'flutter test integration_test/ emits the screenshots the evidence mv moves');

    run('flutter', ['build', 'apk', '--debug']);
    assert.ok(fs.existsSync(path.join(pkg, 'build/app/outputs/flutter-apk/app-debug.apk')));

    run('flutter', ['build', 'web', '--release']);
    assert.ok(fs.existsSync(path.join(pkg, 'build/web/main.dart.js')));

    fs.rmSync(path.join(pkg, 'build/integration_test_screenshots'), { recursive: true, force: true });
    run('flutter', ['drive', '--driver=test_driver/integration_test.dart',
      '--target=integration_test/app_test.dart', '-d', 'chrome']);
    assert.ok(fs.existsSync(path.join(pkg, 'build/integration_test_screenshots/web-shot.png')),
      'flutter drive emits the WEB screenshots under their own name, so the web and '
      + 'mobile evidence moves in executor.md are each independently falsifiable');

    const junit = path.join(root, '.planning/objectives/34-demo/evidence/maestro.xml');
    fs.mkdirSync(path.dirname(junit), { recursive: true });
    run('maestro', ['test', '.maestro/', '--format', 'junit', '--output', junit]);
    assert.ok(fs.existsSync(junit), 'maestro writes the junit xml at --output');
    assert.ok(fs.readdirSync(path.join(env.HOME, '.maestro/tests')).length > 0,
      'and leaves screenshots under ~/.maestro/tests/*/screenshots/, which the prose moves');

    run('adb', ['install', '-r', 'build/app/outputs/flutter-apk/app-debug.apk']);

    // A stub that exits 0 for anything turns every prose command into a no-op and every
    // section green. Each stub must reject an unknown invocation WITH the argv it saw.
    for (const [cmd, args] of [['flutter', ['bogus-subcommand']], ['maestro', ['record']], ['adb', ['shell']]]) {
      let threw = null;
      try { run(cmd, args); } catch (e) { threw = e; }
      assert.ok(threw, `${cmd} must reject ${JSON.stringify(args)}`);
      assert.strictEqual(threw.status, 2, `${cmd} rejects with exit 2`);
      assert.match(String(threw.stderr), new RegExp(args[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'and the message carries the argv it saw — that is what makes a red section diagnosable');
    }
  });

  test('Case F3b — the jq, pgrep and df-tools shims are equally strict', () => {
    const root = makeScratchRepo();
    const bin = factory.stubBinDir();
    const env = { PATH: bin + path.delimiter + process.env.PATH, HOME: path.join(root, '.home') };
    const jsonPath = path.join(root, 'boot.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ action: 'skip', packageDir: '/x/flutter', missing: [], setup_task: null }));
    const run = (cmd, args) => execFileSync(path.join(bin, cmd), args, { cwd: root, env, encoding: 'utf-8' });

    assert.strictEqual(run('jq', ['-r', '.action', jsonPath]).trim(), 'skip');
    assert.strictEqual(run('jq', ['-r', '.packageDir', jsonPath]).trim(), '/x/flutter');
    assert.strictEqual(run('jq', ['-r', '.missing | join(", ")', jsonPath]).trim(), '');

    let threw = null;
    try { run('jq', ['-r', '.nope', jsonPath]); } catch (e) { threw = e; }
    assert.ok(threw && threw.status === 2, 'an unlisted jq filter is rejected, not guessed at');

    // Nothing is running in the scratch environment, so the chromedriver guard's
    // checkpoint branch is the deterministic one.
    threw = null;
    try { run('pgrep', ['chromedriver']); } catch (e) { threw = e; }
    assert.ok(threw && threw.status === 1, 'pgrep chromedriver exits 1 — no chromedriver in a scratch root');

    // df-tools is a SHIM, not a stub: it execs this worktree's real df-tools.cjs.
    // Substitute the BINARY, keep the ARGUMENTS (verifier-ui-eval-invocation.test.cjs:38-42).
    const out = execFileSync(path.join(bin, 'df-tools'),
      ['verify', 'flutter-ui-bootstrap', '.', '--raw'], { cwd: root, env, encoding: 'utf-8' });
    assert.strictEqual(JSON.parse(out).action, 'skip');
  });

  test('Case F4 — a missing binary is MISSING, never a pass', () => {
    const root = makeScratchRepo();
    const res = harness.runSection(
      harness.splitCalls('flutter analyze --no-pub'),
      { root }   // deliberately NO pathPrepend: the stubs are not reachable
    );
    assert.strictEqual(res.ok, false, 'a section whose binary is absent must not read as a pass');
    assert.ok(res.missing, 'and it must carry a MISSING reason');
    assert.match(String(res.missing), /flutter/, 'naming the absent binary');
    assert.ok(res.findings.some(f => f.type === 'missing-binary' && f.binary === 'flutter'),
      'a missing binary is its own finding type, distinct from a genuine non-zero exit');

    const withStubs = harness.runSection(
      harness.splitCalls('flutter analyze --no-pub'),
      { root, pathPrepend: factory.stubBinDir() }
    );
    assert.strictEqual(withStubs.ok, true, 'the positive control: with the stubs on PATH it passes');
    assert.strictEqual(withStubs.missing, null);
  });

});

test.describe('agent-shell-harness — the `# harness:` annotation vocabulary (A) and evidence landing (E)', () => {

  // A1 — `expect` is how a call that cannot report its own success (an `mv … || true`,
  // a build that writes somewhere) is still asserted. Both directions, or it proves
  // nothing: a checker that never fails is the defect this program exists to close.
  test('Case A1 — `# harness: expect <path>` asserts the artifact the call claims to produce', () => {
    const made = harness.runSection(
      harness.splitCalls('# harness: expect made.txt\ntouch made.txt'),
      { root: makeRoot() });
    assert.strictEqual(made.ok, true, 'the artifact exists, so the section passes');

    const absent = harness.runSection(
      harness.splitCalls('# harness: expect never-made.txt\ntrue'),
      { root: makeRoot() });
    assert.strictEqual(absent.ok, false, 'a call that exits 0 without producing its artifact FAILS');
    const f = absent.findings.find(x => x.type === 'missing-artifact');
    assert.ok(f, 'the finding names the class');
    assert.match(f.message, /never-made\.txt/, 'and the path that was promised');

    // Resolved against the scratch ROOT, not the call's cwd — the whole point of the
    // evidence case is that the landing place does not move with the working directory.
    const sub = harness.runSection(
      harness.splitCalls('# harness: expect sub/deep.txt\n( cd sub && touch deep.txt )'),
      { root: makeRoot() });
    assert.strictEqual(sub.ok, true, 'a root-relative expect resolves against the root');
  });

  // A2 — the harness reports a cwd change as a LEAK because that is what it is, unless
  // the prose DECLARES the move. A declaration is visible in the file; a harness that
  // guessed which moves were intentional would be unfalsifiable.
  test('Case A2 — `# harness: expect-cwd <path>` declares an intentional directory change', () => {
    const root = makeRoot();
    const declared = harness.runSection(
      harness.splitCalls('# harness: expect-cwd {root}/sub\ncd sub'), { root });
    assert.strictEqual(declared.ok, true, 'a DECLARED move is not a leak');
    assert.strictEqual(declared.calls[0].cwd_after, path.join(root, 'sub'));

    const wrong = harness.runSection(
      harness.splitCalls('# harness: expect-cwd {root}/sub\ntrue'), { root: makeRoot() });
    assert.strictEqual(wrong.ok, false, 'a declaration the call did not honour FAILS');
    assert.ok(wrong.findings.some(f => f.type === 'cwd-mismatch'),
      'and it is its own finding type, distinct from an undeclared leak');

    // The negative control: without the declaration the same call is still a leak.
    const undeclared = harness.runSection(harness.splitCalls('cd sub'), { root: makeRoot() });
    assert.ok(undeclared.findings.some(f => f.type === 'cwd-leak'),
      'expect-cwd is a declaration, not a blanket amnesty');
  });

  // A3 — `executor.md`'s chromedriver guard ends `|| { echo CHECKPOINT…; exit 1; }`.
  // That exit 1 is CORRECT prose. Reporting it as a failure would push a reader to
  // "fix" working prose — the most expensive kind of false finding.
  test('Case A3 — `# harness: expect-exit <n>` makes a deliberate non-zero exit correct', () => {
    const declared = harness.runSection(
      harness.splitCalls('# harness: expect-exit 1\nfalse'), { root: makeRoot() });
    assert.strictEqual(declared.ok, true, 'a declared exit 1 is not a finding');
    assert.strictEqual(declared.calls[0].status, 1);
    assert.strictEqual(declared.calls[0].expected_status, 1);

    const unmet = harness.runSection(
      harness.splitCalls('# harness: expect-exit 1\ntrue'), { root: makeRoot() });
    assert.strictEqual(unmet.ok, false, 'a call that was supposed to fail and did not, FAILS');
    assert.ok(unmet.findings.some(f => f.type === 'nonzero-status' && f.status === 0));

    const undeclared = harness.runSection(harness.splitCalls('false'), { root: makeRoot() });
    assert.strictEqual(undeclared.ok, false, 'the default expectation is still 0');
  });

  // A4 — `derive` is a VISIBLE, PER-CALL declaration, never a shared environment. Let it
  // leak into the following call and 34-09's X3 (a $VAR assigned in one call, read in
  // the next) becomes unreachable on real prose — the harness would bless the exact bug
  // it was built to catch.
  test('Case A4 — `# harness: derive VAR=value` injects into THAT call only', () => {
    const one = harness.runSection(
      harness.splitCalls('# harness: derive OBJECTIVE_DIR=34-demo\necho "$OBJECTIVE_DIR"'),
      { root: makeRoot() });
    assert.strictEqual(one.ok, true, 'the derived variable is available to its own call');
    assert.strictEqual(one.calls[0].stdout.trim(), '34-demo');

    const leaked = harness.runSection(
      harness.splitCalls('# harness: derive OBJECTIVE_DIR=34-demo\necho "$OBJECTIVE_DIR"\necho "$OBJECTIVE_DIR"'),
      { root: makeRoot() });
    assert.strictEqual(leaked.ok, false, 'the SECOND call has no such variable and must fail');
    const f = leaked.findings.find(x => x.type === 'unset-variable');
    assert.ok(f, 'bash\'s own set -u diagnosis, not the harness simulating one');
    assert.strictEqual(f.variable, 'OBJECTIVE_DIR');
    assert.strictEqual(f.index, 1, 'and it is the second call, not the first');

    // `{root}` expands, which is what makes $REPO_ROOT/$PACKAGE_DIR declarable at all.
    const root = makeRoot();
    const expanded = harness.runSection(
      harness.splitCalls('# harness: derive REPO_ROOT={root}\necho "$REPO_ROOT"'), { root });
    assert.strictEqual(expanded.calls[0].stdout.trim(), root);
  });

  // A5 — prose is ILLUSTRATIVE. `<path/to/test.dart>` is the right thing to write for a
  // reader and unrunnable for a shell. `subst` replaces the literal token at run time so
  // the prose keeps its placeholder AND gets executed — and so the mirror path
  // `~/.claude/devflow/bin/df-tools.cjs`, which is correct prose, is never "fixed" into
  // a checkout path. Substitute the BINARY, keep the ARGUMENTS.
  test('Case A5 — `# harness: subst <token>=<value>` replaces a literal token before execution', () => {
    const root = makeRoot();
    const res = harness.runSection(
      harness.splitCalls('# harness: subst <path/to/test.dart>=sub/t.dart\n'
        + '# harness: expect sub/t.dart\ntouch <path/to/test.dart>'),
      { root });
    assert.strictEqual(res.ok, true, 'the substituted call ran and produced the artifact');
    assert.strictEqual(res.calls[0].call, 'touch <path/to/test.dart>',
      'the reported call is the PROSE, so a finding cites the text a reader must fix');
    assert.strictEqual(res.calls[0].executed, 'touch sub/t.dart',
      'and `executed` shows what bash actually got');

    // A value may contain `=`: split on the FIRST one only.
    const eq = harness.runSection(
      harness.splitCalls('# harness: subst TOKEN=--driver=x.dart\necho TOKEN'), { root: makeRoot() });
    assert.strictEqual(eq.calls[0].executed, 'echo --driver=x.dart');
  });

  // A6 — the single easiest way to make this harness worthless is a `skip` that counts
  // green. A skip is MISSING: the prose was never exercised, so nothing about it was
  // proven. A section of nothing but skips must not be `ok`.
  test('Case A6 — `# harness: skip <reason>` is MISSING, never a pass', () => {
    const res = harness.runSection(
      harness.splitCalls('# harness: skip needs a booted device\nflutter test'),
      { root: makeRoot() });
    assert.notStrictEqual(res.ok, true, 'a section of only skips is NOT ok');
    assert.strictEqual(res.calls[0].status, 'skipped');
    assert.ok(res.missing, 'and the section carries a MISSING reason');
    assert.match(String(res.missing), /needs a booted device/, 'which quotes the declared reason');
    assert.ok(res.findings.some(f => f.type === 'skipped'));

    // A skipped call is not executed at all: it can move nothing and produce nothing.
    const root = makeRoot();
    const inert = harness.runSection(
      harness.splitCalls('# harness: skip no device\ntouch should-not-exist.txt'), { root });
    assert.strictEqual(fs.existsSync(path.join(root, 'should-not-exist.txt')), false,
      'a skipped call is never run');
    assert.strictEqual(inert.calls[0].cwd_after, inert.calls[0].cwd_before);
  });

  // A7 — a typo'd annotation must not silently disable a check. `# harness: expct` that
  // is quietly ignored is worse than no annotation at all: the prose LOOKS asserted.
  test('Case A7 — an unknown `# harness:` directive is a finding, not a silent no-op', () => {
    const typo = harness.runSection(
      harness.splitCalls('# harness: expct made.txt\ntouch made.txt'), { root: makeRoot() });
    assert.strictEqual(typo.ok, false, 'a directive the harness does not understand FAILS the section');
    const f = typo.findings.find(x => x.type === 'unknown-annotation');
    assert.ok(f, 'and it is its own finding type');
    assert.match(f.message, /expct/, 'quoting the directive as written');

    // A malformed argument to a KNOWN directive is the same class of mistake.
    for (const bad of ['expect', 'expect-exit later', 'derive REPO_ROOT', 'subst =x', 'skip']) {
      const res = harness.runSection(
        harness.splitCalls('# harness: ' + bad + '\ntrue'), { root: makeRoot() });
      assert.strictEqual(res.ok, false, `\`# harness: ${bad}\` must not pass silently`);
      assert.ok(res.findings.some(x => x.type === 'unknown-annotation'));
    }

    // An ordinary prose comment is NOT a directive and must stay inert.
    const prose = harness.runSection(
      harness.splitCalls('# At task START (capture baseline to a file)\ntrue'), { root: makeRoot() });
    assert.strictEqual(prose.ok, true, 'only `# harness:` lines are directives');
  });

  // X5c — the containment scanner's own bug, found by E1/E2 on real prose: `"$REPO_ROOT"/x`
  // is a VARIABLE expansion followed by a suffix, not an absolute path. Reading the `/`
  // after the closing quote as a path start blocks every evidence command executor.md
  // writes — a harness that blocks the prose it was built to check verifies nothing.
  test('Case X5c — `"$VAR"/suffix` is not an absolute path, and a real one still is', () => {
    const root = makeRoot();
    const ok = harness.runSection(
      harness.splitCalls('# harness: derive REPO_ROOT={root}\n'
        + '# harness: expect sub/ev/x.txt\n'
        + 'mkdir -p "$REPO_ROOT"/sub/ev/ && touch "$REPO_ROOT"/sub/ev/x.txt'),
      { root });
    assert.deepStrictEqual(ok.findings.map(f => f.type), [],
      'a quoted variable expansion with a path suffix is not a containment escape');

    // The positive control: a genuine absolute path outside the root is STILL blocked.
    const blocked = harness.runSection(
      harness.splitCalls('touch /tmp/harn-x5c-marker'), { root: makeRoot() });
    assert.ok(blocked.findings.some(f => f.type === 'containment'),
      'the containment check must not have been loosened into uselessness');
    assert.strictEqual(fs.existsSync('/tmp/harn-x5c-marker'), false);

    // …and one inside a quoted string, which the old scanner also caught.
    const quoted = harness.runSection(
      harness.splitCalls('touch "/tmp/harn-x5c-quoted"'), { root: makeRoot() });
    assert.ok(quoted.findings.some(f => f.type === 'containment'));
  });

  // E1/E2 — the claim `agents/executor.md` makes in prose ("Both sides absolute — no cd,
  // so this command doesn't depend on cwd at all") executed from TWO starting working
  // directories. Running it from the repo root only would prove the author's intent;
  // running it from a package subdirectory as well is what proves the claim.
  test('Case E1/E2 — evidence lands in the same place from the root and from a subdirectory', () => {
    const out = factory.runEvidenceCaseFromBothCwds(harness);

    assert.strictEqual(out.root.ok, true, `from the repo root: ${JSON.stringify(out.root.findings)}`);
    assert.strictEqual(out.subdir.ok, true, `from <root>/flutter: ${JSON.stringify(out.subdir.findings)}`);
    assert.strictEqual(out.root.landed, '.planning/objectives/34-demo/evidence/shot.png');
    assert.strictEqual(out.root.landed, out.subdir.landed,
      'the SAME landing path from either starting cwd — that is the whole claim');
  });

});

// ══════════════════════════════════════════════════════════════════════════════════════
// The real file (R). R4 and R5 are written and asserted BEFORE the verdict cases: a green
// R1 on a section the harness could not parse — or could never fail — is the wave-0
// lag-check defect reproduced inside the tool built to prevent it.
// ══════════════════════════════════════════════════════════════════════════════════════

const EXECUTOR_MD = path.resolve(__dirname, '..', '..', '..', 'agents', 'executor.md');
const SECTIONS = [
  '## Flutter UI bootstrap detector (REQ-10-07)',
  '## Flutter UI per-task verification (REQ-10-04)',
  '## Flutter UI post-all-tasks verification (REQ-10-04)',
];

test.describe('agent-shell-harness — the real agents/executor.md (R)', () => {

  // R4 — the anti-vacuity guard. Two halves: the harness must find a non-trivial number
  // of calls in each section (a harness that finds nothing and reports green IS the
  // defect), and it must not over-collect — `executor.md`'s `##` headings live inside
  // `<step>` elements, and a section that runs past its `</step>` swallows the git commit
  // protocol and the state-advance block, neither of which is Flutter verification.
  test('Case R4 — each section yields a real, BOUNDED set of calls', () => {
    const md = fs.readFileSync(EXECUTOR_MD, 'utf-8');
    let total = 0;
    const counts = {};

    for (const section of SECTIONS) {
      const ex = harness.extractBashBlocks(md, section);
      assert.strictEqual(ex.ok, true, `${section} must be found with bash in it: ${ex.error || ex.missing}`);
      const calls = ex.blocks.flatMap(b => harness.splitCalls(b));
      assert.ok(calls.length >= 1, `${section} must yield at least one call`);
      counts[section] = calls.length;
      total += calls.length;

      // Over-collection is as bad as under-collection: it makes the section's verdict a
      // statement about prose the section does not own.
      const text = calls.map(c => c.call).join('\n');
      for (const foreign of ['git add ', 'git commit', 'state advance-job', 'PLAN_START_TIME',
        'roadmap update-job-progress', 'trd-tdd inspect']) {
        assert.ok(!text.includes(foreign),
          `${section} must stop at its own </step>: it captured \`${foreign}\``);
      }
    }

    assert.ok(total >= 12, `the three sections must total at least 12 calls, got ${total}`);
    // The measured counts, recorded so a later prose edit that deletes half the blocks
    // trips this rather than quietly shrinking the gate.
    assert.deepStrictEqual(counts, {
      '## Flutter UI bootstrap detector (REQ-10-07)': 5,
      '## Flutter UI per-task verification (REQ-10-04)': 6,
      '## Flutter UI post-all-tasks verification (REQ-10-04)': 11,
    });
  });

  // R5 — the differential control. Without it, R1-R3 passing proves the harness is
  // permissive, not that the prose is correct. Never mutate the real file: a crashed
  // test would leave the agent file broken.
  test('Case R5 — a deliberately broken COPY of executor.md FAILS', () => {
    const src = fs.readFileSync(EXECUTOR_MD, 'utf-8');
    const subshell = '( cd "$PACKAGE_DIR" && flutter test <path/to/test.dart> )';
    const bare = 'cd "$PACKAGE_DIR" && flutter test <path/to/test.dart>';
    assert.ok(src.includes(subshell), 'the prose under test must still contain the subshell form');

    const root = makeScratchRepo();
    const broken = path.join(root, 'broken-executor.md');
    fs.writeFileSync(broken, src.replace(subshell, bare));

    const res = harness.checkSection(broken, SECTIONS[1], {
      root, pathPrepend: factory.stubBinDir(),
    });
    assert.strictEqual(res.ok, false, 'the harness must be able to FAIL the file it checks');
    assert.ok(res.findings.some(f => f.type === 'cwd-leak'),
      'and it must fail it for the RIGHT reason — the bare `cd` leaking the cwd');
  });

  // R1-R3 — the deliverable. The CURRENT `agents/executor.md` Flutter sections, executed
  // under the real Bash-tool model against a hand-built monorepo and argument-checking
  // stubs. Only meaningful because R4 proved the harness found the blocks and R5 proved
  // it can fail.
  for (const [caseName, section] of [['R3', SECTIONS[0]], ['R1', SECTIONS[1]], ['R2', SECTIONS[2]]]) {
    test(`Case ${caseName} — ${section} passes end-to-end`, () => {
      const root = makeScratchRepo();
      const res = harness.checkSection(EXECUTOR_MD, section, { root, pathPrepend: factory.stubBinDir() });
      assert.strictEqual(res.missing, null, `MISSING: ${res.missing}`);
      assert.strictEqual(res.ok, true,
        'findings: ' + JSON.stringify(res.findings.map(f => ({ type: f.type, line: f.line, m: f.message })), null, 2));
      assert.ok(res.calls.length >= 1);
      assert.ok(res.calls.every(c => c.status === 0 || c.status === c.expected_status),
        'every call ended on the status its prose declares');
    });
  }

});
