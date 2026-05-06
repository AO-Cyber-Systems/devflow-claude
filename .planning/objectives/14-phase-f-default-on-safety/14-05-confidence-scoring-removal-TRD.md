---
objective: 14-phase-f-default-on-safety
trd: "05"
type: standard
wave: 3
depends_on:
  - "14-02"
files_modified:
  - plugins/devflow/devflow/references/trd-spec.md
  - plugins/devflow/devflow/references/auto-behaviors.md
  - plugins/devflow/agents/executor.md
  - plugins/devflow/agents/planner.md
  - plugins/devflow/devflow/bin/lib/frontmatter.cjs
  - plugins/devflow/devflow/bin/lib/intent.cjs
  - plugins/devflow/devflow/templates/trd-prompt.md
  - plugins/devflow/devflow/bin/df-tools.test.cjs
autonomous: true
requirements:
  - F5
must_haves:
  truths:
    - "TRD frontmatter no longer requires confidence field"
    - "In-flight TRDs with confidence: high|medium|low still parse without error"
    - "Frontmatter validate against new 'trd' schema returns valid:true with or without confidence present"
    - "Executor branches on per-task caution attribute, not on TRD-level confidence"
    - "auto-behaviors.md no longer has confidence-based-model-overrides section"
    - "trd-spec.md and templates/trd-prompt.md frontmatter table no longer list confidence as required"
    - "Per-task caution attribute (single allowed value: pause-before-destructive) is documented"
    - "intent.cjs no longer pulls confidence into the resolved config (or pulls it as a parsed-but-unused field for back-compat)"
    - "Discovery and research-finding confidence levels (different feature) remain UNCHANGED"
  artifacts:
    - path: "plugins/devflow/devflow/references/trd-spec.md"
      provides: "TRD spec without confidence requirement; with caution attribute documented"
      contains: "caution"
    - path: "plugins/devflow/devflow/references/auto-behaviors.md"
      provides: "Auto-behaviors without confidence-model overrides; with caution semantics documented"
      contains: "caution"
    - path: "plugins/devflow/agents/executor.md"
      provides: "Executor with caution-based pause logic; no confidence branching in execute_tasks"
      contains: "caution"
    - path: "plugins/devflow/devflow/bin/lib/frontmatter.cjs"
      provides: "FRONTMATTER_SCHEMAS now has 'trd' schema (does NOT require confidence)"
      contains: "trd:"
    - path: "plugins/devflow/devflow/bin/lib/intent.cjs"
      provides: "intent resolver no longer surfaces confidence as a real resolution; back-compat parse only"
      contains: "intent"
    - path: "plugins/devflow/devflow/templates/trd-prompt.md"
      provides: "TRD template no longer lists confidence in example/required-fields"
    - path: "plugins/devflow/devflow/bin/df-tools.test.cjs"
      provides: "Back-compat test: confidence field present is accepted; absent is also accepted"
      contains: "back-compat"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/frontmatter.cjs"
      to: "FRONTMATTER_SCHEMAS.trd"
      via: "schema definition"
      pattern: "FRONTMATTER_SCHEMAS"
    - from: "plugins/devflow/agents/executor.md"
      to: "caution attribute"
      via: "execute_tasks step"
      pattern: "caution"
    - from: "plugins/devflow/devflow/bin/lib/intent.cjs"
      to: "TRD frontmatter confidence field"
      via: "resolve() step (back-compat parse only)"
      pattern: "confidence"
---

<objective>
Drop the per-TRD `confidence: high|medium|low` frontmatter field from the required schema. Remove confidence-based execution branching from `executor.md` and confidence-model overrides from `auto-behaviors.md`. Replace with an explicit per-task `caution="pause-before-destructive"` attribute (opt-in, narrow semantics).

**Back-compat is a hard requirement.** In-flight TRDs that still carry `confidence` in frontmatter MUST continue to parse without error or warning. The validator drops the field from `required`, but still accepts its presence.

Purpose: F5 from issue #31. Per session analysis, confidence scoring rarely affects execution behavior — most TRDs end up `high`. The field is overhead. Replacing with a per-task explicit caution flag is more honest about what the machinery actually does.

**Out of scope (do not touch):**
- The job-checker `<confidence_scoring>` 1-10 plan-quality score (different feature, agent-emitted, surfaced in checker output)
- `templates/discovery.md` and `templates/research.md` confidence levels (research/source-verification confidence — also a different feature)
- `references/research-tooling.md` HIGH/MEDIUM/LOW confidence (source-verification feature)
</objective>

<file_tree>
plugins/devflow/devflow/
├── references/
│   ├── trd-spec.md                                ← MODIFY (drop confidence row + section)
│   └── auto-behaviors.md                          ← MODIFY (drop overrides section, add caution doc)
├── agents/
│   ├── executor.md                                ← MODIFY (replace confidence table with caution branching)
│   └── planner.md                                 ← MODIFY (drop confidence from required-fields list)
├── templates/
│   └── trd-prompt.md                              ← MODIFY (drop confidence from example + required-fields table)
└── bin/
    ├── lib/frontmatter.cjs                        ← MODIFY (add trd schema; do NOT require confidence)
    ├── lib/intent.cjs                             ← MODIFY (remove confidence resolution; back-compat parse-and-ignore)
    └── df-tools.test.cjs                          ← MODIFY (back-compat tests)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: existing FRONTMATTER_SCHEMAS in `lib/frontmatter.cjs` (line 225)

```js
const FRONTMATTER_SCHEMAS = {
  plan: { required: ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  summary: { required: ['objective', 'job', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['objective', 'verified', 'status', 'score'] },
};
```

**Add a new `trd` schema. Do NOT modify `plan` schema (back-compat for legacy JOB.md files).**

```js
const FRONTMATTER_SCHEMAS = {
  plan: { required: ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  trd:  { required: ['objective', 'trd', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  // Note: NO 'confidence' in trd.required. Field is accepted if present, but not required.
  summary: { required: ['objective', 'job', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['objective', 'verified', 'status', 'score'] },
};
```

### Pattern: existing intent.cjs confidence block (lines 357-359)

```js
// plugins/devflow/devflow/bin/lib/intent.cjs (around line 357)
if (trdFm.confidence) {
  config.confidence = trdFm.confidence;
  sources.confidence = 'TRD frontmatter';
}
```

Replace with:

```js
// F5: confidence scoring removed; per-task caution attribute replaces it.
// Back-compat: parse the field if present, but do NOT surface it in resolved config.
// Old TRDs with `confidence:` continue to load without error; the value is ignored.
if (trdFm.confidence !== undefined) {
  // intentionally ignored — see Phase F (issue #31 F5)
}
```

The block above keeps the parse path alive (so YAML loader does not flag unknown field), but stops contributing to resolved config. Tools that surface "resolved config" no longer claim confidence as a tier in the resolution chain.

### Pattern: existing confidence sections to remove

#### `agents/executor.md` lines ~63-71 (`<step name="execute_tasks">`)

```markdown
**Confidence-based execution (from TRD frontmatter):**

| Confidence | Behavior |
|---|---|
| `high` | Standard execution |
| `medium` | Extra verification at each task boundary, log verification results |
| `low` | Pause before destructive operations (file deletions, schema changes), extra verification, consider reading additional context |
```

Replace with:

```markdown
**Per-task caution attribute (F5):**

Tasks may declare a caution flag: `<task type="auto" caution="pause-before-destructive">`.

| Caution value | Behavior |
|---|---|
| `pause-before-destructive` | Pause before file deletions, schema drops, force pushes, mass-rewrites. Surface what will be destroyed; require confirmation. |
| (absent) | Standard execution. No caution behavior. |

Other values are warned and treated as absent. There is no TRD-level confidence flag — caution is per-task and opt-in.

**Back-compat:** TRDs may still carry a `confidence:` frontmatter field from in-flight planning. Ignore it — do not error, do not branch on it.
```

#### `references/auto-behaviors.md` lines ~45-54 (`## Confidence-Based Model Overrides`)

```markdown
## Confidence-Based Model Overrides

TRD confidence level affects execution model selection:

| Confidence | Executor Model | Behavior |
|---|---|---|
| `high` | Profile default | Standard execution |
| `medium` | Profile default | Extra verification at task boundaries |
| `low` | Upgrade to opus | Pause before destructive ops, extra verification |
```

Replace with:

```markdown
## Per-Task Caution Attribute (F5)

Tasks may declare `caution="pause-before-destructive"` — executor pauses before destructive operations within that task. There is no TRD-level confidence flag and no confidence-based model selection. Model is determined by profile + objective settings.

**Back-compat:** Legacy TRDs with `confidence: high|medium|low` in frontmatter parse without error; the field is ignored at execution time.
```

#### `references/trd-spec.md`

- Frontmatter example block (line ~14): remove `confidence: high              # high | medium | low`.
- Frontmatter required-fields table (line ~123): remove the `| confidence | Yes | ... |` row.
- `## Confidence Scoring` section (line ~138-143): remove entirely. Replace with brief `## Per-Task Caution` section.

#### `templates/trd-prompt.md`

- Line ~22 (frontmatter example): remove `confidence: high              # high | medium | low — based on research completeness`.
- Line ~172 (TRD-vs-JOB comparison table): remove `| Confidence | None | confidence: high\|medium\|low |` row.
- Lines ~186-194 (`## Confidence Scoring` section if present): remove entirely.
- Line ~204 (frontmatter required-fields table): remove `| confidence | Yes | ... |` row.

#### `agents/planner.md` lines 1020 and 1138

- Line 1020: drop `, confidence` from required-fields list.
- Line 1138: drop `, confidence` from success criteria checklist.

</codebase_examples>

<anti_patterns>
- DO NOT remove `confidence` field handling in `lib/frontmatter.cjs` `extractFrontmatter`. The field must continue to PARSE without error; only its REQUIRED status is dropped.
- DO NOT modify the existing `plan` schema. It's used by legacy JOB.md files; back-compat there is non-negotiable.
- DO NOT touch `agents/job-checker.md` `<confidence_scoring>` section — that's a different feature.
- DO NOT touch `templates/discovery.md` or `templates/research.md` — their confidence levels are research/source-verification (different feature).
- DO NOT touch `references/research-tooling.md` — its HIGH/MEDIUM/LOW confidence levels are source-verification.
- DO NOT introduce a new top-level `caution:` frontmatter field. The caution attribute is per-`<task>`, not per-TRD.
- DO NOT delete intent.cjs's confidence parse path entirely — keep the `trdFm.confidence !== undefined` check (back-compat).
- DO NOT cascade into removing `confidence` from prior TRDs' frontmatter on disk. Existing TRDs are immutable history; back-compat parsing covers them.
</anti_patterns>

<error_recovery>
- If after the edits, the validator fails on any in-flight TRD that has `confidence:` in frontmatter: back-compat is broken. Inspect the validator output — `confidence` should never appear in `missing`.
- If the executor errors on a TRD that omits `confidence:`: hard reference still exists. Grep `confidence` in `agents/executor.md` and remove all branches.
- If `npm test` regresses: the most likely culprit is intent.cjs tests asserting old `sources.confidence` resolution. Update intent.cjs tests as part of this TRD.
- If intent.cjs tests fail with `sources.confidence` undefined: the test still expects the old resolution. Either update the test to match new behavior (confidence not surfaced) OR keep intent.cjs surfacing with a deprecation note. Prefer the former — F5's intent is to remove the resolution.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/14-phase-f-default-on-safety/14-CONTEXT.md
@.planning/objectives/14-phase-f-default-on-safety/14-RESEARCH.md
@plugins/devflow/devflow/references/trd-spec.md
@plugins/devflow/devflow/references/auto-behaviors.md
@plugins/devflow/agents/executor.md
@plugins/devflow/agents/planner.md
@plugins/devflow/devflow/bin/lib/frontmatter.cjs
@plugins/devflow/devflow/bin/lib/intent.cjs
@plugins/devflow/devflow/templates/trd-prompt.md
</context>

<research_context>

From 14-RESEARCH.md § "F5 — Confidence scoring removal":

**Surface area (locked, plus two additions discovered during planning):**

| File | Change |
|---|---|
| `references/trd-spec.md` | Drop confidence row + section. Document `caution`. |
| `references/auto-behaviors.md` | Drop overrides section. Add `caution` doc. |
| `agents/executor.md` | Replace confidence table with caution-flag handling. |
| `agents/planner.md` | Drop "confidence" from required-frontmatter list AND success criteria. |
| `lib/frontmatter.cjs` | Add `trd` schema (without confidence requirement). |
| `lib/intent.cjs` | **(added)** Remove `confidence` resolution; keep parse-and-ignore for back-compat. |
| `templates/trd-prompt.md` | **(added)** Drop confidence from example, required-fields table, and Confidence Scoring section. |

**Caution attribute spec (locked):**

```
<task type="auto" caution="pause-before-destructive">
```

Single allowed value: `pause-before-destructive`. Absent → standard. Other values → ignored with warning.

**Back-compat strategy:**

- `extractFrontmatter` parses arbitrary keys — `confidence` parses fine.
- Validator: `cmdFrontmatterValidate(_, _, 'trd', _)` returns `valid:true` regardless of `confidence` presence.
- Executor: ignore `confidence` if present.
- intent.cjs: parse `confidence` if present; don't add to resolved config.
</research_context>

<gotchas>
- `agents/planner.md` is also touched by TRD 14-02 (Wave 2 — auto-research trigger insertion at `<step name="mandatory_discovery">`). 14-02 lands first; this TRD lands after. The two edit different sections; no diff conflict expected. Verify after rebase.
- `lib/intent.cjs` may have its own tests that assert `sources.confidence` is set when TRD has confidence. Check `lib/intent.test.cjs` for confidence-related test cases. If they exist, update them to match new behavior.
- `templates/trd-prompt.md` has THREE confidence touchpoints (lines 22, 172, ~190, 204). Use grep to find all of them — don't trust line numbers.
- `agents/job-checker.md` line ~291-331 has its own `<confidence_scoring>` section — OUT of scope. Sentinel: `grep -c "confidence" agents/job-checker.md` should return ≥ 1 after this TRD.
- `references/research-tooling.md` mentions `HIGH/MEDIUM/LOW confidence` for research findings — OUT of scope. Sentinel: `grep -c "confidence" references/research-tooling.md` should return ≥ 3 after this TRD.
- `templates/discovery.md` uses `<confidence level="...">` XML for discovery findings — OUT of scope.
- `templates/research.md` uses `(HIGH confidence)` / `(MEDIUM confidence)` for research source tiers — OUT of scope.
- Running `npm test` after each task within this TRD is critical — surface area is wide and easy to miss a regression.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add trd schema + back-compat tests in frontmatter.cjs</name>
  <files>plugins/devflow/devflow/bin/lib/frontmatter.cjs, plugins/devflow/devflow/bin/df-tools.test.cjs</files>
  <action>
Open `plugins/devflow/devflow/bin/lib/frontmatter.cjs`, locate `FRONTMATTER_SCHEMAS` (line ~225). Add the new `trd` schema entry:

```js
const FRONTMATTER_SCHEMAS = {
  plan: { required: ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  trd:  { required: ['objective', 'trd', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  summary: { required: ['objective', 'job', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['objective', 'verified', 'status', 'score'] },
};
```

`confidence` is intentionally absent from `trd.required`. The plan schema is unchanged.

Append a new `describe` block to `plugins/devflow/devflow/bin/df-tools.test.cjs`:

```js
describe('F5 confidence-field back-compat', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'df-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('trd schema does not require confidence field', () => {
    const trdPath = path.join(tmpDir, 'trd.md');
    fs.writeFileSync(trdPath,
      `---\nobjective: "14-phase-f"\ntrd: "01"\ntype: standard\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n  artifacts: []\n  key_links: []\n---\n\n# TRD\n`,
      'utf-8'
    );
    const out = execFileSync('node', [
      path.join(__dirname, 'df-tools.cjs'),
      'frontmatter', 'validate', trdPath, '--schema', 'trd', '--raw'
    ], { encoding: 'utf-8' });
    const result = JSON.parse(out);
    assert.strictEqual(result.valid, true, 'TRD without confidence must validate');
    assert.deepStrictEqual(result.missing, [], 'no fields should be missing');
  });

  test('trd schema accepts confidence field if present (back-compat)', () => {
    const trdPath = path.join(tmpDir, 'trd.md');
    fs.writeFileSync(trdPath,
      `---\nobjective: "14-phase-f"\ntrd: "01"\ntype: standard\nconfidence: high\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n  artifacts: []\n  key_links: []\n---\n\n# TRD\n`,
      'utf-8'
    );
    const out = execFileSync('node', [
      path.join(__dirname, 'df-tools.cjs'),
      'frontmatter', 'validate', trdPath, '--schema', 'trd', '--raw'
    ], { encoding: 'utf-8' });
    const result = JSON.parse(out);
    assert.strictEqual(result.valid, true, 'legacy TRD with confidence must still validate');
    assert.ok(!result.missing.includes('confidence'), 'confidence must not be a missing required field');
  });

  test('plan schema unchanged (legacy JOB.md still validates)', () => {
    const jobPath = path.join(tmpDir, 'job.md');
    fs.writeFileSync(jobPath,
      `---\nobjective: "test"\njob: "01"\ntype: standard\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n  artifacts: []\n  key_links: []\n---\n\n# JOB\n`,
      'utf-8'
    );
    const out = execFileSync('node', [
      path.join(__dirname, 'df-tools.cjs'),
      'frontmatter', 'validate', jobPath, '--schema', 'plan', '--raw'
    ], { encoding: 'utf-8' });
    const result = JSON.parse(out);
    assert.strictEqual(result.valid, true, 'plan schema must still accept JOB.md');
  });
});
```

Run: `npm test`
Expected: All tests pass, including three new back-compat tests.

Commit: `feat(14-05): add trd frontmatter schema with back-compat for confidence field`

# CRITICAL: plan schema UNCHANGED. Do not add `trd` to plan.required.
# CRITICAL: confidence INTENTIONALLY ABSENT from trd.required.
# PATTERN: execFileSync subprocess pattern — mirror existing tests.
  </action>
  <verify>
`grep -A 5 "FRONTMATTER_SCHEMAS = {" plugins/devflow/devflow/bin/lib/frontmatter.cjs | grep -c "trd:"` returns 1.
`grep "trd:.*required" plugins/devflow/devflow/bin/lib/frontmatter.cjs | grep -c "confidence"` returns 0.
`grep "F5 confidence-field back-compat" plugins/devflow/devflow/bin/df-tools.test.cjs` returns 1 match.
`npm test 2>&1 | tail -3` — full suite passes; no regressions.
  </verify>
  <done>
`FRONTMATTER_SCHEMAS.trd` exists; `confidence` not in `required`. `plan` schema unchanged. Three back-compat tests pass. Single commit landed.
  </done>
  <recovery>
If existing tests regress: check whether any test referenced `--schema trd` expecting different behavior. There shouldn't be any. Revert + re-add carefully.
If validator crashes: typo in schema definition. `node -c plugins/devflow/devflow/bin/lib/frontmatter.cjs`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Update intent.cjs to back-compat parse only</name>
  <files>plugins/devflow/devflow/bin/lib/intent.cjs</files>
  <action>
Open `plugins/devflow/devflow/bin/lib/intent.cjs`. Locate the confidence resolution block (around lines 357-359):

```js
if (trdFm.confidence) {
  config.confidence = trdFm.confidence;
  sources.confidence = 'TRD frontmatter';
}
```

Replace with the back-compat parse-and-ignore stub:

```js
// F5: confidence scoring removed (issue #31). Per-task `caution` attribute replaces TRD-level confidence.
// Back-compat: parse the field if present, but do NOT surface it in resolved config.
// Old TRDs with `confidence:` continue to load without error; the value is ignored.
if (trdFm.confidence !== undefined) {
  // intentionally ignored — see Phase F (issue #31 F5)
}
```

Check whether `lib/intent.test.cjs` (or `intent.test.cjs` if co-located differently) references `confidence`:

```bash
grep -n "confidence" plugins/devflow/devflow/bin/lib/intent*.test.cjs 2>&1 || true
```

If matching tests exist:
- Update them to assert that `result.config.confidence` is `undefined` AND `result.sources.confidence` is `undefined` (or absent), even when the TRD has `confidence: high`.
- This shows the field is parsed (no error) but not surfaced.

Run: `npm test`
Expected: Full suite passes. If intent tests previously asserted confidence resolution, they now assert non-resolution (back-compat behavior).

Commit: `feat(14-05): drop confidence resolution from intent.cjs; preserve back-compat parse`

# CRITICAL: Keep the `if (trdFm.confidence !== undefined)` check — removing it entirely could trigger YAML strict-mode warnings on unknown fields. Empty body is fine; the parser path stays alive.
# CRITICAL: Do NOT remove `config.confidence` references from any OTHER part of intent.cjs without grep — there may be downstream uses. Grep all occurrences first.
# GOTCHA: `intent resolve` CLI command output structure may include `sources.confidence`. After this change, that key is absent — that's the correct new behavior.
# PATTERN: Mirror the existing comment style in intent.cjs (lines have `// F<N>:` references in a few places).
  </action>
  <verify>
`grep -n "confidence" plugins/devflow/devflow/bin/lib/intent.cjs` shows ONLY the back-compat parse-and-ignore block + comment(s) — no `config.confidence = ...` line.
`grep -c "config.confidence = trdFm.confidence" plugins/devflow/devflow/bin/lib/intent.cjs` returns 0.
`grep -c "intentionally ignored" plugins/devflow/devflow/bin/lib/intent.cjs` returns ≥ 1.
`npm test 2>&1 | tail -3` — no regressions; if intent.test.cjs exists, its updated assertions pass.
`node plugins/devflow/devflow/bin/df-tools.cjs intent resolve --objective 14 --raw 2>/dev/null | jq '.sources.confidence // "absent"'` prints `"absent"` (or null) — confidence no longer surfaces in resolution.
  </verify>
  <done>
intent.cjs's confidence resolution removed; back-compat parse-and-ignore block remains. intent.test.cjs (if it had confidence assertions) updated to match new behavior. Full suite passes. Single commit landed.
  </done>
  <recovery>
If `npm test` regresses with errors mentioning `sources.confidence` or `config.confidence`: a downstream test still expects the OLD resolution. Find via `grep -rn "config.confidence\|sources.confidence" plugins/devflow/` and update assertions.
If `df-tools intent resolve` crashes: the parse path may be referenced elsewhere. Check for `config.confidence` references throughout intent.cjs — those should be removed too OR guarded.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Edit references, agent prompts, and TRD template (drop confidence, add caution)</name>
  <files>plugins/devflow/devflow/references/trd-spec.md, plugins/devflow/devflow/references/auto-behaviors.md, plugins/devflow/agents/executor.md, plugins/devflow/agents/planner.md, plugins/devflow/devflow/templates/trd-prompt.md</files>
  <action>
Apply the surgical edits documented in `<codebase_examples>` above. Five files, each gets a targeted change:

**1. `plugins/devflow/devflow/references/trd-spec.md`:**
- Frontmatter example block: remove `confidence: high              # high | medium | low` line.
- Frontmatter required-fields table: remove the `| confidence | Yes | ... |` row.
- `## Confidence Scoring` section: remove heading + content. Replace with brief `## Per-Task Caution` section (see codebase_examples).

**2. `plugins/devflow/devflow/references/auto-behaviors.md`:**
- `## Confidence-Based Model Overrides` section (heading + table): remove.
- Add `## Per-Task Caution Attribute (F5)` section in its place (see codebase_examples).

**3. `plugins/devflow/agents/executor.md`:**
- `<step name="execute_tasks">` confidence table (lines ~63-71): replace with caution-attribute table.
- Line ~39 (Parse comment): change `Parse: frontmatter (objective, trd, type, autonomous, wave, depends_on, confidence)` → `Parse: frontmatter (objective, trd, type, autonomous, wave, depends_on)`. Drop trailing `, confidence`.

**4. `plugins/devflow/agents/planner.md`:**
- Line ~1020: drop `, confidence` from required-fields list.
- Line ~1138: drop `, confidence` from success criteria checklist.

**5. `plugins/devflow/devflow/templates/trd-prompt.md`:**
- Line ~22 (frontmatter example): remove `confidence: high              # high | medium | low — based on research completeness`.
- Line ~172 (TRD-vs-JOB comparison table): remove the `| Confidence | None | confidence: high\|medium\|low |` row.
- Lines ~186-194 (`## Confidence Scoring` section if present): remove heading + content.
- Line ~204 (frontmatter required-fields table): remove `| confidence | Yes | ... |` row.

Run: `npm test`
Expected: No regressions.

Sentinel grep checks (must all pass):

```bash
# These MUST be 0 (confidence removed from per-TRD field semantics)
grep -c "confidence" plugins/devflow/agents/executor.md
grep -c "confidence" plugins/devflow/devflow/references/trd-spec.md
grep -c "confidence" plugins/devflow/devflow/references/auto-behaviors.md
grep -c "confidence" plugins/devflow/devflow/templates/trd-prompt.md
grep "objective, trd, type" plugins/devflow/agents/planner.md | grep -c "confidence"

# These MUST be > 0 (out-of-scope features remain UNCHANGED)
grep -c "confidence" plugins/devflow/agents/job-checker.md          # ≥ 1
grep -c "confidence" plugins/devflow/devflow/references/research-tooling.md  # ≥ 3
grep -c "confidence" plugins/devflow/devflow/templates/discovery.md  # ≥ 1
grep -c "confidence" plugins/devflow/devflow/templates/research.md   # ≥ 1
```

Commit: `feat(14-05): drop confidence frontmatter; add per-task caution attribute`

# CRITICAL: After this task, ONLY out-of-scope confidence references remain (job-checker plan-quality score, research-finding confidence, discovery confidence). Verify via the sentinel grep checks.
# CRITICAL: Use the Edit tool for surgical changes. Do NOT regenerate entire files.
# CRITICAL: Verify line-number drift before each edit. Find by content (heading, table row text), not by line number.
# GOTCHA: When removing a markdown table row, also check whether removing it leaves a header row + separator with no body — in which case the entire table can be removed.
# GOTCHA: When removing a heading + section, also remove blank lines that would create double-blanks.
# PATTERN: Use Read tool to inspect before each Edit. Look for the exact string. Edit replaces by exact-string match.
  </action>
  <verify>
Sentinel check 1 — must all be 0:
- `grep -c "confidence" plugins/devflow/agents/executor.md` → 0
- `grep -c "confidence" plugins/devflow/devflow/references/trd-spec.md` → 0
- `grep -c "confidence" plugins/devflow/devflow/references/auto-behaviors.md` → 0
- `grep -c "confidence" plugins/devflow/devflow/templates/trd-prompt.md` → 0

Sentinel check 2 — must remain > 0 (out-of-scope unchanged):
- `grep -c "confidence" plugins/devflow/agents/job-checker.md` → ≥ 1
- `grep -c "confidence" plugins/devflow/devflow/references/research-tooling.md` → ≥ 3
- `grep -c "confidence" plugins/devflow/devflow/templates/discovery.md` → ≥ 1
- `grep -c "confidence" plugins/devflow/devflow/templates/research.md` → ≥ 1

Caution semantics added:
- `grep -c "Per-Task Caution" plugins/devflow/devflow/references/trd-spec.md` → 1
- `grep -c "caution" plugins/devflow/agents/executor.md` → ≥ 2
- `grep -c "caution" plugins/devflow/devflow/references/auto-behaviors.md` → ≥ 1

Test suite: `npm test 2>&1 | tail -3` — no regressions.
  </verify>
  <done>
- 5 files edited with surgical scope.
- All sentinel grep checks pass (in-scope = 0 confidence; out-of-scope = unchanged).
- Caution attribute documented in trd-spec.md, auto-behaviors.md, executor.md.
- Single commit with `feat(14-05):` prefix covers all five file changes.
  </done>
  <recovery>
If a sentinel-1 grep returns > 0: there's a leftover reference. `grep -n "confidence" <file>` to locate, remove.
If a sentinel-2 grep returns 0: you over-deleted. `git checkout plugins/devflow/<path>` to restore, retry.
If npm test regresses: a test asserts old executor.md / trd-spec.md text. Find failing test, update assertion.
If line-number drift makes edits hit wrong content: re-Read the file, locate by exact heading text, Edit by exact-string match.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `FRONTMATTER_SCHEMAS.trd` exists; does not require `confidence`
- TRD with `confidence: high` validates (back-compat); TRD without validates (new normal)
- `plan` schema unchanged
- intent.cjs no longer surfaces confidence in resolved config; parse path preserved for back-compat
- `executor.md`, `trd-spec.md`, `auto-behaviors.md`, `planner.md`, `templates/trd-prompt.md` no longer reference per-TRD confidence
- `job-checker.md`, `research-tooling.md`, `templates/discovery.md`, `templates/research.md` UNCHANGED (sentinel greps confirm)
- All tests pass; no regressions
</verification>

<success_criteria>
- [ ] `lib/frontmatter.cjs` has new `trd` schema; `plan` schema unchanged
- [ ] Three back-compat tests added and pass
- [ ] `lib/intent.cjs` no longer surfaces confidence in resolved config; parse-and-ignore preserved
- [ ] `references/trd-spec.md`, `references/auto-behaviors.md`: confidence sections removed; caution sections added
- [ ] `agents/executor.md`: confidence table replaced with caution table; Parse comment updated
- [ ] `agents/planner.md`: confidence dropped from required-fields list and success criteria
- [ ] `templates/trd-prompt.md`: confidence dropped from example, comparison table, scoring section, required-fields table
- [ ] `agents/job-checker.md`, `references/research-tooling.md`, `templates/discovery.md`, `templates/research.md`: UNCHANGED
- [ ] Three commits: schema+tests / intent.cjs / prompt edits
- [ ] All tests pass
</success_criteria>

<output>
After completion, create `.planning/objectives/14-phase-f-default-on-safety/14-05-SUMMARY.md`. Include:
- Three commit hashes
- Test count delta
- Sentinel grep results (in-scope = 0, out-of-scope > 0) as a table
- Sample run: `df-tools frontmatter validate <some-in-flight-TRD-with-confidence> --schema trd --raw` showing valid:true
- Sample run: `df-tools intent resolve --objective 14 --raw | jq '.sources'` showing no `confidence` key
</output>
