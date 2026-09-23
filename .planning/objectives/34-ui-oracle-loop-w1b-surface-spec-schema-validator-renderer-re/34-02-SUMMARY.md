---
objective: 34-ui-oracle-loop-w1b-surface-spec
job: "02"
subsystem: devflow-runtime
tags: [ui-oracle-loop, surface-spec, schema, parser, fixtures, tdd]
duration: one session
completed: 2026-09-22
---

# TRD 34-02 SUMMARY — Surface Spec schema v1, the parser front door, and the `projects-rail` positive control

## Task Evidence

| Task | Commit | What shipped |
|---|---|---|
| 1 — RED: parseSurfaceSpec P1-P4 | `2cd194e` | `bin/lib/ui-spec.test.cjs` (P1-P4 only), observed failing |
| 2a — GREEN: parseSurfaceSpec | `dd0f241` | `bin/lib/ui-spec.cjs` |
| 2b — the positive control + F1-F4 | `261de0d` | `bin/lib/__fixtures__/ui-spec/projects-rail.md`, F1-F4 |
| 3a — RED: P5 + L1-L3 | `cf15594` | P5 (mirror guard), L1, L2, L3, observed failing |
| 3b — GREEN: schema + vocabulary | `ba6dc36` | `devflow/schemas/surface-spec.schema.json`, `devflow/schemas/must_not_vocabulary.json` |

Five files touched, exactly the five in `files_modified`. No new npm dependency —
`package.json` still carries only `node-pty`; `ui-spec.cjs` requires `fs`, `path` and
`./yaml-lite.cjs` and nothing else, and uses `structuredClone` (a node builtin) for the
per-call deep copies L3 pins.

## TDD Evidence

Suite baseline re-measured at TRD start (`npm test`, branch `df/w1b-surface-spec`):
**3073 tests / 3012 pass / 11 fail / 50 skipped.** The 11 failures sit in four files, none of
them touched here: `bin/devflow-watch.test.cjs` (4), `bin/handoff-e2e.test.cjs` (4),
`bin/lib/org-awareness-cli.test.cjs` (2), `bin/lib/awareness.test.cjs` (1). Per the TRD,
`npm test` is **not** the gate for this TRD; the focused suites are.

### RED 1 — P1-P4, before `ui-spec.cjs` existed

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec.test.cjs 2>&1 | head -12; exit ${PIPESTATUS[0]}'
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './ui-spec.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/ui-spec.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
...
ℹ tests 1
ℹ pass 0
ℹ fail 1
exit code: 1
```

### GREEN 1 — P1-P4

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec.test.cjs 2>&1 | tail -20; exit ${PIPESTATUS[0]}'
✔ Case P1 — a well-formed spec: front matter parsed, body verbatim after the terminator
✔ Case P2 — no front-matter block at all: THROWS, never returns {frontMatter: {}}
✔ Case P3 — front matter opened and never closed: THROWS, naming the opening line
✔ Case P4 — BOM, CRLF, and a markdown `---` rule inside the prose body
ℹ tests 4   ℹ pass 4   ℹ fail 0
exit code: 0
```

### RED 2 — F1-F4, before the fixture file existed

```
Error: ENOENT: no such file or directory, open
  '/Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/projects-rail.md'
    at loadFixture (.../ui-spec.test.cjs:136:30)
exit code: 1   (4 failing: F1, F2, F3, F4)
```

Two intermediate REDs against the fixture itself, both genuine yaml-lite refusals with a line
number (recorded in full under **Fixture normalisations** below):

```
Error [YamlLiteError]: unterminated single-quoted string (line 26)       exit code: 1
Error [YamlLiteError]: indentation does not match any open block (line 30) exit code: 1
```

### GREEN 2 — F1-F4, plus the positive-control probe

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec.test.cjs 2>&1 | tail -30; exit ${PIPESTATUS[0]}'
✔ Case P1 … ✔ Case P4
✔ Case F1 — the projects-rail fixture parses without throwing
✔ Case F2 — its shape: 2 routes, 2 controls, 3 header behaviours, 8 states, 3 flow steps
✔ Case F3 — the amended §4.2 constructs survive transcription (activation map, block states, hit_rect pair)
✔ Case F4 — the scalars yaml-lite is most likely to get wrong, on the REAL fixture
ℹ tests 8   ℹ pass 8   ℹ fail 0
exit code: 0

$ <the TRD's positive-control probe>
projects-rail 2 2 8 3
exit code: 0
```

### RED 3 — P5 + L1-L3, before the schema files existed

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec.test.cjs 2>&1 | grep -E "^(✔|✖|ℹ)"; exit ${PIPESTATUS[0]}'
✔ Case P1 … ✔ Case F4                                   (8 pass)
✖ Case P5 (the mirror guard) — the loaders work from a ~/.claude/devflow-shaped tree
✖ Case L1 — loadSurfaceSpecSchema(): version, required keys, and the id pattern
✖ Case L2 — loadMustNotVocabulary(): sorted, unique, sourced, and complete
✖ Case L3 — both loaders are pure reads: a mutated result never reaches the next caller
ℹ tests 12   ℹ pass 8   ℹ fail 4
exit code: 1

Error [SurfaceSpecError]: must_not_vocabulary.json not found at
  /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/schemas/must_not_vocabulary.json: ENOENT
```

**Deviation, stated plainly:** the two loader FUNCTIONS shipped in `dd0f241` alongside
`parseSurfaceSpec` (they are the module's three declared exports and share its `__dirname`
resolution header), so the RED for task 3 is driven by the missing schema DATA files rather
than by a missing function. The artefacts under test in task 3 are the two JSON files, and
they did not exist when P5/L1-L3 were observed failing. The RED is real and is attributable to
the deliverable; it is not a `Cannot find module`.

### GREEN 3 — the whole focused suite

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec.test.cjs 2>&1 | grep -E "^(✔|✖|ℹ)"; exit ${PIPESTATUS[0]}'
✔ P1 ✔ P2 ✔ P3 ✔ P4 ✔ F1 ✔ F2 ✔ F3 ✔ F4 ✔ P5 ✔ L1 ✔ L2 ✔ L3
ℹ tests 12   ℹ pass 12   ℹ fail 0
exit code: 0
```

## Post-TRD Verification

The TRD's `<verification>` command:

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec.test.cjs yaml-lite.test.cjs 2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 28
ℹ suites 0
ℹ pass 28
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
exit code: 0
```

28 = this TRD's 12 (P1-P5, L1-L3, F1-F4) + 34-01's 16.

Mirror-path probe (task 3 `<verify>`), executed rather than asserted:

```
$ bash -c 'set -e; T=$(mktemp -d); mkdir -p "$T/bin/lib" "$T/schemas"; cp .../ui-spec.cjs .../yaml-lite.cjs "$T/bin/lib/"; cp .../schemas/*.json "$T/schemas/"; ( cd /tmp && node -e "…loadSurfaceSpecSchema()…" ); rm -rf "$T"'
mirror-load: /private/tmp https://devflow.aocyber.ai/schemas/surface-spec/v1 schema_version=1 required=["surface","routes","controls","states","flows"]
exit code: 0
```

Vocabulary shape probe (task 3 `<verify>`):

```
$ bash -c 'node -e "…sorted && unique && includes(\"navigate on close\")…"'
["change route","cover sibling hit rects","fire twice per activation","lose selection","navigate on close","select the project","steal focus"]
exit code: 0
```

`npm test` is not a gate here. Post-TRD full suite: **3082 tests / 3020 pass / 12 fail / 50
skipped** — `bin/devflow-watch.test.cjs` (5), `bin/handoff-e2e.test.cjs` (4),
`bin/lib/agent-shell-harness.test.cjs` (2), `bin/lib/awareness.test.cjs` (1). Zero failures in
`ui-spec.test.cjs` or `yaml-lite.test.cjs`. Two notes on the drift from the 11 measured at
start: `devflow-watch` and `org-awareness-cli` are timing-flaky (org-awareness-cli's 2 failures
at start passed at the end; devflow-watch went 4 → 5), and the 2 `agent-shell-harness` failures
are **TRD 34-10's in-flight RED**, running in parallel on this branch — not caused by and not
fixable from this TRD.

## BLOCKER for 34-03/34-05/34-08 — `schemas/` is NOT in the sync-runtime allowlist

**The TRD's Runtime-model premise is factually wrong**, and the consequence is exactly the
W0-retrospective defect class this objective's `key_links` names — one directory down.

The TRD states: *"This TRD adds a new directory (`devflow/schemas/`) to the mirrored tree — it
is mirrored automatically because the hook copies `devflow/` wholesale."* It does not. The hook
copies an ALLOWLIST:

```js
// plugins/devflow/hooks/sync-runtime.js:114
const SUBDIRS = ['workflows', 'references', 'templates', 'bin'];
```

Verified against the live mirror:

```
$ ls ~/.claude/devflow/
audit.log  bin  CHANGELOG.md  initiatives  references  templates  VERSION  workflows
$ ls ~/.claude/devflow/schemas
ls: /Users/markemerson/.claude/devflow/schemas: No such file or directory
```

So `loadSurfaceSpecSchema()` — which correctly resolves `__dirname/../../schemas` and therefore
`~/.claude/devflow/schemas/` when it runs from the mirror — will throw
`SurfaceSpecError: surface-spec.schema.json not found … ENOENT` on **every skill invocation**,
while passing every test in the checkout. P5 proves the LAYOUT is right; it cannot prove the
SYNC happens, because it builds the tree by hand.

**Fix: one word** — `const SUBDIRS = ['workflows', 'references', 'templates', 'bin', 'schemas'];`
in `plugins/devflow/hooks/sync-runtime.js`. That file is **not** in this TRD's `files_modified`,
so it was deliberately not touched here. It must land, with its own RED case (assert
`~/.claude/devflow/schemas/surface-spec.schema.json` exists after a sync, or assert `'schemas'`
∈ `SUBDIRS`), before any skill calls `df-tools ui spec validate`. Suggested owner: whichever
W1b TRD arms the `df-tools ui` CLI (34-07), or a micro on its own.

Related and CORRECT, not a bug: `MIRROR_EXCLUDE` drops `__fixtures__/` and `*.test.cjs` from
the mirror. `__fixtures__/ui-spec/projects-rail.md` is therefore checkout-only, which is right —
it is test data, and every TRD that asserts against it does so from the checkout.

## Fixture normalisations against the AMENDED §4.2

The fixture is a hand transcription of the **amended** §4.2 (commit `4e27123`, branch
`docs/ui-oracle-loop-design`), not of the stale copy in this worktree. All normalisations are
recorded in an HTML comment at the top of the fixture's prose body as well as here.

### The three normalisations TRD 34-02 anticipated: all UNNECESSARY

The amendment removed the source constructs, so none of the three was performed.

1. **`activation`** — the TRD anticipated rewriting
   `activation: [pointer, keyboard: [Enter, Space]]` to `[pointer, {keyboard: [Enter, Space]}]`.
   Not needed: amended §4.2 writes it as a MAP, `activation: {pointer: true, keyboard: [Enter, Space]}`,
   which is squarely inside yaml-lite's subset. The list form is what 34-01 case Y11b refuses,
   verbatim:

   > `an implicit single-pair map inside a flow sequence is not supported by yaml-lite; write it as an explicit flow map, e.g. [pointer, {keyboard: [Enter, Space]}] (line N)`

   F3 asserts the parsed value is `{pointer: true, keyboard: ['Enter','Space']}` — **a deliberate
   departure from the TRD's test-list wording for F3**, which still quoted the pre-amendment
   list form. The amendment is the authority; the case id, intent and position are unchanged.
2. **`narrow` / `dark` states** — the TRD anticipated rewriting
   `- id: narrow      {viewport: 390x844, seed: …}` to a single flow map. Not needed: amended
   §4.2 already uses BLOCK syntax (`- id: narrow` / `viewport: "390x844"` / `seed: …`).
3. **`acceptance.locked_sheet`** — the TRD anticipated inventing a 64-hex digest. Not needed:
   amended §4.2 carries the quoted full hash
   `"sha256:9f2c1b7e4a6d0835c1e9b4f7a2d6c8e013b5a7f9d2c4e6081a3b5c7d9e1f3a5b7"`, transcribed
   verbatim.

Also from the amendment, transcribed as written and asserted by F3 (34-03/34-04 read them):
the second control `rail.project.chevron` with the full `hit_rect` shape
(`max: "40x40"`, `within: rail.project.header`, `disjoint_from: [rail.project.header]`) and
`rail.project.header`'s reciprocal `hit_rect: {disjoint_from: [rail.project.chevron]}`.
`hit_rect.within` is in the schema (I6 ruling). §4.4/§4.5-I4 disjointness holds on the fixture
and is pinned by F4: `outage.must_show = ["unavailable"]`, `empty.must_show = ["Create a project"]`,
intersection `[]`.

### The ONE addition beyond §4.2

`routes[1]` — `conversations.all`, `root: true`, `path: /conversations`, `entry: [deeplink]`,
`reachable_from_nav: true`, `title: Conversations`. §4.2 names this route only as
`back.target`. TRD 34-02 instructs transcribing it so invariant I2 ("every route has a `back`
or is the declared root") has a root to point at; without it the positive control would fail
34-03 for a reason that is an artefact of the transcription.

### TWO normalisations the transcription actually needed — both yaml-lite traps

Neither was fixed by editing `yaml-lite.cjs`: its refusal list is 34-01's, closed and
deliberate, and **both cases fail loudly with a line number rather than mis-parsing**. Both are
comment-level; no value in the fixture changed.

**(a) An apostrophe in a trailing comment is read as an opening quote.**

```
  - id: rail.project.header            # MUST equal the widget's semantics identifier
  →  Error [YamlLiteError]: unterminated single-quoted string (line 26)   exit code 1
```

`maskQuoted()` masks quoted regions over the WHOLE line before the comment is located (it has
to — a `#` inside a quoted scalar is not a comment), so a lone `'` after the `#` is still an
opening quote to it. Two comments were reworded to avoid apostrophes:
`# MUST equal the semantics identifier on the widget` and
`# inside the header area but MUST own its own hit target`.

**(b) A key whose value is ENTIRELY a trailing comment swallows the comment as its value.**

```
    behaviors:                         # `when` clauses are exclusive and cover visible_in
      - when: {control_state: collapsed, viewport: desktop}
  →  Error [YamlLiteError]: indentation does not match any open block (line 30)   exit code 1
```

`splitKeyValue()` begins its comment scan at `start + 1`, so a `#` sitting AT the value start is
not treated as a comment — deliberate, per 34-01's own note (`color: #fff` is the string
`'#fff'`). The consequence for an empty-valued key is that `behaviors` gets the comment text as
its value, the block beneath it then belongs to no open mapping, and the error surfaces two
lines later. Fixed by moving the comment onto its own full line above the key.

Both are worth a follow-up decision in 34-01's file (they are divergences from YAML 1.2, not
merely strictness), but neither is silent and neither blocks this TRD. **Spec authors should
know both**: 34-05's renderer and any `/devflow:ui-design` scaffold should avoid emitting a
trailing comment on an empty-valued key, and should avoid apostrophes in comments.

## The shipped schema — `required` and optional key lists

34-03 must implement against the shipped file, not against the TRD's draft.

- `$id`: `https://devflow.aocyber.ai/schemas/surface-spec/v1`
- `$schema`: `https://json-schema.org/draft/2020-12/schema`
- `schema_version`: `1`
- **`required` (exact, ordered):** `["surface", "routes", "controls", "states", "flows"]`
- **optional top-level properties:** `schema_version`, `patterns`, `references`, `design_read`,
  `mode`, `scope_rules`, `acceptance`
- `additionalProperties: false` at the top level and on every `$defs` object.
- **`$defs.id.pattern`:** `^[a-z0-9][a-z0-9.\-]*$` (JSON source `"^[a-z0-9][a-z0-9.\\-]*$"`).
  L1 checks every id in the positive control against the pattern the SCHEMA declares, not
  against a second copy of the rule.
- `$defs` shipped: `id`, `idList`, `stringList`, `effect`, `whenClause`, `contentContract`,
  `hitRect`, `behavior`, `route`, `control`, `state`, `flow`, `scopeRule`.
- **`$defs.effect` enum (from §7.5):** `navigation`, `toggle`, `select`, `dialog`, `submit`, `inert`.
- **`control.kind` enum:** `button`, `toggle`, `link`, `menu`, `disclosure-header`, `input`.
- **`scopeRule.on` enum (§4.6):** `workspace-switch`, `company-switch`, `project-switch`,
  `project-move`, `logout`.
- `route` requires `id`, `path`, `entry`; `control` requires `id`, `kind`, `visible_in`;
  `state` requires `id`; `flow` requires `id`, `steps`; `behavior` requires `does`, `effect`.
- `hitRect` properties: `max` (`^[0-9]+x[0-9]+$`), `within` (an id — the I6 ruling), `disjoint_from`.
- `acceptance.locked_sheet` pattern: `^sha256:[0-9a-f]{64}$`.

**The schema declares STRUCTURE only.** I1-I8 (§4.5) are 34-03's job, in code: "every route has
a `back` unless it is the root", "`behaviors` are exclusive and cover `visible_in`",
"`outage.must_show ∩ empty.must_show = ∅`", `hit_rect` resolvability/reciprocity/`within`
consistency. None is encoded here — a schema that half-expresses a rule gives it two homes and
lets them drift. JSON has no comments, so every property carries a `description` citing its §4.x
origin; those descriptions ARE the file's documentation.

## The shipped `terms[]`, verbatim

34-03's `CTRL007` and 34-05's control table both read this array.

```json
{
  "schema_version": 1,
  "source": "eden-ui-flutter design/must_not_vocabulary.json (W1a 1a-09)",
  "terms": [
    "change route",
    "cover sibling hit rects",
    "fire twice per activation",
    "lose selection",
    "navigate on close",
    "select the project",
    "steal focus"
  ]
}
```

Sorted, unique, seven terms — exactly those §4.3 and IMPLEMENTATION-PLAN line 265 name. No term
was invented. L2 additionally asserts that every `must_not` the positive control uses is in this
array, so the fixture cannot drift into free text that CTRL007 would then reject.

## The fixture's exact `states[].id` order

34-05's capture list and 34-06's sheet rows are ordered by this array. Pinned by F2 with
`deepStrictEqual`:

```
['populated', 'long-content', 'empty', 'error', 'outage', 'guard-denied', 'narrow', 'dark']
```

Eight states. `loading` is absent, matching §4.2 — §4.4 requires it only when the surface owns
an async fetch.

## Other shape facts later TRDs depend on

- `surface` = `projects-rail`; `mode` = `redesign`.
- `routes` (2, in order): `project.conversations` (`back.target: conversations.all`),
  `conversations.all` (`root: true`).
- `controls` (2, in order): `rail.project.header` (3 `behaviors`, `disabled_when: null`),
  `rail.project.chevron` (single `does` + `effect`).
- `flows` (1): `open-project-conversation`, 3 steps (`click`, `click`, `back`).
- `acceptance.locked_by` = `mark@aocyber.ai`; `locked_at` = `2026-09-18` (a STRING —
  yaml-lite does not date-type).
- `parseSurfaceSpec` returns `{frontMatter, body, schema_version}`. **The body rule, decided
  once:** `body` is everything after the terminator line's newline, verbatim; a leading BOM is
  stripped and CRLF is normalised to LF before the split, so a spec whose front matter is
  followed by a blank line has a body starting with `\n`.
- The fixture declares no `schema_version`, so `parseSurfaceSpec` reports the default `1`.
- `frontmatter.cjs` was NOT modified and is NOT reused. `ui-spec.cjs`'s header names it and
  says why this parser is strict where that one is lenient.
