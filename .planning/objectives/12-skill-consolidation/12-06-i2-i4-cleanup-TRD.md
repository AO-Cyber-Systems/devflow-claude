---
objective: 12-skill-consolidation
trd: 06
type: standard
confidence: medium
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/decimal-survey.cjs
  - plugins/devflow/devflow/bin/lib/decimal-survey.test.cjs
  - plugins/devflow/devflow/bin/lib/templates.cjs
  - plugins/devflow/devflow/bin/lib/templates.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/templates/summary-minimal.md
  - plugins/devflow/devflow/templates/summary-standard.md
  - plugins/devflow/devflow/templates/summary-complex.md
  - .planning/objectives/12-skill-consolidation/12-RESEARCH.md
autonomous: true
requirements:
  - PHASE-I2
  - PHASE-I4
must_haves:
  truths:
    - "df-tools survey decimal-objectives [--root <path>] returns JSON with project-by-project decimal usage stats"
    - "Survey result is appended to 12-RESEARCH.md § 'I2 disposition' with concrete recommendation"
    - "If recommendation=drop: decimal-handling code in objective.cjs is removed (or kept with disposition note)"
    - "lib/templates.cjs cmdTemplateSelect returns 'templates/summary.md' unconditionally (canonicalized)"
    - "summary-minimal.md, summary-standard.md, summary-complex.md are deleted from disk"
    - "Existing tests referencing summary-{minimal,standard,complex} still pass (or are updated to canonical)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/decimal-survey.cjs"
      provides: "surveyDecimalObjectives() walker + cmdSurveyDecimalObjectives CLI"
      contains: "module.exports"
    - path: "plugins/devflow/devflow/bin/lib/decimal-survey.test.cjs"
      provides: "Tests for surveyDecimalObjectives + CLI"
      min_lines: 100
    - path: "plugins/devflow/devflow/bin/lib/templates.cjs"
      provides: "cmdTemplateSelect canonicalized to single template"
      contains: "templates/summary.md"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "lib/decimal-survey.cjs"
      via: "case 'survey' router arm"
      pattern: "case 'survey'"
    - from: "plugins/devflow/devflow/bin/lib/templates.cjs"
      to: "templates/summary.md"
      via: "cmdTemplateSelect always returns this path"
      pattern: "templates/summary\\.md"
---

<objective>
Two independent low-leverage cleanups bundled into one TRD because they touch different files and don't share dependencies (small + focused parallel work):

**I2 — Decimal-objective survey + disposition:**
Build `df-tools survey decimal-objectives` CLI that walks active DevFlow projects and reports decimal-objective usage. Run the survey against `~/Source` (or user's repo root). If <5%, document the recommendation to drop in 12-RESEARCH.md § "I2 disposition" and (decision permitting) remove `lib/objective.cjs` decimal logic + simplify roadmap parsing. If ≥5%, keep with documented rationale.

**I4 — Summary template canonicalization:**
Delete the 3 dead-weight summary template variants (`summary-minimal.md`, `summary-standard.md`, `summary-complex.md`), keep canonical `summary.md`, update `lib/templates.cjs::cmdTemplateSelect` to always return the canonical path. Reserve `summary_verbosity` config flag for future differentiation (out of scope this TRD).

This TRD is INDEPENDENT of skill consolidation (different files; can run Wave 1 in parallel with 12-01 and 12-05).

Output: Decimal-survey CLI shipped + disposition documented; summary templates canonicalized to one file.
</objective>

<file_tree>
plugins/devflow/devflow/
├── bin/
│   ├── df-tools.cjs                                   ← MODIFY (add `case 'survey'` arm)
│   └── lib/
│       ├── decimal-survey.cjs                         ← CREATE
│       ├── decimal-survey.test.cjs                    ← CREATE
│       ├── templates.cjs                              ← MODIFY (cmdTemplateSelect canonicalized)
│       └── templates.test.cjs                         ← MODIFY (update assertions)
└── templates/
    ├── summary.md                                     ← KEEP (canonical)
    ├── summary-minimal.md                             ← DELETE
    ├── summary-standard.md                            ← DELETE
    └── summary-complex.md                             ← DELETE

.planning/objectives/12-skill-consolidation/
└── 12-RESEARCH.md                                     ← MODIFY (populate § "I2 disposition")
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Pattern: Existing decimal-objective code in lib/objective.cjs (lines 198-237):**

```javascript
// Find existing decimal objectives for this base
const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
for (const dir of dirs) {
  const match = dir.match(decimalPattern);
  if (match) {
    decimals.push(parseInt(match[1], 10));
  }
}
// ... ~80 lines total of decimal logic
```

**Pattern: Existing cmdTemplateSelect heuristic (lines 36-46):**

```javascript
let template = 'templates/summary-standard.md';
let type = 'standard';

if (taskCount <= 2 && fileCount <= 3 && !hasDecisions) {
  template = 'templates/summary-minimal.md';
  type = 'minimal';
} else if (hasDecisions || fileCount > 6 || taskCount > 5) {
  template = 'templates/summary-complex.md';
  type = 'complex';
}
```

**Pattern: Survey-style walker (mirror obj 5 _detectStaleInitiatives):**

```javascript
function surveyDecimalObjectives(rootPath) {
  const projects = [];
  const entries = _runFs.readdirSync(rootPath, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const planningDir = path.join(rootPath, e.name, '.planning', 'objectives');
    if (!_runFs.existsSync(planningDir)) continue;
    const objDirs = _runFs.readdirSync(planningDir);
    const total = objDirs.filter(d => /^\d+(\.\d+)?-/.test(d)).length;
    const decimal = objDirs.filter(d => /^\d+\.\d+-/.test(d)).length;
    projects.push({ project: e.name, total, decimal });
  }
  const totalAll = projects.reduce((a, p) => a + p.total, 0);
  const decimalAll = projects.reduce((a, p) => a + p.decimal, 0);
  return {
    projects_scanned: projects.length,
    total_objectives: totalAll,
    decimal_objectives: decimalAll,
    decimal_percentage: totalAll > 0 ? (decimalAll / totalAll) * 100 : 0,
    threshold_percentage: 5.0,
    recommendation: (totalAll > 0 && (decimalAll / totalAll) * 100 < 5) ? 'drop' : 'keep',
    by_project: projects,
  };
}
```

**Pattern: Disposition documentation (mirror obj 0 TRD 0.1's defaults-table doc style):**

```markdown
### I2 disposition

**Survey ran:** 2026-05-04 against `~/Source/`
**Projects scanned:** 12
**Total objectives:** 87
**Decimal objectives:** 1 (1.15%)
**Threshold:** 5.0%
**Recommendation:** drop
**Action taken:** ...
```

</codebase_examples>

<anti_patterns>

- **Removing decimal-handling code without explicit drop disposition** — recommendation drives action. If survey says keep, code stays.
- **Hardcoding the survey root** — `--root <path>` flag with default `process.env.HOME + '/Source'`.
- **LLM-generated test data for survey tests** — use `__fixtures__/decimal-survey-fixtures.cjs` factory builders for project tree shapes.
- **Modifying `summary.md` content** — only the 3 sibling templates get deleted; canonical content stays as-is.
- **Forgetting to update `lib/templates.test.cjs`** — old tests assume heuristic returns minimal/standard/complex; update to assert canonical path always.

</anti_patterns>

<error_recovery>

- **Survey root doesn't exist** — return graceful `{error: 'root path not accessible', root: <path>}`, exit 1.
- **No `.planning/objectives/` in any sibling project** — return `{projects_scanned: 0, total_objectives: 0, ...}` with `recommendation: 'no_data'`.
- **`templates.test.cjs` has hardcoded `summary-standard.md` assertions** — update assertions to expect `summary.md`. Don't introduce a new test framework path.
- **Live survey returns ≥5%** — if recommendation is `keep`, document the rationale in disposition section; do NOT remove decimal-handling code. The survey output is THE deciding artifact.

</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/objectives/12-skill-consolidation/12-CONTEXT.md
@.planning/objectives/12-skill-consolidation/12-RESEARCH.md

# Files being modified or referenced
@plugins/devflow/devflow/bin/lib/objective.cjs
@plugins/devflow/devflow/bin/lib/templates.cjs
@plugins/devflow/devflow/templates/summary.md
</context>

<research_context>

From `12-RESEARCH.md`:

**I2 design:**
- CLI surface: `df-tools survey decimal-objectives [--root <path>]`
- Default root: `~/Source/` (or `process.env.HOME + '/Source'`)
- JSON output shape (locked)
- Threshold: <5% → recommendation `drop`; ≥5% → `keep`
- Code surface to potentially remove: `lib/objective.cjs` lines 198-237, 399-455, 503-578 (~80 LOC)

**I4 design:**
- Keep: `templates/summary.md` (326 lines, canonical)
- Delete: `summary-minimal.md` (41), `summary-standard.md` (48), `summary-complex.md` (59) — 148 lines total
- `lib/templates.cjs::cmdTemplateSelect` returns `'templates/summary.md'` unconditionally
- Reserve `summary_verbosity` config field for future (no implementation this TRD)

</research_context>

<gotchas>

- **`lib/templates.cjs` exports `cmdTemplateSelect` AND `cmdTemplateFill`** — only `cmdTemplateSelect` changes. `cmdTemplateFill` is unchanged.
- **`executor.md:452` and `planner.md:496` reference `templates/summary.md`** — already point to canonical; no agent file changes needed.
- **Survey CLI is read-only** — never mutates discovered projects.
- **Disposition section is APPENDED to 12-RESEARCH.md** — replaces the placeholder `*To be filled by executor...*`.
- **Decimal removal is conditional** — only run the removal sub-step IF survey returns `recommendation: drop`. Otherwise, skip task 3.

</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Build df-tools survey decimal-objectives CLI + run it + populate disposition</name>
  <files>plugins/devflow/devflow/bin/lib/decimal-survey.cjs, plugins/devflow/devflow/bin/lib/decimal-survey.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, .planning/objectives/12-skill-consolidation/12-RESEARCH.md</files>
  <action>
Standard task — implement survey CLI, run it live, populate disposition.

**Step 1: Create `lib/decimal-survey.cjs`** with `surveyDecimalObjectives(rootPath)` + `cmdSurveyDecimalObjectives(cwd, args, raw)` per the embedded code example.

Required exports (locked):
```javascript
// ─── module.exports — LOCKED by TRD 12-06 (4-entry surface; SC-I2)
module.exports = {
  surveyDecimalObjectives,
  cmdSurveyDecimalObjectives,
  _setRunFs,
  _resetMocks,
};
```

**Step 2: Create `lib/decimal-survey.test.cjs`** with tests:

Group SU (surveyDecimalObjectives):
- SU1: Mock root with 3 projects (one with 5 integer objs + 1 decimal, one with 3 integers + 0 decimal, one without `.planning/`) → returns 2 projects scanned, 8 total, 1 decimal, 12.5% percentage, recommendation 'keep'
- SU2: Mock root with all-integer objectives → recommendation 'drop'
- SU3: Mock root with 0 projects → returns `{projects_scanned: 0, ..., recommendation: 'no_data'}`
- SU4: Mock root that doesn't exist → `{error: ...}`, exit 1
- SU5: Mock project with 100 integers + 1 decimal → 0.99% → 'drop'
- SU6: Mock project with 5 integers + 1 decimal → 16.6% → 'keep'

Group CLI (cmdSurveyDecimalObjectives via spawnSync):
- CLI1: `df-tools survey decimal-objectives --root <fixture-root>` exits 0, returns JSON with expected shape
- CLI2: `df-tools survey decimal-objectives --root /nonexistent` exits 1
- CLI3: `--raw` flag returns JSON only

Group EX:
- EX1: Module exports = 4 entries
- EX2: Banner present

**Step 3: Wire `df-tools.cjs` arm:**

```javascript
case 'survey': {
  const { cmdSurveyDecimalObjectives } = require('./lib/decimal-survey.cjs');
  const sub = argv[1];
  const args = argv.slice(2);
  const raw = args.includes('--raw');
  if (sub === 'decimal-objectives') {
    cmdSurveyDecimalObjectives(cwd, args.filter(a => a !== '--raw'), raw);
  } else {
    error('Usage: df-tools survey decimal-objectives [--root <path>]');
  }
  break;
}
```

**Step 4: Run the survey LIVE:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs survey decimal-objectives --root /Users/markemerson/Source --raw > /tmp/decimal-survey.json
cat /tmp/decimal-survey.json
```

**Step 5: Populate `12-RESEARCH.md` § "I2 disposition"** — REPLACE the placeholder text with concrete results:

Find the existing line:
```
*To be filled by executor in 12-05-i2-i4-cleanup-TRD execution.*
```

Replace with:
```markdown
**Survey ran:** <ISO timestamp>
**Survey root:** /Users/markemerson/Source
**Projects scanned:** N
**Total objectives:** N
**Decimal objectives:** N (X.YZ%)
**Threshold:** 5.0%
**Recommendation:** <drop | keep | no_data>

**Per-project breakdown:**

| Project | Total objectives | Decimal objectives |
|---|---|---|
| ... | ... | ... |

**Action taken:**
- If recommendation=drop: Task 3 of this TRD removes lib/objective.cjs decimal-handling code.
- If recommendation=keep: Decimal handling preserved; document patterns of use here.
- If recommendation=no_data: No data to act on; preserve current behavior; revisit in v1.3.
```

# CRITICAL: Run the survey LIVE — paste actual JSON output into the disposition. Do NOT fabricate data.
# CRITICAL: If executor cannot reach `/Users/markemerson/Source`, run from the user's actual repo root (`pwd` likely returns the right context).
# GOTCHA: Some sibling projects may not have `.planning/` — that's expected; survey skips them.
# PATTERN: Mirror obj 5 TRD 05-02's spawnSync subprocess test pattern.

**Commit message:** `feat(12-06): add df-tools survey decimal-objectives + populate I2 disposition`
  </action>
  <verify>
```bash
cd plugins/devflow/devflow/bin && node --test lib/decimal-survey.test.cjs 2>&1 | tail -25
# All SU/CLI/EX tests pass

# Live survey:
node df-tools.cjs survey decimal-objectives --root /Users/markemerson/Source --raw
# JSON output

# Disposition populated:
grep -A 30 'I2 disposition' .planning/objectives/12-skill-consolidation/12-RESEARCH.md
# Contains real numbers, not placeholder

cd /Users/markemerson/Source/devflow-claude-v1.1 && npm test
```
  </verify>
  <done>
- `lib/decimal-survey.cjs` + tests exist with 4-entry locked exports
- `df-tools survey decimal-objectives` CLI works against live `~/Source`
- 12-RESEARCH.md § "I2 disposition" contains concrete survey output (no placeholder)
- Recommendation captured (drop | keep | no_data)
- `npm test` passes
  </done>
  <recovery>
- **Live survey errors out (root inaccessible)** — fall back to running survey against `process.cwd()`. Note in disposition.
- **Survey returns no data** — recommendation = `no_data`; skip task 3 entirely; document why.
- **EX1 fails** — adjust module.exports to match the locked 4-entry list.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: Canonicalize summary template (delete 3, update lib/templates.cjs)</name>
  <files>plugins/devflow/devflow/bin/lib/templates.cjs, plugins/devflow/devflow/bin/lib/templates.test.cjs, plugins/devflow/devflow/templates/summary-minimal.md, plugins/devflow/devflow/templates/summary-standard.md, plugins/devflow/devflow/templates/summary-complex.md</files>
  <action>
Standard task — code update + 3 file deletions. Atomic single commit.

**Step 1: Update `lib/templates.cjs::cmdTemplateSelect`** to ALWAYS return `templates/summary.md`:

Replace the existing heuristic:

```javascript
function cmdTemplateSelect(cwd, jobPath, raw) {
  if (!jobPath) {
    error('job-path required');
  }

  // Phase I4: Canonicalized to single template (TRD 12-06).
  // Heuristic-based selection (minimal/standard/complex) removed.
  // Future: respect config.json `summary_verbosity` flag (reserved field, not yet wired).
  const result = {
    template: 'templates/summary.md',
    type: 'standard',
    canonicalized_by: 'TRD 12-06',
  };
  output(result, raw, 'templates/summary.md');
}
```

**Step 2: Update `lib/templates.test.cjs`** to assert the new behavior:

- TS1: `cmdTemplateSelect(cwd, '<small-trd>', raw=true)` → returns `template: 'templates/summary.md'`
- TS2: `cmdTemplateSelect(cwd, '<large-trd-with-decisions>', raw=true)` → still returns `'templates/summary.md'` (no longer complex)
- TS3: `cmdTemplateSelect(cwd, '<missing-file>', raw=true)` → falls back to `'templates/summary.md'` (with error field)

Remove any test that asserted minimal/standard/complex differentiation — those tests are no longer relevant.

**Step 3: Delete the 3 sibling template files:**

```bash
git rm plugins/devflow/devflow/templates/summary-minimal.md
git rm plugins/devflow/devflow/templates/summary-standard.md
git rm plugins/devflow/devflow/templates/summary-complex.md
```

**Step 4: Verify no other code references the deleted templates:**

```bash
grep -rn 'summary-minimal\|summary-standard\|summary-complex' plugins/ docs/ .claude-plugin/ 2>/dev/null
# Expected: 0 results (or only references in CHANGELOG.md or this TRD/RESEARCH.md, which are documentation artifacts)
```

If any code references remain (likely in `lib/templates.cjs` or `lib/templates.test.cjs`), update them to canonical.

# CRITICAL: Atomic 5-file commit (templates.cjs + templates.test.cjs + 3 deletions).
# CRITICAL: Run `npm test` after deletion to catch any reference still pointing at deleted files.
# GOTCHA: lib/templates.cjs may still reference 'templates/summary-standard.md' in error fallback (line 51) — update to 'templates/summary.md'.
# PATTERN: Stub-and-fill removed; canonicalized to single artifact (mirror obj 4's resolution-path consolidation).

**Commit message:** `refactor(12-06): canonicalize summary template to single file`
  </action>
  <verify>
```bash
# Verify deletions:
ls plugins/devflow/devflow/templates/summary-*.md 2>/dev/null
# Expected: only summary.md (not summary-minimal/standard/complex)

# Verify no broken references:
grep -rn 'summary-minimal\|summary-standard\|summary-complex' plugins/ 2>/dev/null
# Expected: 0 hits in production code (allowed in CHANGELOG.md, .planning/ docs)

# Verify cmdTemplateSelect canonicalized:
node -e "
const { cmdTemplateSelect } = require('./plugins/devflow/devflow/bin/lib/templates.cjs');
// Smoke against an arbitrary TRD:
cmdTemplateSelect(process.cwd(), '.planning/objectives/12-skill-consolidation/12-01-skill-route-and-objective-TRD.md', true);
"
# Expected: outputs JSON with template: 'templates/summary.md'

# Run full test suite:
npm test
# Expected: 1359+ tests pass; templates.test.cjs assertions are updated to canonical path
```
  </verify>
  <done>
- `lib/templates.cjs::cmdTemplateSelect` returns `'templates/summary.md'` unconditionally
- `lib/templates.test.cjs` updated to assert canonical path
- 3 sibling template files deleted from disk
- No production-code references to deleted templates
- 5 changes in single atomic commit
- `npm test` passes
  </done>
  <recovery>
- **`grep -rn 'summary-standard'` finds hits in lib/templates.cjs** — line 36 (`let template = 'templates/summary-standard.md';`) and line 51 (fallback) need replacement with `'templates/summary.md'`.
- **Test failures from deleted file references** — update test assertions; the tests should NOT validate the existence of deleted templates.
- **Markdown reference in another doc (e.g., CHANGELOG.md)** — those are historical; leave them. Only modify production code.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: (Conditional) Remove decimal-objective code if survey recommends drop</name>
  <files>plugins/devflow/devflow/bin/lib/objective.cjs</files>
  <action>
**Conditional task — execute ONLY IF Task 1's survey returned `recommendation: 'drop'`.**

Read 12-RESEARCH.md § "I2 disposition" — find the recommendation line. If it says `drop`, proceed with the removal. If it says `keep` or `no_data`, SKIP this task entirely (commit nothing).

**If recommendation = drop, perform these edits to `lib/objective.cjs`:**

1. **Remove `cmdNextDecimal`** (lines around 198-237) — the function that finds existing decimal objectives + calculates next decimal.

2. **Remove `cmdInsertObjective`'s decimal-calculation block** (lines around 399-455) — replace with: throw an error / output JSON `{error: 'decimal-objective insertion was deprecated in v1.2; use df-tools objective add to append instead', removed_in: '12-06'}` and exit 1.

3. **Remove decimal-handling logic in `cmdRemoveObjective`** (lines around 503-578) — the renumber logic for decimal siblings is no longer needed; the integer-renumber path stays.

4. **Update `df-tools.cjs`** if it routes a `next-decimal` subcommand directly — make it return the deprecation error.

5. **Update `lib/objective.test.cjs`** — remove decimal-objective tests; add a regression test asserting that `df-tools objective insert` (or the underlying `cmdInsertObjective`) returns the deprecation error JSON.

6. **Update `plugins/devflow/skills/objective/SKILL.md`** (created in 12-01 if it merged before this TRD; otherwise leave a note in 12-RESEARCH.md disposition) — remove the `insert` subcommand. Update SKILL_ROUTES if 12-01 has merged.

7. **Update `12-CONTEXT.md` "Out of scope"** — note that the `insert` subcommand was removed in this TRD as a result of I2.

**If recommendation ≠ drop, this task is a NO-OP.** Document the skip in 12-06-SUMMARY.md.

# CRITICAL: This task TOUCHES THE SAME FILE as 12-01 might have touched (skills/objective/SKILL.md and SKILL_ROUTES). If 12-01 has already landed, coordinate edits — don't undo 12-01's work, just remove the `insert` subcommand entry from SKILL_ROUTES.
# CRITICAL: If 12-01 has NOT yet landed (Wave 1 timing — 12-06 and 12-01 are both Wave 1), 12-06 task 3 must run AFTER 12-01 has merged. The orchestrator handles this; this TRD's `depends_on: []` is correct because 12-06 task 1+2 don't depend on 12-01. Task 3 has implicit dependency on 12-01 (handled by `Glob` checks before edits).
# GOTCHA: If recommendation=drop but 12-01 already shipped with `insert` in SKILL_ROUTES, this task MUST update lib/skill-route.cjs to remove `'insert'` from `SKILL_ROUTES.objective.subcommands` AND update the test M-RE2 to match.
# GOTCHA: Decimal removal is irreversible. Tag the commit message clearly: `refactor(12-06): remove decimal-objective handling per I2 survey (drop recommendation)`
# PATTERN: Conditional task — see obj 4 dup-detect resolve which had conditional code paths per resolution.

**Commit message (if executed):** `refactor(12-06): remove decimal-objective handling per I2 survey (drop recommendation)`
  </action>
  <verify>
```bash
# Determine if this task should run:
RECOMMENDATION=$(grep '\*\*Recommendation:\*\*' .planning/objectives/12-skill-consolidation/12-RESEARCH.md | tail -1)
echo "$RECOMMENDATION"

# If recommendation is 'drop', verify:
if echo "$RECOMMENDATION" | grep -q 'drop'; then
  # Decimal code removed:
  ! grep -q 'decimalPattern' plugins/devflow/devflow/bin/lib/objective.cjs
  # CmdInsertObjective returns deprecation:
  node ~/.claude/devflow/bin/df-tools.cjs objective insert 5 "test" 2>&1 | grep -q 'deprecated'
  # Or if 12-01 hasn't merged:
  node ~/.claude/devflow/bin/df-tools.cjs insert-objective 5 "test" 2>&1 | grep -q 'deprecated'
fi

# If recommendation is 'keep' or 'no_data', this task is a no-op:
if ! echo "$RECOMMENDATION" | grep -q 'drop'; then
  echo "Task 3 skipped per disposition"
  # No code changes expected
fi

# Final test pass:
npm test
```
  </verify>
  <done>
- IF recommendation=drop: decimal-handling code removed from objective.cjs (~80 LOC); insert subcommand returns deprecation error; SKILL_ROUTES.objective updated if 12-01 has merged.
- IF recommendation≠drop: Task 3 explicitly skipped; documented in 12-06-SUMMARY.md.
- `npm test` passes regardless.
  </done>
  <recovery>
- **`cmdInsertObjective` removal breaks 12-01's tests for `routeSkill('objective', ['insert', ...])`** — update those tests to assert the new error JSON, not a successful route.
- **Coordination with 12-01:** if 12-06 task 3 runs while 12-01 is in flight, defer task 3 to a follow-up commit AFTER 12-01 lands. Document deferral in SUMMARY.
- **Survey output is unclear** — re-run `df-tools survey decimal-objectives` and re-evaluate; treat unclear results as `no_data` (skip removal).
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `df-tools survey decimal-objectives` CLI exists and works against live `~/Source`
2. 12-RESEARCH.md § "I2 disposition" contains concrete survey output (no placeholder)
3. `summary.md` is the only summary template in `plugins/devflow/devflow/templates/`
4. `lib/templates.cjs::cmdTemplateSelect` returns `'templates/summary.md'` for any input
5. `lib/templates.test.cjs` assertions updated to canonical path
6. No production code references `summary-minimal.md`, `summary-standard.md`, `summary-complex.md`
7. If recommendation=drop: decimal-objective code removed from `lib/objective.cjs`; `df-tools objective insert` returns deprecation error
8. If recommendation≠drop: decimal code preserved; 12-RESEARCH.md disposition documents the keep rationale
9. EX1 export-lock test passes for `lib/decimal-survey.cjs`
10. `npm test` passes
</verification>

<success_criteria>
- 2-3 commits expected (task 1, task 2, task 3 conditional)
- `lib/decimal-survey.cjs` exports exactly 4 entries
- 3 summary template files deleted
- 12-RESEARCH.md § "I2 disposition" populated with real survey data
- All `cmdTemplateSelect` outputs canonical path
- Decimal removal landed IFF survey said drop
- `npm test` passes
</success_criteria>

<output>
Create `.planning/objectives/12-skill-consolidation/12-06-SUMMARY.md` per template. Required:
- 2-3 commit hashes
- I2 disposition recommendation + action taken
- I4 confirmation: 3 templates deleted; cmdTemplateSelect canonicalized
- If task 3 was a no-op, explicit "skipped per disposition: <recommendation>"
</output>
