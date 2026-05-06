---
objective: 14-phase-f-default-on-safety
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/templates/config.json
  - plugins/devflow/devflow/bin/df-tools.test.cjs
autonomous: true
requirements:
  - F1-CONFIG
  - F4
must_haves:
  truths:
    - "Fresh DevFlow project initialized via templates/config.json starts with job_checker_enabled: true"
    - "build.md § 8 still spawns the dedicated verifier (Phase D acceptance preserved)"
    - "Regression test asserts both invariants and lives in df-tools.test.cjs"
  artifacts:
    - path: "plugins/devflow/devflow/templates/config.json"
      provides: "Fresh-project default config with job_checker_enabled: true"
      contains: "\"job_checker_enabled\""
    - path: "plugins/devflow/devflow/bin/df-tools.test.cjs"
      provides: "Phase F config + F4 acceptance regression test"
      contains: "Phase F config defaults"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.test.cjs"
      to: "plugins/devflow/devflow/templates/config.json"
      via: "fs.readFileSync + JSON.parse assertion"
      pattern: "config\\.json"
    - from: "plugins/devflow/devflow/bin/df-tools.test.cjs"
      to: "plugins/devflow/devflow/workflows/build.md"
      via: "fs.readFileSync + grep assertion (mirrors existing Phase D test)"
      pattern: "subagent_type=\"verifier\""
---

<objective>
Flip the fresh-project config default to `job_checker_enabled: true` (F1 config side) and add a regression test that asserts both this default AND the Phase D verifier-wiring invariant in `build.md` § 8 (F4 acceptance).

Purpose: Defaults are only safety nets if they ship that way for new users. The cheap CLI checker (TRD 14-01) is the cost amortization that makes default-on viable. F4 is satisfied by Phase D / objective 11 — this TRD adds a guard so future edits cannot silently un-wire the verifier.

Output: One-line config change + one regression test block. ~5 minute task. Standard (not TDD) because the config flip is a single boolean and the test is mechanical static-assert mirroring existing patterns.
</objective>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: existing Phase D regression test in `df-tools.test.cjs`

The Phase D / objective 11 SUMMARY confirms a regression test block exists asserting `build.md` § 8 wires the verifier. The new test block here mirrors that pattern exactly:

```js
// plugins/devflow/devflow/bin/df-tools.test.cjs
describe('Phase D verifier wiring', () => {
  test('build.md § 8 spawns dedicated verifier', () => {
    const buildMd = fs.readFileSync(
      path.join(__dirname, '..', 'workflows', 'build.md'),
      'utf-8'
    );
    assert.ok(/subagent_type="verifier"/.test(buildMd),
      'build.md must spawn verifier in § 8');
    assert.ok(/model="\{verifier_model\}"/.test(buildMd),
      'verifier spawn must use {verifier_model}');
  });
});
```

Apply the same shape for the new Phase F config test.

### Pattern: current `templates/config.json` (relevant excerpt)

```json
{
  "mode": "yolo",
  "depth": "standard",
  "workflow": {
    "research": true,
    "job_check": true,
    "verifier": true,
    "auto_advance": true
  },
  ...
}
```

The `workflow.job_check` field is the canonical name in current installed config. The issue #31 spec uses `job_checker_enabled` — verify which name is the source of truth and update accordingly. The init bootstrap at `lib/init.cjs` reads `job_checker_enabled` (per `init.cjs`'s output keys); see `df-tools init plan-objective` JSON which contains `job_checker_enabled: true` in the live system. **The discrepancy is real:** the source-of-truth name is `job_checker_enabled` (init reads it; agents read it). The template currently has `workflow.job_check` instead. Reconcile during this task — see action below.

</codebase_examples>

<anti_patterns>
- DO NOT edit `build.md`. Phase D / objective 11 already wired the verifier; this TRD only adds a regression test.
- DO NOT change other config defaults beyond what's needed for F1. Scope creep here is high-risk because config.json is project-wide.
- DO NOT add new fields to config.json. Only flip the existing `job_checker_enabled` (or rename `workflow.job_check` → `job_checker_enabled` if reconciliation is needed).
- DO NOT regenerate any existing project's config.json. The change is to the **template** consumed by future `/devflow:new-project` only.
</anti_patterns>

<error_recovery>
- If `templates/config.json` already has `job_checker_enabled: true` (because it was set in a previous session): mark Task 1 as no-op in SUMMARY, still run the regression test to confirm. The test remains valuable as a regression guard.
- If `build.md` no longer spawns the verifier when the test runs (i.e. someone reverted Phase D): STOP, do not proceed. This is a critical regression — file a gap and escalate; do not paper over it.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/14-phase-f-default-on-safety/14-CONTEXT.md
@.planning/objectives/14-phase-f-default-on-safety/14-RESEARCH.md
@.planning/objectives/11-phase-d-verifier-wiring/11-01-SUMMARY.md
@plugins/devflow/devflow/templates/config.json
@plugins/devflow/devflow/workflows/build.md
@plugins/devflow/devflow/bin/df-tools.test.cjs
</context>

<research_context>

From 14-RESEARCH.md § "F4 acceptance check (Phase D status)":

**Source of truth:** `plugins/devflow/devflow/workflows/build.md` § 8.

Confirmed wiring lines (read 2026-05-04 from this branch):
- Line 178: "First, spawn dedicated verifier as backstop."
- Line 195: `subagent_type="verifier",`
- Line 196: `model="{verifier_model}"`

Phase D regression tests in `df-tools.test.cjs` already assert these. **Acceptance ruling: F4 is satisfied. No build.md edits.**

For F1-CONFIG: the template consumed by `/devflow:new-project` is `plugins/devflow/devflow/templates/config.json`. Currently it has `workflow.job_check: true` but the canonical key (per `df-tools init`) is `job_checker_enabled`. Reconcile during this TRD.
</research_context>

<gotchas>
- Two different naming conventions in play: `workflow.job_check` (in current template) vs `job_checker_enabled` (top-level, in init bootstrap output). The source of truth is `job_checker_enabled` — that is what `df-tools init` returns and what agents read. If the template has `workflow.job_check` only, fresh projects do NOT get `job_checker_enabled: true` set anywhere. **This is a latent bug** that F1 quietly fixes.
- Verify by inspection: open `plugins/devflow/devflow/bin/lib/init.cjs` and confirm where it reads/defaults `job_checker_enabled`. The default in init.cjs may already be `true` when the field is absent — meaning F1 may be a no-op functionally. Even so, ship the explicit field in the template for clarity and future-proofing.
- `df-tools init plan-objective` for THIS objective returned `"job_checker_enabled": true` — confirm the source (config.json field, init.cjs default, or environment override).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Update templates/config.json defaults</name>
  <files>plugins/devflow/devflow/templates/config.json</files>
  <action>
Read `plugins/devflow/devflow/templates/config.json`. Read `plugins/devflow/devflow/bin/lib/init.cjs` to confirm the source-of-truth name (`job_checker_enabled` vs `workflow.job_check`).

Apply the minimal change that makes the issue #31 acceptance criterion true: **fresh projects get `job_checker_enabled: true` from the template.**

Two variants depending on what init.cjs reads:

Variant A (init reads top-level `job_checker_enabled`):
```json
{
  "mode": "yolo",
  "depth": "standard",
  "job_checker_enabled": true,
  "workflow": { ... existing fields ... },
  ...
}
```

Variant B (init reads `workflow.job_check`):
```json
{
  "workflow": {
    "research": true,
    "job_check": true,    // already true in current template
    ...
  }
}
```

If Variant B is already true (no change needed), still add explicit top-level `job_checker_enabled: true` to make the surface match what agents query (defensive). If Variant A applies, the field may be missing entirely — add it.

Run: `node -e "const c = require('./plugins/devflow/devflow/templates/config.json'); console.log(JSON.stringify({ job_checker_enabled: c.job_checker_enabled, workflow_job_check: c.workflow && c.workflow.job_check }))"`
Expected: At least one of the two surfaces is `true` and matches what agents read.

# CRITICAL: Do NOT edit any other field. Scope is one boolean (or its addition).
# GOTCHA: config.json is consumed by `/devflow:new-project` template install. Existing user projects already have their own copy and are unaffected.
# PATTERN: Mirror the existing JSON formatting (2-space indent, trailing newline).
  </action>
  <verify>
`grep -c "job_checker_enabled" plugins/devflow/devflow/templates/config.json` returns ≥ 1.
`node -e "console.log(require('./plugins/devflow/devflow/templates/config.json').job_checker_enabled)"` prints `true`, OR if init.cjs reads `workflow.job_check`, that field is `true` AND a top-level alias is also present.
`git diff plugins/devflow/devflow/templates/config.json` shows ONLY changes to job_checker enablement (single field add or boolean flip).
  </verify>
  <done>
templates/config.json explicitly sets `job_checker_enabled: true` at the surface that init.cjs reads. No other fields changed. JSON parses cleanly. The diff is minimal (1-3 lines added/changed).
  </done>
  <recovery>
If JSON parse fails after edit: `git checkout plugins/devflow/devflow/templates/config.json` and re-edit using a JSON-aware tool (jq) — `cat config.json | jq '. + {job_checker_enabled: true}' > /tmp/c.json && mv /tmp/c.json config.json`.
If accidentally edited other fields: `git diff` and revert non-target hunks via `git checkout -p`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Add regression test for Phase F config + F4 acceptance</name>
  <files>plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
Append a new `describe` block to `plugins/devflow/devflow/bin/df-tools.test.cjs` that asserts BOTH:

1. **Phase F config defaults** — fresh template has `job_checker_enabled: true` (whichever surface init.cjs reads).
2. **F4 acceptance (Phase D regression preserved)** — re-asserts the existing Phase D invariants in `build.md` § 8. This is a belt-and-suspenders duplicate of the existing Phase D test, intentionally placed under Phase F to make the F4 acceptance check explicit and discoverable.

Test block:

```js
describe('Phase F config defaults + F4 acceptance', () => {
  test('templates/config.json defaults job_checker_enabled to true', () => {
    const cfgPath = path.join(__dirname, '..', 'templates', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    // Source-of-truth surface: top-level job_checker_enabled OR workflow.job_check
    const value = cfg.job_checker_enabled ?? (cfg.workflow && cfg.workflow.job_check);
    assert.strictEqual(value, true,
      'Fresh-project template must default job_checker_enabled (or workflow.job_check) to true per issue #31 F1');
  });

  test('F4 acceptance: build.md § 8 still spawns dedicated verifier', () => {
    const buildPath = path.join(__dirname, '..', 'workflows', 'build.md');
    const buildMd = fs.readFileSync(buildPath, 'utf-8');
    assert.ok(/subagent_type="verifier"/.test(buildMd),
      'F4 regressed: build.md must still spawn verifier (Phase D wiring)');
    assert.ok(/model="\{verifier_model\}"/.test(buildMd),
      'F4 regressed: verifier spawn must use {verifier_model}');
    // F4 also requires the spawn to be in § 8
    assert.ok(/## 8\. Auto-Verify \+ Complete/.test(buildMd),
      'F4 regressed: § 8 header missing');
  });
});
```

Run: `npm test`
Expected: 1471 + 2 new tests pass, 0 failures.

Commit: `feat(14-04): default job_checker_enabled to true and assert F4 acceptance`

# CRITICAL: This block is a static-assert pattern — no execution, no agent spawn. Mirrors Phase D test exactly.
# GOTCHA: Use `??` for null-coalescing — covers both surface variants in one assertion.
# PATTERN: Tests live at end of df-tools.test.cjs; follow existing `describe` placement order.
  </action>
  <verify>
`npm test 2>&1 | grep -E "Phase F config|F4 acceptance"` shows both new test names.
`npm test 2>&1 | tail -5` shows pass count = baseline + 2 (or +5 if 14-01 also landed in same wave; either way, no failures).
`grep -c "Phase F config defaults" plugins/devflow/devflow/bin/df-tools.test.cjs` returns 1.
`grep -c "F4 acceptance" plugins/devflow/devflow/bin/df-tools.test.cjs` returns ≥ 1.
  </verify>
  <done>
df-tools.test.cjs has new `describe('Phase F config defaults + F4 acceptance', ...)` block with two passing tests. Total test count increased by 2 (or more if Wave 1 sibling 14-01 also landed). No regressions. Single commit with `feat(14-04):` prefix covers both file changes.
  </done>
  <recovery>
If the F4 assertion fails: this is a CRITICAL regression of Phase D. Do NOT modify the assertion to match a broken state. Instead: STOP, file a gap, escalate. The test is correct; the regression is in build.md.
If the config assertion fails: re-check Task 1's output; verify `value` extraction logic matches what was actually written to config.json.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Fresh-project config template has `job_checker_enabled: true` (or canonical equivalent)
- Phase D verifier-wiring invariants still hold (build.md § 8 spawns verifier)
- Two new regression tests pass; no regressions in 1471 baseline
</verification>

<success_criteria>
- [ ] `templates/config.json` explicitly sets `job_checker_enabled: true` at the canonical surface
- [ ] `df-tools.test.cjs` has new "Phase F config defaults + F4 acceptance" describe block
- [ ] Both new tests pass
- [ ] No regressions in existing test suite
- [ ] Single commit with `feat(14-04):` prefix
</success_criteria>

<output>
After completion, create `.planning/objectives/14-phase-f-default-on-safety/14-04-SUMMARY.md`. Include:
- The exact diff applied to config.json
- Test count delta
- Confirmation that Phase D regression test STILL passes (run it explicitly: `npm test 2>&1 | grep -E "Phase D verifier wiring"`)
- Whether Variant A or Variant B (or both) was the chosen surface
</output>
