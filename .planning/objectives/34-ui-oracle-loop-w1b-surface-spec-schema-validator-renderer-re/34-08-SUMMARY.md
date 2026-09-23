# TRD 34-08 SUMMARY — build mode refuses to compose without a valid, locked spec

`type: tdd` · wave 8 · `depends_on: ["34-07"]` · `autonomous: true`
Branch `df/w1b-surface-spec`, worktree `/Users/markemerson/Source/devflow-w1b`.

`eden-flutter:frontend-design` build mode gains a **Surface Spec step** — the Phase A gate on the
composition path. It locates or drafts `flutter/ui_spec/<surface>.md`, validates it, reads the
`lock` status, and **refuses to compose** unless `ok` is true and the lock is `held`.
`design-stack-flutter.md` gains the two sections the spec's `must_not` vocabulary asserts against.

Both prose files ship with executable contract tests. §21 amendment 1 makes an executable check
mandatory for agent prose that encodes runtime semantics, and *"run this command"* is exactly such
a claim — so **every `df-tools` string the new prose names is EXECUTED by a test**, not read.

> ### ⚠ 34-06's human-verify checkpoint is still OUTSTANDING, and this TRD did not touch it
> No `ui lock` was run against any committed file. Every lock written during this TRD went to a
> `mkdtemp` directory or a `/tmp` copy. The committed positive control
> `__fixtures__/ui-spec/projects-rail.md` still reports `lock: "MISSING"`, and nothing here
> records or implies a human acceptance of the `projects-rail` review sheet.

---

## Task Evidence

| # | Task | RED | GREEN | Files |
|---|------|-----|-------|-------|
| 1 | The contract tests — extraction guards and executable claims (G1-G2, E1-E3) | `f3e0cb3` | — | `ui-spec-skill-contract.test.cjs` |
| 2 | Build mode's Surface Spec step, and the refusal sentence (S1-S7) | `df64c26` (+ `600a03c`) | `2cbd0a7` | `SKILL.md`, `ui-spec-skill-contract.test.cjs` |
| 3 | `design-stack-flutter.md`: Composition and semantics, Surface Spec (R1-R3) | `f7f91b2` | `3412be9` | `design-stack-flutter.md`, `ui-spec-skill-contract.test.cjs` |

```
$ git diff --name-only 039cf59..HEAD
plugins/devflow/devflow/bin/lib/ui-spec-skill-contract.test.cjs
plugins/devflow/devflow/references/design-stack-flutter.md
plugins/eden-ui-flutter/skills/frontend-design/SKILL.md
```

Exactly the three files in `files_modified`. **No new npm dependency** — `package.json` is
untouched and still carries exactly `node-pty`; the test file requires only `node:test`,
`node:assert`, `node:fs`, `node:os`, `node:path` and `node:child_process`.

---

## THE REFUSAL, AS SHIPPED

This is the Definition of Done for this row, and this is where a reviewer can object to the
wording. Quoted verbatim from `SKILL.md` build mode step 5:

> **Refusal:** Do not compose a surface whose spec reports `ok: false`, or whose `lock` is
> anything other than `held` — report the errors or the lock status and stop, rather than
> composing against an unapproved design.
>
> `PAT000` and `HIT000` rows carry `status: MISSING` when the pattern catalogue or the hit-rect
> probe was unreachable; they do not set `ok: false` and do not block composition. A check that
> could not run is not a violation, and treating it as one would block every surface in the repo.

Plus three per-branch imperatives, one for each non-`held` lock value:

> - `absent` — this surface has never been look-locked. Render the review sheet (…) and run the
>   look-lock checkpoint. **Do not compose.**
> - `cleared` — it was approved, and `routes`, `controls` or `states` has changed since; the
>   `reason` names which. Re-render the changed states, re-run the sheet, and run the look-lock
>   checkpoint again. **Do not compose.**
> - `MISSING` — the lock could not be determined, so whether a human ever approved this surface
>   is unknown. Stop and ask the user. **Do not compose.**

Flat imperatives, not "consider whether". **S2** asserts that one sentence carries BOTH conditions
(`ok` false AND a lock other than `held`), and asserts the absence of the two softening forms.

### The refusal PROVEN — five real spec states through the real binary

Not "the sentence is present": the five states a spec can actually be in, each produced by really
editing a real spec, each run through `df-tools ui spec validate`, mapped onto the step's own
branch rule (`ok === true && lock === 'held'`).

```
file       | ok        | lock     | step 5 branch
held       | true      | held     | PROCEED to composition
missing    | true      | MISSING  | REFUSE — Do not compose
absent     | true      | absent   | REFUSE — Do not compose
cleared    | true      | cleared  | REFUSE — Do not compose
invalid    | false     | MISSING  | REFUSE — Do not compose
```

* `held` — `ui lock` run on a temp copy of the positive control.
* `missing` — the committed positive control, untouched (an unsigned §4.2 illustration).
* `absent` — the same spec with its `acceptance:` block removed.
* `cleared` — the locked copy with `kind: disclosure-header` → `kind: button` (a `controls` change).
* `invalid` — `surface: projects-rail` → `surface: "Not A Valid Id"`.

**Four of five refuse. One proceeds.** A gate that only ever accepts is not a gate, and this is the
half the TRD asked to be proven.

### The ACCEPT proof — a MISSING check does not block composition

The same `held` run, in full. `ok` is **true** and the branch is PROCEED *even though* the verdict
carries a `PAT000` row, because W1b has no pinned `eden-ui-flutter` release and the pattern
catalogue is unreachable on every real run in this repo:

```json
{
  "ok": true,
  "errors": [ { "code": "PAT000", "status": "MISSING" } ],
  "lock": "held"
}
validate exit=0
```

Had step 5's refusal read `errors.length > 0` instead of `ok`, **every surface in the repo would
be blocked**. The prose says so explicitly (34-04's rule, one level up) so that nobody adds the
belt-and-braces check later.

---

## Every `df-tools` string the prose names, EXECUTED

Each was extracted from the new prose by the same regex the test uses and run against a
nonexistent spec. A REGISTERED arm refuses by name; an unregistered one would print
`Unknown ui subcommand` — the wave-0 defect class.

| prose region | command | exit | first line of output |
|---|---|---|---|
| `SKILL.md` step 5 | `ui spec validate` | 1 | `Error: spec not found: /nonexistent/spec-that-does-not-exist.md` |
| `SKILL.md` step 5 | `ui sheet` | 1 | `Error: spec not found: /nonexistent/spec-that-does-not-exist.md` |
| `SKILL.md` step 5 | `ui lock` | 1 | `Error: spec not found: /nonexistent/spec-that-does-not-exist.md` |
| `design-stack-flutter.md` `## Surface Spec` | `ui spec render` | 1 | `Error: spec not found: /nonexistent/spec-that-does-not-exist.md` |
| `design-stack-flutter.md` `## Surface Spec` | `ui sheet` | 1 | `Error: spec not found: /nonexistent/spec-that-does-not-exist.md` |

`## Composition and semantics` names no command (it is a composition-rules section), which is why
**E1's guard asserts the total across all three regions is non-zero** rather than per-region — a
per-region guard would have been a green assertion over an empty loop.

**Case E1 asserts exactly this, in code, by execution.** It is the whole reason this "prose" row
ships with a test file.

### The TRD's `<verify>` probe, run verbatim

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && grep -oh "df-tools\.cjs ui [a-z]* *[a-z]*" ../../../../eden-ui-flutter/skills/frontend-design/SKILL.md | sort -u'
df-tools.cjs ui lock
df-tools.cjs ui sheet flutter
df-tools.cjs ui spec validate
EXIT=0
```

Three arms, all registered. (`flutter` is the TRD's own grep pattern taking the next word of
`ui sheet flutter/ui_spec/<surface>.md` — an artefact of the probe, not a fourth arm. E1 runs the
parsed arm, not the grep output, which is why the executable check is the one that counts.)

### The refusal probe, run verbatim

```
$ bash -c 'grep -c "Do not compose" plugins/eden-ui-flutter/skills/frontend-design/SKILL.md'
4
```

Three per-lock-value imperatives plus the summary refusal — the TRD's predicted `4`.

---

## TDD Evidence

### Suite baseline, re-measured at TRD start (2026-09-22)

```
$ npm test
ℹ tests 3209
ℹ suites 467
ℹ pass 3149
ℹ fail 10
ℹ skipped 50
```

All 10 pre-existing and unrelated, in three files: `devflow-watch.test.cjs`,
`handoff-e2e.test.cjs`, `awareness.test.cjs` — CLI-spawn / daemon-timing flakes.
**`npm test` is not this row's gate** (the TRD's `<verification>` says so).

### RED — task 1 (G1-G2, E1-E3), verbatim, commit `f3e0cb3`

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-skill-contract.test.cjs'
✔ Case G1 — build mode is locatable by heading and bounded by the next `## ` heading (0.972125ms)
✖ Case G2 — the Surface Spec step exists and names at least one `df-tools … ui …` command (0.511042ms)
✖ Case E1 — every `df-tools … ui …` command the new prose names is a REAL registered arm, proven by EXECUTING it (0.351291ms)
✖ Case E2 — every path the new prose names resolves, or is a declared app-repo template path (0.7875ms)
✖ Case E3 — the `lock` vocabulary in the prose is exactly the set the real tool can emit (749.441375ms)
ℹ tests 5
ℹ pass 1
ℹ fail 4
EXIT=1
```

The reasons, verbatim:

```
✖ Case E2 …
  AssertionError [ERR_ASSERTION]: the new prose must name at least one reference file — E2 cannot pin what it cannot find

✖ Case E3 …
  AssertionError [ERR_ASSERTION]: build mode must contain a step titled **Locate or draft the Surface Spec** — the Phase A gate on the composition path
      at surfaceSpecStep (…/ui-spec-skill-contract.test.cjs:92:10)
      at TestContext.<anonymous> (…/ui-spec-skill-contract.test.cjs:308:16)
```

That is the right RED: the step does not exist, so nothing can be extracted from it and nothing can
be executed. **E3's 749ms is load-bearing** — its fixture derivation (four real specs, one real
`ui lock`, four real `validate` runs) had already RUN and its sanity assertion
`['MISSING','absent','cleared','held']` had already PASSED before it reached the prose and failed
there. The RED is about the prose, not about the fixture builder.

G1 passed on arrival — it is the extraction guard over pre-existing prose, and a guard that fails
on arrival is guarding nothing. A differential control for it is recorded below.

### RED — task 2 (S1-S7), verbatim, commit `df64c26`

```
✔ Case G1 …
✖ Case G2 …
✖ Case E1 …
✖ Case E2 …
✖ Case E3 …
✖ Case S1 — the step names `flutter/ui_spec/` and the `ui spec validate` arm (0.163875ms)
✖ Case S2 — THE REFUSAL: composition does not proceed when `ok` is false or `lock` is not `held` (0.135958ms)
✖ Case S3 — the step names the drafting inputs: pattern library, router table, mockup/donor, design read (0.104ms)
✖ Case S4 — the look-lock procedure is REFERENCED, not restated (0.138708ms)
✖ Case S5 — the Surface Spec step sits AFTER the design read and BEFORE composition planning (0.273792ms)
✖ Case S6 — the port path names the pattern-mapping page (§8.1) (0.102292ms)
✔ Case S7 — every pre-TRD build-mode step survives the renumbering (0.170708ms)
ℹ tests 12
ℹ pass 2
ℹ fail 10
EXIT=1
```

S7 passed on arrival, as it must: it is a no-regression net over content that existed before this
TRD (the same relationship 34-07 recorded for its P3). Differential control below.

### GREEN — task 2

```
✔ Case G1 … ✔ Case G2 … ✔ Case E1 … ✔ Case E2 … ✔ Case E3 …
✔ Case S1 … ✔ Case S2 … ✔ Case S3 … ✔ Case S4 … ✔ Case S5 … ✔ Case S6 … ✔ Case S7 …
ℹ tests 12
ℹ pass 12
ℹ fail 0
EXIT=0
```

### RED — task 3 (R1-R3), verbatim, commit `f7f91b2`

```
✖ Case R1 — `## Composition and semantics` states the four composition rules (0.223208ms)
✖ Case R2 — `## Surface Spec` states the one-file rule and the re-lock rule (0.096792ms)
✖ Case R3 — the eight pre-existing sections are present, in order, and the two new ones append (0.151291ms)
ℹ tests 15
ℹ pass 12
ℹ fail 3
EXIT=1
```

All three failed on `design-stack-flutter.md must contain a "## Composition and semantics" heading`
/ `"## Surface Spec"` — the sections did not exist. R3 fails on the same missing headings even
though its eight-section half was already true, which is correct: it asserts BOTH that the eight
survive AND that the two new ones append after them.

**R2 then failed a second time, on real prose** (`3412be9`'s first draft), and that failure is
worth recording because it is the case earning its keep:

```
✖ Case R2 …
  AssertionError [ERR_ASSERTION]: it must say a PROSE change does NOT clear the lock — the half of the rule that keeps the gate usable
```

The draft stated the shape half of the re-lock rule and buried the prose half inside a subordinate
clause. R2 exists because the buried half is the one people get wrong, and it caught it.

### GREEN — task 3, and the TRD's full `<verification>` command

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-skill-contract.test.cjs \
    ui-spec-lock.test.cjs ui-spec-cli.test.cjs ui-sheet.test.cjs ui-spec-render.test.cjs \
    ui-spec-validate.test.cjs ui-spec.test.cjs yaml-lite.test.cjs agent-shell-harness.test.cjs \
    2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 189
ℹ suites 7
ℹ pass 189
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
EXIT=0
```

### Differential controls — for the two cases that passed on arrival

Both breaks were applied to a byte copy, run, and restored; `diff -q` confirmed byte-identical
restoration before moving on, and the suite was back to `pass 15 / fail 0`.

| control | the break applied | result |
|---|---|---|
| C-S7 | `9. **Run the pre-flight check**` → `9. **Run the checks**` (a renumbering that drops a step) | `exit=1  red=['Case S7']` — **only** S7 |
| C-G1a | `## Review Mode` → `## Reviewing` | `exit=1  red=['Case S7']` — **G1 stayed green** |
| C-G1b | `## Build Mode` → `## Building` | `exit=1  red=[G1, G2, E1, E2, E3, S1-S7]` |

**C-G1a is the honest one.** G1 bounds the section on the *next `## ` heading, whatever it is*, so
renaming the following heading does not break the bound — and it should not: the bound's job is to
stop before the next mode, not to police that mode's name. What caught the rename was S7, which
asserts the three mode headings by name. C-G1b removes the heading G1 actually searches for and
G1 goes red, taking every dependent case with it — the correct cascade for a guard.

---

## Build-mode step numbering, before and after

| before | after | step |
|---|---|---|
| 0 | 0 | Read project theme |
| 1 | 1 | State the design read |
| 2 | 2 | Detect greenfield vs redesign |
| 3 | 3 | Understand the request |
| 4 | 4 | Check eden-ui-flutter for matching widgets |
| — | **5** | **Locate or draft the Surface Spec** ← new |
| 5 | 6 | Plan the composition |
| 6 | 7 | Generate Dart files |
| 7 | 8 | Verify |
| 8 | 9 | Run the pre-flight check |

**Nothing references build-mode steps by number.** Checked before renumbering:

```
$ grep -rn "frontend-design" plugins/ docs/ --include "*.md" | grep -v "skills/frontend-design/SKILL.md"
```

returns only prose *about* the skill (`brand-builder/SKILL.md`, the proposal, the implementation
plan) — no caller indexes into its steps. So the shift of five steps is safe, and the TRD's
fallback ("insert as step 0a rather than shifting eight steps") was not needed. **S7** guards the
content either way, and **C-S7** proves S7 can actually fail.

### Why 5 and not 0

The TRD, the proposal §8.1 and the plan row all call this "step 0", meaning *step zero of the
design work* — the gate before composition. Build mode's literal step 0 is already
*"Read project theme"*, so the name is a role, not an index. Position was chosen from the TRD's own
constraints, all of which are data dependencies:

* **after step 1** (design read) — the spec's `design_read` field is that sentence, carried verbatim;
* **after step 2** (greenfield/redesign) — the spec's `mode` field is that classification;
* **after step 3** (understand the request) and **step 4** (widget catalogue) — the drafting inputs;
* **before step 6** (plan the composition) — it is the gate *on* composition, which is the point.

The step says so in its own first line so a reader does not have to reconstruct it:

> (Proposal §4 and §8.1 call this build mode's *step 0*; it is numbered here by its position in the run.)

**S5** asserts the ordering by index, and additionally asserts the numbers ascend and are unique —
a renumber that produced two step 6s would go red.

---

## Step 5 (Phase A) and step 9 (Phase B) — how they relate, as written

Step 9 (*"Run the pre-flight check"*, the `/devflow:ui-eval` step) already existed. Read it before
writing step 5; the two must not read as rivals. The reconciliation is one paragraph, in step 5:

> This step and the pre-flight step are different gates and do not overlap: this one is the
> **Phase A** gate on the *design* — does an approved spec exist to compose against — and runs
> before any Dart is written. The pre-flight step is the **Phase B** gate on the *render*, and
> runs after.

Phase A asks *"is this the right design"* and is answered by a human looking at a review sheet.
Phase B asks *"does the built surface match it"* and is answered by the visual-eval engine.
Neither substitutes for the other, and step 5 never invokes `/devflow:ui-eval`.

---

## Mirror facts — which file is copied to `~/.claude/devflow/` and which is not

This distinction decides what an `@path` in each file may say, and getting it backwards produces a
reference that is dead at runtime.

| file | mirrored to `~/.claude/devflow/`? | consequence |
|---|---|---|
| `plugins/devflow/devflow/references/design-stack-flutter.md` | **YES** — `sync-runtime` copies all of `plugins/devflow/devflow/` | a path it names must exist under `plugins/devflow/devflow/` (the mirror SOURCE) so that it resolves under the mirror at runtime |
| `plugins/eden-ui-flutter/skills/frontend-design/SKILL.md` | **NO** — `eden-ui-flutter` is a separate plugin, loaded from its own plugin directory | the FILE is read from the plugin dir, but its `@~/.claude/devflow/references/…` references resolve through the DEVFLOW mirror — which is how it already loads `design-craft.md`, `design-tells.md`, `design-preflight.md` and `design-stack-flutter.md` |

So step 5's command strings name **`node ~/.claude/devflow/bin/df-tools.cjs …`** — the mirror —
because that is the binary a skill actually invokes. The contract test substitutes
`path.join(__dirname, '..', 'df-tools.cjs')` and keeps the ARGUMENTS
(`verifier-ui-eval-invocation.test.cjs:38-42`: *substitute the BINARY, keep the ARGUMENTS*), so the
prose stays honest about runtime while the test scores this worktree's build rather than a lagging
cache.

**E2 asserts every `@path` in `SKILL.md` resolves**, mapping `@~/.claude/devflow/<rest>` onto
`plugins/devflow/devflow/<rest>` — the mirror's source — and repo-relative `@plugins/…` paths onto
the checkout directly. Five references, all resolving.

---

## Gaps found and RECORDED, not patched here

The TRD's scope fence forbids touching the validator, renderer, sheet, lock or `df-tools.cjs`.
Three findings:

### 1. `ui spec validate`'s `lock` is NESTED, and the obvious read of it is silently wrong

34-07's SUMMARY describes *"a top-level `lock` field with one of four honest values"*. The shipped
shape is a top-level key `lock` holding an **object** whose own `lock` key carries the value:

```json
"lock": { "lock": "MISSING", "reason": "…", "locked_by": "…", "locked_at": "…" }
```

An agent that wrote `if (out.lock !== 'held') refuse` would compare an object to a string, and
would therefore **refuse every surface, including approved ones** — a gate that fails closed, but
for the wrong reason and with a message nobody can act on. Step 5's prose says *"Read the `lock`
block of that same output. Its `lock` value is one of exactly four"* precisely to avoid that.
No code change made; this is a note for whoever writes the next consumer, and a candidate for a
flattened or aliased field in W1★.

### 2. `df-tools.cjs`'s `case 'ui'` block comment still omits `ui spec render`

34-05 flagged this comment as a carry-forward. It has since been extended by 34-06 and 34-07 and
now documents `ui metrics`, `ui spec validate`, `ui sheet` and `ui lock` — but **not `ui spec
render`**, which is registered (`RENDER_FLAGS = ['--manifest','--graph','--table']`) and which this
TRD's new `## Surface Spec` section names. `df-tools.cjs` is not in this TRD's `files_modified`, so
the comment is left alone and recorded here. One comment line closes it.

### 3. Nothing pins the SKILL.md prose to `checkpoints.md`'s approval command except S4

The approval command string now appears in three files (`checkpoints.md`, `agents/executor.md`,
`SKILL.md`). 34-07's P2 covers the first two; this file's E1 covers the third's ARM but not its
FLAGS. **S4 closes that specific gap** by extracting any `ui lock` command the step cites and
requiring its flag set to match a form of the command in `checkpoints.md` — so
`--sheet-hash`/`--by` cannot drift between the two files without a test failing. It does not cover
`executor.md`'s copy; 34-07's P2/P3 do.

---

## Deviations from Plan

### 1. The new step is numbered **5**, not **0**

Recorded in full under *Build-mode step numbering* above: build mode's literal step 0 is already
*"Read project theme"*; "step 0" is the proposal's name for the role, and the step's own first line
says so. Every ordering constraint the TRD states is satisfied and asserted by **S5**.

### 2. The two new `design-stack-flutter.md` headings are UNNUMBERED

The file's eight existing sections are `## 1. Typography` … `## 8. Dependency verification`. The
TRD's `must_haves` and cases **R1**/**R2** name the literal headings `## Composition and semantics`
and `## Surface Spec`, with no number. The first draft shipped them as `## 9.` / `## 10.` to match
house style and R1/R2 went red; the TRD's literal headings win over the file's numbering
convention, and the tests are the contract. Recorded so a later style pass renumbers *both* the
headings and the two test constants together rather than one of them.

```
$ bash -c 'grep -n "^## " plugins/devflow/devflow/references/design-stack-flutter.md'
16:## 1. Typography
66:## 2. Colour
99:## 3. Icons
122:## 4. Layout mechanics
156:## 5. Motion
225:## 6. Interactive states
247:## 7. Performance
265:## 8. Dependency verification
281:## Composition and semantics
310:## Surface Spec
EXIT=0
```

The eight, in their original order, then the two new ones appended. **R3** asserts exactly this.

### 3. One extra `test:` commit (`600a03c`) correcting E2's extraction before the prose

E2's first reference-file regex was `` /`[^`]*?(?:references\/)?([a-z0-9-]+\.md)`/ ``, which also
matches `` `refs/<surface>/pattern-mapping.md` `` and would then have demanded that file under
`plugins/devflow/devflow/references/`, where it will never exist. The net would have **failed for
correct prose** — and, worse, could not have told that artefact from a genuinely dead reference.
The two patterns are now narrow (an explicit `references/<name>.md` path, or a bare backticked
basename), and app-repo template paths are owned by E2's part (c) instead.

This is the same class as 34-07's deviation #4 (P2's first-word-only regex): a **strengthening**
of an extraction, committed separately, with the suite confirmed still RED in between
(`ℹ tests 12 / ℹ pass 2 / ℹ fail 10 / EXIT=1`).

### 4. E2's app-repo template paths are pinned against a canonical SET, not `fs.existsSync`

The TRD says *"template paths with `<placeholders>` are checked for their fixed prefix; concrete
paths must exist in the checkout."* `flutter/ui_spec/` has no fixed prefix in THIS checkout — it is
an app-repository path, and devflow-claude is not the app repository, so an `existsSync` check
would fail for correct prose. E2 part (c) instead pins each extracted `<surface>` path against the
canonical set the amended proposal §4.1/§8.1 declares:

```
flutter/ui_spec/<surface>.md · flutter/ui_spec/refs/<surface>/ ·
refs/<surface>/pattern-mapping.md · refs/<surface>/donor/ · refs/<surface>/locked/
```

A typo'd `flutter/specs/<surface>.md` is exactly as dead as an unregistered arm, and this is the
only check that can see it. The guard `templates.size > 0` keeps it from passing vacuously.

### 5. S1-S7 were committed as one RED, and R1-R3 as one RED

Same precedent as 34-07's L1-L8 and P1-P3: the cases fail for a single missing artefact (the step;
the two sections), so seven and three separate RED commits would record the same failure seven and
three times. Each group's RED was observed and recorded before its GREEN, and the two cases that
did NOT go red in those runs (G1, S7) were separately proven by differential control.

---

## `npm test` at TRD end — not a gate, recorded for drift only

```
ℹ tests 3224   (+15, this TRD's new cases)
ℹ suites 467
ℹ pass  3164   (+15)
ℹ fail  10     (baseline at TRD start: 10 — unchanged)
ℹ skipped 50
```

Same ten pre-existing failures, same three files (`devflow-watch`, `handoff-e2e`, `awareness`).
No file this TRD touched appears among them.

---

## Scope fence — what this TRD did NOT touch

No Flutter code. No change to `ui-spec.cjs`, `ui-spec-validate.cjs`, `ui-spec-render.cjs`,
`ui-sheet.cjs`, `ui-spec-lock.cjs`, `ui-spec-cli.cjs`, `df-tools.cjs`, `yaml-lite.cjs` or any
schema. No fenced bash was added to either prose file — the runtime model forbids a `cd` in an
agent file as firmly as in an agent prompt, and every command step 5 names is a single inline
invocation with no shell state. The dogfood is W1★, not here.
