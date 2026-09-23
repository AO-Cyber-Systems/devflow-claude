# TRD 34-07 SUMMARY — look-lock: writing the acceptance block, and clearing it on shape change only

`type: tdd` · wave 7 · `depends_on: ["34-06", "34-10"]` · `autonomous: true`
Branch `df/w1b-surface-spec`, worktree `/Users/markemerson/Source/devflow-w1b`.

`df-tools ui lock <spec> --sheet-hash <h> --by <email> [--at <date>]` splices an `acceptance:`
block into a Surface Spec's own front matter and leaves the prose body byte-identical.
`ui spec validate` then reports a top-level `lock` field with one of four honest values —
`held`, `cleared`, `absent`, `MISSING` — cleared by a `routes`/`controls`/`states` change and
**not** by prose, with a reason naming which of the three moved.

> ### ⚠ 34-06's human-verify checkpoint is still OUTSTANDING, and this TRD did not touch it
> No lock was written to any committed fixture. The positive control
> `__fixtures__/ui-spec/projects-rail.md` still carries the §4.2 *illustration* block it was
> transcribed with — a sheet digest and a name, no `locked_shape_hash` — and therefore reports
> `lock: "MISSING"`, which is exactly right: an unsigned illustration must not launder into a
> human approval. Case **L5** asserts that, on that file, by name.

---

## Task Evidence

| # | Task | RED | GREEN | Files |
|---|------|-----|-------|-------|
| 1 | shapeHash over exactly three keys, and `writeLock` (S1-S6, A1-A5) | `84414b4` | `5111793` | `ui-spec-lock.{cjs,test.cjs}`, `schemas/surface-spec.schema.json` |
| 2 | The lock statuses, the `lock` field and the `ui lock` arm (L1-L8) | `0312de9` | `3e46c04` | `ui-spec-cli.{cjs,test.cjs}`, `df-tools.cjs` |
| 3 | The `look-lock` checkpoint variant (P1-P3) | `8731f68` (+ `f48f0ba`) | `593b8fc` | `references/checkpoints.md`, `agents/executor.md`, `ui-spec-lock.test.cjs` |

```
$ git diff --name-only 7fb7a6f..HEAD
plugins/devflow/agents/executor.md
plugins/devflow/devflow/bin/df-tools.cjs
plugins/devflow/devflow/bin/lib/ui-spec-cli.cjs
plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs
plugins/devflow/devflow/bin/lib/ui-spec-lock.cjs
plugins/devflow/devflow/bin/lib/ui-spec-lock.test.cjs
plugins/devflow/devflow/references/checkpoints.md
plugins/devflow/devflow/schemas/surface-spec.schema.json
```

Eight files: the TRD's seven `files_modified`, plus `schemas/surface-spec.schema.json` — a
**mandatory deviation**, recorded in full under *Deviations* below.

**No new npm dependency.** `package.json` is untouched and still carries exactly `node-pty`.
`ui-spec-lock.cjs` requires only `node:fs` and three sibling `.cjs` modules; the sha256 and the
canonical serialiser are borrowed from 34-06's `ui-sheet.cjs` rather than re-derived, so there is
still one hashing path in this objective.

---

## TDD Evidence

### Suite baseline, re-measured at TRD start (2026-09-22)

```
$ npm test
ℹ tests 3185
ℹ suites 467
ℹ pass 3126
ℹ fail 9
ℹ skipped 50
```

All 9 pre-existing and unrelated — `devflow-watch` (5), `handoff-e2e` (3), `awareness` S1 (1),
all CLI-spawn / daemon-timing flakes. **`npm test` is not this row's gate** (the TRD's
`<verification>` says so, and the orchestrator's stated band is 10).

### RED — task 1 (S1-S6, A1-A5), verbatim, commit `84414b4`

```
$ cd plugins/devflow/devflow/bin/lib && node --test ui-spec-lock.test.cjs
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './ui-spec-lock.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/ui-spec-lock.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
    ...
    at Object.<anonymous> (…/ui-spec-lock.test.cjs:38:14)
  code: 'MODULE_NOT_FOUND',
ℹ tests 1 / ℹ pass 0 / ℹ fail 1
EXIT=1
```

### GREEN — task 1

```
✔ Case S1 — nothing OUTSIDE {routes, controls, states} moves the shape hash
✔ Case S2 — a ROUTE change moves the shape hash
✔ Case S3 — a CONTROL change moves the shape hash
✔ Case S4 — a STATE change moves the shape hash
✔ Case S5 — key INSERTION ORDER does not move the shape hash
✔ Case S6 — `flows` is deliberately OUTSIDE the shape hash
✔ Case A1 — writeLock records sheet, by, at and the shape hash, and the spec still validates
✔ Case A2 — the prose body and every untouched front-matter line are BYTE-identical
✔ Case A3 — writeLock REFUSES a spec that does not validate, and writes nothing
✔ Case A4 — a bad or absent --sheet-hash, and an absent --by, are refusals
✔ Case A5 — re-locking OVERWRITES the acceptance block and does not duplicate keys
ℹ tests 11 / ℹ pass 11 / ℹ fail 0
EXIT=0
```

**The three-keys probe from the TRD's `<verify>` block, executed:**

```
$ cd plugins/devflow/devflow/bin/lib && node -e "… const a=shapeHash(s); \
    const prose={...s, design_read:'CHANGED', mode:'greenfield', flows:[]}; \
    const shape={...s, controls:[...s.controls.slice(1)]}; …"
prose-only same: true control change differs: true
EXIT=0
```

### RED — task 2 (L1-L8 + C4 kept in sync), verbatim, commit `0312de9`

```
$ cd plugins/devflow/devflow/bin/lib && node --test ui-spec-cli.test.cjs
✖ Case C4 — unknown `ui` and `ui spec` subcommands exit 1 and list what is available
  AssertionError: The input did not match /Unknown ui subcommand\. Available: metrics, spec, sheet, lock/.
  Input: 'Error: Unknown ui subcommand. Available: metrics, spec, sheet\n'
✖ Case L1 — `ui lock` writes the block and `ui spec validate` then reports lock: held
  AssertionError: `ui spec validate` must report a top-level `lock` field: {
✖ Case L2 — editing a CONTROL clears the lock, and the reason names `controls`
✖ Case L3 — editing ONLY the prose body leaves the lock HELD
✖ Case L3b — editing `design_read`, `references` or `flows` also leaves the lock HELD
✖ Case L3c — editing a ROUTE or a STATE clears it too, each naming its own section
✖ Case L4 — a spec with no `acceptance` block reports `absent`, not `cleared`
✖ Case L5 — an acceptance block with no `locked_shape_hash` reports MISSING, never held
✖ Case L6 — `lock: cleared` does NOT set ok: false
✖ Case L7 — `ui lock` refuses an invalid spec, a bad --sheet-hash and an absent --by
  AssertionError: stdout is not JSON (exit 1): Error: Unknown ui subcommand. Available: metrics, spec, sheet
✖ Case L8 — `--at` defaults to today, and a locked spec still validates
ℹ tests 26 / ℹ pass 15 / ℹ fail 11
EXIT=1
```

### RED — task 3 (P1-P3), verbatim, commit `8731f68`

```
$ cd plugins/devflow/devflow/bin/lib && node --test ui-spec-lock.test.cjs
✖ Case P1 — checkpoints.md documents the look-lock variant, end to end
  AssertionError: checkpoints.md must contain a "### look-lock variant" heading
✖ Case P2 — every `df-tools.cjs` command the new prose names is a REAL arm
  AssertionError: checkpoints.md must contain a "### look-lock variant" heading
ℹ tests 14 / ℹ pass 12 / ℹ fail 2
EXIT=1
```

P3 was green in the RED run and stayed green: `agents/executor.md` had not been edited yet. It
is a regression net over 34-10's gate, not a case with its own defect, and it is reported as
such rather than as a claimed RED.

### GREEN — task 3, and the TRD's full `<verification>` command

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-spec-lock.test.cjs \
    ui-spec-cli.test.cjs ui-sheet.test.cjs ui-spec-render.test.cjs ui-spec-validate.test.cjs \
    ui-spec.test.cjs yaml-lite.test.cjs agent-shell-harness.test.cjs 2>&1 | tail -12; \
    exit ${PIPESTATUS[0]}'
ℹ tests 174
ℹ suites 7
ℹ pass 174
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
EXIT=0
```

### Differential controls — because `lockStatus` shipped inside task 1's GREEN

`ui-spec-lock.cjs` was written as one module in task 1's GREEN commit, so `lockStatus` existed
before L1-L8 were written. Those cases still produced a **real RED** (commit `0312de9`, 11
failures, exit 1) because they run through the CLI, which had neither the `lock` field nor the
`ui lock` arm. But to prove each net can fail *for the bug it names* rather than for the missing
arm, every L and A case was re-proven by breaking the implementation and confirming that case —
and only that case — goes red. The implementation was restored from a byte copy between every
control; `git status` is clean and the suite is back to `pass 174 / fail 0`.

| control | the break applied | result |
|---|---|---|
| C1 | `shapePayload` also covers `design_read` (over-hash) | `exit=1 red=['Case L3b','Case S1','Case S6']` |
| C2 | a lock with no `locked_shape_hash` reports `held` | `exit=1 red=['Case L5']` |
| C3 | `absent` collapses into `cleared` | `exit=1 red=['Case L1','Case L4']` |
| C4 | the `cleared` reason is a constant, naming no section | `exit=1 red=['Case L2','Case L3c']` |
| C5 | a cleared lock flips `process.exitCode` | `exit=1 red=['Case L6']` |
| C6 | `writeLock`'s validate guard removed | `exit=1 red=['Case A3']` |
| C7 | `spliceAcceptanceBlock` reconstructs instead of splicing | `exit=1 red=['Case A2']` |
| C8 | `cmdUiLock`'s invalid-spec guard removed (arm only) | **`exit=0 red=[]` — see below** |
| C9 | **both** invalid-spec guards removed | `exit=1 red=['Case A3','Case L7']` |

**C8 is the honest one.** Removing the arm's guard alone changes nothing a test can see,
because `writeLock` then refuses with the same verdict and the arm prints it down the
`written.verdict` path. Two independent guards on the same rule is deliberate — `writeLock` is
callable without the arm (A3 pins that) and the arm refuses before it reaches the library so the
verdict is the first thing an author sees. C9 removes both and L7 goes red, so the net is not
vacuous; it simply needs both guards gone, which is what "a lock on a broken spec is impossible"
actually means.

C1's reddening of **S6** as well as S1 is expected and not a leak: S6 asserts the canonical
payload has exactly the keys `controls`, `routes`, `states`, so any over-hash necessarily breaks
it. S6 is a superset net over S1 — the same relationship 34-06 recorded between G2 and G6.

---

## Post-TRD Verification — the real-binary probes, verbatim

### The lock-lifecycle probe — this row's gate evidence

The plan's three RED cases in one run, through the real binary, on a real file that is really
edited between steps:

```
$ cd plugins/devflow/devflow/bin/lib && bash -c 'set -e; \
    cp __fixtures__/ui-spec/projects-rail.md /tmp/lk.md; H=$(node -e "console.log(\"a\".repeat(64))"); \
    node ../df-tools.cjs ui lock /tmp/lk.md --sheet-hash $H --by mark@aocyber.ai --at 2026-09-22 > /dev/null; \
    echo "after lock: $(… validate … .lock.lock)"; \
    printf "\nAn extra prose paragraph.\n" >> /tmp/lk.md; \
    echo "after prose edit: $(… validate … .lock.lock)"; \
    sed -i "" "s/kind: disclosure-header/kind: button/" /tmp/lk.md; \
    echo "after control edit: $(… validate … .lock.lock)"'
after lock: held
after prose edit: held
after control edit: cleared
EXIT=0
```

The `cleared` verdict in full, from the same file:

```json
{
  "lock": "cleared",
  "reason": "`controls` changed since the lock — §4.1 clears acceptance.locked_sheet",
  "locked_by": "mark@aocyber.ai",
  "locked_at": "2026-09-22"
}
ok: true
```

`ok` is **true** on that same run, and the arm exited 0 — a cleared lock is a status, not a
structural violation.

### The block `ui lock` writes

```
$ node ../df-tools.cjs ui lock /tmp/pv.md --sheet-hash 33af7614… --by reviewer@example.test --at 2026-09-22
{
  "spec": "/tmp/pv.md",
  "locked_sheet": "sha256:33af7614188bfe47d7e06eefa798dba149d0008ebde0e181662357de818af2b3",
  "locked_by": "reviewer@example.test",
  "locked_at": "2026-09-22",
  "locked_shape_hash": "sha256:0ecea28b03f6f7030d446f05a8d9d2a1538f9d848d53b2e85c00e60a43f56dc6",
  "locked_section_hashes": {
    "routes": "sha256:e8de281f0bda4795a5a76aca2140bea08cee79dea173c416c9f954fe02ef1114",
    "controls": "sha256:637d7cb9a3a9a5aab6b283ca3a7353703296472d77871aec7bd6e66018c1de5a",
    "states": "sha256:32ecafd1132441bc16666a4f309006dc436e259ff3906a7efdbcb6ee95d5336d"
  },
  "engine_version": "2.8.0",
  "schema_version": 1
}
EXIT=0
```

…and in the file itself, as YAML yaml-lite reads back:

```yaml
acceptance:
  locked_sheet: "sha256:aaaaaaaa…"
  locked_by: mark@aocyber.ai
  locked_at: 2026-09-22
  locked_shape_hash: "sha256:0ecea28b03f6f7030d446f05a8d9d2a1538f9d848d53b2e85c00e60a43f56dc6"
  locked_section_hashes:
    routes: "sha256:e8de281f0bda4795a5a76aca2140bea08cee79dea173c416c9f954fe02ef1114"
    controls: "sha256:637d7cb9a3a9a5aab6b283ca3a7353703296472d77871aec7bd6e66018c1de5a"
    states: "sha256:32ecafd1132441bc16666a4f309006dc436e259ff3906a7efdbcb6ee95d5336d"
```

### The committed positive control's lock status — the MISSING that must not be laundered

```
$ node ../df-tools.cjs ui spec validate __fixtures__/ui-spec/projects-rail.md
{
  "lock": "MISSING",
  "reason": "the `acceptance` block carries no `locked_shape_hash` — this lock predates shape
             hashing (or was hand-written), so whether it still stands cannot be determined;
             re-lock with `df-tools ui lock`",
  "locked_by": "mark@aocyber.ai",
  "locked_at": "2026-09-18"
}
exit 0
```

34-04's `PAT000`/`HIT000` rule, one level up: a check that could not run reports `MISSING`, not
`held`, and does not flip `ok`.

### Prose-names-a-real-arm probe

```
$ grep -o "df-tools\.cjs ui [a-z]* *[a-z]*" references/checkpoints.md ../agents/executor.md | sort -u
../agents/executor.md:df-tools.cjs ui lock
references/checkpoints.md:df-tools.cjs ui lock
references/checkpoints.md:df-tools.cjs ui sheet
references/checkpoints.md:df-tools.cjs ui spec validate

$ sed -n "/case 'ui': {/,/^    }/p" bin/df-tools.cjs | grep -E "subcommand ===|Unknown ui"
      if (subcommand === 'metrics') {
      } else if (subcommand === 'spec') {
      } else if (subcommand === 'sheet') {
      } else if (subcommand === 'lock') {
        error('Unknown ui subcommand. Available: metrics, spec, sheet, lock');
```

Every command named in the new prose is registered. **P2 asserts the same thing in code and by
EXECUTION**, not by set comparison: it extracts each `df-tools.cjs ui …` string out of the
sections this TRD added, runs it against a nonexistent spec, and requires the refusal to be
"spec not found" rather than "Unknown ui subcommand".

### 34-10's harness suite, after the `executor.md` edit

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 | tail -10; exit ${PIPESTATUS[0]}'
ℹ tests 37 / ℹ suites 7 / ℹ pass 37 / ℹ fail 0
EXIT=0
```

**No fenced bash was added to `agents/executor.md`** — the TRD's stated preference. The edit is
two prose lines (one exception clause on the auto-mode bullet, one `*UI surfaces:*` sentence
pointing at `checkpoints.md`), so no 34-10 harness annotation vocabulary was needed. P3 runs the
harness suite from inside this TRD's own test file, so a later edit to `executor.md` in this
objective cannot go unnoticed.

### `npm test` at TRD end — not a gate, recorded for drift only

```
ℹ tests 3209   (+24, this TRD's new cases)
ℹ pass  3150   (+24)
ℹ fail  9      (baseline at TRD start: 9 — unchanged)
ℹ skipped 50
```

Same nine pre-existing failures, same three files (`devflow-watch`, `handoff-e2e`, `awareness`).
No file this TRD touched appears among them.

---

## WHICH SPEC EDITS CLEAR A LOCK, AND WHICH DO NOT

This is the Definition of Done this TRD owns. Both directions were proven by **mutating a real
spec and re-reading the status**, never by asserting the hash's inputs.

### Direction 1 — a shape change CLEARS the lock

| edit made | what was really changed | result | evidence |
|---|---|---|---|
| `kind: disclosure-header` → `kind: button` | a `controls[]` entry | `cleared`, reason names `controls` | lifecycle probe (`after control edit: cleared`); **L2**; **L6** |
| `path: /projects/:id/conversations` → `/projects/:id/threads` | a `routes[]` entry | `cleared`, reason names `routes`, and does **not** name `controls` | **L3c** |
| `seed: projects-0` → `seed: projects-none` | a `states[]` entry | `cleared`, reason names `states`, and does **not** name `routes` | **L3c** |
| adding/removing a route, editing `back` | `routes` | hash moves | **S2** |
| adding a control, editing a `does`, adding `behaviors` | `controls` | hash moves | **S3** |
| adding a state, changing a `seed`, editing `content.must_show` | `states` | hash moves | **S4** |

The reason names the section because the per-section hashes are compared, not guessed —
`C4` (constant reason) reddens L2 and L3c, so "names which" is asserted, not decorative.

### Direction 2 — a prose or non-shape change does NOT clear the lock

| edit made | what was really changed | result | evidence |
|---|---|---|---|
| a paragraph appended after the closing `---`, plus `## Intent` → `## Intent (revised)` | the prose body | `held`, and `locked_at` unchanged | lifecycle probe (`after prose edit: held`); **L3** |
| `design_read: "… density compact"` → `"… density comfortable"` | `design_read` | `held` | **L3b** |
| `mockup: refs/projects-rail/mockup.png` → `mockup-v2.png` | `references` | `held` | **L3b** |
| `id: open-project-conversation` → `…-v2` | `flows` | `held` | **L3b** |
| `patterns`, `mode`, `surface`, `scope_rules`, the `acceptance` block itself | front matter outside the three keys | hash unmoved | **S1** |
| key insertion order at any level | nothing | hash unmoved | **S5** |

`C1` (add `design_read` to the hashed payload) reddens **L3b**, so direction 2 is a real net:
it fails the moment the payload widens by one key.

### The two failure modes this asymmetry exists to prevent

* **A lock that survives a shape change is a false approval.** The file still says a human
  signed this off; they signed off a different surface. Direction 1's cases are what stop that.
* **A lock that dies on a typo fix is unusable.** Within a fortnight it is re-approved without
  being read, which is *strictly worse* than no lock, because the signature is still there.
  Direction 2's cases are what stop that.

Neither direction alone is worth anything. That is why both are asserted, and why `C1`'s
one-key widening has to be able to break the suite.

---

## The `locked_shape_hash` payload, exactly

```
locked_shape_hash = "sha256:" + sha256( canonical({ routes, controls, states }) )

canonical(v)  = ui-sheet.cjs's recursive, key-SORTED JSON serialiser (34-06)
                arrays keep their order; object keys are sorted at every depth
```

Reached through `canonicalSheetJson`/`sheetHash`, **not a second hashing path**. 34-06 built one
canonical serialiser and one digest on purpose: two definitions of what a human's approval
covers eventually disagree about whether it still stands. This module supplies a different
*payload* to the same functions, so a future change to canonicalisation moves `sheet_hash` and
`locked_shape_hash` together — the only way the two stay comparable. `canonicalShapeJson(spec)`
is exported so a surprising S-case can be *read* rather than guessed.

### What is IN

Exactly three keys: `routes`, `controls`, `states`. Nothing else. A key absent from the spec
canonicalises as `null`, so a spec that declares no `flows` and one that declares `flows: []`
hash identically (they must — neither is in the payload).

### What is OUT — each an explicit decision

1. **The prose body.** §4.1 says a prose change must not clear a lock; hashing the body would be
   the exact inversion of the rule. **L3.**
2. **`design_read`, `references`, `patterns`, `mode`, `surface`, `scope_rules`.** These are the
   keys most likely to be reworded between reviews. Over-hashing them trains the team to
   re-approve without reading, which is how a gate dies while still reporting green. **S1**,
   **L3b**.
3. **`flows` — the counter-intuitive one, pinned deliberately (S6).** "Flows are surely part of
   the shape" is the obvious wrong intuition and the next person to touch this will have it.
   §4.1's re-lock rule names three keys and `flows` is not one; a flow is a *walk over structure
   the reviewer has already seen* — every route it visits and every control it clicks is inside
   the hash already. S6 asserts it with a comment saying so, and reads the payload's key list
   back to prove the exclusion is structural rather than incidental. **If W1★ rules the other
   way it is a one-line change to `shapePayload` and S6's assertion inverts — the test already
   exists.**
4. **`engine_version`.** 34-11's version bump would otherwise silently clear every look-lock in
   every repo, for a release that changed nothing a human looked at. Same reasoning, and the
   same exclusion, as 34-06's `sheet_hash`.
5. **`sheet_hash` itself.** It is stored separately as `locked_sheet`. Hashing it into the shape
   hash would mean a re-render (new pixels, same paths) cleared the lock.
6. **`acceptance` itself.** Otherwise `writeLock` would invalidate the very hash it just wrote.
   **S1** pins it.

---

## Per-section hashes: STORED, not recomputed

**Decision: stored**, in `acceptance.locked_section_hashes`.

`lock: cleared` has to name *which* of the three moved, or the human is sent back to diff the
file by hand — and that is a question that cannot be answered after the fact. Telling
routes-changed from states-changed needs each section's value **as at the lock**; recomputing
today's three values tells you what they are now, not which one moved. So `writeLock` stores
all three beside `locked_shape_hash`.

The resulting `cleared` reason shape:

```
`controls` changed since the lock — §4.1 clears acceptance.locked_sheet
`routes`, `states` changed since the lock — §4.1 clears acceptance.locked_sheet
```

A lock written by hand or by an older engine, carrying `locked_shape_hash` but **no**
`locked_section_hashes`, still resolves `held`/`cleared` correctly; the reason then says so
rather than guessing a section:

```
`routes`, `controls` or `states` changed since the lock, and the block carries no
`locked_section_hashes`, so which one cannot be named — re-lock with `df-tools ui lock`
```

`locked_section_hashes` is therefore **optional in the schema**. Making it required would refuse
every hand-written block, and the engine can do its job without it.

---

## The four lock statuses

```
lockStatus(spec) -> { lock, reason, locked_by, locked_at }

  no `acceptance` block                    -> 'absent'   never look-locked
  `acceptance` is not a mapping            -> 'MISSING'  undeterminable
  no `locked_shape_hash`                   -> 'MISSING'  predates shape hashing / hand-written
  `locked_shape_hash` not sha256:<64 hex>  -> 'MISSING'  undeterminable
  stored === shapeHash(spec)               -> 'held'
  otherwise                                -> 'cleared'  + which of the three moved
  the spec could not be parsed at all      -> 'MISSING'
```

Four values, never two collapsed into one. `absent` and `cleared` are different situations for
the human reading the output — one needs a first review, the other needs a re-review — and
collapsing them produces a message nobody can act on (**L4**). `MISSING` is neither pass nor
failure; reporting an undeterminable lock as `held` is the silent-green class this objective
exists to close (**L5**).

**`lock` never touches `ok` and never touches the exit code.** A spec can be structurally
perfect and un-approved — that is every spec during authoring, before any sheet exists. **L6**
asserts `ok === true` and `exit 0` on a spec whose lock is cleared, and control **C5** (flipping
the exit code on `cleared`) reddens exactly that case. 34-08's refusal to compose reads `lock`
explicitly, beside `ok`.

---

## The `ui lock` arm

```
df-tools ui lock <spec> --sheet-hash <64 hex> --by <email> [--at YYYY-MM-DD] [--patterns <c.json>]
```

| invocation | stdout | file | exit |
|---|---|---|---|
| valid spec, valid flags | `{spec, locked_sheet, locked_by, locked_at, locked_shape_hash, locked_section_hashes, engine_version, schema_version}` | written | 0 |
| spec does not validate | the verdict, in `validate`'s own shape | **none** | **1** |
| `--sheet-hash` absent or not 64 hex | one-line refusal naming the requirement | none | **1** |
| `--by` absent or blank | one-line refusal naming `--by` | none | **1** |
| `--at` not `YYYY-MM-DD` | one-line refusal naming `--at` | none | **1** |
| spec not found | one-line refusal | none | **1** |

`--sheet-hash` accepts bare 64-hex (what `ui sheet` prints) **or** a `sha256:`-prefixed value
(what the spec stores), and normalises; anything else is refused. `--at` defaults to
`new Date().toISOString().slice(0,10)` and is overridable — a test asserting today's literal date
fails at midnight (**L8**, **A4**).

`process.exitCode` throughout — never `process.exit()`, never `helpers.output()` (which calls
`process.exit(0)` unconditionally and would make every refusal above unreachable). Same decision
and same reasoning as `validate`, `render` and `sheet`.

`ui` subcommands are now `metrics, spec, sheet, lock`; 34-04's **C4** assertion was updated in
the same commit as the RED, so the refusal message and its test cannot drift apart.

### The YAML write is a SPLICE, not a re-serialisation

`yaml-lite` parses; it does not serialise. `spliceAcceptanceBlock` therefore works on the RAW
TEXT: it locates the `acceptance:` block (key line plus the indented lines under it) and replaces
exactly those lines, or appends the block before the closing `---` when there is none. Every line
it does not own is carried across verbatim — comments, blank lines, key order — and the prose
body is copied byte for byte. The file's dominant line ending is detected and reused.

**A2** asserts the body is byte-identical *and* that the front-matter lines before and after the
block are byte-identical, using a fixture generator that relocates `acceptance:` into the middle
of the front matter — because in the committed positive control it is the last key, so the
"lines after the block" comparison would otherwise assert over an empty list and prove nothing.
Control **C7** (append one newline on write) reddens A2.

**A5** re-locks an already-locked spec and asserts exactly one `acceptance:` key and exactly one
of each `locked_*` line: re-lock after a change is the normal path, not an edge case.

---

## The `look-lock` checkpoint variant

**Location:** `plugins/devflow/devflow/references/checkpoints.md`
→ `<checkpoint_types>` → `<type name="human-verify">` → `## checkpoint:human-verify (Most Common - 90%)`
→ **`### look-lock variant`**

It sits INSIDE the human-verify type, between the Xcode example and `</type>`. **P1** asserts
that position by index (`## checkpoint:human-verify` < `### look-lock variant` <
`## checkpoint:decision`) and asserts the string `checkpoint:look-lock` never appears — it is a
VARIANT carried as `variant="look-lock"` on a `type="checkpoint:human-verify"` element, not a
fourth type. The three-type taxonomy is what the orchestrator dispatches on.

**The exact approval command it names — 34-08's skill prose must cite this same string:**

```
node ~/.claude/devflow/bin/df-tools.cjs ui lock <spec> --sheet-hash <sheet_hash> --by <email>
```

The section covers, in order: when a look-lock is due (`lock: "absent"` or `"cleared"`; `"held"`
means no checkpoint); the four things the human is shown (absolute sheet path, `sheet_hash`, the
`missing[]` capture list, the `lock` status and reason); what approval runs; what a rejection
does; the autonomous-mode rule; then the `<task>` XML example in the house format.

A second, three-line pointer was added at
`<autonomous_checkpoints>` → `## Autonomous Mode Checkpoint Semantics` → **`### look-lock checkpoints`**,
between the decision and human-action subsections, because that is where the orchestrator reads
its mode semantics. It states the rule and **references** the variant section rather than
restating the procedure.

### The autonomous-mode rule, as written (the orchestrator reads this)

> **Autonomous mode: a look-lock is NEVER blind-approved and is never delegated to the verifier
> agent.** The general rule below hands `checkpoint:human-verify` to the verifier on green
> machine evidence, because those checkpoints ask "does it work". A look-lock asks "is this the
> right design" — a question no machine evidence answers, and the whole value of the recorded
> lock is that a *person* looked. In autonomous mode a look-lock **falls through to the user**
> exactly as `checkpoint:human-action` does. An agent must never run `ui lock` with its own
> address, or with the user's, on the user's behalf.

### What a rejection does, as written

> comments on the sheet are the revision channel. The executor fixes the spec or re-captures the
> affected states, re-runs `ui sheet`, and presents the new sheet with its new `sheet_hash`.
> **No lock is written** — `ui lock` is not run at all on a rejection, so the spec keeps
> reporting `absent` / `cleared` and nothing downstream can mistake the surface for approved.

### `agents/executor.md` — a reference, never a restatement

Two prose lines, no fenced bash:

* on the auto-mode bullet: `**EXCEPT variant="look-lock"** → STOP normally; a look-lock is a
  design judgment, never blind-approved and never delegated (see the look-lock variant in
  checkpoints.md).`
* under `**checkpoint:human-verify (90%)**`: a `*UI surfaces:*` sentence naming
  `df-tools.cjs ui lock` and pointing at
  `@~/.claude/devflow/references/checkpoints.md`'s look-lock section, with an explicit
  "do not restate the procedure here".

Two copies of a procedure is the drift class objective 33 closed.

---

## Deviations from Plan

### 1. `schemas/surface-spec.schema.json` is an eighth file (MANDATORY)

The schema declares `acceptance` with `"additionalProperties": false` and exactly three
properties. Writing `locked_shape_hash` into it therefore made the spec **invalid**, proven
before any code was written:

```
$ node ../df-tools.cjs ui spec validate /tmp/probe1.md
  "code": "SPEC001",
  "path": "acceptance.locked_shape_hash",
  "msg": "unknown key \"locked_shape_hash\" — the schema declares no such property here"
EXIT=1
```

`ui lock` would have broken the artifact in the act of signing it — the exact failure the TRD's
key_links warn about, one level up. Two optional properties were added to `acceptance`:
`locked_shape_hash` (`^sha256:[0-9a-f]{64}$`) and `locked_section_hashes` (a closed object of
three such strings). **A1** and **L8** assert that a freshly locked spec still validates, so the
schema and the writer cannot drift apart.

**`schema_version` was NOT bumped.** Both additions are optional, so every spec authored against
version 1 still validates unchanged; a bump would have made every existing spec's declared
version stale for a backwards-compatible addition. (34-06's "a schema change *is* a shape
change" applies to `sheet_hash`, which hashes `schema_version` — that remains true and is
unaffected.)

### 2. Eight `ui-spec-cli.test.cjs` cases (L1-L8) rather than six (L1-L6)

L3b, L3c and L8 were added:

* **L3b** exercises `design_read`, `references` and `flows` — the three front-matter keys most
  likely to be reworded between reviews, and the ones over-hashing would kill the gate through.
  Without it, direction 2 is proven only for the prose body.
* **L3c** edits a route and a state. Without it, L2's `assert.match(reason, /controls/)` could be
  satisfied by a constant string — control C4 confirms both cases catch that.
* **L8** pins `--at`'s default and asserts a locked spec still validates through the real binary.

### 3. `ui-spec-lock.cjs` was written whole in task 1's GREEN, so `lockStatus` preceded L1-L8

The module is one coherent unit and splitting `lockStatus` out of it would have meant shipping a
half-module. L1-L8 still produced a genuine RED (11 failures, exit 1) because they run through
the CLI, which had neither the `lock` field nor the `ui lock` arm. To close the gap honestly,
every L and A case was additionally proven by a differential control (C1-C9 above) — the
precedent waves 1-6 set for a case that passes on arrival.

### 4. One extra `test:` commit in task 3 (`f48f0ba`)

P2's extraction regex captured only the first word after `ui`, so prose naming the two-level arm
`df-tools.cjs ui spec validate <spec>` would have been run as `ui spec /nonexistent.md` and read
back "Unknown ui spec subcommand" — the net would fail for *correct* prose, and worse, could
never distinguish that artefact from a genuinely missing second-level arm. The regex now captures
`ui spec <sub>` whole. This is a **strengthening**, not a fix-to-make-it-pass: P2 would have
passed as originally written had the prose simply avoided naming `ui spec validate`. Committed
separately, before the prose, and the suite was confirmed still RED in between.

### 5. P1's section bound ends at the example's `</task>`

P1 bounds the look-lock section at the next heading **or** the next XML close tag at column 0 —
and the `<task>` example inside the section's fenced XML block has one. The autonomous-mode
paragraph was therefore moved to sit **before** the example rather than after it, so everything
P1 asserts is inside the bound. Rules first, example last also reads better. The only text after
the bound is the example itself.

---

## Nothing was self-approved

No `ui lock` was run against any committed file. Every lock written during this TRD went to a
temp copy (`/tmp/lk.md`, `/tmp/pv.md`, per-test `mkdtemp` directories). The committed positive
control still reports `lock: "MISSING"`, and 34-06's human-verify checkpoint on
`__fixtures__/ui-spec/sheet/projects-rail.sheet.html` remains **outstanding and unapproved** —
this TRD neither answered it nor recorded an approval that would imply it had been.
