# TRD 34-06 SUMMARY — the review sheet, and a `sheet_hash` that survives a template edit

`type: tdd` · wave 6 · `depends_on: ["34-05"]` · **`autonomous: false`**
Branch `df/w1b-surface-spec`, worktree `/Users/markemerson/Source/devflow-w1b`.

`df-tools ui sheet <spec> --renders <dir> --refs <dir> --out <file>` writes one static,
self-contained HTML review sheet (§8.3) and prints `{sheet_hash, out, states, missing}`. The hash
is the sha256 of the canonical **model** — never of the HTML — so editing
`templates/ui-sheet.html` cannot invalidate a human's look-lock. A declared state with no render
is a **`MISSING` cell**, never a dropped row.

> ### ⚠ The `checkpoint:human-verify` in task 3 is OUTSTANDING
> This TRD ran under `--auto`. The executor did **not** answer the checkpoint and did **not**
> approve the sheet. The three questions, the artifact path and the how-to-verify steps are in
> [**The human-verify checkpoint**](#the-human-verify-checkpoint-outstanding) below, ready to be
> routed to a human. The fixture sheet was committed ahead of the answer so the artifact exists
> on the branch for a verifier to open — see *Deviations*.

---

## Task Evidence

| # | Task | RED | GREEN | Files |
|---|------|-----|-------|-------|
| 1 | The model and a hash that ignores the template (H1-H4, M1) | `5f5f5b6` | `08aefee` | `ui-sheet.{cjs,test.cjs}`, `templates/ui-sheet.html` |
| 2a | The grid, MISSING cells, self-containment (G1-G7) | *differential controls* — `b96c989` | (already green at `08aefee`) | `ui-sheet.test.cjs` |
| 2b | The `ui sheet` arm and its refusals (A1-A4, C4) | `c6b3f1a` | `e492fa0` | `ui-spec-cli.{cjs,test.cjs}`, `df-tools.cjs` |
| 3 | The fixture sheet | — | `145030c` | `__fixtures__/ui-spec/sheet/projects-rail.sheet.html` |

Seven files changed — **exactly** this TRD's `files_modified`, no others:

```
$ git diff --name-only cd01ea6..HEAD
plugins/devflow/devflow/bin/df-tools.cjs
plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/sheet/projects-rail.sheet.html
plugins/devflow/devflow/bin/lib/ui-sheet.cjs
plugins/devflow/devflow/bin/lib/ui-sheet.test.cjs
plugins/devflow/devflow/bin/lib/ui-spec-cli.cjs
plugins/devflow/devflow/bin/lib/ui-spec-cli.test.cjs
plugins/devflow/devflow/templates/ui-sheet.html
```

**No new npm dependency.** `package.json` is untouched and still carries exactly `node-pty`.
`node:crypto` and `node:zlib` are builtins; the template is substituted with `String.split/join`
and the sheet is built by string concatenation. No templating engine, no HTML builder, no
markdown renderer, no mermaid library, no hashing library.

---

## TDD Evidence

### Suite baseline, re-measured at TRD start (2026-09-22)

```
$ npm test
ℹ tests 3169
ℹ suites 467
ℹ pass 3111
ℹ fail 8
ℹ skipped 50
```

All 8 pre-existing and unrelated: `devflow-watch` (3), `handoff-e2e` (4), `awareness` S1 (1) —
CLI-spawn / timing flakes. **`npm test` is not this row's gate** (the TRD's `<verification>`
says so explicitly).

### RED — task 1 (H1-H4, M1), verbatim, commit `5f5f5b6`

```
$ cd plugins/devflow/devflow/bin/lib && node --test ui-sheet.test.cjs
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './ui-sheet.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/ui-sheet.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
    ...
  code: 'MODULE_NOT_FOUND',
ℹ tests 1 / ℹ pass 0 / ℹ fail 1
EXIT=1
```

**One RED was a fixture defect, not an implementation one, and is recorded rather than hidden.**
On the first GREEN run H1-H4 passed and **M1 failed** with
`ENOENT … /df-ui-sheet-mirror-*/references/model-profiles.json` — `helpers.cjs` reads
`references/model-profiles.json` at *module load*, and the mirror tree the test built copied
`bin/lib` + `schemas` + `templates` but not `references/`. The real `~/.claude/devflow/` mirror
**does** carry `references/`, so a tree without it is not the mirror — it is a broken copy of it.
The fixture was corrected (the tree now copies `references/*.json` too); `ui-sheet.cjs` was not
changed for it.

### GREEN — task 1

```
✔ Case H1 — editing the template changes the HTML and does NOT change sheet_hash
✔ Case H2 — renaming a state in the spec changes sheet_hash
✔ Case H3 — two models whose keys were inserted in different orders hash identically
✔ Case H4 — different pixels at the same path do not move the hash; a NEW render does
✔ Case M1 (the mirror guard) — the sheet template resolves from a ~/.claude/devflow tree
ℹ tests 5 / ℹ pass 5 / ℹ fail 0
EXIT=0
```

### The template-independence probe — this row's headline claim, EXECUTED

Not "the hash is computed from the spec, therefore…". The template string is really edited and
the hash is really re-taken:

```
$ cd plugins/devflow/devflow/bin/lib && node -e "… const a=s.renderSheetHtml(m); \
    const b=s.renderSheetHtml(m, s.loadSheetTemplate()+'<!-- edit -->'); \
    console.log('html differs:', a!==b, 'hash same:', h1===h2); …"
html differs: true hash same: true
EXIT=0
```

H1 goes further than the probe: it inserts a real CSS rule *inside* the `<style>` block plus a
trailing HTML comment, asserts the two renders differ, asserts the hash did not move, and asserts
the canonical hashed payload contains no markup at all (`<style`, `<!DOCTYPE`, `<table`, `<td`,
`<html`).

### G1-G7 passed on arrival — differential controls, not a claimed RED

Task 1's template already carried the full grid (H1 needs a template with a `<style>` block to
edit), so **no RED is claimed for G1-G7**. Each case was instead proven by breaking the
implementation and confirming that case — and only that case — goes red. The implementation was
restored from git between every control; `git diff` on `ui-sheet.cjs` and `templates/ui-sheet.html`
is empty and the suite is back to `pass 12 / fail 0`.

| case | the break applied | result |
|---|---|---|
| G1 | `rows.reverse()` — capture-list order dropped | `exit=1 red=['Case G1']` |
| G2 | `rowHtml` returns `''` for a MISSING row (the "skip when falsy" template bug) | `exit=1 red=['Case G2','Case G6']` |
| G3 | `refKindOf` always returns `null` — the ref pane unlabelled | `exit=1 red=['Case G3']` |
| G4 | `{{DESIGN_READ}}` substituted with `''` | **`exit=0 red=[]` — see below** |
| G5 | `navGraphMermaid` re-derived here as `'flowchart TD\n'` | `exit=1 red=['Case G5']` |
| G6 | `contractHtml` returns `''` always | `exit=1 red=['Case G6']` |
| G7 | a `<link rel="stylesheet" href="https://cdn.example.com/sheet.css">` added to the template | `exit=1 red=['Case G7']` |

**G2's control also reddened G6**, which is expected and not a leak: G6 walks every row with a
content contract and asserts its block exists, so dropping rows necessarily breaks it too. G6 is a
superset net over G2 — the same relationship 34-05 recorded between D1 and D2.

**G4 could not fail for its own bug, and was strengthened.** The TRD's literal wording is "assert
both strings appear in the HTML" — but the control table carries its own `*Design read:* …` line,
so deleting the sheet header's substitution entirely left `html.includes(design_read)` green. That
is a net that cannot see the defect it is named for. G4 now scopes both assertions to the sheet
**header** (everything before the `<h2>Navigation graph` heading). Re-run with the same break:

```
G4 (design_read dropped from the header): exit=1 red=['Case G4']
G4 (mode dropped from the header):        exit=1 red=['Case G4']
```

### RED — task 2b (A1-A4 + C4), verbatim, commit `c6b3f1a`

```
✖ Case C4 — unknown `ui` and `ui spec` subcommands exit 1 and list what is available
  AssertionError: The input did not match /Unknown ui subcommand\. Available: metrics, spec, sheet/.
  Input: 'Error: Unknown ui subcommand. Available: metrics, spec\n'
✖ Case A1 — `ui sheet` writes the file and prints {sheet_hash, out, states, missing}, exit 0
  AssertionError: exit 1. stderr: Error: Unknown ui subcommand. Available: metrics, spec
✖ Case A2 — a missing --out, a nonexistent --renders dir and a nonexistent spec each exit 1
  AssertionError: the refusal names the flag that is missing
✖ Case A3 — an INVALID spec exits 1 and writes no sheet at all
  AssertionError: stdout is not JSON (exit 1): Error: Unknown ui subcommand. Available: metrics, spec
✖ Case A4 — the hash the arm prints is the one sheetHash(buildSheetModel(...)) computes
  AssertionError: Error: Unknown ui subcommand. Available: metrics, spec
ℹ tests 16 / ℹ pass 11 / ℹ fail 5
EXIT=1
```

### GREEN — the TRD's `<verification>` command

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test ui-sheet.test.cjs \
    ui-spec-cli.test.cjs ui-spec-render.test.cjs ui-spec-validate.test.cjs ui-spec.test.cjs \
    yaml-lite.test.cjs 2>&1 | tail -12; exit ${PIPESTATUS[0]}'
ℹ tests 113
ℹ suites 0
ℹ pass 113
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
EXIT=0
```

---

## Post-TRD Verification — the real-binary probes, verbatim

**MISSING-cell probe — the never-drop rule, on real HTML:**

```
$ cd plugins/devflow/devflow/bin/lib && mkdir -p /tmp/sheet-r && \
  node ../df-tools.cjs ui sheet __fixtures__/ui-spec/projects-rail.md \
    --renders /tmp/sheet-r --refs /tmp/sheet-r --out /tmp/sheet.html > /tmp/sheet.json
advisory: PAT000 MISSING — the pattern catalogue is unreachable, so 2 referenced pattern(s)
  could not be resolved and no `must_not` defaults could be inherited — §4.5 I5 is UNCHECKED
  for this spec, which is not the same as passing (supply one with `--patterns`)
advisory: 1 check(s) did not run for …/projects-rail.md; a MISSING row is not a pass.
exit=0
17        # grep -c MISSING  (TRD floor: >= 8)
5         # grep -c guard-denied  (TRD floor: >= 1 — the row exists rather than being skipped)
```

**Self-containment probe:**

```
$ grep -cE "https?://|<script src=|<link[^>]*href=" /tmp/sheet.html; echo "expect 0"
0
expect 0
```

**Hash-path probe:**

```
$ node -e "const j=require('/tmp/sheet.json'); process.exit(/^[0-9a-f]{64}$/.test(j.sheet_hash)?0:1)"
hash exit=0
```

**Arm output on that run** (no renders supplied, so every row is MISSING by design):

```json
{
  "sheet_hash": "c9b5c1631661eb85ed83dded463f828c30cb0275165f2d1321983670586b9814",
  "out": "/tmp/sheet.html",
  "states": 8,
  "missing": ["projects-rail--populated--light--1280", "projects-rail--long-content--light--1280",
              "projects-rail--empty--light--1280", "projects-rail--error--light--1280",
              "projects-rail--outage--light--1280", "projects-rail--guard-denied--light--1280",
              "projects-rail--narrow--light--390", "projects-rail--dark--dark--1280"],
  "engine_version": "2.8.0",
  "schema_version": 1
}
```

**`npm test` at TRD end — not a gate, recorded for drift only:**

```
ℹ tests 3185   (+16, this TRD's new cases)
ℹ pass  3125   (+14)
ℹ fail  10     (baseline at TRD start: 8)
ℹ skipped 50
```

The two extra failures are both in `devflow-watch` (`start cleans up stale PID file`,
`C-2 start --project /p`), which flakes between 3 and 5 failures run to run — the orchestrator's
own stated band is 10. Every failing file is pre-existing and unrelated: `devflow-watch`,
`handoff-e2e`, `awareness` S1. No file this TRD touched appears among them.

**Structural probe on the committed fixture sheet:**

```
external refs (expect 0):   0
rows:                       8
missing rows:               3
img tags:                   6
non-data img (expect 0):    0
```

---

## What `sheet_hash` covers, and what it deliberately excludes

**34-07's re-lock logic is built on this table and must not re-derive it.**

```
sheet_hash = sha256( canonical( model minus engine_version ) )
canonical(v) = key-SORTED JSON serialisation, recursively
```

### IN the hashed payload

| field | why it is a shape change a human must re-see |
|---|---|
| `surface` | a different surface is a different sheet |
| `design_read` | the stated design intent the reviewer judged against |
| `mode` | `greenfield` vs `redesign` changes what "correct" means |
| `schema_version` | a schema change *is* a shape change |
| `navGraphMermaid` | derived from `routes` — §4.1's re-lock trigger, verbatim |
| `controlTableMd` | derived from `controls` — the English a human actually approved |
| `rows[]` | derived from `states` × theme × width — one row per capture, never filtered |
| `rows[].capture_id`, `state_id`, `theme`, `width` | the grid's identity |
| `rows[].render` | the render's path **relative to the renders root**, or `null` |
| `rows[].render_expected` | the relative path that was looked for |
| `rows[].status` | `present` \| `MISSING` |
| `rows[].reason` | `no render at <capture_id>.png`, or `null` |
| `rows[].ref`, `ref_kind`, `ref_status` | the reference and which `--refs` subdirectory labelled it |
| `rows[].content` | the per-state content contract (§4.2) |

### OUT of the hashed payload — each an explicit decision

1. **The rendered HTML, and the template that produced it.** The whole point of the row. If the
   hash tracked the markup, every CSS tweak would invalidate a human's approval — and within two
   weeks the lock would be re-approved without being read, which is strictly worse than no lock,
   because it still reports "a human signed this off". `sheetHash` takes the **model**;
   `renderSheetHtml` is a separate function the hash never sees. Structurally true, not
   accidentally true. Cases **H1** (edit changes HTML, not hash) and **H2** (a spec change *does*
   move it) pin both halves; neither alone does.

2. **Render and reference BYTES.** A row carries a path and a status, never file contents. This
   module reads a render's bytes in exactly one place — `dataUri()`, on the HTML side of the line.
   Re-rendering a screen after a code change writes different pixels at the same path and must
   **not** clear a look-lock: §4.1's re-lock rule names `routes`/`controls`/`states` only. But a
   state moving `MISSING` → `present` **is** new information the human has not seen, so that
   transition **does** move the hash. Case **H4** pins both halves. *Getting this backwards means
   every re-render invalidates the lock.*

3. **`engine_version`.** Stamped on the model and printed in the sheet footer — a reader must be
   able to see which engine produced what they are approving — but **not hashed**. 34-11's version
   bump would otherwise silently clear every look-lock in every repo, for a release that changed
   nothing a human looked at. `schema_version` **is** hashed; a schema change is a shape change.

4. **Absolute paths.** Neither the renders root nor the refs root reaches the model, and
   `reason` names the relative expected filename, never an absolute one. An absolute path in the
   hashed payload would make `sheet_hash` depend on which machine and which checkout ran the tool —
   every CI run would then clear every lock, which is hashing-the-HTML wearing a different hat.

5. **Key insertion order.** `canonical()` sorts keys recursively before hashing. `JSON.stringify`
   alone is insertion-ordered, so two identical specs authored in a different key order would hash
   differently and clear each other's locks. Case **H3**.

`sheetHash` returns **bare 64-hex**; §4.2 stores it as `sha256:<hex>`, matching the schema's
`^sha256:[0-9a-f]{64}$`. `canonicalSheetJson(model)` is exported so a failing H1 can be *read*
rather than guessed (the TRD's `<error_recovery>`).

---

## Decisions this TRD was asked to make and record

### Mermaid: a `<pre class="mermaid">` block, not inline SVG

The graph goes into the sheet verbatim, HTML-escaped, inside `<pre class="mermaid">`.

* A **Claude Artifact renders `<pre class="mermaid">` natively** — no library, no `<script src=`,
  so G7 stays green. This is the TRD gotcha's recommended "fenced code block", in its HTML form.
* Opened from `file://` with no network it degrades to **readable text** — `flowchart TD` and one
  line per edge. A reader can still answer "can I get back from here"; they just read it instead
  of seeing it.
* **Tradeoff:** pre-rendering to inline SVG would draw offline too, but it would mean either a
  mermaid dependency (forbidden) or a hand-written layout engine (a second, drifting derivation of
  a graph `renderSurfaceSpec` already owns). Text that is always honest beats a picture that is
  sometimes wrong.

The control table is embedded the same way, in `<pre class="control-table">`: it is already
written as English sentences, and rendering markdown would mean a markdown renderer — another
dependency, or another thing to get wrong.

### Images: INLINED as `data:` URIs, not referenced by relative path

* §8.3 wants the sheet **publishable as a Claude Artifact** *and* openable from disk offline. A
  relative `src` breaks in the first case and breaks the moment the file moves in the second — and
  neither failure is loud. **A broken image reads as "nothing rendered here", which is the one
  thing this sheet must never say by accident.** That is the same silent-pass class as a dropped
  MISSING row.
* **Tradeoff: file size.** The committed fixture is **57,574 bytes** with five inlined renders and
  one inlined reference. Real 1280×800 screenshots would be far larger — a surface with sixteen
  captures could reach several MB. That is the accepted cost; it is bounded, visible, and it fails
  loudly (a big file) rather than quietly (a blank pane).
* G7 asserts every `<img>` carries `src="data:` and that the page contains no `http(s)://`, no
  `<script`, no `<link … href=` and no non-`data:` CSS `url()`.

### Render lookup, and where `MISSING` comes from

`<renders>/<capture_id><ext>` for `ext` in `['.png', '.jpg', '.jpeg', '.webp']`, first hit wins —
the order is a contract, because the first hit is what lands in the hashed model. `capture_id` is
34-05's, unchanged. No file → `status: 'MISSING'`, `render: null`,
`reason: "no render at <capture_id>.png"`, **and the row is still there**.

A `--renders` or `--refs` directory that was *supplied but does not exist* is a **one-line refusal,
exit 1** — not a fallback to "everything is MISSING". A typo must not silently render as a surface
nobody captured, because that is precisely the message this sheet has to be trusted to mean.
Omitting the flag entirely is different and is allowed: it says up front that no renders were
supplied.

`ref_status` is `present` | `MISSING` | **`none`**. A state that declares no reference is not a
state whose reference failed to arrive; collapsing the two would invent a defect.

### The arm

```
df-tools ui sheet <spec> [--renders <dir>] [--refs <dir>] --out <file> [--patterns <c.json>]
```

| invocation | stdout | file | exit |
|---|---|---|---|
| valid spec | `{sheet_hash, out, states, missing[], engine_version, schema_version, spec}` | written | 0 |
| invalid spec | the verdict, in `validate`'s own shape | **none** | **1** |
| `--out` omitted | — | none | **1**, one line naming `--out` |
| `--renders`/`--refs` dir absent | — | none | **1**, naming the directory |
| spec not found | — | none | **1** |

`process.exitCode` throughout — never `process.exit()`, never `helpers.output()` (which calls
`process.exit(0)` unconditionally and would make this arm structurally incapable of failing). It
reuses `parseAndValidate`, so "is this spec valid" keeps one home across all three arms. **A4**
asserts the printed hash equals an in-process `sheetHash(buildSheetModel(...))`: the CLI has no
second hashing path, because two definitions of what a look-lock covers eventually disagree about
whether a human's approval still stands.

`ui` subcommands are now `metrics, spec, sheet`; 34-04's **C4** assertion was updated in the same
commit as the RED so the refusal message and its test cannot drift apart.

A MISSING *invariant* row (PAT000 — no pinned pattern catalogue in W1b) is advisory on **stderr**,
exactly as `render` does. It does not refuse the sheet and it is not swallowed.

---

## The committed fixture sheet

```
plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/sheet/projects-rail.sheet.html
```

| | |
|---|---|
| `sheet_hash` | **`33af7614188bfe47d7e06eefa798dba149d0008ebde0e181662357de818af2b3`** |
| states (rows) | 8 |
| size | 57,574 bytes |
| images inlined | 6 (5 renders + 1 reference) |

**`missing[]` — MISSING by design, so the checkpoint's second question can be answered:**

```
projects-rail--error--light--1280
projects-rail--outage--light--1280
projects-rail--guard-denied--light--1280
```

The other five states carry a generated placeholder render, and `populated` also carries its
declared reference `locked/populated.png`, labelled **`Reference (locked)`** from the `--refs`
subdirectory it came from.

**34-07's known value is the hash above.** Note it is the hash of the *model*: it is reproducible
from the committed spec plus the knowledge of *which* captures were present — not from the PNG
bytes, which is the whole point of the status-not-bytes rule.

### Reproducing it

The placeholder renders are **generated, never pasted** (CLAUDE.md habit 4): a hand-written PNG
encoder (signature, IHDR, deflated IDAT, IEND, each with its own CRC32) draws a two-tone
"rail beside content" panel at the row's declared width. The same encoder lives in
`ui-sheet.test.cjs` as `makePng()`, which is what lets H4 write *different pixels to the same path*
and assert the hash did not move.

The renders and refs directories are **not committed** — the images are inlined in the sheet, so
committing nine PNGs would add files outside this TRD's `files_modified` for no benefit. The
generator script used is `scratchpad/make-sheet-fixture.cjs`; it writes into a temp tree and runs

```
node ../df-tools.cjs ui sheet __fixtures__/ui-spec/projects-rail.md \
  --renders <tmp>/renders --refs <tmp>/refs \
  --out __fixtures__/ui-spec/sheet/projects-rail.sheet.html
```

with these five `capture_id`s present and the other three absent.

---

## The human-verify checkpoint (OUTSTANDING)

**Not answered. Not approved. No answer may be recorded here by anyone but the human.**

The plan's gate for this row is literally *"one fixture sheet committed and eyeballed once"* — a
review sheet nobody has looked at is not a review artifact, it is a file.

**Artifact (absolute path):**

```
/Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/sheet/projects-rail.sheet.html
```

**How to verify**

1. Open it in a browser — it is self-contained, so `open <path>` (or dragging it into a tab) is
   enough; no server and no network. Alternatively paste its contents into a Claude Artifact,
   which additionally draws the navigation graph.
2. `sheet_hash` `33af7614188bfe47d7e06eefa798dba149d0008ebde0e181662357de818af2b3` · 8 rows ·
   3 MISSING (`error`, `outage`, `guard-denied`).
3. Answer the three questions below, verbatim, and record the answers in this section.

**Question 1 — is the control table readable as English?**
§8.3's standard is *"Clicking the project header toggles its children and selects the project. It
never navigates on close."* If it does not read like that, the fix belongs in **34-05's templates**
and this TRD waits.

> **Answer:** _(awaiting the human)_

**Question 2 — is a MISSING cell unmistakable?**
It must read as *"this was never rendered"*, not as an empty cell that scans as fine. Compare the
`error` / `outage` / `guard-denied` rows against the five that carry a render.

> **Answer:** _(awaiting the human)_

**Question 3 — is the grid legible at the state × theme × width size it will actually be?**
If eight states × two themes is unusable, say so now — the layout is cheap to change before W1★
depends on it.

> **Answer:** _(awaiting the human)_

Any "no" becomes a fix **in this TRD** (layout) or a follow-up noted against **34-05** (wording) —
not a deferred issue.

---

## Deviations

1. **The fixture sheet was committed before the checkpoint was answered.** The TRD says "commit
   the fixture sheet only after the user has answered"; the run is autonomous (`--auto`), so no
   human was available and the executor is forbidden from self-approving. The file was committed
   (`145030c`, whose subject says the checkpoint is OUTSTANDING) so the artifact exists on the
   branch for a verifier to open rather than living as an untracked file in a worktree. **Nothing
   about the checkpoint is marked answered or approved.**

2. **G4 was strengthened beyond the TRD's literal wording.** The prescribed assertion ("both
   strings appear in the HTML") cannot fail for the bug it names, because the control table
   carries its own `*Design read:*` line. Proven by a differential control that came back
   `exit=0 red=[]`. G4 now scopes both assertions to the sheet header. See *G1-G7 passed on
   arrival*.

3. **G1-G7 have differential controls, not REDs.** Task 1's template already carried the full
   grid (H1 needs a `<style>` block to edit), so those seven cases were green when written. Per
   the TDD contract, no RED is claimed; each was proven by breaking the implementation and
   confirming it — and only it — goes red, then restoring. Precedent: 34-05's D1.

4. **`renderSheetHtml` takes a third `opts` argument** (`{renders, refs}`), used only to inline
   images. The TRD's signature is `renderSheetHtml(model, template = loadSheetTemplate())`; the
   defaulted second parameter is unchanged, so the TRD's probe runs verbatim. The roots are passed
   at *render* time rather than carried on the model precisely so the hashed payload stays free of
   absolute paths.

5. **The renders/refs fixture directories are not committed.** The TRD's task-3 command names
   `__fixtures__/ui-spec/renders` and `__fixtures__/ui-spec/refs`; committing them would add nine
   files outside `files_modified`, and the images are inlined in the sheet anyway. Generated into
   a temp tree instead; the generator and the exact present/absent split are recorded above.

6. **`ui-sheet.test.cjs`'s mirror tree copies `references/*.json`.** `helpers.cjs` reads
   `model-profiles.json` at module load, and the real mirror carries `references/`. The TRD's M1
   recipe named `bin/lib/*.cjs` + `templates/ui-sheet.html` only; without `references/` the tree is
   not the mirror. No implementation change.

7. **`templates.cjs` has no resolution helper to reuse.** The TRD's `<codebase_examples>` says
   "`bin/lib/templates.cjs` already loads from that directory; reuse its resolution helper" — it
   does not; `templates.cjs` builds summary/job/verification documents from inline string arrays
   and never reads `devflow/templates/`. `loadSheetTemplate()` therefore follows **34-02's**
   precedent instead (`path.join(__dirname, '..', '..', …)`, exactly as `SCHEMA_DIR` is resolved),
   which is the pattern M1 guards.

## Not in this TRD

`ui lock`, writing `acceptance.locked_sheet`, and publishing to a Claude Artifact (a human action
at W1★). `flutter-ui-eval.cjs` was not touched. No spec semantics are derived here: the nav graph,
the control table and the capture list all come from `renderSurfaceSpec`, and G5 asserts identity
rather than similarity.
