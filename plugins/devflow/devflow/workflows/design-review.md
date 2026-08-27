---
status: active
---
<purpose>
Run the ADVISORY UI design-critique sweep on a Flutter surface (or whole objective): capture (or reuse) each declared UI state, critique it against the project design system through the already-shipped design-critic engine (`flutter-ui-design-review.cjs`), and present a prioritized design-debt list.

This is the HEAVY first-run that produces a ranked design-debt backlog. Where `ui-eval` answers "is this screen BROKEN?" and gates CI, this sweep answers "is this GOOD design, and how do we improve it?" — and NEVER gates. High-priority design-debt items feed the objective-work loop as candidate todos / future UI objectives.
</purpose>

<philosophy>
**Advisory, anchored, never a gate.**

The critique is ANCHORED — not open-ended. Every finding cites the violated design-system token (e.g. `EdenSpacing.space4=16`, `Outfit headlineLarge`, `gold #D4A853`, `WCAG AA`), UX heuristic, or the page's `design_intent`. No anchorless platitudes ("add more whitespace").

The engine emits an ADVISORY rollup ONLY — `advisory:true` always, never a pass/fail verdict:

- `high` priority debt → a material usability/brand problem. Surface it FIRST; it becomes a candidate todo / a future UI objective.
- `medium` priority debt → a noticeable polish gap. Track it in the backlog.
- `low` priority debt → a nitpick. Record but don't prioritize.

The engine runs ONE qualitative critique per state (NOT N-voted — design critique is a single pass, unlike the defect judge's N-sample voting). It resolves the vision model via `references/model-profiles.json` (`df-ui-evaluator`) — the agent never picks a model id. Without `--live` or a credential, every state is recorded as skipped (a clear "live critique required" note) and NO network call occurs.
</philosophy>

<process>

<step name="initialize" priority="first">
Resolve the objective directory and locate the design-review manifest.

```bash
# Objective passed as $ARGUMENTS (objective id) or a direct manifest path.
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init verify-work "${ARGUMENTS}" 2>/dev/null)
OBJECTIVE_DIR=$(echo "$INIT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).objective_dir||"")}catch{console.log("")}})')
```

Locate the manifest, in priority order:
1. A manifest path passed directly in `$ARGUMENTS` (ends in `.json`).
2. The objective's own manifest: `.planning/objectives/<obj>/evidence/ui_eval/manifest.json`.
3. The consumer repo's manifests: `flutter/ui_eval/manifests/*.json`.

The manifest declares each state (`state_id`, `surface`, `screenshot_path`, `design_intent`) and a top-level `design_system_path` — the reference anchor TEXT, resolved relative to the manifest dir. (For eden-biz the anchor lives at `flutter/ui_eval/design-system.md`.)

If no manifest is found, record `SKIPPED (no design-review manifest)` and exit cleanly — never a hard fail.
</step>

<step name="capture">
Capture or REUSE screenshots for each declared state. If the manifest's `screenshot_path`s already exist (e.g. captured by a prior `ui-eval` run), reuse them — the design sweep does not require fresh pixels.

For states needing capture, run the Playwright web capture adapter:

```bash
mkdir -p .planning/objectives/$OBJECTIVE_DIR/evidence/ui_eval/
```

For each manifest state with a `surface`/route:
- `browser_navigate(url=...)` against the running dev surface (`flutter run -d chrome` with `?enable-semantics=true`).
- `browser_wait_for(text="<landmark>")` — never a fixed sleep.
- `browser_take_screenshot()` → save to the state's `screenshot_path`.
</step>

<step name="critique">
Run the design-critic engine arm against the manifest. This is the LIVE critique pass — one qualitative critique per state:

```bash
DESIGN=$(node ~/.claude/devflow/bin/df-tools.cjs flutter-ui design-review "<manifest-path>" --live --raw)
```

The engine resolves the `design_system_path` anchor TEXT, critiques each state against it + the page `design_intent` + UX heuristics, aggregates the findings into a prioritized debt list (high→low), and writes:
- `design-review-report.md` — the human-readable design-debt report.
- `design-review-report.json` — the aggregate (debt[], counts, byDimension, total).
both next to the manifest.

Rollup shape: `{ manifest_path, live, model, judge:'design-critic', advisory:true, total, counts, byDimension, usage, skipped[], report_path }`.

Notes:
- Without `--live` or a credential (`ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN`+`ANTHROPIC_BASE_URL`), every state is reported in `skipped[]` with a "live critique required" note and NO network call occurs.
- On `{ error: ... }` (manifest not found / invalid) → record `SKIPPED (no design-review manifest)` and fall through; never a hard fail.
- `advisory:true` is ALWAYS set. There is NEVER a pass/fail verdict.
</step>

<step name="report">
Present the prioritized design-debt report from `design-review-report.md`, highest priority first.

Frame it explicitly as ADVISORY:
- State clearly: "This is an advisory design critique — it does NOT gate."
- Surface the `high`-priority debt items first. Call them out as candidate todos / future UI objectives that feed the objective-work loop.
- Summarize `counts` (high/medium/low) and `byDimension`.
- List any `skipped[]` states (and why — e.g. no credential).

Report path: `<manifest-dir>/design-review-report.md`.

The high-priority items are the actionable output: they become `/devflow:add-todo` candidates or scope for a future UI-polish objective. The sweep itself never blocks any other workflow.
</step>

</process>

<success_criteria>
- [ ] Objective dir resolved and design-review manifest located (or SKIPPED recorded cleanly)
- [ ] Screenshots captured OR reused for each declared state
- [ ] `df-tools flutter-ui design-review <manifest> --live --raw` run; advisory rollup parsed
- [ ] `design-review-report.md` + `design-review-report.json` written next to the manifest
- [ ] Prioritized design-debt list presented high→low, framed as ADVISORY (never a gate)
- [ ] High-priority items surfaced as candidate todos / future UI objectives for the objective-work loop
- [ ] No hard fail on missing/invalid manifest — falls through with SKIPPED
</success_criteria>
