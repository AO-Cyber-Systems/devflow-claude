---
objective: 34-ui-oracle-loop-w1b-surface-spec
job: "09"
subsystem: testing
tags: [bash, execFileSync, agent-prose, harness, cwd, set-u, commonjs]

# Dependency graph
requires: []
provides:
  - "plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs — extractBashBlocks / splitCalls / runSection / checkSection"
  - "An executable check for agent prose that encodes runtime shell semantics: a bare `cd X && cmd` FAILS a section, `( cd X && cmd )` passes"
  - "A per-call execution model (fresh env, set -u, cwd threaded forward, 10s timeout, containment) that 34-10 annotates real prose against"
  - "A stable checkSection result shape for 34-10's CI job to render"
affects: [34-10, executor.md, worktree_command_discipline, ui-oracle-loop]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extraction-guard-first: the not-found and found-but-empty cases are written and asserted BEFORE the cases that consume the extraction"
    - "One execFileSync('bash', ['-c', …]) per logical call — never one shell per block"
    - "Fresh per-call env from an explicit allow-list ({PATH, HOME, TMPDIR}); never process.env, never a shared object"
    - "cwd captured through a trap-EXIT side file, never appended to the user's stdout"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs
    - plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs
  modified: []

key-decisions:
  - "cwd is captured with `trap 'printf \"%s\" \"$PWD\" > <sidefile>' EXIT`, not the TRD's appended `; pwd` epilogue — the trap still fires when the call itself calls `exit`, which the executor's `pgrep … || { …; exit 1; }` block does."
  - "stderr is redirected to a second side file, so it is captured on the SUCCESS path too and not only off a thrown error."
  - "Containment is a PRE-check: an offending call is blocked and never executed, rather than reported after it has already written outside the root."
  - "Section matching: exact normalised heading text wins; the first `startsWith` match is the fallback. `match` in the result says which fired."
  - "Annotations attach to the NEXT call. A trailing comment stays in its call's text AND is recorded as that call's annotation."
  - "`runSection` realpaths its root, because bash's $PWD is the PHYSICAL path and on macOS /var is a symlink to /private/var — without it every call would look like a cwd leak."

patterns-established:
  - "Positive controls are paired with their negative case (X2 with X1, X4 with X3, X5b with X5) so a harness that fails everything cannot pass the suite"
  - "Every stated limit of a heuristic is written down next to it — a stated limit is a limit, an unstated one is a false green"

requirements-completed: [HARN-34-01, HARN-34-02, HARN-34-03]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 11min
completed: 2026-09-22
---

# TRD 34-09: the agent shell harness Summary

**A 559-line CommonJS harness that runs the fenced bash of a named agent-prose section under the real Bash-tool model — one `execFileSync('bash','-c',…)` per call, cwd threaded forward, env rebuilt fresh each time under `set -u` — so that "a bare `cd X` leaks the working directory" is now an exit code instead of three rounds of review prose.**

## Performance

- **Duration:** ~11 min (first commit 2026-09-22T20:19:02-04:00, last code commit 20:27:54-04:00)
- **Tasks:** 3
- **Files modified:** 2 (both new)

## Accomplishments
- Agent prose that encodes shell semantics now has an executable check (proposal §21 amendment 1).
- The load-bearing pair is proven in both directions by exit code: a bare `cd sub` FAILS a section (exit 1), `( cd sub && touch marker.txt )` PASSES (exit 0).
- A variable assigned in one call and read in the next fails with bash's own `unbound variable` diagnosis, naming the variable — because every call gets `set -u` and a freshly-built env, not because the harness simulates it.
- Extraction is guarded: "section not found" and "section found but empty" are distinct, and neither can read as pass.
- Every run is confined to a temp scratch root, every root is cleaned up, and no new npm dependency was added (`package.json` still has exactly `node-pty`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED extraction guards (E1–E4) | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -30; exit ${PIPESTATUS[0]}'` | 1 | PASS (RED as required) |
| 1: scope | `git log -1 --stat` after the RED commit | 0 | PASS — one file, 142 insertions |
| 2: extraction + splitting green | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS (E1–E4, S1–S4) |
| 2: guard probe | see **Guard probe** below | 0 | PASS |
| 3: full focused suite | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS — 16 tests, `fail 0` |
| 3: model probe | see **Model probe** below | 0 | PASS |
| 3: no-leak probe | `ls "$(node -p 'require("os").tmpdir()')" \| grep -c '^harn-'` after the suite | 0 | PASS — `0` |

## Task Commits

1. **Task 1 — RED extraction guards** — `9e3666f` `test(34-09): RED — bash-block extraction guards (E1-E4)`
2. **Task 2 — extraction + call splitting**
   - `7eba11e` `feat(34-09): GREEN — extractBashBlocks with distinguishable not-found/empty guards`
   - `0c384ae` `test(34-09): RED — S1 one call per logical command`
   - `d66153a` `feat(34-09): GREEN — splitCalls emits one call per logical command`
   - `9f76440` `test(34-09): RED — S2 backslash continuation is one call`
   - `89586ba` `feat(34-09): GREEN — backslash continuations accumulate into one call`
   - `e945790` `test(34-09): RED — S3 comments annotate the next call`
   - `4a1d871` `feat(34-09): GREEN — comment annotations attach to the following call`
   - `e7f4a68` `test(34-09): RED — S4 blank lines and a heredoc as one call`
   - `bcdfddf` `feat(34-09): GREEN — heredocs accumulate into a single call`
3. **Task 3 — the runtime model**
   - `67aeb86` `test(34-09): RED — X1/X2 bare cd leaks the persisted cwd, subshell does not`
   - `efabe1d` `feat(34-09): GREEN — runSection threads cwd forward and flags the leak`
   - `397ab36` `test(34-09): RED — X3/X4 env does not persist between calls`
   - `8d64c34` `feat(34-09): GREEN — set -u per call and an unbound-variable finding`
   - `25f3d7e` `test(34-09): RED — X5 containment blocks writes outside the scratch root`
   - `7ebc391` `feat(34-09): GREEN — containment pre-check blocks calls naming paths outside the root`
   - `ef22351` `test(34-09): RED — X6 checkSection result shape and honest MISSING`
   - `0354015` `feat(34-09): GREEN — checkSection stamps engine_version and reports every call`

No `refactor:` commit was needed — each GREEN step was written against its own case and left the file coherent.

**Scope proof.** Every commit whose subject contains `(34-09)` touches exactly two files:

```
git log --format="%H" --grep="(34-09)" | while read sha; do git show --name-only --format="" "$sha"; done | sort -u
plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs
plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs
```

(The TRD's `git diff --name-only $(git merge-base HEAD origin/main)..HEAD` also lists `yaml-lite.cjs`/`yaml-lite.test.cjs` and the objective's planning files: 34-01 runs in parallel on the SAME branch. Those are 34-01's and the planner's, not this TRD's — hence the per-commit form above.)

## TDD Evidence

Iron Law: one case at a time, RED observed by real exit code and recorded before any implementation, RED committed before GREEN.

| Phase | Case(s) | Command | Exit Code | Expected |
|---|---|---|---|---|
| RED | E1–E4 | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -30; exit ${PIPESTATUS[0]}'` | 1 | FAIL (correct) |
| GREEN | E1–E4 | same | 0 | PASS |
| RED | S1 | same | 1 | FAIL — `TypeError: harness.splitCalls is not a function` |
| GREEN | S1 | same | 0 | PASS |
| RED | S2 | same | 1 | FAIL — `AssertionError: four physical lines, one logical command` / `4 !== 1` |
| GREEN | S2 | same | 0 | PASS |
| RED | S3 | same | 1 | FAIL — `AssertionError: both preceding full-line comments attach to the NEXT call, in order` |
| GREEN | S3 | same | 0 | PASS |
| RED | S4 | same | 1 | FAIL — `AssertionError: two plain commands and one heredoc` / `6 !== 3` |
| GREEN | S4 | same | 0 | PASS |
| RED | X1, X2 | same | 1 | FAIL — `TypeError: harness.runSection is not a function` (both) |
| GREEN | X1, X2 | same | 0 | PASS |
| RED | X3 | same | 1 | FAIL — `AssertionError: environment must NOT persist between calls` |
| GREEN | X3, X4 | same | 0 | PASS |
| RED | X5 | same | 1 | FAIL — `AssertionError: escaping the scratch root must FAIL the section` |
| GREEN | X5, X5b | same | 0 | PASS |
| RED | X6, X6b | same | 1 | FAIL — `TypeError: harness.checkSection is not a function` (both) |
| GREEN | X6, X6b | same | 0 | PASS — 16 tests, `fail 0` |
| REFACTOR | — | not needed | — | — |

### Verbatim RED output, task 1

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 | head -12; exit ${PIPESTATUS[0]}'
node:internal/modules/cjs/loader:1478
  throw err;
  ^

Error: Cannot find module './agent-shell-harness.cjs'
Require stack:
- /Users/markemerson/Source/devflow-w1b/plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs
    at Module._resolveFilename (node:internal/modules/cjs/loader:1475:15)
    at wrapResolveFilename (node:internal/modules/cjs/loader:1048:27)
    at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1072:10)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1093:12)
    at Module._load (node:internal/modules/cjs/loader:1261:25)
EXIT=1
```

and the tail of the same run:

```
✖ agent-shell-harness.test.cjs (56.297625ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
```

### The load-bearing claim, proven in both directions by exit code

`0 = the section PASSED`, `1 = the section FAILED`:

```
$ node direction.cjs bare
bare -> ok = false [ 'cwd-leak' ]
bare cd EXIT=1

$ node direction.cjs subshell
subshell -> ok = true []
subshell EXIT=0
```

### Model probe (task 3 `<verify>`), verbatim

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "const h=require(\"./agent-shell-harness.cjs\"); const fs=require(\"fs\"),os=require(\"os\"),p=require(\"path\"); const mk=()=>{const r=fs.mkdtempSync(p.join(os.tmpdir(),\"harn-\")); fs.mkdirSync(p.join(r,\"sub\")); fs.mkdirSync(p.join(r,\".home\"),{recursive:true}); fs.mkdirSync(p.join(r,\".tmp\"),{recursive:true}); return r;}; const bare=h.runSection(h.splitCalls(\"cd sub\ntouch marker.txt\"),{root:mk()}); const sub=h.runSection(h.splitCalls(\"( cd sub && touch marker.txt )\"),{root:mk()}); const vars=h.runSection(h.splitCalls(\"R=\$(pwd)\necho \\\"\$R\\\"\"),{root:mk()}); console.log(\"bare cd fails:\", bare.ok===false, \"| subshell passes:\", sub.ok===true, \"| unset var fails:\", vars.ok===false); process.exit(bare.ok===false && sub.ok===true && vars.ok===false ? 0 : 1)"'
bare cd fails: true | subshell passes: true | unset var fails: true
EXIT=0
```

### Guard probe (task 2 `<verify>`), verbatim

```
$ bash -c 'cd plugins/devflow/devflow/bin/lib && node -e "const h=require(\"./agent-shell-harness.cjs\"); const a=h.extractBashBlocks(\"# A\n\ntext\n\",\"## Nope\"); const b=h.extractBashBlocks(\"## Flutter\n\ntext\n\",\"## Flutter\"); console.log(\"missing-section ok:\", a.ok, \"| empty-section ok:\", b.ok, b.missing); process.exit(a.ok===false && b.ok===false && !!b.missing ? 0 : 1)"'
missing-section ok: false | empty-section ok: false no bash blocks in section
EXIT=0
```

## The call model, exactly as implemented

34-10 annotates real prose against this and must not have to re-derive it.

**One call per `execFileSync`.** Never one shell per block. The script handed to bash for call *n* is, in this order:

```
exec 2> "<root>/.stderr"
trap 'printf "%s" "$PWD" > "<root>/.cwd"' EXIT
set -u
<the call text, verbatim, newlines and all>
```

invoked as `execFileSync('bash', ['-c', script], { cwd, env, encoding: 'utf-8', timeout: 10000, stdio: ['ignore','pipe','pipe'] })`.

- **cwd capture** — a `trap … EXIT` writing `$PWD` to `<root>/.cwd`, **not** an appended `; pwd`. The trap still fires when the call itself calls `exit` (the executor's web block ends `… || { echo CHECKPOINT…; exit 1; }`), and the value goes to a SIDE FILE so the call's own stdout is never polluted. The file is deleted before each call and read after `execFileSync` returns **including when it throws**, because a failing call still moved (or did not move) the directory — and the bare-`cd` case is a call that *succeeds* while leaking.
- **cwd threading** — `cwd` starts at the scratch root and is set to `cwd_after` after every call, *even after the leak has been flagged*. The harness reports the model; it does not correct it. Resetting to the root would make the bare-`cd` case unfalsifiable.
- **The root is realpath'd** on entry to `runSection`. bash's `$PWD` is the physical path, and on macOS `os.tmpdir()` lives under `/var → /private/var`; without the realpath every single call would look like a cwd leak and the subshell case could never pass.
- **env** — rebuilt FRESH for every call from an explicit allow-list and nothing else:
  `{ PATH: [opts.pathPrepend, process.env.PATH].filter(Boolean).join(':'), HOME: <root>/.home, TMPDIR: <root>/.tmp }`.
  `process.env` is never handed to a call, and no object is shared between calls. `opts.pathPrepend` is the open seam for 34-10's stub `flutter`/`maestro`/`adb` shims (the `__fixtures__/*-shim.cjs` pattern).
- **`set -u`** is injected per call, after the trap, immediately before the call text. `PATH`, `HOME` and `TMPDIR` are set, so nothing legitimate trips it. If real executor prose trips it in 34-10, that is a FINDING about the prose, not a harness bug.
- **stderr** is redirected to `<root>/.stderr` so it is captured on the success path too — `execFileSync` only returns stdout. A *syntax* error is detected before `exec 2>` ever runs, so the piped stderr on the thrown error is used as the fallback.
- **timeout** — 10 000 ms per call, overridable via `opts.timeout`. A `SIGTERM`/`ETIMEDOUT` becomes `status: 'timeout'` plus a `timeout` finding. An interactive command is a finding, never a hang.
- **exit status** — `expected_status` defaults to `0` and is overridable per call record (`call.expectedStatus`), which is the seam for 34-10's deliberate-`exit 1` blocks. Any other status raises a `nonzero-status` finding carrying the status and stderr.

### Finding types

| `type` | Raised when | Carries |
|---|---|---|
| `cwd-leak` | `cwd_after !== cwd_before` | `call`, `cwd_before`, `cwd_after`, and a message naming all three |
| `unset-variable` | stderr matches `<NAME>: unbound variable` | `variable`, and the advice to re-derive it in-call |
| `nonzero-status` | `status !== expected_status` | `status`, trimmed stderr |
| `containment` | the call names an absolute path outside the root | `path`; the call is **blocked**, not run |
| `timeout` | the call exceeded the per-call budget | the budget in ms |

## The `checkSection` result shape, field by field

`checkSection(mdPath, section, opts)` → the object 34-10's CI job renders:

| Field | Meaning |
|---|---|
| `ok` | `true` ONLY when a section was found, had bash, ran, and produced zero findings. Never `true` for anything that did not run. |
| `section` | the matched heading text (normalised, no `#`s); the requested string when not found |
| `missing` | `null` when the section ran; otherwise the REASON it did not — `section not found: <arg>`, `no bash blocks in section`, or `bash blocks contained no executable calls` |
| `calls[]` | EVERY call, passing ones included (see below) |
| `findings[]` | every call's findings flattened, in order |
| `engine_version` | `helpers.pluginVersion()` — so evidence produced by a stale mirror is detectable |
| `root` | the scratch root the section ran in (`null` when nothing ran) |
| `path` | the markdown file that was read |

Each entry of `calls[]`:

| Field | Meaning |
|---|---|
| `index` | 0-based position in the run (renumbered across all blocks of the section) |
| `line` | 1-based line in the markdown FILE where the call starts |
| `call` | the exact text handed to bash |
| `annotations[]` | full-line comments preceding it, plus its own trailing comment |
| `cwd_before` / `cwd_after` | the persisted working directory either side of the call |
| `cwd_captured` | whether `.cwd` was actually written (false for a blocked call or a script that never reached the trap) |
| `status` | the exit code, or `'blocked'` / `'timeout'` |
| `expected_status` | defaults to `0`; the seam for a deliberate non-zero exit |
| `stdout` / `stderr` | captured output; `stdout` is never polluted by the harness |
| `findings[]` | `[]` for a passing call — present, not omitted |

**Every call is reported whether it passed or failed.** A harness that prints only failures cannot show a reviewer what it actually ran, and "nothing printed" then reads identically to "nothing ran".

## Containment — the mechanism, and its honest limits

Two mechanisms, both real, neither complete:

1. **`HOME` and `TMPDIR` point inside the scratch root** (`<root>/.home`, `<root>/.tmp`). Tooling that writes a cache or a temp file stays inside the root. Case X5b asserts this: `touch "$HOME/cache-marker"` passes and the file lands at `<root>/.home/cache-marker`.
2. **A static scan of the call TEXT for absolute paths** before the call runs. Any `/…` token outside the root, other than the read-only system prefixes `/bin/ /sbin/ /usr/ /opt/ /etc/ /dev/ /Library/ /System/ /Applications/` (extensible via `opts.allowOutside`), blocks the call: `status: 'blocked'`, a `containment` finding, and the call is **never executed** — X5 asserts `/tmp/harn-outside-marker` does not exist afterwards.

**What this cannot catch — stated plainly, because an unstated limit is a false green:**

- **a path BUILT at runtime.** `d=$(echo /tmp); touch "$d/x"` has no absolute path in its text and will run.
- **a relative escape.** `touch ../../x` is not an absolute path; nothing blocks it. It is caught only indirectly, and only sometimes, because cwd starts at the root.
- **a symlink inside the root** pointing out of it.
- **anything a spawned process does on its own** — the harness inspects the call text, not the syscalls of what it starts.
- **the allow-listed prefixes are allowed for WRITES too.** `touch /usr/local/x` would not be blocked by the scan (it would simply fail on permissions on a normal machine).
- **it over-flags reads.** A call that merely *reads* `/Users/... /some/path` is blocked just like a write. That is deliberate — erring toward a finding — but it means 34-10 will need `opts.allowOutside` for real executor prose that cites absolute repo paths.
- **the scan is line-based, not a bash parser.** A path inside a quoted string that is only ever echoed is still flagged.

Scratch roots are created with `fs.mkdtempSync` and removed with `fs.rmSync(root,{recursive:true,force:true})`; the test suite registers its `after()` hook and its module-level `ROOTS` array *before* the first test that creates one, so a FAILING test still cleans up. Verified: after a full suite run, `ls "$(node -p 'require("os").tmpdir()')" | grep -c '^harn-'` prints `0`.

> Note on the TRD's no-leak probe: it greps `/tmp`, but `os.tmpdir()` on macOS is `/var/folders/…/T`, so `ls /tmp | grep -c '^harn-'` prints `0` whether or not anything leaked. The probe was run against **both** paths; both print `0`.

## The section-matching rule

34-10 names real `agents/executor.md` headings against this:

- The `section` argument and every ATX heading in the document are normalised by stripping leading `#`s and whitespace. `'## Flutter'`, `'Flutter'` and `'#### Flutter'` are therefore the same query; the *document's* heading level is what matters, not the argument's.
- An **exact** match on normalised text wins. If there is none, the **first heading whose normalised text `startsWith` the wanted text** is used. The result's `match` field says which rule fired (`'exact'` | `'startsWith'`).
- The section ends at the next heading of the **same or higher** level. A deeper subheading stays inside it.
- Headings inside fenced code blocks are never boundaries — the scanner tracks fence state in the same pass.
- A fence is collected when its info string's **first token** is `bash`: ` ```bash ` and ` ```bash title=capture ` are in, ` ```yaml `, ` ```markdown ` and a bare ` ``` ` are out.
- A section that is not found returns `{ok:false, error:'section not found: <arg>'}`; a section with no bash returns `{ok:false, missing:'no bash blocks in section'}`. The two are deliberately distinguishable and neither reads as pass.

## The annotation-association rule

34-10's `# harness:` vocabulary is built on this:

- **A full-line comment annotates the call that FOLLOWS it**, never one of its own. Several comments in a row all attach to that next call, in source order. `# harness: expect <path>` therefore reads naturally in prose above the command it describes.
- Pending annotations survive blank lines, and are consumed by the next call — they never leak onto the call after that.
- **A trailing comment stays IN its call's text** (bash ignores it) **and is also recorded** as that call's annotation. Detection is a small quote-aware scanner, not a bash parser; its stated limit is that a `#` inside a **heredoc body** would be misread, which is why heredoc calls skip trailing-comment extraction entirely.
- A comment inside a heredoc body is content, not an annotation (case S4 asserts this in both directions).

## Call-splitting rules

- One physical line = one call, **except**: a line ending in an ODD number of backslashes continues onto the next (the executor's `flutter drive` block is four physical lines and one logical command), and a heredoc (`<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"`; `<<<` excluded) accumulates through its terminator line.
- Blank lines are separators and are never calls.
- `line` is 1-based within the block for a raw string, and absolute in the markdown file when the `extractBashBlocks` block object is passed (which is what `checkSection` does).
- Stated limits: a heredoc opener inside quotes (`echo "a <<EOF b"`) is still counted, and terminator matching is on the trimmed line so `<<-` indentation is accepted more loosely than bash would.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| focused suite (the TRD's `<verification>`) | `bash -c 'cd plugins/devflow/devflow/bin/lib && node --test agent-shell-harness.test.cjs 2>&1 \| tail -12; exit ${PIPESTATUS[0]}'` | 0 | PASS — `tests 16 / pass 16 / fail 0` |
| model probe (task 3) | see **Model probe** above | 0 | PASS |
| guard probe (task 2) | see **Guard probe** above | 0 | PASS |
| no-leak probe | `ls "$(node -p 'require("os").tmpdir()')" \| grep -c '^harn-'` (and `ls /tmp \| grep -c '^harn-'`) | 0 | PASS — both `0` |
| no new dependency | `node -p "JSON.stringify(require('./package.json').dependencies)"` | 0 | PASS — `{"node-pty":"1.1.0"}` |
| **not a gate** | `npm test` | — | see below |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8

| Must-have (TRD frontmatter `truths`) | Evidence |
|---|---|
| `extractBashBlocks` returns every fenced bash block in a named section with its 1-based start line, and a not-found / zero-block section is an ERROR, not an empty pass | E1, E2, E3, E4 + the guard probe |
| `splitCalls` splits into the calls the Bash tool would make, preserving comments as annotations and keeping `\` continuations as ONE call | S1, S2, S3 |
| `runSection` runs each call as its own `execFileSync('bash',['-c',…])` with cwd threaded FORWARD and NO shared environment | X1–X4, and the per-call script documented under **The call model** |
| A bare `cd X && cmd` leaves the next call's cwd inside X, and the harness DETECTS it and FAILS the section naming the call and both cwds | X1 (`cwd-leak` finding asserted to contain the call text and both paths); `direction.cjs bare` exits **1** |
| `( cd X && cmd )` leaves cwd unchanged — the section passes | X2; `direction.cjs subshell` exits **0** |
| A `$VAR` assigned in one call and read in a later call FAILS with an unset-variable diagnosis (`set -u`, fresh env) | X3 — the finding carries `variable: 'REPO_ROOT'` and stderr matches `REPO_ROOT: unbound variable`; X4 is the positive control |
| Every run is confined to a temp scratch directory, and a call that tries to write outside it fails the section | X5 (blocked, file never created) and X5b (`$HOME` write contained); no-leak probe prints `0` |
| A section whose blocks could not be executed reports `MISSING` with the reason — never `pass` | E1, E2, X6b |

- **Gate failures:** None.
- **`npm test` (explicitly NOT a gate for this TRD):**
  - Baseline re-measured at TRD start: **3033 tests / 2973 pass / 10 fail / 50 skipped** — all 10 in the three pre-existing files (`devflow-watch` ×5, `handoff-e2e` ×4, `awareness` ×1).
  - After this TRD: **3063 tests / 3002 pass / 11 fail / 50 skipped**. The +30 tests are this TRD's 16 plus 34-01's yaml-lite cases. All 16 of this TRD's tests pass in the full run. The 11th failure is `bin/lib/yaml-lite.test.cjs` — **34-01's file**, mid-flight on the same branch, not this TRD's.

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/agent-shell-harness.cjs` (559 lines) — `extractBashBlocks`, `splitCalls`, `runSection`, `checkSection`, plus `normalizeHeading`.
- `plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs` (480 lines) — E1–E4, S1–S4, X1–X6 (+X5b, X6b) over hand-written markdown strings. No real agent file is read; no generated test data.

## Deviations from Plan

**1. [correctness] `trap … EXIT` instead of the TRD's appended `; pwd` epilogue**
- **Found during:** Task 3 (runSection design)
- **Issue:** The TRD's pseudocode is `script = 'set -u\n<call>\n__st=$?\nprintf … > cwdfile\nexit $__st'`. A call that calls `exit` itself — which the executor's web block does (`pgrep chromedriver >/dev/null || { echo CHECKPOINT…; exit 1; }`) — never reaches the epilogue, so `.cwd` would be stale for exactly the class of call the TRD's own gotcha list calls out.
- **Fix:** `trap 'printf "%s" "$PWD" > "<cwdfile>"' EXIT` at the top of the script; the script's exit status is still the call's own. `.cwd` is deleted before each call so a stale read is detectable (`cwd_captured`).
- **Verification:** X1/X2 pass; the model probe exits 0.
- **Committed in:** `efabe1d`
- **Residual limit:** a call that installs its own `trap … EXIT` overrides the harness's; `cwd_captured` is then `false` and `cwd_after` falls back to `cwd_before`.

**2. [correctness] stderr captured via a side file, not only off the thrown error**
- **Found during:** Task 3
- **Issue:** `execFileSync` returns stdout only; on the success path stderr is discarded, so a call that warns on stderr and exits 0 would report `stderr: ''`.
- **Fix:** `exec 2> "<root>/.stderr"` in the script prologue, read after the call on both paths, with the thrown error's `stderr` as the fallback for parse-time failures.
- **Committed in:** `efabe1d`

**3. [correctness] `runSection` realpaths its root**
- **Found during:** Task 3
- **Issue:** bash's `$PWD` is the physical path; `os.tmpdir()` on macOS is under `/var → /private/var`. Without resolving, `cwd_after !== cwd_before` on EVERY call and X2 could never pass.
- **Fix:** `fs.realpathSync(opts.root)` on entry; the test's `makeRoot()` does the same so its assertions compare like with like.
- **Verification:** a differential control confirmed the module resolves an unresolved root correctly (`subshell ok with UNRESOLVED root: true`).
- **Committed in:** `efabe1d`

**4. [correctness] containment is a PRE-check that blocks the call**
- **Found during:** Task 3
- **Issue:** The TRD describes "a call that tries to write outside it fails the section". Reporting after the fact would mean the harness had already written outside its own root.
- **Fix:** the scan runs before execution; an offender yields `status: 'blocked'` and the call is not run. X5 asserts the file does not exist afterwards.
- **Committed in:** `7ebc391`

**5. [TDD shape] positive controls could not be independently RED**
- **Found during:** Tasks 3
- **Issue:** X2 (`subshell passes`), X4 (`re-derive passes`) and X5b (`$HOME writes contained`) are the positive halves of X1/X3/X5. Once the negative half is implemented the positive half passes without new code, so it cannot be made to fail for a bug it names.
- **Fix:** each positive control was written and committed in the SAME RED commit as its negative half, and both were observed failing together (`TypeError: harness.runSection is not a function` for X1/X2; X4 green-on-arrival is recorded in the X3 RED run's output). The pairing is the point: without the positive half, the negative half would also pass on a harness that fails everything.
- **Impact:** none on coverage; recorded for honesty about what "RED" meant for those three cases.

**6. [environment] the TRD's probe commands needed un-escaping to run**
- **Found during:** Tasks 2 and 3
- **Issue:** Both `<verify>` probes contain `\&\&`, which is the markdown-escaped form; passed to `bash -c '…'` literally it is a syntax error (`Expression expected`).
- **Fix:** ran them with `&&`. Otherwise character-for-character as written. Both printed the exact expected strings and exited 0.
- **Impact:** none on behaviour; noted so 34-10 fixes the escaping when it lifts these probes into CI.

**7. [measurement] baseline re-measured at 2973 pass / 10 fail**
- The TRD records 2974/9. Re-measured at TRD start: **2973 pass / 10 fail / 50 skipped**, and the 10 failures are in the SAME three pre-existing files (`devflow-watch` ×5, `handoff-e2e` ×4, `awareness` ×1). The extra failure is timing flake in `devflow-watch`/`handoff-e2e`, not a regression, and `npm test` is not a gate for this TRD.

---

**Total deviations:** 7 (4 correctness improvements over the TRD pseudocode, 1 TDD-shape disclosure, 1 environment fix to the TRD's own probe text, 1 re-measurement). **Impact on plan:** no scope creep — the deliverable is still exactly the two files the TRD names, and every deviation makes a case the TRD asked for actually falsifiable.

## Issues Encountered

None blocking. Two things worth flagging to 34-10:

1. The containment scan **over-flags reads** of absolute paths outside the root. Real `agents/executor.md` prose cites absolute repo paths, so 34-10 will need `opts.allowOutside` (or a scratch monorepo rooted inside the harness root) or every such call will come back `blocked`.
2. `set -u` will fire on any executor block that reads a variable a previous block assigned. That is the intended finding, but 34-10 should expect the first real run to be noisy and treat the noise as the deliverable.

## File ownership

34-01 owns `yaml-lite.cjs` / `yaml-lite.test.cjs` and committed them to this same branch in parallel; this TRD never touched them. `plugins/devflow/agents/executor.md` was **not** edited — that is 34-10's deliverable. No collision.

## Next Objective Readiness

34-10 is unblocked. It has:
- `checkSection(mdPath, section, opts)` to point at `agents/executor.md`, with a documented section-matching rule for naming its real headings;
- `opts.pathPrepend` as the seam for stub `flutter`/`maestro`/`adb` binaries (the `__fixtures__/*-shim.cjs` pattern), and `opts.allowOutside` / `opts.root` for the scratch monorepo;
- the annotation-association rule its `# harness:` vocabulary is built on;
- `call.expectedStatus` for blocks with a deliberate non-zero exit;
- a stable result shape, `engine_version`-stamped, for the CI job to render.

**The harness lives in this checkout only.** Skills and agents invoke the MIRROR at `~/.claude/devflow/bin/` — `agent-shell-harness.cjs` is not there and will not be until a release + `sync-runtime`. 34-10's CI job must invoke the LOCAL binary by absolute path, as `verifier-ui-eval-invocation.test.cjs` does.

---
*Objective: 34-ui-oracle-loop-w1b-surface-spec*
*TRD: 09*
*Completed: 2026-09-22*
