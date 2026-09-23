---
objective: 34-ui-oracle-loop-w1b-surface-spec
trd: "11"
type: standard
wave: 9
status: tasks-1-and-2-complete; task-3 (tag) OUTSTANDING — checkpoint:human-action
commits:
  - "959e403 fix(34-11): re-export the W1b interface list from ui-spec.cjs"
  - "dce508b chore(release): 2.9.0 — UI Oracle Loop W1b Surface Spec"
---

# TRD 34-11 SUMMARY — release 2.9.0

Tasks 1 (release audit) and 2 (CHANGELOG + version trio) are **complete**. Task 3 is a
`checkpoint:human-action` (tag `v2.9.0`) and is **OUTSTANDING** — this run was autonomous and a
human-action checkpoint cannot be automated. **No tag was created. Nothing was pushed. No PR was
opened. `DEVFLOW_SKIP_CHANGELOG_GATE` was never set.** In place of tagging, the gate was
*executed* against a simulated invocation with negative controls — see the CHECKPOINT section.

Release commit: **`dce508b`**.

## Task Evidence

### Task 1 — release checks

#### Check 1: the objective's own suites, all green at the release commit

Each file run separately, exit code captured per file:

```
yaml-lite.test.cjs                   exit=0  pass 16  fail 0
ui-spec.test.cjs                     exit=0  pass 16  fail 0   (12 + the 4 added below)
ui-spec-validate.test.cjs            exit=0  pass 39  fail 0
ui-spec-cli.test.cjs                 exit=0  pass 26  fail 0
ui-spec-render.test.cjs              exit=0  pass 18  fail 0
ui-sheet.test.cjs                    exit=0  pass 12  fail 0
ui-spec-lock.test.cjs                exit=0  pass 14  fail 0
ui-spec-skill-contract.test.cjs      exit=0  pass 15  fail 0
agent-shell-harness.test.cjs         exit=0  pass 37  fail 0
```

All nine together: `tests 193 / pass 193 / fail 0 / skipped 0`, **exit 0**.

Also run, because this objective changed it (`c6f636a`):
`plugins/devflow/hooks/sync-runtime.test.js` → `tests 15 / pass 15 / fail 0`, including
*"Objective 34: every shipped runtime subdir reaches the mirror"*. `SUBDIRS` at
`hooks/sync-runtime.js:114` reads:

```js
const SUBDIRS = ['workflows', 'references', 'templates', 'bin', 'schemas'];
```

`'schemas'` is present. Without it `devflow/schemas/` never reaches `~/.claude/devflow` and
`ui spec validate` ENOENTs on every real skill invocation while every checkout test stays green.

#### Check 2: the pre-existing baseline — CHANGED 10 → 8, explained, nothing regressed

The TRD records a pre-objective baseline of 2974 pass / **9** fail / 50 skipped. Two full runs
were taken on this branch:

| run | when | tests | pass | fail | skipped |
|---|---|---:|---:|---:|---:|
| 1 | before this TRD's commits (branch head `5c391be`) | 3224 | 3164 | **10** | 50 |
| 2 | at the release commit `dce508b` | 3228 | 3170 | **8** | 50 |

Failing files, both runs — only ever these three, all pre-existing:

```
plugins/devflow/devflow/bin/devflow-watch.test.cjs
plugins/devflow/devflow/bin/handoff-e2e.test.cjs
plugins/devflow/devflow/bin/lib/awareness.test.cjs
```

**The count is not 9, so per the TRD this is a finding to explain — here it is.** A re-run never
proves a flake; only the failing cases' *identity* does. Comparing leaf case names between the two
runs, run 2's failing set is a strict **subset** of run 1's:

```
both runs (8):  disallowed command produces rejected done record + "Do NOT retry" guidance
                foreground daemon writes PID file, status reports running, stop kills it
                idempotency: route-results emits once, silence on second invocation
                multi-record: 3 queued commands appear in a single injection
                start cleans up stale PID file and starts fresh
                start refuses when daemon already running
                write pending → daemon executes → route-results emits result with stdout
                S1: scanPeer with 1 valid branch returns 1 entry with all fields

run 1 only (2): C-1 start --project /p1,/p2 writes watching:[/p1, /p2]
                C-2 start --project /p (single) writes watching:[/p] (back-compat)
```

The whole delta is the two `devflow-watch multi-project CLI (TRD 20-03)` daemon-spawn cases,
which passed in run 2. **No failure was added in either direction**, and no failing case is in any
file this objective touched. The arithmetic is exactly consistent: +4 tests (the four cases added
below), +6 pass (those 4, plus the 2 that stopped failing), −2 fail.

This matches the band `34-10-SUMMARY.md` already records: *"Pre-existing failure band ~8–11,
always in `devflow-watch`, `handoff-e2e`, `awareness` (S1) … CLI-spawn/daemon timing flakes."*
**Judgement: not a release blocker.** A release that broke something would have *added* a failing
case; the set only shrank, and shrank inside a file already documented as timing-flaky.

#### Check 3: the W1b interface list — EXECUTED, and it FAILED first

**This is the finding of the audit.** Probed rather than grepped, and as shipped by 34-01…34-10
the promised interface list was a **fiction**:

```
PASS  ui-spec.cjs exports parseSurfaceSpec    -> typeof=function
FAIL  ui-spec.cjs exports validateSurfaceSpec -> typeof=undefined
FAIL  ui-spec.cjs exports renderSurfaceSpec   -> typeof=undefined
TypeError: m.validateSurfaceSpec is not a function
```

`ui-spec.cjs` exported only `{parseSurfaceSpec, loadSurfaceSpecSchema, loadMustNotVocabulary, …}`;
the other two lived unre-exported in `ui-spec-validate.cjs` / `ui-spec-render.cjs`. W1c, W1★ and W2
are all planned against that one front door, so three downstream objectives would have planned
against names that do not resolve.

Fixed under the TRD's own `<error_recovery>` clause (*"add a re-export to `ui-spec.cjs` with a
comment naming the W1b interface list — a legitimate, additive release-time fix with its own
commit"*) in **`959e403`**, as **lazy getters**: the require chain is
`ui-spec-render → ui-spec-validate → ui-spec`, so a top-level `require` back would close a cycle
and hand the sibling a half-initialised `loadSurfaceSpecSchema`. Four cases were added to
`ui-spec.test.cjs` — W1 (the three are functions), W2 (**identity** with the sibling export, because
a stub of the right shape satisfies a `typeof` check and is still a fiction), W3 (enumerable, so
`Object.keys` shows the real interface), and W4 (a cold-require differential control in a child
process, which is what would actually catch the cycle).

Re-run after the fix — the full probe, end to end through the real modules and the **real existing
engine**:

```
PASS  ui-spec.cjs exports parseSurfaceSpec  -> typeof=function
PASS  ui-spec.cjs exports validateSurfaceSpec  -> typeof=function
PASS  ui-spec.cjs exports renderSurfaceSpec  -> typeof=function
PASS  validateSurfaceSpec is the sibling fn
PASS  renderSurfaceSpec  is the sibling fn
PASS  validate(projects-rail) returns a verdict  -> keys=ok,errors,engine_version,schema_version
      verdict.ok=true  findings=0
PASS  render(projects-rail) produced artifacts  -> keys=manifest,navGraphMermaid,controlTableMd,captureList,validation
PASS  engine loadManifest() accepted the rendered manifest  -> states=8
PASS    manifest state carries state_id  -> "populated"
PASS    manifest state carries seed  -> "projects-3-conversations-12"
PASS    manifest state carries as  -> "workspace-member"
PASS    manifest state carries fault  -> null
PASS    manifest state carries references  -> ["locked/populated.png"]
PASS  ui-sheet.cjs exports sheetHash
PASS  sheetHash(model) is a sha256 hex  -> c9b5c1631661eb85ed83dded463f828c30cb0275165f2d1321983670586b9814
PASS  rendered sheet HTML contains sheet_hash
PASS  look-lock documented in checkpoints.md  -> mentions=11

PROBE PASSED   (exit 0)
```

The manifest was written to a real file and loaded with `flutter-ui-eval.cjs`'s **existing**
`loadManifest()` — the engine this objective never touched — not with a local re-implementation.

#### Check 4: dependencies unchanged

```
dependencies: {"node-pty":"1.1.0"}
count: 1
exit 0
```

#### Bonus: the twelve known-broken fixtures, through the REAL binary

With the hand-built catalogue, all twelve exit 1, each with **exactly one** real error code:

```
behaviors-missing-narrow.md      exit=1  [CTRL004]     hit-rect-overlap.md              exit=1  [HIT001]
behaviors-overlapping-when.md    exit=1  [CTRL003]     hit-rect-within-and-disjoint.md  exit=1  [HIT002]
control-two-does.md              exit=1  [CTRL001]     outage-equals-empty.md           exit=1  [STATE002]
entry-control-unknown.md         exit=1  [ROUTE003]    route-without-back.md            exit=1  [ROUTE002]
flow-ends-mid-route.md           exit=1  [FLOW002]     state-without-seed.md            exit=1  [STATE001]
guard-without-denied-state.md    exit=1  [GUARD001]    unknown-pattern.md               exit=1  [PAT001]
```

Positive control `projects-rail.md` → `"ok": true`, `errors: []`, **exit 0**.

Without `--patterns`, `unknown-pattern.md` exits **0** and every spec carries a `PAT000` MISSING
row — correct, documented behaviour (see Known limitations), and the reason the `--patterns` flag
and the fixture catalogue exist at all.

### Task 2 — CHANGELOG 2.9.0 and the version trio

The generator (`df-tools changelog update --version v2.9.0 --from <merge-base> --to HEAD
--dry-run`) was run over **130 commits**. Its output is a commit list — 55 "GREEN —" bullets under
Added and a `### Tests` section — and was **not** shipped. The entry was rewritten from the ten
`34-0x-SUMMARY.md` files in the 2.8.0 house style: bold-led bullets, the defect or capability in
plain English, commit short-shas in parentheses.

**Every one of the 58 short-shas cited in the entry was verified to resolve to a real commit**
(`git cat-file -e <sha>^{commit}`) — 0 unresolvable.

Verification:

```
node ~/.claude/devflow/bin/df-tools.cjs changelog check 2.9.0
  { "ok": true, "version": "2.9.0", "present": true }      exit=0

grep -c "Known limitations" CHANGELOG.md                   3
gate regex ^## \[2\.9\.0\] matches                         true
```

Version trio, read **out of the release commit's tree**:

```
package.json:3                            2.9.0
plugins/devflow/.claude-plugin/plugin.json:4   2.9.0
.claude-plugin/marketplace.json:4  (marketplace's own)  2.9.0
.claude-plugin/marketplace.json:14 (devflow plugin)     2.9.0

siblings UNTOUCHED: social-media-generator=1.3.0, aosentry-mcp=1.0.0,
                    eden-ui-flutter=1.0.0, eden-ui-web=1.0.0, monorepo-standards=0.1.0
```

All three files re-parsed as valid JSON. The bump propagates into the engine stamp —
`ui spec validate` now reports `"engine_version": "2.9.0"` (it read `2.8.0` before).

## Post-TRD Verification

| check | result |
|---|---|
| Objective suites (9 files) | `193/193`, every file exit 0 |
| `sync-runtime.test.js` | `15/15`, `SUBDIRS` includes `'schemas'` |
| Full `npm test` at `dce508b` | 3228 tests / 3170 pass / **8 fail** / 50 skipped |
| Failing files | only `devflow-watch`, `handoff-e2e`, `awareness` — all pre-existing |
| Failures in objective-touched files | **zero** |
| W1b interface list | failed → fixed in `959e403` → probe exit 0 |
| Twelve broken fixtures | 12/12 exit 1, one code each |
| Positive control | `projects-rail` ok, exit 0 |
| Dependencies | `{"node-pty":"1.1.0"}`, count 1 |
| Version trio | 2.9.0 ×4, siblings untouched |
| `changelog check 2.9.0` | exit 0 |
| Cited shas resolvable | 58/58 |
| Tag gate (simulated, nothing created) | ALLOW, with two live negative controls |
| Working tree | clean but for an untracked `.gitkeep` |

## Objective exit statement (against OBJECTIVE.md's definition of done)

| clause | verdict | evidence |
|---|---|---|
| `validate` rejects each known-broken fixture with its own code, and accepts `projects-rail` | **MET** | 12/12 exit 1 with exactly one code each; positive control exit 0 — table above |
| `render` emits a manifest whose states carry `state_id`/`seed`/`as`/`fault`/`references` | **MET** | probe: all five present on the manifest's states, and it loads through the real `flutter-ui-eval` `loadManifest()` (8 states) |
| `ui sheet` produces a page whose `sheet_hash` is stable across template edits and shows MISSING for an unrendered state | **MET** | `ui-sheet.test.cjs` 12/12 (H1–H4 pin both halves of the hash contract); the committed fixture sheet carries MISSING cells |
| `ui lock` writes the acceptance block and is cleared by a shape change but not by prose | **MET** | `ui-spec-lock.test.cjs` 14/14; proven by mutating a real spec — L2/L6/L3c cleared on `kind`/`path`/`seed`, L3/L3b held on prose/`design_read`/`references`/`flows` |
| `frontend-design` build mode refuses to compose without a valid, locked spec | **MET** | `ui-spec-skill-contract.test.cjs` 15/15; `grep -c "Do not compose"` → 4; proven across five real spec states, four refuse and one proceeds |
| the harness FAILS a bare `cd X && cmd` and PASSES `( cd X && cmd )` | **MET** | `✔ Case X1 — a bare cd sub leaks the persisted cwd and FAILS the section`; `✔ Case X2 — ( cd sub && touch marker.txt ) leaves cwd unchanged and PASSES` |
| the current `executor.md` Flutter section passes end-to-end | **MET** | `✔ Case R1/R2/R3 … passes end-to-end` (22 calls, zero findings), with `✔ Case R5 — a deliberately broken COPY of executor.md FAILS` as the differential control |

All seven clauses met.

## Open items — recorded, NOT resolved

1. **34-06's `checkpoint:human-verify` is OUTSTANDING and unapproved.** Zero of its three
   questions are answered. A verifier returned `gaps_found`: **Q2** (a MISSING cell is
   unmistakable) **PASSED**; **Q1** (the control table reads as English) and **Q3** (grid
   legibility at 8 states × 2 themes) each surfaced one cheap fix — Q1 owned by **34-05**
   (wording, in the renderer's templates), Q3 owned by **34-06** (layout). The sheet to review is
   `plugins/devflow/devflow/bin/lib/__fixtures__/ui-spec/sheet/projects-rail.sheet.html`. This is
   the only human gate in the objective and **2.9.0 ships with it open** — see the judgement below.
2. **The review sheet's `sheet_hash` includes the engine-rendered control-table prose.** A
   wording-only change in `ui-spec-render.cjs` would therefore clear every look-lock — the exact
   over-trigger the design already, deliberately, rejected for `engine_version`. 34-07's
   lock-clearing rule is **not** affected: it hashes `{routes, controls, states}` only. **Needs a
   decision before W1★.**
3. **The amended proposal `docs/PROPOSAL-ui-oracle-loop.md` (branch `docs/ui-oracle-loop-design`,
   commit `4e27123`, a different checkout — NOT touched by this run) has two self-contradictions**,
   resolved here normative-rule-over-illustrative-example: its `locked_sheet` literal is 65 hex
   characters and so cannot be a sha256, and its §4.2 example declares both `within` and
   `disjoint_from` on one target while its own §4.5 I6 — added in the same commit — forbids that.
   The fixtures follow the rules; **the proposal still reads both ways and needs an amendment to
   one side.** Owner: the controller.
4. **`<worktree_command_discipline>` in `agents/executor.md` contradicts its own Flutter
   sections.** It forbids `&&`, pipes and `cd` prefixes; the Flutter sections mandate
   `( cd "$PACKAGE_DIR" && … )` and pipe through `sort`/`grep`. Both rules are individually
   well-founded, and the discipline section's alternative (set the Bash tool's cwd) is unavailable
   because the tool takes no cwd argument. 34-10 found this, recorded it, and deliberately did
   **not** "fix" it either way. **A design decision, not a wording fix.** Owner: the orchestrator.
5. **`ui spec validate`'s `lock` is nested** (`lock.lock`), so `if (out.lock !== 'held')` compares
   an object to a string and would refuse every surface including approved ones. W1★ candidate.
6. **The harness CI job is path-filtered and is not a required check.** Until branch protection
   lists `harness`, a PR touching none of the filtered paths merges on a green tick that never ran
   the gate. Out of band; not done.
7. `CTRL007` reserved but unimplemented; `terminal: true` not in the schema; `flows` excluded from
   the look-lock shape hash; `references[]` uncalibrated and no `expected` judge anchor — all W2 /
   later.

### Is 2.9.0 shippable?

**Yes — as a plugin release.** Everything it ships is proven green at the release commit, the
interface list is real, no dependency was added, and the baseline did not regress. Items 2–7 are
recorded, not hidden, and items 2, 4 and 5 are decisions for W1★/the orchestrator rather than
defects in shipped code.

The one thing a reader must not misread: **item 1 means the review sheet's own look has never been
human-approved.** That does not block the plugin release — the sheet is a fixture, no `ui lock` was
ever run against a committed file, and nothing in 2.9.0 claims a human signed anything. It **does**
mean W1★'s dogfood should expect two cosmetic fixes (Q1 wording in 34-05, Q3 layout in 34-06)
before it locks anything for real.

## What W1★ and W2 inherit — and what they must NOT assume

Inherit: `ui-spec.cjs` as the single front door exporting
`{parseSurfaceSpec, validateSurfaceSpec, renderSurfaceSpec}`; a manifest that loads through the
existing `flutter-ui-eval` engine unmodified; `sheetHash`; `look-lock` as a documented checkpoint
variant the verifier may not stand in for; and the harness plus its `# harness:` vocabulary.

Must **not** assume: that the pattern catalogue resolves (it does not — `PAT000 / MISSING` on every
real spec until W1a pins an `eden-ui-flutter` release); that I6 checks hit-rect **overlap**
(it checks resolvability, reciprocity and within/disjoint consistency only — measuring rects is
W2's probe, and `HIT000` is the answer where the check could not run); that a probe, the checks or
the executor CONFORM loop exist (they do not — W2); that `references[]` is calibrated or an
`expected` judge anchor exists; or that any of these arms is reachable from a **skill** before
2.9.0 is installed and a new session re-syncs the `~/.claude/devflow` mirror.

## CHECKPOINT: human-action — Tag v2.9.0

**Status: OUTSTANDING. Not performed.** This run was autonomous; tagging is the user's call.
No tag was created, nothing was pushed, no PR was opened, and `DEVFLOW_SKIP_CHANGELOG_GATE` was
never set.

### The command

```bash
git tag -a v2.9.0 -m "UI Oracle Loop W1b — Surface Spec: schema, validator, renderer, review sheet, look-lock, prose harness"
```

The `-m` text becomes the **GitHub release title** — `.github/workflows/release.yml` fires on
push of a `v*` tag and titles the release from the annotated tag's subject (re-fetching the tag
object, per the 2.7.1 fix).

### Proof the gate would pass — executed, nothing created

`plugins/devflow/hooks/changelog-on-tag.js` was run directly against a simulated PreToolUse
payload. An empty stdout is an allow; a deny writes a JSON decision.

```
git tag -a v2.9.0 -m '...'         -> ALLOW (no deny emitted)
git tag -a v2.9.0 dce508b -m '...' -> ALLOW (no deny emitted)
```

With two **negative controls**, because a gate that cannot deny proves nothing:

```
git tag -a v2.9.1 -m x        -> DENY: CHANGELOG.md has no entry for v2.9.1.
git tag -a v2.9.0 HEAD~1 -m x -> DENY: CHANGELOG.md has no entry for v2.9.0 (at commit HEAD~1).
```

The second control is the important one: it proves the hook really resolves the **named commit's**
tree, and that the release commit is the only correct target.

### Correction to the TRD's stated wiring

The TRD's `wiring` clause says the gate *"reads the version heading from the COMMIT being tagged,
not the working tree (2.7.1 fix)."* **That is only true when the tag command names a commit-ish.**
Reading `makeTreeReader()` in the hook: with no commit-ish it returns a reader backed by
`fs.readFileSync` over the **working tree**; only a resolved commit-ish switches it to
`git show <commitish>:<path>`. So the bare `git tag -a v2.9.0` form above is judged against the
**working tree**. Both paths allow here — the working tree is clean at `dce508b`, so they agree —
but the distinction matters to anyone relying on the TRD's sentence.

### Preconditions

Satisfied:

- `CHANGELOG.md` carries `## [2.9.0] - 2026-09-22` **in `dce508b`'s own tree** (verified with
  `git show dce508b:CHANGELOG.md`) — not merely in the working tree.
- The version trio reads `2.9.0` in that commit's tree; the four sibling plugin versions are
  untouched. The gate's manifest-sync check matches the `devflow` entry by `plugin.json`'s `.name`.
- `HEAD` is `dce508b`, the release commit. The working tree is clean apart from one untracked
  `.planning/.../.gitkeep`.
- All release checks above pass.

Not yet satisfied — **the human must decide these**:

- **`HEAD` is `dce508b` on branch `df/w1b-surface-spec`, not on `main`.** Tagging here tags a
  branch commit. If 2.9.0 is meant to be tagged on `main`, merge first and tag the merge result.
- **The merge runbook in `~/.claude/CLAUDE.md` has not been run** — Stage A preflight, Stage B
  composition (relevant here: 34-07 and 34-10 both edit `agents/executor.md`, and
  34-04/34-05/34-06/34-07 all edit `df-tools.cjs`'s `case 'ui'`), Stage C approval. `/code-review
  <PR> high` after the final branch review is mandatory per the TRD.
- **Nothing has been pushed**, so `release.yml` has not run and no GitHub release exists.
- **Open item 1** (34-06's human-verify) is unapproved. It does not block the plugin release, but
  the user should see it before tagging.

### Deviations from the TRD

1. **Task 3 not executed** — a `checkpoint:human-action` under an autonomous run. Replaced with the
   executed gate proof above.
2. **One code change inside the release**, against the TRD's "no code changes" scope fence but
   *expressly* permitted by its `<error_recovery>` clause: the `ui-spec.cjs` re-export
   (`959e403`), with its own commit and its own four tests. Without it the release's own
   must-have — "the W1b interface list is real at the tag" — would have been false.
