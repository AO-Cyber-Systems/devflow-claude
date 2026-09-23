# TRD 34-05 SUMMARY — `renderSurfaceSpec`: manifest, nav graph, control table, capture list

`type: tdd` · wave 5 · `depends_on: ["34-04"]` · autonomous
Branch `df/w1b-surface-spec`, worktree `/Users/markemerson/Source/devflow-w1b`.

One hand-authored artifact (the Surface Spec) now yields four derived ones. `df-tools ui spec
render <file> --manifest|--graph|--table` emits them, refuses an invalid spec with exit 1, and is
byte-stable against three committed, human-read snapshots. `flutter-ui-eval.cjs` was **not
touched** — neither its judge behaviour nor anything else; `loadManifest` was already exported.

---

## Task Evidence

| # | Task | RED | GREEN | Files |
|---|------|-----|-------|-------|
| 1 | The manifest, proven by the engine that consumes it (M1-M5) | `20deb8e` | `a67137b` | `ui-spec-render.{cjs,test.cjs}` |
| 2a | The nav graph (G1-G4) | `8122f7c` | `50aff43` | `ui-spec-render.{cjs,test.cjs}` |
| 2b | The control table (T1-T4) | `08864bc` | `981c9e3` | `ui-spec-render.{cjs,test.cjs}` |
| 2c | The capture list (C1-C3) | `da43fee` | `70367e7` | `ui-spec-render.{cjs,test.cjs}` |
| 3a | The `render` arm and its refusal (R1-R5) | `df1d2fa` | `171913d` | `ui-spec-cli.{cjs,test.cjs}` |
| 3b | Determinism and three snapshots (D1-D2) | `77d3d30` | `6f7315f` | `__fixtures__/ui-spec/snapshots/*` |

Seven files changed — **exactly** this TRD's `files_modified`, no others:

```
$ git diff --name-only 30b7cb7..HEAD
plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/snapshots/projects-rail.controls.md
plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/snapshots/projects-rail.graph.mmd
plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/snapshots/projects-rail.manifest.json
plugins/devflow/devflow/bin/lib/ui-spec-cli.cjs
plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs
plugins/devflow/devflow/bin/lib/ui-spec-render.cjs
plugins/devflow/devflow/bin/lib/ui-spec-render.test.cjs
```

**No new npm dependency.** `package.json` is untouched and still carries exactly `node-pty`. The
mermaid graph and the markdown table are string concatenation, as the TRD's `<anti_patterns>`
requires.

---

## TDD Evidence

### Suite baseline, re-measured at TRD start (2026-09-22)

```
$ npm test
ℹ tests 3146
ℹ suites 467
ℹ pass 3086
ℹ fail 10
ℹ skipped 50
```

All 10 pre-existing and unrelated: `handoff-e2e` (4), `devflow-watch` (5), `awareness` S1 (1) —
CLI-spawn/timing flakes. **`npm test` is not this row's gate** (see `<verification>`).

### RED, verbatim

**Task 1 — M1-M5** (`20deb8e`):
```
$ node --test ui-spec-render.test.cjs
Error: Cannot find module './ui-spec-render.cjs'
Require stack:
- .../bin/lib/ui-spec-render.test.cjs
ℹ pass 0 / ℹ fail 1
exit code 1
```

**Task 2a — G1-G4** (`8122f7c`):
```
✖ Case G1 — TypeError: Cannot read properties of undefined (reading 'split')
✖ Case G2 — TypeError: Cannot read properties of undefined (reading 'split')
✖ Case G3 — TypeError: Cannot read properties of undefined (reading 'split')
✖ Case G4 — TypeError: Cannot read properties of undefined (reading 'endsWith')
ℹ pass 5 / ℹ fail 4     exit code 1
```
*First attempt at G3 failed with a `ReferenceError` on `resolveGuardDeniedState` — a FALSE RED
(the test had not imported it). The import was added and the RED re-run before committing; the
recorded output above is the real one.*

**Task 2b — T1-T4** (`08864bc`):
```
✖ Case T1 — TypeError: Cannot read properties of undefined (reading 'split')
✖ Case T2 — TypeError: Cannot read properties of undefined (reading 'split')
✖ Case T3 — TypeError: Cannot read properties of undefined (reading 'split')
✖ Case T4 — TypeError: Cannot read properties of undefined (reading 'split')
ℹ pass 9 / ℹ fail 4     exit code 1
```

**Task 2c — C1-C3** (`da43fee`):
```
✖ Case C1 — TypeError: Cannot read properties of undefined (reading 'length')
✖ Case C2 — TypeError: Cannot read properties of undefined (reading 'map')
✖ Case C3 — TypeError: Cannot read properties of undefined (reading 'map')
ℹ pass 13 / ℹ fail 3    exit code 1
```

**Task 3a — R1-R5** (`df1d2fa`):
```
✖ Case R1 — AssertionError: expected exit 0, got 1.
   stderr: Error: Unknown ui spec subcommand. Available: validate
✖ Case R4 — AssertionError: the refusal must name --manifest:
   Error: Unknown ui spec subcommand. Available: validate
ℹ pass 7 / ℹ fail 5     exit code 1
```

**Task 3b — D1-D2** (`77d3d30`):
```
✖ Case D2 — AssertionError: missing committed snapshot:
   .../__fixtures__/ui-spec/snapshots/projects-rail.graph.mmd
ℹ pass 17 / ℹ fail 1    exit code 1
```

### D1 passed on arrival — differential control, not a claimed RED

`renderSurfaceSpec` was already pure and order-preserving when D1 was written, so **no RED is
claimed for D1**. Instead `buildManifest` was made to alternate its key order between calls
(a module-level flip), and the suite re-run:

```
✖ Case D1 — AssertionError: manifest key order drifted
✖ Case D2 — (also red)
ℹ pass 16 / ℹ fail 2
```

D1 fired with the exact assertion message naming the bug it exists for. D2 went red too, which is
expected and not a leak: any manifest key-order drift necessarily breaks byte-stability as well —
D2 is a superset net over D1. **The other 16 cases were unaffected.** The implementation was
restored and `git diff plugins/devflow/devflow/bin/lib/ui-spec-render.cjs` is empty; `pass 18 /
fail 0`.

### GREEN — the TRD's `<verification>` command

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-render.test.cjs \
    ui-spec-cli.test.cjs ui-spec-validate.test.cjs ui-spec.test.cjs yaml-lite.test.cjs \
    2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 97
ℹ suites 0
ℹ pass 97
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
EXIT=0
```

### Real-binary probes (this row's gate evidence, verbatim)

**Consumer probe — the generated manifest loaded by the real `flutter-ui-eval` engine:**
```
$ node -e "... renderSurfaceSpec(spec).manifest -> tmpfile -> loadManifest(tmpfile) ..."
states 8 true
EXIT=0
```

**Arm probe — all three flags through the real binary:**
```
$ for f in --manifest --graph --table; do node ../df-tools.cjs ui spec render \
      __fixtures__/ui-spec/projects-rail.md $f > /dev/null 2>/dev/null; echo "$f exit=$?"; done
--manifest exit=0
--graph exit=0
--table exit=0
```

**Refusal probe — the guard that stops an unchecked manifest existing:**
```
$ node ../df-tools.cjs ui spec render __fixtures__/ui-spec/broken/route-without-back.md \
      --manifest > /tmp/r.out 2>&1; echo "exit=$?"; grep -c ROUTE002 /tmp/r.out
exit=1
1
```

**Byte-stability probe:**
```
$ node ../df-tools.cjs ui spec render __fixtures__/ui-spec/projects-rail.md --graph 2>/dev/null \
      | diff - __fixtures__/ui-spec/snapshots/projects-rail.graph.mmd; echo "graph diff exit=$?"
graph diff exit=0
```

**Untouched-file proof — the objective's out-of-scope line, asserted:**
```
$ git diff --name-only $(git merge-base HEAD origin/main)..HEAD | grep -c "flutter-ui-eval.cjs"
0
```
`loadManifest` did **not** need exporting — `flutter-ui-eval.cjs:911` already exports it. No line
of that file was changed, so the TRD's conditional one-line-export branch was never taken and the
M1 proof is the strong form (the real consumer executed), not the weaker copied-assertions
fallback.

---

## The generated manifest shape, per state

```json
{
  "surface": "projects-rail",
  "engine_version": "<pluginVersion()>",
  "schema_version": 1,
  "states": [
    {
      "state_id": "populated",
      "seed": "projects-3-conversations-12",
      "as": "workspace-member",
      "fault": null,
      "references": ["locked/populated.png"],
      "theme": "light",
      "viewport": null,
      "content": { "must_show": ["{project.name}"], "must_not_show": [] }
    }
  ]
}
```

**The null / `[]` conventions — 34-06's sheet and W2's probe both read these:**

| field | source | when undeclared |
|---|---|---|
| `state_id` | `state.id` | always present |
| `seed` | `state.seed` | **`null`**, never absent |
| `as` | `state.as` | **`DEFAULT_IDENTITY`** (`'primary'`) |
| `fault` | `state.fault` | **`null`**, never absent |
| `references` | `[state.ref]` | **`[]`**, never absent |
| `theme` | `state.theme` | **`DEFAULT_THEME`** (`'light'`) |
| `viewport` | `state.viewport` (the `WxH` string) | **`null`** |
| `content` | `state.content` | **`null`** |

All eight keys are on **every** state. A consumer that has to distinguish "absent" from "empty"
is a consumer with two code paths for one condition, and the one that forgets the second path is
the silent pass. **No state is ever filtered out** — a state with no `ref`, no `fault` and no `as`
is still a manifest row and still a capture line; 34-06 renders it `MISSING`.

**No field is invented.** `expected` — the judge's anchor, which `flutter-ui-eval.cjs` does read —
is deliberately **not** synthesised from `content` here: `references[]` calibration and the judge
are W2's, and guessing an anchor now would be W1b writing W2's semantics.

`states[]` order is the spec's `states[]` order, exactly (M3).

---

## Constants as shipped

| constant | value | why | read by |
|---|---|---|---|
| `DEFAULT_IDENTITY` | `'primary'` | §7.4's identity set is `(primary, workspace-member, non-member, platform-admin, support-agent)`; §4.2 annotates `as` "default: primary user" | 34-06, W1c's identity set |
| `DEFAULT_THEME` | `'light'` | the same default `ui-spec-validate.cjs`'s coverage model applies to a state declaring no `theme` | 34-06's grid columns |
| `DEFAULT_WIDTH` | `1280` | the desktop capture width; a state declaring a `viewport` contributes **its** width instead | 34-06's grid columns |

`NARROW_MAX_WIDTH` (600) is **not** re-declared here — it keeps its one home in
`ui-spec-validate.cjs`.

**`capture_id` template:** `` `<surface>--<state_id>--<theme>--<width>` ``, each part through
`filenameSafe()` (anything outside `[A-Za-z0-9._-]` becomes `_`). Worked examples from the
positive control:

```
projects-rail--populated--light--1280
projects-rail--narrow--light--390        (viewport: 390x844)
projects-rail--dark--dark--1280          (theme: dark)
projects-rail--guard-denied--light--1280
```

Capture-list **order** is the spec's `states[]` order, then theme, then width. Today that is one
triple per state; the secondary keys are declared so a state that later fans out to more than one
theme or width lands somewhere defined rather than wherever the loop put it. C2 also asserts
`capture_id` **uniqueness** — two captures sharing a filename means one silently overwrites the
other and the sheet shows a render of a state nobody looked at.

---

## The mermaid node-id sanitisation rule

```
<kind>_<id with every character outside [A-Za-z0-9_] replaced by _>
      kind ∈ {route, ctrl, state}, plus the single synthetic node `external`
```

Applied to **nodes and edges** alike. Mermaid ids cannot contain dots, so
`project.conversations` → `route_project_conversations`. **The LABEL always carries the real,
unsanitised id**, plus the route's `title` after a `<br/>`.

**Why the kind prefix, deviating from the TRD's illustrative snippet** (which shows bare
`project_conversations` / `rail_project_header` / `guard_denied`): without it a control
`rail.project.header` and a route `rail-project-header` sanitise onto one id, two unrelated edges
merge into one node, and the graph silently under-reports reachability — the exact failure §8.2
says the graph exists to prevent. The TRD states the graph's shape is illustrative and instructs
committing whatever is generated; the prefix is the one substantive change to it.

Node shapes: `route_*["…"]`, `ctrl_*(["…"])`, `state_*{{"…"}}`, `external[["external"]]`.
Edge kinds: entry `-- "label" -->` (solid), back `-. "via, list" .->` (**dashed**, one per
`back`, labelled with the whole `via` list), guard `-- "guard: <name> (as <identity>)" -->`.

**The guard edge uses 34-04's linkage rule and only that rule.** It calls
`ui-spec-validate.cjs`'s exported `resolveGuardDeniedState(guard, statesById)` — the same
function invariant I8 (`GUARD001`) and the behaviour-coverage model's `guard` dimension already
share. The positive control resolves on rung 3 (`guard-denied`), and the edge label carries that
state's `as` (`non-member`), which is what 34-04 recorded the `as` requirement is for. A guard
that resolves to nothing draws **no** edge rather than a guessed one — and it is unreachable
through the CLI anyway, because `GUARD001` refuses such a spec.

A `back` whose target is not a declared route is still **drawn**, labelled `(undeclared route)`.
That is an invariant's problem to report; an edge nobody can see is a reachability answer told
quietly and wrongly.

---

## How the `engine_version` snapshot trap was handled

**Placeholder, not exclusion.** `projects-rail.manifest.json` carries the literal:

```json
"engine_version": "<engine_version>",
```

D2 substitutes the live `pluginVersion()` for that placeholder before the byte comparison; M4
asserts the real value is a non-empty string separately. The field therefore stays visible in the
committed snapshot — a reader still sees that the manifest says which engine produced it — while
34-11's version bump cannot turn the regression net red for a reason unrelated to rendering. A
snapshot that must be regenerated every release is a snapshot people regenerate without reading.

The graph and control-table snapshots carry no version, so they are compared raw.

---

## Did `loadManifest` need exporting from `flutter-ui-eval.cjs`?

**No.** It is already in that file's `module.exports` (line 911–912). Zero lines of
`flutter-ui-eval.cjs` changed; the untouched-file proof prints `0`. Case M1 therefore executes
the real consumer rather than falling back to copied structural assertions, which the TRD flagged
as the weaker proof.

---

## `MISSING` is not laundered into a pass

W1b has no pinned `eden-ui-flutter` release, so **every** real run carries a `PAT000` row with
`status: 'MISSING'` — the pattern check could not run. `ok` counts real violations only, so it
does not flip and render proceeds. Rendering four confident-looking artifacts while silently
swallowing "one of my checks did not run" would be the silent-green class 34-04's header calls
out, so:

- `renderSurfaceSpec(...)` returns the verdict on `.validation`;
- the CLI arm writes each MISSING row to **stderr** as an advisory, plus a count line.

stdout carries **only** the artifact, so the byte-stability probe (which diffs stdout) is
unaffected. Observed:

```
$ node ../df-tools.cjs ui spec render __fixtures__/ui-spec/projects-rail.md --graph >/dev/null
advisory: PAT000 MISSING — the pattern catalogue is unreachable, so 2 referenced pattern(s)
  could not be resolved and no `must_not` defaults could be inherited — §4.5 I5 is UNCHECKED
  for this spec, which is not the same as passing (supply one with `--patterns`)
advisory: 1 check(s) did not run for .../projects-rail.md; a MISSING row is not a pass.
exit=0
```

This is **case R5**, added beyond the TRD's `<test_list>` — see Deviations.

---

## The CLI arm as shipped

```
df-tools ui spec render <file> [--manifest|--graph|--table] [--patterns <catalogue.json>]
```

| invocation | stdout | exit |
|---|---|---|
| `--manifest` | the manifest as pretty JSON | 0 |
| `--graph` | the mermaid graph | 0 |
| `--table` | the control-table markdown | 0 |
| *no flag* (the **default**) | `{spec, manifest, navGraphMermaid, controlTableMd, captureList}` as pretty JSON | 0 |
| invalid spec | the verdict JSON, in `validate`'s own shape — **no artifact at all** | **1** |
| unknown flag | `Error: Unknown render flag --x. Available: --manifest, --graph, --table` (stderr) | **1** |

`process.exitCode` throughout — never `process.exit()`, never `helpers.output()` (which calls
`process.exit(0)` unconditionally and would make this arm structurally incapable of failing).
R2 additionally asserts the bare render's `navGraphMermaid` / `controlTableMd` are byte-identical
to the single-flag arms, so a caller never has to run the arm three times and hope they agree.

`validate` and `render` now share one `parseAndValidate()` front half: "is this spec valid" asked
by two callers is one question, and two implementations of it eventually disagree about which
specs are valid.

---

## The control table's rendered text — what a human reads on the review sheet

This is the artifact a reviewer can object to. Pasted in full from the committed snapshot
`__fixtures__/ui-spec/snapshots/projects-rail.controls.md`:

```markdown
## Controls — projects-rail

*Design read:* utility rail; expression low, motion minimal, density compact
*Mode:* redesign

### rail.project.header (disclosure-header)

*Visible in:* populated, long-content, narrow

- When collapsed, on desktop: expands children; selects the project and scopes the middle pane. (toggle, select)
- When expanded, on desktop: collapses children; selection unchanged. It never changes route; it never loses selection. (toggle)
- On narrow: opens the project in the drawer. (navigation)

*Always:* It never fires twice per activation; it never covers sibling hit rects.

### rail.project.chevron (toggle)

*Visible in:* populated, long-content, narrow

- Activating rail.project.chevron toggles children visibility only. (toggle)

*Always:* It never selects the project; it never changes route.
```

**Templates, and the decisions in them:**

- One bullet **per `when` clause**. T2 asserts the bullet COUNT equals the behaviour count — a
  `contains('collapsed')` assertion passes on a table that merged three behaviours into one
  sentence, which is the render the plan's named case exists to forbid.
- Condition in words: `control_state` leads (`When collapsed`), other dimensions follow
  (`, on desktop`, `, in dark theme`, `, in the empty state`, `, when access is denied`). With no
  `control_state` the first phrase is capitalised (`On narrow: …`). An **absent** `when` key is a
  WILDCARD contributing no phrase — the same rule `ui-spec-validate.cjs`'s coverage model uses, so
  the table and the invariant describe one control rather than two. An entirely empty `when`
  renders `In every state`.
- `must_not` renders as English negations via `conjugate()`, which inflects only the term's
  leading verb (the vocabulary is phrased as bare verb phrases): `change route` → *"It never
  changes route"*, `cover sibling hit rects` → *"it never covers sibling hit rects"*.
- **Two must_not scopes, kept apart.** A **behaviour-level** `must_not` runs inline on its own
  behaviour's bullet. The **control-level** one — which §4.2 annotates as applying to every
  behaviour — renders **once**, on its own `*Always:*` line after the bullets. Emitting it inside
  the per-behaviour loop is exactly what puts T2's count off by one.
- `manual: true` (§4.3) prefixes `[human-verify]` at either scope, keeping free text on the human
  list instead of pretending it is machine-checkable. T3 proves both scopes against a mutated
  spec, since the positive control declares no `manual` flag.

**Wording objections a reviewer may want to raise:**
1. `- Activating rail.project.chevron toggles children visibility only. (toggle)` — the
   single-`does` template names the control in the sentence (T1 asks for it) even though the
   `###` heading already does. §8.3's quoted example (*"Clicking the project header toggles…"*)
   names it in prose too, so this follows the proposal rather than the heading.
2. The effect classes trail in parentheses **after** the negations. The TRD's illustrative block
   put them before, separated by an em dash. §8.3's quoted sentence runs the negation as the
   trailing sentence with no parenthetical in between, so the proposal's shape was followed and
   the machine annotation was pushed to the end.
3. `*Visible in:*` is an addition beyond both the TRD illustration and §8.3 — see Deviations.

---

## Deviations, each with its reason

1. **Case R5 added beyond the `<test_list>`** — the MISSING advisory on stderr. The `<test_list>`
   is otherwise unmodified; nothing was rewritten or dropped. R5 exists because the orchestrator's
   binding instruction (and 34-04's header) require that `PAT000`/`HIT000` not be laundered into a
   pass, and without a case the advisory could be deleted silently.
2. **Mermaid node ids carry a kind prefix** (`route_`/`ctrl_`/`state_`) where the TRD's
   illustrative snippet showed bare sanitised ids. Reason above under the node-id rule: without it
   two ids from different namespaces can collapse onto one node and merge unrelated edges. The TRD
   declares the graph's shape illustrative.
3. **The control-level `must_not` renders on its own `*Always:*` line**, not as a fourth bullet as
   in the TRD's illustrative table. The TRD's two CRITICAL constraints are honoured exactly (one
   line per `when`; the control-level `must_not` once per control); making it visibly *not* a peer
   of the behaviour bullets both reads more truthfully — it is a rule spanning all of them — and
   makes T2's count assertion structural rather than prose-coupled.
4. **`*Visible in:*` line added per control.** `visible_in` is already in the spec (no new rule
   invented), and the sheet reader needs to know which states a control appears in to judge the
   rest of the block.
5. **`runArm` in `ui-spec-cli.test.cjs` switched from `execSync` to `spawnSync`.** `execSync`
   returns only stdout and throws on non-zero, so the helper **discarded stderr on a successful
   run** — the exact stream and path R5 is about. A harness that cannot see stderr on success
   cannot fail for a missing advisory, which is the same blind-gate class this objective exists to
   close. A small argv tokenizer came with it, because `spawnSync` does no shell parsing and three
   existing call sites quote paths with `JSON.stringify`; all pre-existing CLI cases still pass.
6. **T3's negation count is derived from the spec, not hardcoded.** The first draft asserted 5
   where the fixture declares 6 — my arithmetic, not an implementation bug. Rather than patch the
   literal, the test now counts the declared `must_not` terms off the spec and asserts the rendered
   count equals it, so it tracks the fixture instead of my memory of it.
7. **`bin/df-tools.cjs`'s `case 'ui'` comment block still documents only `ui spec validate`.**
   That file is not in `files_modified` and needs no code change (dispatch already routes
   `ui spec` to `cmdUiSpec`), so it was left alone. **Carry-forward for 34-08** (the skill prose
   row): update that comment when `sheet`/`lock` land, or sooner.

Nothing was stopped on. No design decision arose that the TRD and the two settled corrections did
not cover; the settled corrections themselves (the 64-hex digest, and the chevron keeping its
reciprocal `disjoint_from` without a `within`) were taken as given and the renderer was built
against the positive control as it is on disk.

---

## Post-TRD Verification

**Focused suite — the TRD's `<verification>` command, exit code is the evidence:**
```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-render.test.cjs \
    ui-spec-cli.test.cjs ui-spec-validate.test.cjs ui-spec.test.cjs yaml-lite.test.cjs \
    2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 97   ℹ pass 97   ℹ fail 0   ℹ skipped 0
EXIT=0
```

Breakdown of the 18 new `ui-spec-render.test.cjs` cases: M1-M5, G1-G4, T1-T4, C1-C3, D1-D2.
`ui-spec-cli.test.cjs` grew from 7 to 12 cases (R1-R5).

**Real-binary probes:** consumer probe `states 8 true` exit 0 · arm probe `exit=0` ×3 · refusal
probe `exit=1` + `ROUTE002` count `1` · byte-stability probe `graph diff exit=0`. Verbatim above.

**Untouched-file proof:** `0` occurrences of `flutter-ui-eval.cjs` in the branch diff against
`origin/main`. The judge is unchanged; `references[]` is populated and nothing about how the
engine reads it was altered.

**`npm test` (NOT a gate)** — re-measured after the last commit:
```
ℹ tests 3169   ℹ pass 3109   ℹ fail 10   ℹ skipped 50
```
Against the start-of-TRD baseline (`3146 / 3086 / 10 / 50`): **+23 tests, +23 passing, failures
unchanged at 10** — the same pre-existing `handoff-e2e` (4), `devflow-watch` (5) and `awareness`
S1 (1) CLI-spawn/timing flakes, by name. **No new failure was introduced.** (The 23 are the 18
new render cases plus the 5 new CLI render cases.)

---

## What the next rows inherit

- **34-06 (the sheet)** — `captureList` order and `capture_id` are its grid and its on-disk
  lookup; `DEFAULT_THEME` / `DEFAULT_WIDTH` are its column values; a state with empty
  `references[]` is the `MISSING` cell, and the CLI's stderr advisory is the other MISSING source.
- **34-07 (the lock)** — the manifest, graph and table are all functions of `routes`/`controls`/
  `states`, so §4.1's re-lock rule ("any change to those clears `locked_sheet`") is exactly the
  set that changes these three bytes.
- **34-08 (the skill prose)** — `df-tools ui spec render` is reachable from a skill only after the
  next SessionStart (`sync-runtime` mirrors `plugins/devflow/devflow/` to `~/.claude/devflow/`).
  Also carry item 7 in Deviations.
- **W2** — `references[]` is populated but **uncalibrated**, and no `expected` anchor is
  synthesised. Both are W2's, and `flutter-ui-eval.cjs`'s judge behaviour is untouched.
