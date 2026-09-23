---
objective: 34-ui-oracle-loop-w1b-surface-spec
job: "10"
subsystem: testing
tags: [bash, agent-prose, harness, annotations, executor-md, ci, commonjs]

# Dependency graph
requires: ["34-09"]
provides:
  - "The CURRENT `plugins/devflow/agents/executor.md` Flutter sections pass the harness end-to-end (22 calls, 3 sections, zero findings)"
  - "A hand-built monorepo scratch repo + six argument-checking stub binaries on a prepended, HERMETIC PATH"
  - "The `# harness:` annotation vocabulary — expect / expect-cwd / expect-exit / derive / subst / skip — with an unknown directive as a FINDING"
  - ".github/workflows/agent-shell-harness.yml — the gate, on every PR touching agent prose"
affects: [34-07, executor.md, worktree_command_discipline, ui-oracle-loop, W2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Annotations are DECLARATIONS in the prose a reviewer already reads, never a mute button: a skip is MISSING, an unknown directive is a finding"
    - "Substitute the BINARY by NAME on a prepended PATH, not by absolute path — containment stays maximally strict and no allowOutside is needed"
    - "Hermetic PATH: the caller's PATH is NOT inherited, so a developer box with real flutter/jq behaves like a CI runner with neither"
    - "Anti-vacuity before verdict: R4 (bounded call counts) and R5 (differential control on a COPY) written and asserted before R1-R3"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/scratch-repo/factory.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/bin/{flutter,maestro,adb,jq,pgrep,df-tools}
    - .github/workflows/agent-shell-harness.yml
  modified:
    - plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs
    - plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs
    - plugins/devflow/agents/executor.md

key-decisions:
  - "No `opts.allowOutside` was used. The only absolute paths the three sections name after substitution are `/dev/null`; the mirror path is substituted to a PATH-resolved shim by NAME. Containment stays as strict as 34-09 shipped it."
  - "`jq` is STUBBED, not substituted away — but the three sections no longer use it, because the prose that piped a detector field into a dying shell variable was itself the defect."
  - "The PATH a call runs with is hermetic (stub dir + node's dir + POSIX system dirs). `process.env.PATH` is not inherited; this box has real flutter/maestro/jq and the CI runner has none."
  - "A section now also ends at an XML close tag at column 0. `executor.md`'s `##` headings live inside `<step>` elements; the heading-level rule alone ran the post-all-tasks section to EOF and swallowed 21 foreign calls."
  - "`\"$VAR\"/suffix` is no longer read as an absolute path. The containment scan is word-based with quote tracking."
  - "No `# harness: skip` was used anywhere. Zero."
---

# TRD 34-10: the harness meets real prose

**The current `agents/executor.md` Flutter sections now pass the harness end-to-end — 5 + 6 + 11 = 22 calls, three sections, zero findings — and the prose was fixed, not exempted. Before the fix the same three sections produced 40 findings.**

## Performance

- **Tasks:** 3
- **Commits:** 23 (11 `test:` RED, 11 `feat:` GREEN, 1 `fix:` for the prose)
- **Files modified:** 11 (8 new)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: F1-F4 focused suite | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS |
| 1: bootstrap-contract probe | see **Bootstrap-contract probe** | 0 | PASS |
| 1: stub-strictness probe | `bash -c 'plugins/.../__fixtures__/agent-shell/bin/flutter bogus-subcommand; echo "exit=$?"'` | — | PASS — `exit=2` with argv |
| 2: A1-A7, E1/E2, X5c | same focused suite | 0 | PASS |
| 2: evidence-landing probe | see **Evidence-landing probe** | 0 | PASS |
| 2: skip-is-not-pass probe | see **Skip-is-not-pass probe** | 0 | PASS |
| 3: full focused suite | same focused suite | 0 | PASS — `tests 37 / pass 37 / fail 0` |
| 3: **the deliverable probe** | see **The real file** | 0 | PASS — 3 × `ok=true`, 22 calls |
| 3: differential control | see **Differential control** | 0 | PASS — `broken copy ok: false` |
| 3: CI YAML probe | `grep -cE "continue-on-error\|\|\| true" .github/workflows/agent-shell-harness.yml` | 0 | PASS — prints `0` |

## Task Commits

**Task 1 — the scratch monorepo and the stubs**
- `e2a4333` `test(34-10): RED — F1-F4 the scratch monorepo and the argument-checking stubs`
- `52cfa9e` `feat(34-10): GREEN — hand-built scratch monorepo, six strict stubs, hermetic PATH, MISSING-binary`

**Task 2 — the annotation vocabulary and the evidence case** (one case at a time)
- `c3c843a` / `cfcdacd` — A1 `expect`
- `1902e8d` / `d15e0b1` — A2 `expect-cwd`
- `cfb34e2` / `39b6f44` — A3 `expect-exit`
- `6e5a714` / `0c30bdf` — A4 `derive` (+ its negative half)
- `b0d23b8` / `d8619cb` — A5 `subst`
- `846e2c1` / `aeca056` — A6 `skip` is MISSING
- `8bd41ca` / `35646f8` — A7 unknown directive is a finding
- `7077a57` / `a2358a1` — X5c containment false positive + E1/E2 evidence landing

**Task 3 — the real file and the CI gate**
- `f68c036` `test(34-10): RED — R4 anti-vacuity and bounded sections, R5 the differential control`
- `153e06f` `feat(34-10): GREEN — bound a section at its XML close tag; R1-R5 against the real file`
- `4a3acc0` `fix(34-10): executor.md Flutter prose — no cross-call shell variables, declared harness intent`
- `d48a050` `test(34-10): RED — C1/C2 the CI gate must run and must be able to fail`
- `c005bfc` `feat(34-10): GREEN — CI job runs the harness on every agent-prose PR, exit code unswallowed`

**Scope proof.** Every commit whose subject contains `(34-10)` touches only:

```
.github/workflows/agent-shell-harness.yml
plugins/devflow/agents/executor.md
plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/bin/{adb,df-tools,flutter,jq,maestro,pgrep}
plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/scratch-repo/factory.cjs
plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs
plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs
```

34-02's `ui-spec.*`, its `__fixtures__/ui-spec/`, and 34-01's `yaml-lite.*` were never touched.

## TDD Evidence

Iron Law: one case at a time, RED observed by a real exit code and recorded before any implementation, RED committed before GREEN.

| Phase | Case(s) | Exit Code | Expected / observed |
|---|---|---|---|
| RED | F1-F4 | 1 | `Error: Cannot find module './__fixtures__/agent-shell/scratch-repo/factory.cjs'` |
| GREEN | F1-F4 (+F3b) | 0 | `tests 21 / pass 21 / fail 0` |
| RED | A1 | 1 | `a call that exits 0 without producing its artifact FAILS` / `true !== false` |
| GREEN | A1 | 0 | `pass 22` |
| RED | A2 | 1 | `a DECLARED move is not a leak` / `false !== true` |
| GREEN | A2 | 0 | `pass 23` |
| RED | A3 | 1 | `a declared exit 1 is not a finding` / `false !== true` |
| GREEN | A3 | 0 | `pass 24` |
| RED | A4 | 1 | `the derived variable is available to its own call` / `false !== true` |
| GREEN | A4 | 0 | `pass 25` |
| RED | A5 | 1 | `the substituted call ran and produced the artifact` / `false !== true` |
| GREEN | A5 | 0 | `pass 26` |
| RED | A6 | 1 | `Expected values to be strictly equal: 127 !== 'skipped'` |
| GREEN | A6 | 0 | `pass 27` |
| RED | A7 | 1 | `a directive the harness does not understand FAILS the section` / `true !== false` |
| GREEN | A7 | 0 | `pass 28` |
| RED | X5c + E1/E2 | 1 | `a quoted variable expansion with a path suffix is not a containment escape` and `from the repo root: ["containment","containment","containment","missing-artifact"]` |
| GREEN | X5c + E1/E2 | 0 | `pass 30` |
| RED | R4 + R5 | 1 | `## Flutter UI bootstrap detector (REQ-10-07) must stop at its own </step>: it captured \`PLAN_START_TIME\`` and `and it must fail it for the RIGHT reason — the bare \`cd\` leaking the cwd` |
| GREEN | R4, R5, R1-R3 | 0 | `pass 35` |
| RED | C1 + C2 | 1 | `/…/.github/workflows/agent-shell-harness.yml must exist` |
| GREEN | C1 + C2 | 0 | `tests 37 / pass 37 / fail 0` |
| REFACTOR | — | — | not needed |

### Verbatim RED output, task 1

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 | head -14; echo "EXIT=${PIPESTATUS[0]}"'
node:internal/test_runner/harness:122
      throw err;
      ^

Error: Cannot find module './__fixtures__/agent-shell/scratch-repo/factory.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
...
EXIT=1
```

### `npm test` baseline (explicitly NOT a gate for this TRD)

Re-measured at TRD start on this branch: **3073 tests / 3012 pass / 11 fail / 50 skipped.**
All 11 pre-existing and unrelated: `handoff-e2e.test.cjs` (4), `devflow-watch.test.cjs` (4),
`org-awareness-cli.test.cjs` (2), `awareness.test.cjs` (1).

## What changed in `agents/executor.md`, and the finding that forced it

This is the headline result. Every change below was caused by a finding the harness
produced on the CURRENT prose; none is a harness exception. The full "before" run is
reproducible by checking out `153e06f:plugins/devflow/agents/executor.md` and pointing
`checkSection` at it — **40 findings across the three sections, all three `ok=false`.**

### 1. The bootstrap capture chained shell variables across four Bash calls

**Finding (verbatim):**

```
[unset-variable] L48 call 2 read `$BOOTSTRAP`, which no longer exists: shell variables do
NOT persist between Bash calls. Re-derive it inside this call.
Offending call: `ACTION=$(echo "$BOOTSTRAP" | jq -r '.action')`
[nonzero-status] L50 call 4 exited 1 — bash: line 3: BOOTSTRAP: unbound variable
                                        bash: line 3: REPO_ROOT: unbound variable
```

**Original:**

```bash
BOOTSTRAP=$(node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-bootstrap . --raw)
ACTION=$(echo "$BOOTSTRAP" | jq -r '.action')
REPO_ROOT=$(pwd)
PACKAGE_DIR=$(echo "$BOOTSTRAP" | jq -r '.packageDir // "'"$REPO_ROOT"'"')
```

**Fixed:**

```bash
# One plain command per Bash call. There is nothing to assign: a shell variable does NOT
# survive into the next call, so read `.action` and `.packageDir` straight out of this
# tool result and note them down as literal absolute paths.
# harness: subst node ~/.claude/devflow/bin/df-tools.cjs=df-tools
node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-bootstrap . --raw

# The repo root is the session's working directory.
pwd
```

**Why this shape.** The paragraph directly beneath this block *already* said the values
"will not survive into the next Bash call" and should be noted down as literal paths — so
the four assignments were vestigial, and the `jq` extraction existed only to populate
variables that die at the end of their own call. An LLM executor reads the JSON out of the
tool result. The prose and its own commentary now agree. (The neighbouring sentence was
re-worded from "`REPO_ROOT` is captured here" to "The repo root is read here", since
nothing is assigned any more.)

### 2. The setup-task extraction had the same defect

**Finding:** `[unset-variable] L73 call 5 read $BOOTSTRAP …`

**Original:**

```bash
SETUP_TASK=$(echo "$BOOTSTRAP" | jq -r '.setup_task')
# Insert SETUP_TASK as the first task in the task list (before all TRD-defined tasks).
```

**Fixed** — the bash block is gone, replaced by prose (there is no shell work to do here):

> Take `.setup_task` from the detector output above — it is a fully-formed `<task>` XML block
> from TRD 10-04a's bootstrap detector — and insert it as the FIRST task in the task list,
> before all TRD-defined tasks. There is deliberately no shell step here: piping the field
> through `jq` into a shell variable would only lose it at the end of that Bash call.

### 3. The hard-fail message interpolated a dead variable

**Finding:**

```
[unset-variable] L82 call 7 read `$MISSING`, which no longer exists …
[nonzero-status] L82 call 7 exited 127 — bash: line 3: MISSING: unbound variable
[nonzero-status] L84 call 9 exited 1 (expected 0): `exit 1`
```

**Original → Fixed:**

```bash
-MISSING=$(echo "$BOOTSTRAP" | jq -r '.missing | join(", ")')
-echo "EXECUTOR HARD FAIL: … Missing: $MISSING"
+# The missing items are the `.missing` array in the detector output above — quote them
+# into the message you return. `$MISSING` from an earlier call no longer exists here.
+echo "EXECUTOR HARD FAIL: Flutter UI bootstrap infra missing after marker set."
 echo "Restore the missing infra OR delete .planning/.flutter-ui-bootstrap-done to re-run bootstrap."
+# harness: expect-exit 1
 exit 1
```

The `exit 1` is CORRECT prose (it is the hard-fail branch) and is now declared with
`expect-exit 1` rather than reading as a failure.

### 4. The analyze baseline-diff carried a shell variable AND a multi-line `if`

**Findings:**

```
[unset-variable] L177 call 3 read `$PACKAGE_DIR` …
[unset-variable] L178 call 4 read `$REPO_ROOT` …
[nonzero-status] L180 call 5 exited 2 — bash: -c: line 4: syntax error: unexpected end of file
[unset-variable] L182 call 7 read `$NEW_WARNINGS` …
[nonzero-status] L184 call 8 exited 2 — bash: -c: line 3: syntax error near unexpected token `fi'
```

**Original:**

```bash
CURRENT_ANALYZE=$(cd "$PACKAGE_DIR" && flutter analyze --no-pub --no-fatal-warnings 2>&1 | sort)
NEW_WARNINGS=$(diff …/analyze-baseline.txt <(echo "$CURRENT_ANALYZE") | grep '^>')

if [ -n "$NEW_WARNINGS" ]; then
  echo "FAIL: task introduced new flutter analyze warnings:"
  echo "$NEW_WARNINGS"
fi
```

**Fixed** — the current output goes to a SECOND FILE (the section's own stated idiom:
*"The baseline lives in a file, not a shell variable"*), and one self-contained call does
the comparison:

```bash
( cd "$PACKAGE_DIR" && flutter analyze --no-pub --no-fatal-warnings 2>&1 | sort ) > "$REPO_ROOT"/.planning/objectives/$OBJECTIVE_DIR/evidence/analyze-current.txt

diff "$REPO_ROOT"/…/analyze-baseline.txt "$REPO_ROOT"/…/analyze-current.txt | grep '^>' || echo "OK: no new flutter analyze warnings"
```

The `if … fi` and the "Apply deviation Rules 1-3" guidance moved out of the fence into
prose. **Note on the multi-line `if`:** 34-09's splitter is "one physical line, one call"
(with backslash-continuation and heredoc exceptions). A multi-line shell compound
construct therefore splits into per-line calls and each is a syntax error — a FINDING, not
a silent pass, so the failure mode is safe. It was not worth extending the splitter here
because `$NEW_WARNINGS` could never exist by that call anyway: the prose, not the splitter,
was the defect. **W2 should decide** whether to teach `splitCalls` about `if/for/while/case`.

### 5. Every `$REPO_ROOT` / `$PACKAGE_DIR` / `$OBJECTIVE_DIR` reference needed a `derive`

**Finding pattern (14 instances):** `[unset-variable] L173/L212/L223/L227/… read $REPO_ROOT / $PACKAGE_DIR …`

These are NOT prose bugs: the prose deliberately uses them as per-call placeholders and
says so ("Each Bash call must do one of: substitute the literal absolute paths … or
re-derive at the top of the call"). They are now DECLARED, per call, in the file:

```bash
# harness: derive REPO_ROOT={root}
# harness: derive OBJECTIVE_DIR=34-demo
mkdir -p "$REPO_ROOT"/.planning/objectives/$OBJECTIVE_DIR/evidence/
```

A `derive` reaches exactly one call (A4's negative half asserts it), so 34-09's X3 stays
reachable on real prose: an *un*-declared `$VAR` still fails.

### 6. The illustrative placeholders needed `subst`

`<path/to/test.dart>` and `<tests.integration path from TRD>` are redirections to bash:

```
[nonzero-status] L193 call 9 exited 2: `( cd "$PACKAGE_DIR" && flutter test <path/to/test.dart> )`
  — bash: -c: line 3: syntax error near unexpected token `)'
```

Declared, not rewritten — the placeholder stays in the prose where it belongs:

```bash
# RED phase — MUST exit non-zero (test fails on missing implementation)
# harness: subst <path/to/test.dart>=integration_test/red_phase_test.dart
# harness: expect-exit 1
```

The RED half is substituted to a path the scratch repo does NOT contain, so the stub exits
1 exactly as real `flutter test` does on a missing target — which is how the prose's own
claim ("MUST exit non-zero") became an assertion instead of a comment.

### 7. The mirror path needed `subst`, not an edit

```
[nonzero-status] L47 call 1 exited 1: `BOOTSTRAP=$(node ~/.claude/devflow/bin/df-tools.cjs …)`
  — Error: Cannot find module '…/.home/.claude/devflow/bin/df-tools.cjs'
```

`~/.claude/devflow/bin/df-tools.cjs` is CORRECT prose (skills and agents invoke the
mirror). Substituted at run time to a `df-tools` shim on the prepended PATH, which execs
this worktree's real `df-tools.cjs`. **Substitute the BINARY, keep the ARGUMENTS** —
`verifier-ui-eval-invocation.test.cjs:38-42`.

### 8. The evidence `mv`s and the builds gained `expect`

`mv … 2>/dev/null || true` exits 0 whether or not anything moved, and `flutter build apk`
reports nothing about where it wrote. Each now declares the artifact it produces:

```bash
# harness: expect .planning/objectives/34-demo/evidence/shot.png     (mobile integration_test)
# harness: expect .planning/objectives/34-demo/evidence/maestro.xml  (maestro --output)
# harness: expect .planning/objectives/34-demo/evidence/flow-1.png   (maestro ~ screenshots)
# harness: expect .planning/objectives/34-demo/evidence/web-shot.png (flutter drive)
# harness: expect flutter/build/app/outputs/flutter-apk/app-debug.apk
```

The `flutter` stub writes `shot.png` from `flutter test integration_test/` and
`web-shot.png` from `flutter drive`, so the mobile and web evidence moves are each
*independently* falsifiable rather than one satisfying the other's assertion.

### 9. The chromedriver guard

```
[nonzero-status] L250 call 8 exited 1 (expected 0): `pgrep chromedriver >/dev/null || { … exit 1; }`
```

Correct prose; declared `# harness: expect-exit 1`, with a comment saying why. A `pgrep`
stub makes it deterministic: nothing is running in a scratch root, on any machine.

### Not changed

`executor.md:177`'s `CURRENT_ANALYZE=$(cd "$PACKAGE_DIR" && …)` — **the command
substitution was never flagged as a cwd leak.** 34-09's detector works on the OBSERVED cwd
after the call, and a `$( … )` subshell does not move it. Confirmed explicitly on the
original file: the only findings on that line were `unset-variable` (`$PACKAGE_DIR`) and
the resulting `nonzero-status`. **No harness fix was needed.**

## The `# harness:` annotation vocabulary, as shipped

34-07 edits `executor.md` later and reads this. One line each. A directive is a full-line
comment; it attaches to the call that FOLLOWS it (34-09's rule), and several in a row all
attach to that call. `{root}` in any value expands to the scratch root.

| Directive | Meaning |
|---|---|
| `# harness: expect <path>` | after the call, `<path>` (resolved against the scratch ROOT, not the cwd) must exist |
| `# harness: expect-cwd <path>` | the persisted cwd after the call must equal `<path>`; a DECLARED move is not a `cwd-leak` |
| `# harness: expect-exit <n>` | the call's status must equal `n` (default expectation is 0) |
| `# harness: derive <VAR>=<value>` | inject `VAR` into THIS call's environment only — never the next one |
| `# harness: subst <token>=<value>` | literal replace of `<token>` in the call text before execution (split on the FIRST `=`) |
| `# harness: skip <reason>` | do not execute; `status: 'skipped'`; counts toward MISSING, **never** toward pass |
| anything else under `# harness:` | a `unknown-annotation` FINDING — including a known verb with a malformed argument |

A comment that does not begin `# harness:` is ordinary prose and is inert.

**`# harness: skip` was used ZERO times.** Nothing in the three sections was declared
un-runnable.

New finding types added to 34-09's four: `missing-artifact`, `cwd-mismatch`, `skipped`,
`unknown-annotation`, `missing-binary`. `checkSection().missing` is non-null whenever any
call did not actually execute (a skip, or an absent binary) — a section like that is never
`ok`.

## Per-section call counts (R4's floor)

| Section | Calls |
|---|---|
| `## Flutter UI bootstrap detector (REQ-10-07)` | 5 |
| `## Flutter UI per-task verification (REQ-10-04)` | 6 |
| `## Flutter UI post-all-tasks verification (REQ-10-04)` | 11 |
| **Total** | **22** |

R4 asserts these numbers exactly, plus a guard that no section captured foreign prose
(`git add `, `git commit`, `state advance-job`, `PLAN_START_TIME`, …). A later prose edit
that deletes half the blocks trips it rather than quietly shrinking the gate.

## The real file — the deliverable, verbatim

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "…checkSection over the three sections…"; echo "EXIT=$?"'
## Flutter UI bootstrap detector (REQ-10-07) calls=5 ok=true
## Flutter UI per-task verification (REQ-10-04) calls=6 ok=true
## Flutter UI post-all-tasks verification (REQ-10-04) calls=11 ok=true
total calls 22
EXIT=0
```

(The TRD's probe text was run with real `&&` — as written it contains the markdown-escaped
`\&\&`, which `bash -c` rejects; 34-09 recorded the same. It also needed
`{root, pathPrepend}` and an absolute path to `df-tools.cjs`: `__dirname` inside `node -e`
is the cwd, and the TRD's relative `../df-tools.cjs` resolved against the SCRATCH repo.)

## Differential control — the harness can fail, for the right reason

```
$ bash -c '… copy executor.md, replace ONE `( cd "$PACKAGE_DIR" && flutter test <path/to/test.dart> )`
           with the bare `cd "$PACKAGE_DIR" && flutter test <path/to/test.dart>` …'
broken copy ok: false
finding types: ["cwd-leak"]
EXIT=0
```

The TRD's own probe replaces only the opening `( cd` and leaves the trailing `)`, which
also fails — but as a bash *syntax error*, not a cwd leak:

```
broken copy ok: false | finding types: ["nonzero-status"]
EXIT=0
```

Case R5 uses the stronger form and asserts the `cwd-leak` finding specifically, because
"any breakage fails" is a much weaker control than "the leak detector fires".

## Evidence-landing probe (E1/E2), verbatim

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "…runEvidenceCaseFromBothCwds…"; echo "EXIT=$?"'
{"root":{"ok":true,"landed":".planning/objectives/34-demo/evidence/shot.png","findings":[]},
 "subdir":{"ok":true,"landed":".planning/objectives/34-demo/evidence/shot.png","findings":[]}}
EXIT=0
```

Same landing path from a starting cwd of the scratch root AND of `<root>/flutter`.
The landing path is compared RELATIVE to each run's own scratch root — the two runs use
different roots, so comparing absolute paths would be trivially false.

## Skip-is-not-pass probe, verbatim

```
$ bash -c '… runSection(splitCalls("# harness: skip needs a device\nflutter test"), {root}) …'
false call 1: skipped (needs a device)
EXIT=0
```

## Bootstrap-contract probe, verbatim

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "…makeScratchRepo + df-tools verify flutter-ui-bootstrap…"'
/private/var/folders/…/agent-shell-scratch-Ldjpmx/flutter
EXIT=0
```

Absolute, ends in `/flutter`, `prefix: 'flutter'`, `action: 'skip'` — the W0-4 contract the
prose relies on, satisfied by a hand-built fixture.

## The `jq` decision

**Stubbed** — `__fixtures__/agent-shell/bin/jq`, a strict stub implementing EXACTLY the
four filters `executor.md` uses (`.action`, `.packageDir`, `.setup_task`,
`.missing | join(", ")`) and rejecting every other filter with exit 2 and its argv.

Then the prose fix removed `jq` from all three sections (see change 1-3 above), so the
stub is no longer exercised by R1-R3. It is kept, and covered by case F3b, because the
rest of `executor.md` pipes through `jq` at lines ~345, ~456 and ~893, and W2 points the
harness at those sections. It also settles the TRD's gotcha permanently: the harness never
depends on the runner having `jq`.

## Containment / `allowOutside` decision

**No `allowOutside` entry was used.** 34-09 flagged that real prose citing absolute repo
paths would be blocked. Two things made the exception unnecessary:

1. **The containment scanner had a bug**, found by E1/E2 on the real prose: it read the
   `/` after a closing quote as a path start, so `"$REPO_ROOT"/.planning/…` — a variable
   expansion with a suffix, one shell word — was reported as an absolute path outside the
   root and the call was BLOCKED. That blocked *every* evidence command `executor.md`
   writes. Fixed with a word-based, quote-tracking scan (case X5c, with both positive
   controls: `touch /tmp/…` and `touch "/tmp/…"` are still blocked).
2. **The mirror path is substituted by NAME**, to a `df-tools` shim on the prepended PATH,
   not to an absolute worktree path. Nothing outside the root appears in any call text.

After substitution the only absolute path any of the 22 calls names is `/dev/null`, an
allow-listed system prefix. Containment is therefore exactly as strict as 34-09 shipped it.

## Other harness changes, each with its own RED case

| Change | Why | RED case |
|---|---|---|
| A section also ends at an XML close tag at column 0 | `executor.md`'s `##` headings live inside `<step>` elements with no sibling `##` after them; the heading-level rule alone ran the post-all-tasks section to EOF and captured 21 foreign calls (`git add`, `git commit -m`, `state advance-job`, the SUMMARY template). A verdict on that is a statement about prose the section does not own. | R4 |
| Word-based containment scan | `"$VAR"/suffix` is not an absolute path | X5c |
| Hermetic PATH (no `process.env.PATH`) | this box has real `flutter`, `maestro` and `jq`; the CI runner has none. Inheriting the caller's PATH means the harness exercises a real toolchain locally and stubs in CI, and an absent stub falls through to the real binary instead of reporting MISSING. `opts.inheritPath: true` opts back in. | F4 |
| `missing-binary` finding + `runSection().missing` | exit 127 is MISSING, never a plain failure and never a pass | F4 |
| `opts.cwd` initial working directory | E2 needs the same section run from a subdirectory | E1/E2 |
| `rec.executed` alongside `rec.call` | a finding cites the PROSE (what a reader must fix); `executed` shows what bash got | A5 |

## Disagreement between the harness and `<worktree_command_discipline>`

**Found, recorded, NOT corrected — it needs a decision, not a wording fix.**

`<worktree_command_discipline>` (executor.md ~line 700) says, of the Claude Code
worktree-isolation guard: *"Emit one plain command per Bash call. Do not chain with `;` or
`&&`, do not pipe, do not prefix with `cd`, and do not wrap in `$(...)`."*

The Flutter sections — before and after this TRD — mandate the opposite for every
flutter/maestro/adb invocation: `( cd "$PACKAGE_DIR" && <cmd> )`, and the analyze
baseline pipes through `sort` and `diff | grep`. Both rules are individually well-founded:

- the subshell form is what stops a `cd` leaking into every later call (the thing this
  whole harness exists to enforce), and
- the discipline section's alternative — *"set the Bash tool's cwd"* — is not available,
  because the Bash tool in this harness takes no cwd argument.

So the Flutter sections will attract worktree-guard refusals for exactly the commands they
require. Resolving that is a design decision about the guard, above this TRD's scope; the
harness currently sides with the subshell form (a bare `cd` is a `cwd-leak` finding).
**Raise it to the orchestrator.**

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| focused suite (the TRD's `<verification>`) | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS — `tests 37 / pass 37 / fail 0` |
| the deliverable probe (real file) | above | 0 | PASS |
| differential control | above | 0 | PASS |
| evidence-landing probe | above | 0 | PASS |
| skip-is-not-pass probe | above | 0 | PASS |
| bootstrap-contract probe | above | 0 | PASS |
| CI YAML probe | `grep -cE "continue-on-error\|\|\| true" .github/workflows/agent-shell-harness.yml` | 0 | PASS — `0` |
| no new dependency | `node -p "JSON.stringify(require('./package.json').dependencies)"` | 0 | PASS — `{"node-pty":"1.1.0"}` |
| **not a gate** | `npm test` | — | see below |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 9/9

| Must-have (TRD frontmatter `truths`) | Evidence |
|---|---|
| A hand-written monorepo scratch repo fixture | F1 + the bootstrap-contract probe; `factory.cjs` writes every file out by name |
| Three stubs accepting what `executor.md` passes, emitting plausible artifacts | F3 (+F3b for `jq`/`pgrep`/`df-tools`) |
| The `# harness:` vocabulary implemented and documented | A1-A7 + the table above |
| A placeholder annotation is substituted before execution | A5, and R1 on the real `<path/to/test.dart>` |
| An un-annotated `$VAR` across calls still FAILS (34-09 X3) | A4's negative half; X3 still green |
| `checkSection` asserts every `expect`; the evidence `mv` proven from root AND subdirectory | A1, E1/E2 + the evidence-landing probe |
| **The CURRENT `executor.md` Flutter sections pass end-to-end** | R1, R2, R3 + the deliverable probe (`ok=true` ×3, 22 calls) |
| The CI workflow runs on every agent-prose PR and fails on a finding | C1, C2 + the YAML probe |
| MISSING (never pass) when a stub is absent or a section cannot be located | F4, A6, X6b; `checkSection().missing` |

- **Gate failures:** None.
- **`npm test` (explicitly NOT a gate):**
  - Baseline at TRD start: **3073 tests / 3012 pass / 11 fail / 50 skipped** — `handoff-e2e` ×4, `devflow-watch` ×4, `org-awareness-cli` ×2, `awareness` ×1.
  - After this TRD: **3098 tests / 3038 pass / 10 fail / 50 skipped** — `initiatives-cli` ×12 assertions, `devflow-watch` ×5, `handoff-e2e` ×4, `awareness` ×1. All pre-existing; the set shifts run-to-run because those are process-spawning CLI tests, which is why `npm test` is not this TRD's gate. All 37 harness tests pass inside the full run (7/7 describes green); the +25 tests are this TRD's 21 new cases plus 34-01's/34-02's.

## CI: this job must be added to branch protection

`.github/workflows/agent-shell-harness.yml` is path-filtered, which is a known false-green
class in this fleet (**fleet memory: `path-filtered-ci-hides-red`**). Two mitigations are
in the file — the filter includes the workflow's OWN path and the harness's own sources
and fixtures, so a PR that weakens the gate re-runs the gate; and a first step asserts the
six stub binaries are still mode `100755` in the index, because a lost executable bit would
turn every section into MISSING.

**The third mitigation is out of band and NOT done here:** the `harness` job must be listed
as a REQUIRED check in the repo's branch protection. Until it is, a PR that does not touch
the filtered paths merges on a green tick that never ran this gate. Nothing was created or
validated on GitHub by this TRD.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs` — +annotation vocabulary, XML-close-tag section boundary, word-based containment scan, hermetic PATH, `missing-binary`, `opts.cwd`, `rec.executed`.
- `plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs` — +21 cases (F1-F4, F3b, A1-A7, X5c, E1/E2, R1-R5, C1/C2); 37 total.
- `plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/scratch-repo/factory.cjs` — hand-written monorepo factory + the shared evidence-case code path.
- `plugins/devflow/devflow/bin/lib/__fixtures__/agent-shell/bin/{flutter,maestro,adb,jq,pgrep,df-tools}` — six executables, committed `100755`.
- `plugins/devflow/agents/executor.md` — the prose fixes above.
- `.github/workflows/agent-shell-harness.yml` — the gate.

## Deviations from Plan

**1. [scope] Six stub binaries, not three**
- The TRD's `files_modified` names `flutter`, `maestro`, `adb`. Three more were needed and are sanctioned by the TRD body: `jq` (the TRD's own gotcha: *"Either add a `jq` stub to the fixture bin, or annotate those calls `# harness: subst`"*), `df-tools` (the mirror-path shim the TRD prescribes at `:47`), and `pgrep` (so the chromedriver guard's `expect-exit 1` is deterministic on a developer box that happens to be running chromedriver, not a coin flip).
- All three live inside `__fixtures__/agent-shell/`, which IS in `files_modified`.

**2. [correctness] Section boundaries needed an XML close-tag rule (harness fix)**
- 34-09's heading-level rule alone captured 21 calls of foreign prose into the post-all-tasks section. Fixed with a RED case (R4) rather than by restructuring `executor.md`'s XML skeleton.

**3. [correctness] The containment scanner over-flagged `"$VAR"/suffix` (harness fix)**
- Found by E1/E2 on real prose, fixed with a RED case (X5c) carrying two positive controls. This is what removed the need for `opts.allowOutside`.

**4. [correctness] PATH is hermetic by default (harness fix)**
- Found by F4: this machine has real `flutter`, `maestro` and `jq`, so "the stub is absent" silently became "the real 40-second toolchain ran".

**5. [TDD shape] Some positive controls could not be independently RED**
- A1's third assertion, A2's negative control, A3's default case and A7's inert-prose case pass as soon as their negative half is implemented. Each was written and committed in the SAME RED commit as its negative half and observed failing with it. Recorded for honesty about what RED meant for those.

**6. [environment] Three TRD probe commands needed correcting to run**
- The markdown-escaped `\&\&` (34-09 recorded the same); `__dirname` inside `node -e` resolving against a different cwd in the bootstrap-contract probe; and `checkSection` needing `{root, pathPrepend}` for the real-file and differential-control probes, since a section that runs real `flutter` commands needs a scratch monorepo and the stubs. Otherwise run character-for-character as written.

**7. [scope] `flutter drive` writes `web-shot.png`, not `shot.png`**
- Found while wiring R2: with one filename, the mobile evidence `mv`'s `expect` was already satisfied when the web `mv`'s assertion ran, so the web assertion could not fail. Case F3 was updated in the same commit as the change.

## Open questions for W2 / the orchestrator

1. **The `<worktree_command_discipline>` conflict above** — a decision, not a wording fix.
2. **Multi-line shell compound constructs** (`if/fi`, `for/done`) split per line and become syntax errors. Safe (a finding, never a pass), but W2 should decide whether `splitCalls` learns them before the harness is pointed at the rest of `executor.md`.
3. **Branch protection** must list the `harness` job.
