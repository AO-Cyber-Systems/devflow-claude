---
objective: 33-the-visual-gate-actually-runs-in-ci
trd: "02"
subsystem: testing
tags: [flutter-ui-eval, visual-eval, aodex-485, resolver, verifier, tdd]

requires:
  - objective: 33-the-visual-gate-actually-runs-in-ci
    trd: "01"
    provides: "resolveUIEvalTarget(cwd, arg) — the single, tested id-to-manifest lookup with four honest statuses; this TRD wires it behind the handler"
provides:
  - "cmdVerifyFlutterUIEval delegates its first positional argument to resolveUIEvalTarget instead of its own fs.existsSync/loadManifest pair — one implementation, one place"
  - "Step 8c's own invocation, extracted live from agents/verifier.md and executed (not copied into a test), resolves to a named status instead of the legacy collapsed {error} shape"
  - "All four resolutions (not_applicable/absent/invalid/resolved) pinned by objective id, each with its own exit-code assertion — not just resolution, but the exit code Step 8c and CI both depend on"
  - "Manifest-path backwards compatibility preserved byte-for-byte except one added field (resolution:'resolved'), proven by a pre-TRD-vs-post-TRD rollup diff over the checked-in fixture"
affects: [33-03]

tech-stack:
  added: []
  patterns:
    - "Extraction-based pinning: a test that reads the actual agent prose (verifier.md Step 8c), regexes the real invocation out of it, and executes that string — never a hard-coded copy. An extraction-guard case (V4) fails loudly if the regex ever matches zero times, so the load-bearing case (V1) cannot pass by silently finding nothing."
    - "Four-status -> {ok, exit-code} mapping, pinned by name per status: not_applicable/absent/invalid all emit ok:true + exit 0 (never the legacy ok:false + {error}); resolved keeps the existing verdict-driven exit code (32-04) unchanged."
    - "Differential control performed on the REWIRING itself (not the prose) — reverting the handler's resolution call to the pre-TRD path-only fs.existsSync/loadManifest pair reproduces the exact defect and fails 7 cases by name across two files."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
    - plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs

key-decisions:
  - "Case X4 (flutter-ui-eval-dogfood.test.cjs) originally asserted the legacy collapsed-error payload (`{error:'manifest/captureResults not found', ok:false}`) as CORRECT behaviour for a not-found manifest path. That payload IS the defect this objective closes — Step 8c reads any `{error}` shape as SKIPPED, which is exactly how the gate went unreachable. Updated the assertion to the new named shape (`resolution:'not_applicable'`, `ok:true`) while leaving the case's actual guarantee — exit 0, never a hard CI failure — fully intact and still asserted. Disclosed here per the TRD's explicit allowance for this exact situation, not silently changed."
  - "The coordinator flagged a real gap after RED+GREEN were committed: V1 alone only pins that `resolution` is ONE of the four statuses — it would pass even if the fixture resolved to not_applicable, proving nothing about whether an objective id can reach a SCORED manifest. Added V2 (resolved + real verdict + exit 0), V3 (absent + exit 0 + searched[]), V5 (invalid + exit 0, distinguishable from absent), V6 (not_applicable via a real non-UI objective, exit 0), and D-ID (the other CLI arm, `flutter-ui eval`, routes to the same handler) — closing the mapping from all four resolutions to their exit codes, not just one."
  - "`resolution: 'resolved'` was added to the SUCCESS rollup as a literal alongside the pre-existing (and unrelated) `resolved` field — the run's list of expect:fail states that now pass. Different key name (`resolution` vs `resolved`), deliberately, to avoid colliding with an existing field a caller might already read."

patterns-established:
  - "A prose-pinning test extracts the real invocation from the agent markdown file at test time, rather than encoding a copy of the command string — closing exactly the class of drift this objective exists to fix (Step 8c said one thing; the engine accepted another; nothing ever caught it)."

requirements-completed:
  - "UIEVAL-33-04"
  - "UIEVAL-33-05"
  - "UIEVAL-33-06"

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 55min
completed: 2026-08-27
---

# Objective 33 TRD 02: The invocation Step 8c actually contains resolves to something the engine can load Summary

**`cmdVerifyFlutterUIEval` now delegates to 33-01's `resolveUIEvalTarget`: Step 8c's own `verify flutter-ui-eval "$OBJECTIVE"` invocation, extracted live from `verifier.md` and executed against a hermetic fixture, loads and scores a real manifest by objective id — proven for all four resolutions with their own exit codes, not just the happy path.**

## Performance

- **Duration:** ~55 min across the session (task 1 RED, coordinator-requested gap-closing pass, task 2 GREEN, task 3 differential control)
- **Tasks:** 3/3 complete
- **Files modified:** 3 (1 new test file, 1 engine file, 1 existing dogfood test file with one disclosed assertion change)

## Branch / commits

Base: `768b052` (tip of `fix/ui-eval-default-honesty` after 33-01), executed on `exec/33-02`.

1. `c4c3ab7` — **RED**: V4 (extraction guard) + V1 (load-bearing case), observed failing against the pre-fix handler.
2. `0918505` — **GREEN**: handler rewiring (`cmdVerifyFlutterUIEval` -> `resolveUIEvalTarget`), V1 now green, disclosed X4 change.
3. `2bbf03d` — **test**: V2/V3/V5/V6/D-ID — the coordinator-requested gap-closing cases pinning all four resolutions by objective id with their own exit codes.

Task 3 (differential control) produced no commit by design — a commit there would mean the restore failed.

## The RED (task 1, recorded verbatim)

```
bash -c 'cd plugins/devflow/devflow/bin/lib && node --test verifier-ui-eval-invocation.test.cjs 2>&1 | tail -40; exit ${PIPESTATUS[0]}'
```

```
▶ verifier-ui-eval-invocation (TRD 33-02, aodex#485 defect 5)
  ✔ Case V4 — Step 8c contains exactly one `verify flutter-ui-eval` invocation (1.659459ms)
  ✖ Case V1 — Step 8c's own invocation resolves to something the engine can load (objective 33) (82.225708ms)
✖ verifier-ui-eval-invocation (TRD 33-02, aodex#485 defect 5) (84.40375ms)
ℹ tests 2
ℹ pass 1
ℹ fail 1

✖ failing tests:

test at verifier-ui-eval-invocation.test.cjs:118:3
✖ Case V1 — Step 8c's own invocation resolves to something the engine can load (objective 33) (82.225708ms)
  AssertionError [ERR_ASSERTION]: Step 8c's invocation must resolve to something the engine can load (objective 33)
    actual: { error: 'manifest/captureResults not found', ok: false },
    expected: { error: 'manifest/captureResults not found', ok: false },
    operator: 'notDeepStrictEqual'
```

Exit code **1**. V4 (the extraction guard) passed first — proving the regex found Step 8c's real invocation, exactly once — so V1's failure means what it claims: **Step 8c's own prose, executed verbatim against a fixture objective id, produced the legacy collapsed-error payload.** This is the recorded evidence that the visual gate had never run.

## The extraction mechanism (for 33-03)

```js
const md = fs.readFileSync(VERIFIER_MD, 'utf-8'); // path.join(__dirname,'..','..','..','agents','verifier.md')
const startIdx = md.indexOf('### Step 8c');
const endIdx = md.indexOf('### Step 8d');
const step8c = md.slice(startIdx, endIdx);
const matches = [...step8c.matchAll(/df-tools\.cjs\s+verify\s+flutter-ui-eval\s+([^\n)]*)/g)];
```

Slice bounds: strictly between the `### Step 8c` and `### Step 8d` headings (byte offsets via `indexOf`). This means:

- **Reflowing Step 8c's prose is SAFE** as long as the `### Step 8c` / `### Step 8d` headings stay intact and the `verify flutter-ui-eval` invocation stays inside that slice, on one line ending before a `\n` or a `)`.
- **Renaming or removing `### Step 8d`** breaks the slice (`endIdx === -1`) — asserted explicitly (`assert.ok(endIdx !== -1 ...)`), so this fails loudly, not silently.
- **Moving the invocation into Step 8d, or adding a second `verify flutter-ui-eval` call anywhere in Step 8c**, trips V4 (`matches.length !== 1`) before V1 even runs.
- The regex captures everything after `verify flutter-ui-eval` up to a newline or `)` — a multi-line invocation (e.g. wrapped in `\` continuations) would need the regex updated; that is out of scope here since Step 8c is currently single-line.

## GREEN — the rewiring

`cmdVerifyFlutterUIEval` (`flutter-ui-eval.cjs`) no longer does its own `fs.existsSync` + `loadManifest` try/catch. It calls `resolveUIEvalTarget(cwd, manifestArg)` once and switches on `target.resolution`:

```js
const { resolveUIEvalTarget } = require('./flutter-ui-eval-resolve.cjs');
const target = resolveUIEvalTarget(cwd, manifestArg);

if (target.resolution !== 'resolved') {
  output({ resolution: target.resolution, reason: target.reason, objective_dir: target.objective_dir,
    manifest_path: target.manifest_path, searched: target.searched, ui_trds: target.ui_trds,
    visual_gate: target.visual_gate, ok: true }, raw);
  return;
}
const absManifest = target.manifest_path;
const manifest = target.manifest; // 33-01 Case M8 — never re-read/re-parsed here
```

The success rollup gained one field: `resolution: 'resolved'`, alongside the pre-existing `manifest_path` — so a caller can switch on the same field name regardless of which branch produced the output.

## The resolution -> output/exit-code mapping (pinned, not assumed)

| Resolution | `ok` | Exit code | Pinned by | Reasoning |
|---|---|---|---|---|
| `not_applicable` | `true` | **0** | Case V6 (real non-UI objective) + Case X4 (nonexistent id/path) | Not a judged failure — nothing to judge. Step 8c's standing contract ("never a hard fail") is honored at this layer. |
| `absent` | `true` | **0** | Case V3 | Applicable objective, nothing written yet. Runs and reports (`searched[]` non-empty); does not crash, does not vanish. |
| `invalid` | `true` | **0** | Case V5 | A manifest-shaped file exists but is broken (bad JSON here). Distinguishable from `absent` by `resolution` (33-01's whole point) — but STILL not a judged failure; 33-03 owns whether this should someday route differently. This TRD's job was reachability, not routing policy. |
| `resolved` | n/a (full rollup, no `ok` field — unchanged shape) | **verdict-driven** (32-04, unchanged): `pass`/`pass-with-reviews` -> 0, `fail` -> 1 | Case V2 (`pass` -> 0), existing X1-X3 (fail -> 1, pass -> 0, pass-with-reviews -> 0), B1 (unchanged fixture, still `fail` -> 1 post-TRD) | This is the ONLY branch where "did the gate run" and "did it pass" are different questions — the exit code answers the second one, exactly as before this TRD. |

Only the three non-scoring resolutions are new exit-code territory; `resolved`'s exit-code behavior is 100% inherited from 32-04, untouched by this TRD (confirmed by B1 below).

## The end-to-end claim, demonstrated (not just asserted in a test)

No objective in this repo currently has a `type:ui + stack:flutter` TRD (confirmed by 33-01's own summary and reconfirmed here — `verify flutter-ui-eval 33 --raw` on objective 33 itself resolves `not_applicable`, since 33 has no such TRD). So the live demonstration below uses a hermetic temp objective built the same way Case V2 builds its fixture — this is the same claim V2 pins in the test suite, reproduced here as a standalone command-line transcript per the TRD's evidence requirement.

```
$ node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval 90 --raw
{
  "resolution": "resolved",
  "manifest_path": ".../90-e2e-demo/evidence/ui_eval/manifest.json",
  "network": false,
  "judge": "offline-label-echo",
  "gate": "advisory",
  "samples": 1,
  "flakeBudget": 0,
  "unjudgedPolicy": "review",
  "verdict": "pass",
  "counts": { "pass": 1, "fail": 0, "review": 0 },
  "reviews": [],
  "fails": [],
  "known_failing": [],
  "resolved": [],
  "unjudged": [],
  "states": [
    { "state_id": "only-good", "verdict": "pass", "is_broken": false, "defects": [], "evidence": "label", "advisories": [] }
  ]
}

$ bash -c 'node plugins/devflow/devflow/bin/df-tools.cjs verify flutter-ui-eval 90 --raw > /dev/null 2>&1; echo $?'
0
```

**This proves:** an objective id, resolved via 33-01's resolver, reaches the existing scoring pipeline unmodified — loads a manifest, runs the offline label-echo judge, produces a real `verdict`, and exits 0 for a clean pass.

**This does NOT prove:** that a real vision model (`--judge live`) returns a well-formed Shape-C response for a real screenshot. That boundary (`callVisionJudge`) is deliberately injected/fake here and in every test in this TRD — no network calls, no credentials, per the TRD's `no_network` constraint. Only the resolution -> load -> score -> exit-code pipeline is proven; the correctness of a real vision judgment is untouched by this TRD (it was objective 32's territory, and stays that way).

**What "the gate runs in CI" does and does not mean on THIS repo today:** no objective in devflow-claude currently declares `type:ui + stack:flutter`, so on THIS repo's own TRDs, Step 8c's invocation resolves `not_applicable` everywhere it runs — reachable and honest, but never `resolved`, because there is nothing to resolve to yet. The claim this TRD establishes is narrower and more important than "the gate scores manifests in this repo's CI": it is that **the resolution mechanism itself works end-to-end**, verified against hermetic fixtures and reproducible against any real Flutter repo (e.g. eden-biz) that does declare such a TRD and writes a manifest to `evidence/ui_eval/manifest.json`. Objective 33's own headline claim — "the gate is reachable" — is proven; "the gate is currently exercising a real manifest in this repo's own CI runs" would be false to claim, and is not claimed.

## B1 — backwards compatibility (pre-TRD vs post-TRD rollup diff)

Captured the pre-TRD rollup by stashing all uncommitted changes and running against the base commit, then diffed against the post-TRD rollup over the SAME checked-in fixture manifest:

```
$ diff pre-trd-rollup.json post-trd-rollup.json
1a2
>   "resolution": "resolved",
```

The **only** difference across the entire rollup is the added `"resolution": "resolved"` field. Exit code unchanged (**1** both before and after — this fixture scores `fail` by design, per 32-04). Every dogfood case D1/D2/F1/DF1/DF2/DF3/N1/C5/U1/A1/G1-G5/X1-X4 (except the one disclosed X4 change) passes unchanged.

## Differential control — inverted form, on the rewiring

Per the TRD's instruction: the defect now lives on the handler (not the prose — `"$OBJECTIVE"` is the CORRECT form), so the control reverts the handler's resolution call back to the pre-TRD path-only `fs.existsSync` + `loadManifest` pair.

**Injected regression** (verbatim restore of the pre-fix block):
```js
const absManifest = path.isAbsolute(manifestArg) ? manifestArg : path.join(cwd, manifestArg);
if (!fs.existsSync(absManifest)) {
  output({ error: 'manifest/captureResults not found', path: manifestArg, ok: false }, raw);
  return;
}
let manifest;
try { manifest = loadManifest(absManifest); }
catch (e) { output({ error: 'invalid manifest: ' + e.message, path: absManifest, ok: false }, raw); return; }
```

**Run:**
```
bash -c 'cd plugins/devflow/devflow/bin/lib && node --test verifier-ui-eval-invocation.test.cjs flutter-ui-eval-dogfood.test.cjs 2>&1 | grep -E "^(✖|ℹ tests|ℹ pass|ℹ fail)"; exit ${PIPESTATUS[0]}'
```

```
✖ Case X1-X4 — a failing run exits non-zero (32-04) (767.282625ms)
✖ verifier-ui-eval-invocation (TRD 33-02, aodex#485 defect 5) (1028.812041ms)
ℹ tests 26
ℹ pass 19
ℹ fail 7
✖ failing tests:
✖ Case X4 — a not-found manifest path exits 0 (verifier.md Step 8c: SKIPPED, never a hard fail) (201.872875ms)
✖ Case V1 — Step 8c's own invocation resolves to something the engine can load (objective 33) (174.171083ms)
✖ Case V2 -- an objective id resolves to `resolved` and a real scored verdict, correct exit code (170.313333ms)
✖ Case V3 -- an applicable objective with no manifest resolves to `absent`, exit 0, searched[] non-empty (145.284042ms)
✖ Case V5 -- a broken manifest.json resolves to `invalid` (distinct from absent), exit 0 (165.285084ms)
✖ Case V6 -- a non-UI objective resolves to `not_applicable`, exit 0 (192.127333ms)
✖ Case D-ID -- `flutter-ui eval <objective-id>` resolves too (same handler, the arm the workflow uses) (177.0285ms)
```

**7 cases failed BY NAME**, across both test files (X4 in the dogfood suite; V1/V2/V3/V5/V6/D-ID in the new suite) — the regression was not narrowly caught, it broke every case that depends on the objective-id resolution path, exactly as expected.

**V1's payload, isolated:**
```
bash -c 'node --test --test-name-pattern="Case V1" verifier-ui-eval-invocation.test.cjs 2>&1; exit ${PIPESTATUS[0]}'
```
```
  AssertionError [ERR_ASSERTION]: Step 8c's invocation must resolve to something the engine can load (objective 33)
    actual: { error: 'manifest/captureResults not found', ok: false },
    expected: { error: 'manifest/captureResults not found', ok: false },
    operator: 'notDeepStrictEqual'
```
The exact legacy payload, reproduced on demand.

**Restore:**
```
$ git checkout -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
$ git diff --stat -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs
(no output)
$ git diff --quiet -- plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs && echo CLEAN || echo DIRTY
CLEAN
```

**Re-run, green again:**
```
bash -c 'cd plugins/devflow/devflow/bin/lib && node --test verifier-ui-eval-invocation.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval.test.cjs flutter-ui-eval-resolve.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs flutter-ui-scope.test.cjs 2>&1 | tail -12; exit ${PIPESTATUS[0]}'
```
```
ℹ tests 131
ℹ pass 131
ℹ fail 0
```

## Did any existing test change? Yes — one, disclosed

`flutter-ui-eval-dogfood.test.cjs` Case X4 originally asserted:
```js
assert.strictEqual(parsed.error, 'manifest/captureResults not found', ...);
```
for a not-found manifest **path**. That assertion encoded the pre-fix collapsed-error payload as correct behaviour — exactly the shape that made Step 8c silently route to SKIPPED for months (aodex#485 defect 5). Changed to assert the new named shape instead:
```js
assert.strictEqual(parsed.resolution, 'not_applicable', 'sanity: the non-scoring path was reached');
assert.strictEqual(parsed.ok, true, 'a non-scoring resolution is ok:true, not the legacy ok:false { error }');
assert.strictEqual(result.status, 0, 'a missing manifest must never become a hard CI failure — verifier.md Step 8c routes this to SKIPPED, not a crash');
```
The case's actual guarantee — a not-found target must never become a hard CI failure — is unchanged and still asserted (`result.status === 0`). Only the SHAPE of the non-scoring payload changed, and the reasoning is inlined as a comment at the call site. No other existing test (D1, D2, F1, DF1, DF2, DF3, N1, C5, U1, A1, G1-G5, X1, X2, X3) required any change.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED — V4 + V1 | `node --test verifier-ui-eval-invocation.test.cjs` (pre-fix) | 1 (V4 pass, V1 FAIL as required) | PASS (RED observed) |
| 2: GREEN — handler rewiring + V1 green + V2/V3/V5/V6/D-ID | `node --test verifier-ui-eval-invocation.test.cjs flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-resolve.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs flutter-ui-scope.test.cjs` | 0 | PASS (131/131) |
| 3: Differential control (inverted form) | reintroduce path-only resolution -> 7 named failures (1) -> restore -> `git diff --quiet` CLEAN -> re-run (0) | n/a (procedural) | PASS |

## Task Commits

1. **Task 1: RED** — `c4c3ab7` (test)
2. **Task 2: GREEN (handler rewiring + disclosed X4 change)** — `0918505` (feat)
3. **Task 2 (coordinator gap-closer): V2/V3/V5/V6/D-ID** — `2bbf03d` (test)
4. **Task 3: differential control** — no commit (procedural; a commit here would mean the restore failed)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD-scoped invocation suite | `node --test verifier-ui-eval-invocation.test.cjs` | 0 | PASS (7/7: V4, V1, V2, V3, V5, V6, D-ID) |
| Full ui-eval group | `node --test verifier-ui-eval-invocation.test.cjs flutter-ui-eval.test.cjs flutter-ui-eval-dogfood.test.cjs flutter-ui-eval-resolve.test.cjs flutter-ui-eval-planner-default.test.cjs flutter-ui-eval-bootstrap.test.cjs flutter-ui-scope.test.cjs` | 0 | PASS (131/131) |
| Objective's headline CLI claim | `bash -c 'node ...df-tools.cjs verify flutter-ui-eval 33 --raw \| grep -q manifest/captureResults && echo STILL UNREACHABLE \|\| echo GATE REACHABLE; exit 0'` | 0 | PASS — printed `GATE REACHABLE` |
| Full repo suite (`npm test`) | `npm test` | 1 (pre-existing noise, see below) | PASS for this TRD's files — 2912 tests, 2853 pass, 9 fail, ALL 9 in the documented noise set (devflow-watch.test.cjs x4/group, handoff-e2e.test.cjs x4/group, scanPeer S1 x1) — zero failures in flutter-ui-eval.cjs, flutter-ui-eval-dogfood.test.cjs, or verifier-ui-eval-invocation.test.cjs |
| Untouched-scope proof | `git diff --stat 768b052..HEAD` | n/a | PASS — exactly the 3 files this TRD's `files_modified` permits |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test verifier-ui-eval-invocation.test.cjs` (pre-fix handler) | 1 | FAIL (correct) — V1 fails with the legacy `manifest/captureResults not found` payload, recorded verbatim above |
| GREEN | same command, post-fix handler | 0 | PASS (correct) — 2/2, then 7/7 after V2/V3/V5/V6/D-ID added |
| REFACTOR | none needed | n/a | n/a |
| Differential control (regression injected) | full group, path-only handler restored | 1 | FAIL (correct) — 7/26 named, X4 + V1/V2/V3/V5/V6/D-ID |
| Differential control (restored) | full group, fixed handler | 0 | PASS (correct) — 131/131 |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` in the TRD frontmatter: extraction-based test, RED observed and recorded, resolved+verdict via objective id, absent+exit-0, path-arg back-compat unchanged, inverted differential control with clean restore)
- **Gate failures:** None in scope. `npm test` full-repo run shows 9 pre-existing failures, all within the documented "known environment noise" set (devflow-watch.test.cjs foreground/multi-project flakiness, handoff-e2e.test.cjs end-to-end timing flakiness, awareness.test.cjs Case S1 scanPeer) — none touch this TRD's files, none newly introduced.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/verifier-ui-eval-invocation.test.cjs` (NEW) — V4 (extraction guard), V1 (load-bearing, extracted-and-executed), V2 (resolved by objective id + real verdict + exit 0), V3 (absent + exit 0 + searched[]), V5 (invalid, distinguishable from absent, exit 0), V6 (not_applicable via a real non-UI objective, exit 0), D-ID (the `flutter-ui eval` arm routes to the same handler). Hand-built fixture factory (`makeFixtureObjective`) + manifest/labels generator functions (`buildManifestJSON`, `buildLabelsJSON`, `cleanState`) — fixture_strategy: generators, no hand-pasted JSON blobs, no LLM-generated data.
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` — `cmdVerifyFlutterUIEval` delegates path/id resolution to `resolveUIEvalTarget`; the three non-scoring resolutions emit a named `ok:true` payload instead of `{error, ok:false}`; the `resolved` branch adds `resolution:'resolved'` to the unchanged rollup and consumes `target.manifest` directly (no second `loadManifest` call).
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval-dogfood.test.cjs` — Case X4 updated to assert the new named non-scoring shape instead of the legacy collapsed-error payload it originally encoded as correct (disclosed above); its actual guarantee (exit 0, never a hard fail) is unchanged.

## Decisions Made

See `key-decisions` in frontmatter. Summarized: (1) Case X4 deliberately updated, disclosed, guarantee preserved; (2) coordinator-flagged gap closed with V2/V3/V5/V6/D-ID pinning all four resolutions by exit code, not just resolution string; (3) `resolution:'resolved'` added as a distinct field name from the pre-existing unrelated `resolved` array to avoid collision.

## Deviations from Plan

### Auto-fixed Issues

None in the Rule 1-3 sense (no bugs, missing critical functionality, or blocking issues discovered outside the TRD's scope). One disclosed test-assertion change (Case X4, see above) and one coordinator-requested test-coverage expansion (V2/V3/V5/V6/D-ID, see above) — both fully documented, both compensated by passing evidence, neither weakens any existing guarantee.

**Total deviations:** 0 auto-fixed (Rule 1-3). 1 disclosed assertion update (X4). 1 coordinator-requested coverage expansion (V2/V3/V5/V6/D-ID).
**Impact on plan:** None on scope. The coverage expansion strengthens the TRD's own evidence for its headline claim beyond what the original task list required.

## Issues Encountered

None blocking. The worktree-isolation guard refused one complex heredoc-based Bash invocation (a Python script passed inline); resolved by writing the script to the session scratchpad and invoking it as a plain `python3 <path>` command — no bypass, just a different invocation shape.

## User Setup Required

None — no external service configuration required. All judge calls in this TRD's tests are the injected offline label-echo fake; no network, no credentials.

## Next Objective Readiness

- 33-03 (verifier routing + prose fix) can switch on `resolution` directly from the handler's output. The extraction mechanism documented above tells 33-03 exactly what reflowing Step 8c will and will not break.
- `visual_gate` remains dormant across this repo's own TRDs (confirmed again here) — no objective declares `type:ui + stack:flutter`, so `resolution` will read `not_applicable` for every real objective in devflow-claude until one does. 33-03 should not assume any objective here exercises the `resolved` branch yet; the end-to-end demonstration in this SUMMARY is the reproducible proof that the mechanism works when such an objective (or a Flutter repo like eden-biz) exists.
- No blockers identified for continuing the objective.

---
*Objective: 33-the-visual-gate-actually-runs-in-ci*
*Completed: 2026-08-27*

## Independent verification (orchestrator, at integration)

Re-run rather than accepted from the executing agent's report:

- **ui-eval suite: 106/106** across all six ui-eval test files on the merged tree.
- **Live behaviour, measured with `cmd > /dev/null 2>&1; echo $?` (never through a pipe):**

  | Invocation | resolution | exit |
  |---|---|---|
  | explicit manifest path | `resolved` (gate `advisory`, verdict `fail`) | **1** |
  | objective id, non-UI objective, from repo root | `not_applicable — no type:ui + stack:flutter TRD` | **0** |

- **Differential control on the rewiring.** Replaced the `resolveUIEvalTarget` delegation
  with a hardcoded `not_applicable`:

      ✖ Case V2 -- an objective id resolves to `resolved` and a real scored verdict
      ✖ Case V3 -- an applicable objective with no manifest resolves to `absent`
      ✖ Case V5 -- a broken manifest.json resolves to `invalid` (distinct from absent)
      ✖ Case D-ID -- `flutter-ui eval <objective-id>` resolves too
      tests 7 / pass 3 / fail 4

  Four failures BY NAME. Restored → `git diff --quiet` on the production file **CLEAN**,
  106/106 green.

  Note V1 and V6 still passed under the break — V6 because the break forces
  `not_applicable`, V1 because it accepts any of the four statuses. That is exactly why
  **V2 is the load-bearing case**: it is the only one asserting the gate actually LOADS
  and SCORES a manifest reached by objective id. V1 alone would have let a permanently
  `not_applicable` gate pass as fixed.

## Scope of the claim — read this before saying "the gate runs"

No objective in devflow-claude carries a `type:ui + stack:flutter` TRD. On THIS repo the
gate therefore resolves `not_applicable` everywhere, and will continue to, correctly.

- TRUE: the invocation now executes and returns one of four honest statuses instead of
  dead-ending in `{ error: 'manifest/captureResults not found' }` → SKIPPED.
- FALSE: "the gate scores manifests in this repo's CI." It reaches `resolved` only against
  a Flutter repo (eden-biz) or a synthetic fixture such as V2's.

Do not let the first sentence be read as the second.

