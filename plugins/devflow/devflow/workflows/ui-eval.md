---
status: active
---
<purpose>
Run the UI visual-evaluation pipeline on a Flutter surface (or whole objective): capture each declared UI state, score it through the already-shipped offline scoring engine (`flutter-ui-eval.cjs`), judge the non-skipped states, and write evidence the verifier consumes.

Turns visual correctness — which the verifier always escalated to a human (verifier Step 9) — into a machine judgement. A clean surface drops off the human-verification list; a real defect lands as a `gaps:` entry with screenshot evidence.
</purpose>

<philosophy>
**Judge what the machine can; escalate only the rest.**

The engine emits a `scoreRun` rollup with three verdicts. Each maps to exactly one downstream action:

- `fail` → a defect. Emit a `gaps:` entry with the screenshot path.
- `pass-with-reviews` (or any per-state `review`) → advisory. Emit `notes:` + a partial section; the surface STAYS on the human-verify list.
- `pass` (no fails, no reviews) → machine-verified. REMOVE that surface from the human-verification list.

The engine is offline (label-echo judge, `network:false`) — no pixels leave the machine, no Docker, no network. The agent never picks a vision model id; the engine resolves it via `references/model-profiles.json` (`df-ui-evaluator`).
</philosophy>

<process>

<step name="initialize" priority="first">
Resolve the objective directory and locate the ui_eval manifest.

```bash
# Objective passed as $ARGUMENTS (objective id) or a direct manifest path.
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init verify-work "${ARGUMENTS}" 2>/dev/null)
OBJECTIVE_DIR=$(echo "$INIT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).objective_dir||"")}catch{console.log("")}})')
```

Manifest resolution is performed by the engine — `df-tools verify flutter-ui-eval` accepts
either a manifest path **or an objective id** and resolves it via `resolveUIEvalTarget`
(`bin/lib/flutter-ui-eval-resolve.cjs`), in this order:

1. An explicit path passed in `$ARGUMENTS` that names an existing file.
2. `.planning/objectives/<obj>/evidence/ui_eval/manifest.json`
3. `ui_eval/manifests/*.manifest.json` (and `flutter/ui_eval/manifests/*.manifest.json`)

**The engine reads JSON, not YAML.** A `.yaml` manifest resolves to `invalid`, not to
"absent" — it is reported, not ignored. Do not re-implement this lookup in the agent prose;
pass the objective id and read `resolution` off the result.
</step>

<step name="capture">
Run the Playwright web capture adapter to produce `CaptureResult[]` + screenshots for each declared state. Write screenshots and Shape-B capture JSON into the objective's evidence dir:

```bash
mkdir -p .planning/objectives/$OBJECTIVE_DIR/evidence/ui_eval/
```

For each manifest state with a `surface`/route:
- `browser_navigate(url=...)` against the running dev surface (`flutter run -d chrome` with `?enable-semantics=true`, per verifier Step 8a Flutter-web caveats).
- `browser_wait_for(text="<landmark>")` — never a fixed sleep.
- `browser_take_screenshot()` → save under `evidence/ui_eval/<state_id>.png`.
- Write the Shape-B capture JSON (`{ state_id, surface, screenshot_path, metadata }`) to the path referenced by the manifest state's `capture_path` (relative to the manifest dir).

States flagged skipped in the manifest are not captured.
</step>

<step name="score">
Run the engine consumer arm against the manifest and parse the `scoreRun` rollup:

```bash
UI_EVAL=$(node ~/.claude/devflow/bin/df-tools.cjs verify flutter-ui-eval "<manifest-path>" --raw)
# (equivalent arm: node ~/.claude/devflow/bin/df-tools.cjs flutter-ui eval "<manifest-path>" --raw)
```

Rollup shape (only present when `resolution: 'resolved'`): `{ verdict: 'pass'|'pass-with-reviews'|'fail', counts, reviews[], fails[], states[] }`.
Each `states[]` entry: `{ state_id, verdict: 'pass'|'review'|'fail', is_broken, defects[], errors[] }`.

Route by the engine's `resolution` field (the authoritative table is verifier.md Step 8c):
- `not_applicable` → skip silently, exit 0.
- `absent` → MISSING — keep the surface on the human-verification list, record a todo to author the manifest.
- `invalid` → `gaps:` entry.
- `resolved` → score per the rollup above.
Never a hard fail on `not_applicable` or `absent`; only `invalid` and a judged `fail` produce gaps.
</step>

<step name="judge">
For each non-skipped state in `states[]`, write a per-state judge artifact and the run report into the evidence dir:

```bash
# .planning/objectives/<obj>/evidence/ui_eval/<state_id>.judge.json   (per-state detail)
# .planning/objectives/<obj>/evidence/ui_eval/ui-eval-report.json      (full rollup)
```

Each `<state_id>.judge.json` carries the state's `{ state_id, verdict, is_broken, defects, errors, screenshot_path }`. `ui-eval-report.json` carries the whole rollup plus the manifest path and timestamp.
</step>

<step name="report">
Emit the verdict + per-state detail using the verdict→action mapping:

- `fail` → defect: surface + defect type/severity + `evidence/ui_eval/<state_id>.png` path. Downstream this becomes a `gaps:` entry.
- `pass-with-reviews` / per-state `review` → advisory `notes:` + partial section; surface stays on human-verify.
- `pass` → machine-verified; the verifier removes that surface from its Step 9 human-verification list.

Report path: `.planning/objectives/<obj>/evidence/ui_eval/ui-eval-report.json`.
</step>

</process>

<success_criteria>
- [ ] Objective dir resolved and ui_eval manifest located (or SKIPPED recorded cleanly)
- [ ] Each non-skipped state captured (screenshot + Shape-B capture JSON) into evidence/ui_eval/
- [ ] `df-tools verify flutter-ui-eval` run; scoreRun rollup parsed
- [ ] Per-state `*.judge.json` + `ui-eval-report.json` written to evidence/ui_eval/
- [ ] Verdict→action mapping applied (fail→gaps, review→notes, pass→drop from human-verify)
- [ ] No hard fail on missing/invalid manifest — falls through with SKIPPED
</success_criteria>
