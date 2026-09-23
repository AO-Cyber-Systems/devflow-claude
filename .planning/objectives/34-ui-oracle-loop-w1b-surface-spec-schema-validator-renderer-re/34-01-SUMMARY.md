---
objective: 34-ui-oracle-loop-w1b-surface-spec
job: "01"
subsystem: testing
tags: [yaml, parser, cjs, node-test, zero-dependency]

requires: []
provides:
  - "parseYamlLite(text) — a dependency-free YAML subset parser for Surface Spec front matter"
  - "YamlLiteError {message, name, line} — a parse error carrying a 1-based NUMERIC line"
  - "A closed refusal list: every construct outside the subset throws, none is silently mis-parsed"
affects: [34-02 parseSurfaceSpec, 34-03 schema validator, surface-spec front matter]

tech-stack:
  added: []
  patterns:
    - "Two-phase parse: tokenise to {line, indent, content, dash, key, value, code}, then build the tree"
    - "Quote masking: structural scans run over a same-length masked copy; slices come from the original"
    - "Refusal table matched against the masked, comment-free code region, in source order"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/yaml-lite.cjs
    - plugins/devflow/devflow/bin/lib/yaml-lite.test.cjs
  modified: []

key-decisions:
  - "Scalar typing landed in the parser core (task 2) rather than task 3, because Y3's `a: {b: 1}` requires `1` to be a NUMBER before Y6 is written."
  - "Refusals are matched against a masked, comment-free copy of the line, so `title: \"a & b\"` is not mistaken for an anchor and a `# &x` comment is inert."
  - "Block mapping keys go through the same parseKey() as flow mapping keys, so `\"a b\": 1` and `{\"a b\": 1}` cannot disagree."
  - "Two silent mis-parses found by audit (`- - x`, quoted block keys) were closed with new cases Y13/Y14 rather than written up as caveats."

patterns-established:
  - "Refusal cases assert err.name === 'YamlLiteError' AND typeof err.line === 'number' AND the message text — never assert.throws(fn) alone."
  - "When a prescribed case passes on arrival, run a differential control (break the implementation, watch that case and only that case go red) instead of claiming a RED that never happened."

requirements-completed:
  - SPEC-34-01
  - SPEC-34-02

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 55min
completed: 2026-09-22
---

# TRD 34-01: `yaml-lite` Summary

**A 475-line, zero-dependency YAML subset parser whose refusal half is closed: every one of 29 audited constructs either parses to its documented value or throws a `YamlLiteError` with a numeric line — none is silently mis-parsed.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (plus one unplanned audit task, see Deviations)
- **Files modified:** 2 (both created)
- **Commits:** 18 (`test:` → `feat:` pairs)

## Accomplishments

- `parseYamlLite(text)` parses block maps, block lists of scalars and of maps, inline (flow) maps and lists nested arbitrarily, quoted and bare scalars, and comments — with **zero** `require()` calls of any kind, builtin or otherwise.
- The refusal half names 12 constructs and reports each with a 1-based numeric `.line`.
- An audit of 29 constructs found **two silent mis-parses that the planned test list did not name**; both are now closed and pinned by tests (Y13/Y14).
- `package.json` still carries exactly one dependency, `node-pty`, asserted in code by Y12 as well as by the gate.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — structure (Y1-Y3) | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test yaml-lite.test.cjs 2>&1 \| tail -30; exit ${PIPESTATUS[0]}'` | 1 | PASS (RED as required) |
| 1: scope of the RED commit | `git log -1 --stat` → `yaml-lite.test.cjs \| 105 +++` only | 0 | PASS |
| 2: GREEN — parser core | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test yaml-lite.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS (`pass 4 / fail 0`) |
| 2: no collateral damage | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test flutter-ui-eval.test.cjs flutter-ui-eval-resolve.test.cjs helpers.test.cjs 2>&1 \| tail -8; exit ${PIPESTATUS[0]}'` | 0 | PASS (`pass 73 / fail 0`, = baseline) |
| 3: scalars, comments, refusals (Y4-Y12) | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test yaml-lite.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS (`pass 16 / fail 0`) |
| 3: refusal probe | `node -e "…5 unsupported constructs…"` | 0 | PASS (`rejected 5 of 5`) |
| 3: dependency guard | `bash -c 'grep -c "\"node-pty\"" package.json; node -e "const d=require(\"./package.json\").dependencies; process.exit(Object.keys(d).length===1 && d[\"node-pty\"] ? 0 : 1)"'` | 0 | PASS (grep printed `1`) |

## Task Commits

**Task 1 — RED: structure**
1. `0d56497` test(34-01): RED — yaml-lite structure cases Y1-Y3

**Task 2 — GREEN: parser core**
2. `32dd182` feat(34-01): GREEN — yaml-lite parser core: tokenise, then build

**Task 3 — scalars, comments, and every refusal, one at a time**
3. `67c7b08` test(34-01): RED — Y4 quoted scalars, escapes, quotes in flow lists
4. `d6ae517` feat(34-01): GREEN — quote masking and quoted scalars
5. `40ea2c5` test(34-01): Y5 colon-in-scalar and Y6 explicit scalar typing, with differential control
6. `397bd3b` test(34-01): RED — Y7 comment stripping outside quotes only
7. `7d7685d` feat(34-01): GREEN — strip comments during scalar scanning, not off the raw line
8. `3ce5329` test(34-01): RED — Y8 anchors, aliases and the merge key are refused
9. `3d79a5e` feat(34-01): GREEN — refuse anchors, aliases and the merge key with a line number
10. `f379c96` test(34-01): RED — Y9 block scalars and tags are refused
11. `1f135f6` feat(34-01): GREEN — refuse block scalars and tags
12. `42f3076` test(34-01): RED — Y10 tab indentation and a dedent to an unopened column
13. `a2e1646` feat(34-01): GREEN — refuse tab indentation and a dedent to an unopened column
14. `2087b9a` test(34-01): RED — Y11 duplicate keys and implicit single-pair flow maps
15. `d2229cd` feat(34-01): GREEN — refuse duplicate keys and implicit single-pair flow maps
16. `c1d5d9e` test(34-01): Y12 — no-dependency guard, asserted in code

**Unplanned audit task (see Deviations)**
17. `a1b67e8` test(34-01): RED — Y13/Y14 close the two silent mis-parses the audit found
18. `1d5a362` feat(34-01): GREEN — unquote block keys; refuse nested inline seqs, doc markers, explicit keys

No `refactor:` commit was needed — the tokenise/build split the TRD prescribed held for all 16 cases, and the error-recovery trigger ("a fourth special case in the indentation logic") never fired.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| focused suite | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test yaml-lite.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS — `tests 16 / pass 16 / fail 0` |
| refusal probe | `node -e "…"` over 5 unsupported constructs | 0 | PASS — `rejected 5 of 5` |
| dependency guard | `grep -c "\"node-pty\"" package.json` + one-dependency check | 0 | PASS — grep printed `1` |
| neighbouring suites | `node --test flutter-ui-eval.test.cjs flutter-ui-eval-resolve.test.cjs helpers.test.cjs` | 0 | PASS — `pass 73 / fail 0` (identical to the pre-TRD baseline) |

**Not a gate:** `npm test`. Per the TRD, this branch is red before this TRD starts.

## TDD Evidence

Every RED below was observed as a real non-zero exit code before any implementation, and the RED test was committed before the implementation that greens it.

| Case | Phase | Command | Exit Code | Observed |
|---|---|---|---|---|
| Y1-Y3 | RED | `node --test yaml-lite.test.cjs` | **1** | `Error: Cannot find module './yaml-lite.cjs'` — `pass 0 / fail 1` |
| Y1-Y3 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 4 / fail 0` |
| Y4 | RED | `node --test yaml-lite.test.cjs` | **1** | `AssertionError … actual: { title: '"{project.name}: overview # 1"', subtitle: "'it''s the rail'", escaped: '"say \"hi\" twice"', must_show: [ '"{project.name}"', "'plain text", "quoted'" ] }` — `pass 4 / fail 1` |
| Y4 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 5 / fail 0` |
| Y5, Y6 | (differential control) | see below | **1** then **0** | Case Y5 FAIL + Case Y6 FAIL with the implementation broken; `pass 7 / fail 0` restored |
| Y7 | RED | `node --test yaml-lite.test.cjs` | **1** | `Error [YamlLiteError]: unexpected content after a flow collection (line 7)`, `line: 7` — `pass 7 / fail 1` |
| Y7 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 8 / fail 0` |
| Y8 | RED | `node --test yaml-lite.test.cjs` | **1** | `AssertionError [ERR_ASSERTION]: expected parseYamlLite to throw, got a value instead` — `pass 8 / fail 1` |
| Y8 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 9 / fail 0` |
| Y9 | RED | `node --test yaml-lite.test.cjs` | **1** | `AssertionError [ERR_ASSERTION]: expected parseYamlLite to throw, got a value instead` — `pass 9 / fail 1` |
| Y9 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 10 / fail 0` |
| Y10 | RED | `node --test yaml-lite.test.cjs` | **1** | `AssertionError [ERR_ASSERTION]: expected parseYamlLite to throw, got a value instead` — `pass 10 / fail 1` |
| Y10 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 11 / fail 0` |
| Y11a+b | RED | `node --test yaml-lite.test.cjs` | **1** | both cases `expected parseYamlLite to throw, got a value instead` — `pass 11 / fail 2` |
| Y11a+b | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 13 / fail 0` |
| Y12 | RED | `node --test yaml-lite.test.cjs` | **1** | `AssertionError [ERR_ASSERTION]: require('js-yaml') is not a node builtin — yaml-lite must depend on nothing` — `pass 13 / fail 1` |
| Y12 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 14 / fail 0` |
| Y13+Y14 | RED | `node --test yaml-lite.test.cjs` | **1** | both cases FAIL — `pass 14 / fail 2` |
| Y13+Y14 | GREEN | `node --test yaml-lite.test.cjs` | **0** | `pass 16 / fail 0` |
| all | REFACTOR | not performed — none needed | n/a | n/a |

### Verbatim RED from task 1

```
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './yaml-lite.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/yaml-lite.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
    at wrapResolveFilename (node:internal/modules/cjs/loader:1048:27)
    at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1072:10)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1093:12)
    at Module._load (node:internal/modules/cjs/loader:1261:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1575:12)
    at require (node:internal/modules/helpers:191:16)
    at Object.<anonymous> (/Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/yaml-lite.test.cjs:21:42)
    at Module._compile (node:internal/modules/cjs/loader:1829:14) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [
    '/Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/yaml-lite.test.cjs'
  ]
}

Node.js v25.9.0
✖ yaml-lite.test.cjs (59.48025ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
```
Exit code: **1**.

### Differential controls (where a prescribed case passed on arrival)

**Y5 and Y6** passed the moment they were written: the behaviour they pin had already been
driven by Y2b (the colon-space separator) and Y3/Y4 (number typing, quoted-verbatim). Rather
than claim a RED that never happened, the implementation was broken on purpose and restored:

- Weakened the separator to a bare `':'` and made the quoted-scalar path re-type its contents.
- Result: **Case Y5 FAIL, Case Y6 FAIL, Y1-Y4 still pass** (`pass 5 / fail 2`).
- Restored: `pass 7 / fail 0`.

**Y5's first fixture could not fail for the bug it names.** Only the *first* colon on a line is
ever considered, so `path: /projects/:id/conversations` parses identically under a naive rule.
The fixture was strengthened with a block-list item (`- sha256:9f2b1c4ae0d3`) and a flow list,
where a naive separator turns each digest into the one-key map `{sha256: '9f2b…'}`. With that,
the control fails as required.

**Y12** was controlled by adding `require("js-yaml")` inside an uncalled function (so the module
still loads): **Case Y12 FAIL**, `pass 13 / fail 1`; restored `pass 14 / fail 0`.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 9/9 (all `must_haves.truths`)
- **Gate failures:** None
- **Scope proof:** every commit scoped `(34-01)` touched exactly
  `plugins/devflow/devflow/bin/lib/yaml-lite.cjs` and
  `plugins/devflow/devflow/bin/lib/yaml-lite.test.cjs` and nothing else
  (`git log --format='%h %s' origin/main..HEAD | grep '(34-01)' | … git show --name-only`).

### Re-measured `npm test` baseline

Measured on this worktree at TRD start (planning recorded 2974 pass / 9 fail / 50 skipped):

```
ℹ tests 3044
ℹ suites 461
ℹ pass 2984
ℹ fail 10
ℹ skipped 50
```

The 10 failures are all pre-existing and unrelated to this TRD:
`bin/handoff-e2e.test.cjs` (4, daemon timing), `bin/devflow-watch.test.cjs` (4),
`bin/lib/awareness.test.cjs` (1, peer scan), and `bin/lib/agent-shell-harness.test.cjs`
(1 — `Case S3`, TRD **34-09**'s in-flight RED test, committed to this same branch by the
parallel executor; not this TRD's file and not this TRD's to fix).

**Full-suite state at TRD end** (informational — `npm test` is explicitly not this TRD's gate):

```
ℹ tests 3065
ℹ suites 462
ℹ pass 3006
ℹ fail 9
ℹ skipped 50
```

All 16 yaml-lite cases run and pass inside the full suite. The 9 remaining failures are the
pre-existing set named in the TRD's `<context>` — `bin/handoff-e2e.test.cjs` (4),
`bin/devflow-watch.test.cjs` (4), `bin/lib/awareness.test.cjs` (1). 34-09's `Case S3` went
green in the interim, so the count is back to the 9 the TRD predicted. Net effect of this TRD
on the suite: **+16 passing tests, +0 failures.**

> **Note on the shared branch.** TRD 34-09 is executing into the *same* worktree and branch
> (`df/w1b-surface-spec`), so its commits are interleaved with these. The TRD's scope proof
> (`git diff --name-only $(git merge-base HEAD origin/main)..HEAD`) therefore also lists
> 34-09's `agent-shell-harness*.cjs`. The per-commit scope proof above is the accurate
> substitute; no 34-01 commit touched a file 34-09 owns.

## The supported subset, as shipped

34-02's fixture normalisation cites this list.

| Construct | Example | Parses to |
|---|---|---|
| Block mapping, nested by two-space indent | `references:` / `  mockup: refs/x.png` | `{references: {mockup: 'refs/x.png'}}` |
| Dedent back to an open column | `a:` / `  b: 1` / `c: 2` | `{a: {b: 1}, c: 2}` |
| Block sequence of scalars | `patterns:` / `  - a` / `  - b` | `{patterns: ['a','b']}` |
| Block sequence of maps | `- id: x` + continuation lines aligned to the `i` of `id` | array of objects |
| Flow mapping | `a: {b: 1}` | `{a: {b: 1}}` |
| Flow sequence | `a: [x, y]` | `{a: ['x','y']}` |
| Flow nested in flow, in a block list item | `- {click: r, expect: {route: c}}` | nested objects |
| Empty flow collections | `must_not_show: []`, `x: {}` | `[]`, `{}` |
| Double-quoted scalar | `title: "{p.name}: overview # 1"` | that whole string |
| Single-quoted scalar, `''` escape | `s: 'it''s fine'` | `"it's fine"` |
| Escapes inside double quotes | `e: "say \"hi\""` (`\\`, `\"`, `\n`, `\t`, `\r`) | `say "hi"` |
| Quoted key (block **and** flow) | `"a b": 1`, `{"a b": 1}` | key `a b` |
| Bare scalar with a glued colon | `locked_sheet: sha256:9f2b…`, `path: /projects/:id/…`, `at: 12:30` | the whole string |
| Integer / float | `1`, `-3`, `1.5` | Number |
| Boolean | `true`, `false` | Boolean |
| Null, and a key with an empty value and no block below | `null`, `~`, `guards:` | `null` |
| Date-shaped and dimension-shaped scalars | `2026-09-18`, `390x844` | **String** |
| Quoted digits | `"1"` | **String** `'1'` |
| Full-line comment | `# …` (any indent) | dropped |
| Trailing comment | `surface: rail   # why` | `'rail'` |
| `#` at the start of a value | `color: #fff`, `accent: #fff # why` | `'#fff'` |
| `#` inside quotes | `note: "a # b"`, `must_show: ["#1 priority"]` | preserved |
| CRLF and lone CR line endings | `a: 1\r\nb: 2\r\n` | normalised |
| Empty document / comments only | `""`, `# hi` | `null` |

## The refusal list, as shipped

Every one throws `YamlLiteError` with `name === 'YamlLiteError'` and a **numeric, 1-based** `.line`.

| # | Construct | Detected by | Message (prefix) |
|---|---|---|---|
| 1 | Explicit key | `/^\?(\s\|$)/` on the code region | ``an explicit key (`? key` / `: value`) is not supported by yaml-lite; use `key: value` `` |
| 2 | Merge key | `/^<<\s*:/` | ``the merge key `<<:` is not supported by yaml-lite; write the merged keys out in full`` |
| 3 | Anchor | `/(^\|\s)&[A-Za-z0-9_-]+/` | ``an anchor (`&name`) is not supported by yaml-lite; write the value out in full`` |
| 4 | Alias | `/(^\|\s)\*[A-Za-z0-9_-]+/` | ``an alias (`*name`) is not supported by yaml-lite; write the value out in full`` |
| 5 | Block scalar | `/:\s*[\|>][-+0-9]*\s*$/` | ``a block scalar (`\|` or `>`) is not supported by yaml-lite; use a quoted single-line string`` |
| 6 | Tag | `/(^\|\s)!!?[A-Za-z]/` | ``a tag (`!` / `!!`) is not supported by yaml-lite; scalars are typed by their spelling, not by a tag`` |
| 7 | Tab indentation | `/^ *\t/` on the raw line | ``tab indentation is not supported by yaml-lite; indent with two spaces per level`` |
| 8 | Document marker | line is exactly `---` or `...` | ``a document marker (`---` / `...`) is not supported by yaml-lite; …`` |
| 9 | Nested inline block sequence | body after `- ` starts with `- ` | ``a nested inline block sequence (`- - x`) is not supported by yaml-lite; …`` |
| 10 | Dedent to an unopened column | a token deeper than the open mapping, or tokens left unconsumed | ``indentation does not match any open block`` |
| 11 | Duplicate key (block, and flow) | a `Set` per mapping | ``duplicate key `k` in the same mapping`` / ``… in the same flow mapping`` |
| 12 | Implicit single-pair map in a flow sequence | depth-0 `': '` in a flow-sequence element | see below |
| — | Structural faults | — | ``unterminated double/single-quoted string``, ``unterminated flow collection``, ``unexpected content after a flow collection``, ``unexpected content after a quoted scalar``, ``expected `key: value` inside a flow mapping``, ``the top level of a yaml-lite document must be a block mapping (`key: value`) or a block sequence (`- item`)`` |

Refusals 1-8 are matched **in source order against the masked, comment-free code region**, so
the first offending line is the one reported, and `title: "a & b"` / `# &x` never false-fire.

### Y11b — the exact message 34-02 must quote

For input `activation: [pointer, keyboard: [Enter, Space]]`:

```
an implicit single-pair map inside a flow sequence is not supported by yaml-lite; write it as an explicit flow map, e.g. [pointer, {keyboard: [Enter, Space]}] (line 1)
```

`.name === 'YamlLiteError'`, `.line === 1`. The supported form it names —
`activation: [pointer, {keyboard: [Enter, Space]}]` — parses to
`{activation: ['pointer', {keyboard: ['Enter','Space']}]}`, asserted in Case Y11b.

## Constructs neither supported nor refused

**None.** An audit ran 29 constructs — every refusal above, every supported construct, plus
document markers, explicit keys, nested inline sequences, quoted keys with an embedded `: `,
multi-line plain scalars, trailing junk after a flow collection, unterminated flows and quotes,
a top level that is not a mapping, CRLF, an empty document, and five-level nesting. Every probe
either produced its documented value or threw a `YamlLiteError` with a numeric `.line`. No probe
produced a wrong error type, and no probe produced a value where a refusal was intended.

The audit **found two silent mis-parses on its first run**, which is precisely the failure mode
this TRD exists to prevent. Both were closed (see Deviations) and re-probed clean:

| Input | Before | After |
|---|---|---|
| `a:` / `  - - x` | the STRING `'- x'` | refused, line 2, "nested inline block sequence" |
| `"a b": 1` | `{'"a b"': 1}` — quotes kept in the key | `{'a b': 1}` |

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/yaml-lite.cjs` (475 lines, created) — `parseYamlLite` and
  `YamlLiteError`. Four phases: quote masking, tokenise + refuse, flow scanner, tree builder.
  Zero `require()` calls.
- `plugins/devflow/devflow/bin/lib/yaml-lite.test.cjs` (386 lines, created) — 16 cases
  (Y1, Y2a, Y2b, Y3-Y14) over hand-written YAML string literals. No fixture files, no generated
  data. A shared `refuses(yaml, {line, match})` helper asserts error *name*, numeric *line* and
  message text on every refusal.

## Decisions Made

1. **Scalar typing moved forward into task 2.** The TRD's task-2 sketch says "parseScalar(str)
   → return the trimmed string and let Y6 drive the typing", but Y3's prescribed assertion
   `a: {b: 1, c: [x, y]}` → `{a:{b:1,c:['x','y']}}` needs `1` to be a **Number**. Typing the
   scalars is therefore the smallest implementation that greens Y3.
2. **Quote masking as the single structural primitive.** Every scan for a `:`, `,`, `]`, `}` or
   ` #` runs over a same-length masked copy; slices are taken from the original. This is what
   makes the TRD's "do not strip `#` before tokenising quotes" gotcha structurally impossible
   rather than remembered.
3. **`#` at the start of a value is content.** The TRD's gotcha ("a `#` is only a comment when
   preceded by whitespace") and Y7's assertion (`color: #fff` → `'#fff'`) conflict as literally
   stated: in `color: #fff` the `#` *is* preceded by whitespace. Resolved in favour of the
   assertion: a `#` is a comment when preceded by whitespace **and** it is not the first
   character of the value region. `accent: #fff # why` → `'#fff'`, exercised in Y7.
4. **Block keys unquote through the same `parseKey()` as flow keys** — the two spellings of one
   key cannot disagree.
5. **No `refactor:` commit.** The prescribed tokenise-then-build split held; the TRD's own
   restructure trigger never fired.

## Deviations from Plan

### 1. [Rule 2 — Missing Critical] Two silent mis-parses closed with new cases Y13/Y14

- **Found during:** the construct audit the TRD's `<output>` section mandates ("Any construct
  you encountered that is neither supported nor refused — there must be none").
- **Issue:** with Y1-Y12 all green, `a:` / `  - - x` parsed to the **string** `'- x'`, and
  `"a b": 1` parsed to `{'"a b"': 1}` with the quotes inside the key. Both are exactly the
  outcome the TRD's first gotcha names as the single most damaging one. Three further
  constructs (document markers, explicit keys, a non-mapping top level) *were* refused, but
  every one of them blamed indentation.
- **Fix:** added Y13 (quoted block keys are unquoted) and Y14 (nested inline sequences,
  document markers, explicit keys and a non-mapping top level refused by name). RED observed
  (`pass 14 / fail 2`, exit 1) and committed before the implementation.
- **Files modified:** `yaml-lite.cjs`, `yaml-lite.test.cjs` — no others.
- **Verification:** the 29-construct audit re-run clean; focused suite `pass 16 / fail 0`.
- **Committed in:** `a1b67e8` (RED), `1d5a362` (GREEN).

### 2. [Rule 1 — Wrong as written] Y5's fixture could not fail for the bug it names

- **Found during:** the differential control for Y5/Y6.
- **Issue:** the prescribed sub-assertion `path: /projects/:id/conversations` parses identically
  whether the separator rule is `': '` or a bare `':'`, because only the first colon on a line
  is ever considered. The case could not fail for the bug it names.
- **Fix:** added a block-list item (`- sha256:9f2b1c4ae0d3`) and a flow list to the same case —
  a block-sequence item is where a naive separator does real damage, producing the one-key map
  `{sha256: '9f2b…'}` instead of a string.
- **Verification:** the differential control now fails Y5 and Y6 and only those.
- **Committed in:** `40ea2c5`.

### 3. [Rule 3 — Test measured the wrong thing] Y12 scanned prose, not code

- **Found during:** Y12's first run.
- **Issue:** the guard's `require\(['"]…['"]\)` scan hit the module's own header comment, which
  explains *why* yaml-lite is not `require('js-yaml')`. Real RED, wrong reason.
- **Fix:** strip block comments and whole-line `//` comments before scanning.
- **Verification:** differential control — a `require("js-yaml")` inside an uncalled function
  fails Y12 (`pass 13 / fail 1`); restored `pass 14 / fail 0`.
- **Committed in:** `c1d5d9e`.

### 4. [Documentation] Commit scope is `(34-01)`, not `(ui-spec)`

The TRD body's sample commit messages use `test(ui-spec): …`. The objective's stated convention
is `{type}({objective}-{trd})`, which takes precedence; all 18 commits use `(34-01)`.

---

**Total deviations:** 4 (2 missing-critical auto-fixes, 1 corrected test fixture, 1 test-scope
correction, plus a naming clarification). **Impact:** no scope creep — every commit touched only
the two files this TRD owns. Deviations 1-3 each strengthen a gate that would otherwise have
signed off on a defect.

## Issues Encountered

- **A parallel executor shares this worktree.** TRD 34-09 is committing to the same branch in the
  same checkout. `df-tools commit --files …` kept every 34-01 commit scoped to its own two files,
  but the TRD's `git diff --name-only merge-base..HEAD` scope proof is no longer meaningful on
  this branch — the per-commit proof above replaces it. 34-09's in-flight RED (`Case S3` in
  `agent-shell-harness.test.cjs`) also shows up as a 10th `npm test` failure.
- Nothing required a new npm dependency, and nothing forced a stop.

## User Setup Required

None.

## Next Objective Readiness

- **34-02 is unblocked.** `require('./yaml-lite.cjs')` gives `{ parseYamlLite, YamlLiteError }`.
- 34-02's fixture normalisation should cite the Y11b message quoted verbatim above, and the
  supported-subset / refusal tables in this SUMMARY.
- 34-03's validator can map a `YamlLiteError` to `SPEC000 unparseable front matter` and carry
  `.line` through unchanged — it is a Number on every refusal, asserted in every refusal case.
- **Not built here, by design:** front-matter/body splitting, the schema, the `projects-rail`
  fixture, and any `df-tools` arm. This TRD wires nothing.

---
*Objective: 34-ui-oracle-loop-w1b-surface-spec*
*Completed: 2026-09-22*
