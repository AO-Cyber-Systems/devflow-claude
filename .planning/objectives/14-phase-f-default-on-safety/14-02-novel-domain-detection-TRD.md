---
objective: 14-phase-f-default-on-safety
trd: "02"
type: tdd
wave: 2
depends_on:
  - "14-01"
files_modified:
  - plugins/devflow/devflow/bin/lib/novel-domain.cjs
  - plugins/devflow/devflow/bin/lib/novel-domain.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/novel-domain-fixtures.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/agents/planner.md
autonomous: true
requirements:
  - F2
must_haves:
  truths:
    - "df-tools detect novel-domain <objective> returns structured signal block"
    - "Detector fires NEW_DEP signal when objective references a package not in package.json"
    - "Detector fires MISSING_PATTERNS signal when .planning/codebase/PATTERNS.md is missing or has no matching topics"
    - "Detector fires COMPARISON_KEYWORD signal when objective text matches evaluate/compare/choose-between regex"
    - "Detector returns novel:true when ANY signal fires"
    - "Planner agent reads detector output and auto-spawns objective-researcher when novel:true and !has_research and !--skip-research"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/novel-domain.cjs"
      provides: "cmdDetectNovelDomain command + signal helpers"
      min_lines: 120
      exports: ["cmdDetectNovelDomain", "detectNovelDomain"]
    - path: "plugins/devflow/devflow/bin/lib/novel-domain.test.cjs"
      provides: "Unit tests for all three signals + recommendation logic"
      min_lines: 180
    - path: "plugins/devflow/devflow/bin/lib/__fixtures__/novel-domain-fixtures.cjs"
      provides: "Hand-built factories for objective text, package.json, PATTERNS.md scaffolds"
      min_lines: 50
    - path: "plugins/devflow/agents/planner.md"
      provides: "Auto-trigger block in <step name=\"mandatory_discovery\">"
      contains: "novel-domain"
  key_links:
    - from: "plugins/devflow/devflow/bin/df-tools.cjs"
      to: "plugins/devflow/devflow/bin/lib/novel-domain.cjs"
      via: "require + dispatcher case"
      pattern: "novel-domain"
    - from: "plugins/devflow/agents/planner.md"
      to: "df-tools detect novel-domain"
      via: "Bash invocation in mandatory_discovery step"
      pattern: "detect novel-domain"
---

<objective>
Add a pure-logic novel-domain detector. When the planner runs, it asks `df-tools detect novel-domain <objective>` whether the work crosses a boundary that warrants research. If yes — and research has not already run — the planner auto-spawns `df-objective-researcher` before generating TRDs.

Purpose: F2 from issue #31. `/devflow:research-objective` is currently manual; novel work goes un-researched and TRDs reference unknown libraries. Lexical detection (no LLM judgment) catches the obvious cases for free.

Output: New `lib/novel-domain.cjs` module + tests + dispatcher hook + a small auto-trigger block in `agents/planner.md`.
</objective>

<file_tree>
plugins/devflow/devflow/bin/
├── df-tools.cjs                                  ← MODIFY (add `detect` dispatcher)
└── lib/
    ├── novel-domain.cjs                          ← CREATE
    ├── novel-domain.test.cjs                     ← CREATE
    └── __fixtures__/
        └── novel-domain-fixtures.cjs             ← CREATE

plugins/devflow/agents/
└── planner.md                                    ← MODIFY (auto-trigger block)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
@/Users/markemerson/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>

<codebase_examples>

### Pattern: pure-logic helper module

Same shape as `lib/trd-pre-check.cjs` (built in TRD 14-01) — a top-level `cmdDetectNovelDomain(cwd, objective, raw)` plus an underlying pure function `detectNovelDomain({ description, packageJson, patternsMd })` that takes already-loaded inputs and returns the signal block. Two-tier API: outer command does I/O, inner pure function is unit-testable without filesystem.

```js
// Shape to mirror:
function detectNovelDomain({ description, packageJson, patternsMd, hasResearch }) {
  const signals = {
    new_dep: detectNewDep(description, packageJson),
    missing_patterns: detectMissingPatterns(description, patternsMd),
    comparison_keyword: detectComparisonKeyword(description),
  };
  const novel = Object.values(signals).some(s => s.fired);
  return { novel, signals, recommendation: novel ? 'spawn objective-researcher' : null };
}

function cmdDetectNovelDomain(cwd, objective, raw) {
  // 1. Resolve objective
  // 2. Read description from objective dir (CONTEXT.md preferred, fallback ROADMAP section)
  // 3. Read package.json (or {} if missing)
  // 4. Read .planning/codebase/PATTERNS.md (or null if missing)
  // 5. Call detectNovelDomain(...)
  // 6. output(...) via helpers.cjs
}
```

### Pattern: dispatcher case in `df-tools.cjs`

A new top-level `case 'detect':` block parallel to `case 'verify':`:

```js
case 'detect': {
  const subcommand = args[1];
  if (subcommand === 'novel-domain') {
    cmdDetectNovelDomain(cwd, args[2], raw);
  } else {
    error('Unknown detect subcommand. Available: novel-domain');
  }
  break;
}
```

### Pattern: planner.md `<step name="mandatory_discovery">` integration

The existing block (~line 880) currently lays out Level 0/1/2/3 discovery. Add at the top:

```markdown
**Step 0 — Auto-trigger research on novel domains (F2):**

If `--skip-research` flag is NOT set AND init JSON `has_research` is `false`:

```bash
NOVEL=$(node ~/.claude/devflow/bin/df-tools.cjs detect novel-domain "$OBJECTIVE" --raw)
if [[ $(echo "$NOVEL" | jq -r '.novel') == "true" ]]; then
  # Auto-spawn objective-researcher before continuing discovery
  Task(
    prompt="Research objective $OBJECTIVE — novel domain detected: $(echo $NOVEL | jq -r '.signals')",
    subagent_type="objective-researcher",
    model="${researcher_model}"
  )
fi
```

If novel:true, the rest of discovery (Level 0-3) proceeds AFTER researcher returns.
```

</codebase_examples>

<anti_patterns>
- DO NOT use LLM-generated test data (TDD playbook habit #4). Build hand-written factories.
- DO NOT add semantic / NLP-based detection. Lexical only — regex + token overlap.
- DO NOT block planning on detector errors. If detector fails to read inputs, return `{ novel: false, error: "..." }` and let planner proceed (failsafe-permissive default — better to miss research than to deadlock planning).
- DO NOT auto-spawn researcher unconditionally. The trigger conditions (no `--skip-research`, no existing research, `novel:true`) must all hold.
- DO NOT modify `<step name="mandatory_discovery">` semantics for non-novel cases. Insert one new sub-step at the top; leave Level 0-3 untouched.
</anti_patterns>

<error_recovery>
- Missing package.json → treat as `{ dependencies: {}, devDependencies: {} }`. NEW_DEP signal still fires for any package-shaped token in description.
- Missing PATTERNS.md → MISSING_PATTERNS fires unconditionally. (Caller can still proceed; this is the brownfield case.)
- Missing CONTEXT.md AND no ROADMAP section → return `{ novel: false, error: "no description source" }`. Planner falls back to manual flag.
- Malformed package.json → catch JSON.parse error, treat as empty.
</error_recovery>

</embedded_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/objectives/14-phase-f-default-on-safety/14-CONTEXT.md
@.planning/objectives/14-phase-f-default-on-safety/14-RESEARCH.md
@plugins/devflow/devflow/bin/lib/objective.cjs
@plugins/devflow/devflow/bin/df-tools.cjs
@plugins/devflow/agents/planner.md
</context>

<research_context>

From 14-RESEARCH.md § "F2 — Novel-domain detection":

**Signal definitions (locked):**

```
1. NEW_DEP signal:
   Extract package-name-shaped tokens (`@scope/pkg`, `pkg-name`) from objective description.
   For each token, check if it appears in package.json `dependencies` or `devDependencies`.
   Token in description AND not in package.json → signal fires.

2. MISSING_PATTERNS signal:
   If `.planning/codebase/PATTERNS.md` is missing → signal fires.
   If PATTERNS.md exists, lexical match: tokenize objective description, check
   if any token appears as a heading in PATTERNS.md. Zero matches → signal fires.

3. COMPARISON_KEYWORD signal:
   Regex match `\b(evaluate|compare|choose between|select between|vs\.)\b` (case-insensitive)
   against objective goal + description. Match → signal fires.
```

**Trigger semantics:** ANY signal firing → `novel: true`.

**Output shape (locked):**

```json
{
  "novel": true,
  "signals": {
    "new_dep": { "fired": true, "candidates": ["jose", "@aws-sdk/client-s3"] },
    "missing_patterns": { "fired": false },
    "comparison_keyword": { "fired": true, "matched": ["choose between"] }
  },
  "recommendation": "spawn objective-researcher"
}
```
</research_context>

<gotchas>
- Package-name regex is fiddly. Valid forms: `@scope/name`, `name`, `name-with-hyphens`, `name.dot`. Length 1-214 chars per npm spec. The simplest practical regex: `/(?:@[a-z0-9][a-z0-9-]*\/)?[a-z0-9][a-z0-9._-]*/g`. **Filter aggressively** — many English words match. Keep only tokens that appear in backticks, code blocks, or follow `npm install`/`yarn add` keywords.
- Description source: prefer `<objective_dir>/<NN>-CONTEXT.md`, fall back to ROADMAP.md section for the objective, fall back to objective directory name (kebab-case slug). Don't crash if all are missing.
- PATTERNS.md tokenization: lowercase, split on whitespace + punctuation, keep tokens length ≥ 4. Headings are markdown `^## .*` or `^### .*` — extract heading text, lowercase, tokenize same way, intersect.
- `vs\.` regex needs the literal period — use `vs\.` (escape) or alternatively `\bvs\b\s*\.` for safer match. Word boundary alone may match "VS Code"; restrict to `vs\.` form only to avoid false positives.
- planner.md is also touched by TRD 14-05 (confidence scoring removal). Coordinate via wave ordering: 14-02 lands first (Wave 2), 14-05 lands second (Wave 3). The two edits are in different sections and don't conflict at the diff level.
</gotchas>

<tasks>

<task type="tdd">
  <name>Task 1: Build fixture factory and signal-detection tests (RED)</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/novel-domain-fixtures.cjs, plugins/devflow/devflow/bin/lib/novel-domain.test.cjs</files>
  <action>
Test-list checklist (place as comment block at top of test file — TDD playbook habit #2):

```
// Test list:
// NEW_DEP signal:
//   1. happy: description mentions `jose`, package.json lacks it → fires, candidates:["jose"]
//   2. happy: scoped package `@aws-sdk/client-s3` mentioned, not installed → fires
//   3. negative: package mentioned IS in dependencies → does not fire
//   4. negative: package mentioned IS in devDependencies → does not fire
//   5. multiple candidates: 3 packages mentioned, 1 installed → 2 fire
//   6. no package-shaped tokens in description → does not fire
//   7. missing package.json → fires for any package-shaped token (treats deps as empty)
// MISSING_PATTERNS signal:
//   8. happy: PATTERNS.md missing entirely → fires
//   9. happy: PATTERNS.md exists, no overlapping heading tokens → fires
//   10. negative: PATTERNS.md has heading matching objective topic → does not fire
// COMPARISON_KEYWORD signal:
//   11. happy: "evaluate three options" → fires, matched:["evaluate"]
//   12. happy: "we should compare X and Y" → fires
//   13. happy: "choose between A and B" → fires
//   14. happy: "Postgres vs. SQLite" → fires (vs. with period)
//   15. negative: "VS Code editor" → does NOT fire (no period after vs)
//   16. negative: clean prose with no comparison verbs → does not fire
//   17. case-insensitive: "EVALUATE" or "Evaluate" → fires
// Aggregator (detectNovelDomain pure function):
//   18. any signal fires → novel:true
//   19. no signal fires → novel:false, recommendation:null
//   20. all three fire → novel:true, signals all show fired:true
// CLI (cmdDetectNovelDomain):
//   21. happy: tmpdir scaffold with description + package.json → returns valid JSON
//   22. missing description sources → error key, novel:false (failsafe)
//   23. --raw mode → JSON only, no human summary
//   24. unknown objective → error, exit non-zero
```

Build `__fixtures__/novel-domain-fixtures.cjs` with hand-written factories:
- `makeDescription({ topic, mentionsPkgs, hasComparison })` — returns string. Templates:
  - mentionsPkgs:["jose"] → "Implement auth using `jose` for JWT signing."
  - hasComparison:"evaluate" → "Evaluate three options before choosing."
- `makePackageJson({ deps, devDeps })` — returns JSON string with `dependencies`/`devDependencies` populated.
- `makePatternsMd({ headings })` — returns markdown string with `## <heading>` blocks.
- `setupObjectiveScaffold(tmpRoot, { objective, description, packageJson, patternsMd })` — writes the four files into the right paths.

Build test file. Tests must FAIL (module not yet implemented).

Run: `cd plugins/devflow/devflow/bin && node --test lib/novel-domain.test.cjs`
Expected: All tests fail.

Commit RED: `test(14-02): add failing tests for novel-domain detector`

# CRITICAL: Hand-built factories ONLY (TDD playbook habit #4). No randomized inputs.
# CRITICAL: Test 14 (`vs.` with period) and Test 15 (`VS Code` without period) must both be present — they pin down the regex shape against false positives.
# GOTCHA: Use realistic objective text in fixtures, not "lorem ipsum". Tests should reflect actual usage.
# PATTERN: Co-located test file (lib/novel-domain.test.cjs) — mirrors lib/trd-pre-check.test.cjs from TRD 14-01.
  </action>
  <verify>
`cd plugins/devflow/devflow/bin && node --test lib/novel-domain.test.cjs 2>&1 | tail -10` — exits non-zero, all 24 tests fail.
`grep -c "Test list" plugins/devflow/devflow/bin/lib/novel-domain.test.cjs` returns 1.
`test -f plugins/devflow/devflow/bin/lib/__fixtures__/novel-domain-fixtures.cjs` succeeds.
`grep -c "module.exports" plugins/devflow/devflow/bin/lib/__fixtures__/novel-domain-fixtures.cjs` returns 1.
  </verify>
  <done>
Test file with test-list checklist + 24 tests covering 3 signals + aggregator + CLI. Fixture factory exports the four `make*`/`setup*` functions. All tests fail. RED commit landed with `test(14-02):` prefix.
  </done>
  <recovery>
If tests cannot find fixture: ensure relative path `require('./__fixtures__/novel-domain-fixtures.cjs')` from test file location.
If a test passes accidentally: grep `cmdDetectNovelDomain` and `detectNovelDomain` in `lib/` — must be zero matches before this commit.
  </recovery>
</task>

<task type="tdd">
  <name>Task 2: Implement detector + dispatcher (GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/novel-domain.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Create `plugins/devflow/devflow/bin/lib/novel-domain.cjs`:

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { output, error, safeReadFile } = require('./helpers.cjs');
const { findObjectiveInternal } = require('./objective.cjs');

// Pure helpers — testable without filesystem
function detectNewDep(description, packageJson) { /* ... */ }
function detectMissingPatterns(description, patternsMd) { /* ... */ }
function detectComparisonKeyword(description) { /* ... */ }

function detectNovelDomain({ description, packageJson, patternsMd }) {
  // returns { novel, signals, recommendation }
}

function cmdDetectNovelDomain(cwd, objective, raw) {
  // I/O wrapper around pure detectNovelDomain
}

module.exports = { cmdDetectNovelDomain, detectNovelDomain };
```

Implement signals one at a time per TDD playbook habit #3:

1. `detectComparisonKeyword` first — simplest (single regex). Run tests 11-17. They should pass.
2. `detectNewDep` next — package regex + intersection. Run tests 1-7. They should pass.
3. `detectMissingPatterns` next — token overlap with headings. Run tests 8-10. They should pass.
4. `detectNovelDomain` aggregator. Run tests 18-20. They should pass.
5. `cmdDetectNovelDomain` CLI wrapper. Run tests 21-24. They should pass.

Wire into `df-tools.cjs`:
- Add import near other lib requires (around line 158).
- Add new top-level `case 'detect':` block (placement after `case 'verify':`).
- Update help block (around line 85) to document `detect novel-domain <objective>`.
- Update `case undefined` error message in helpers if needed.

Run: `cd plugins/devflow/devflow/bin && node --test lib/novel-domain.test.cjs` — all pass.
Run full suite: `npm test` — no regressions.

Commit GREEN: `feat(14-02): implement df-tools detect novel-domain detector`

# CRITICAL: Pure function `detectNovelDomain` must be EXPORTED separately from cmd wrapper. Tests for signals call the pure function with synthetic inputs; tests for CLI call cmd wrapper with tmpdir scaffolds. Two-tier API gives clean unit tests.
# CRITICAL: Comparison keyword regex must be `\b(evaluate|compare|choose between|select between|vs\.)\b` with case-insensitive flag — not `\bvs\b` alone (false positive on "VS Code").
# GOTCHA: Package regex should pre-filter to tokens preceded by backticks, npm/yarn keywords, or quoted in code blocks. Otherwise English words match.
# GOTCHA: Description source priority: CONTEXT.md > ROADMAP section > objective slug. Read via safeReadFile; missing files return null, not throw.
# PATTERN: Mirror two-tier API style from existing pure helpers (e.g. trd-pre-check.cjs from sibling TRD 14-01).
  </action>
  <verify>
`cd plugins/devflow/devflow/bin && node --test lib/novel-domain.test.cjs 2>&1 | tail -3` — `# pass 24`, `# fail 0`.
`npm test 2>&1 | tail -3` — full suite passes, no regressions.
`node plugins/devflow/devflow/bin/df-tools.cjs detect novel-domain 14 --raw | jq -e '.novel,.signals,.recommendation'` — emits structured JSON with all keys.
`grep -c "novel-domain" plugins/devflow/devflow/bin/df-tools.cjs` returns ≥ 2 (dispatcher + help comment).
`grep -c "module.exports.*detectNovelDomain" plugins/devflow/devflow/bin/lib/novel-domain.cjs` returns 1 (both functions exported).
  </verify>
  <done>
`lib/novel-domain.cjs` exports `cmdDetectNovelDomain` and `detectNovelDomain`. All three signals + aggregator + CLI implemented. Dispatcher case in df-tools.cjs handles `detect novel-domain`. All TRD-02 tests pass. Full suite passes. End-to-end CLI works against this objective. GREEN commit landed.
  </done>
  <recovery>
If signal tests pass but CLI tests fail: the I/O layer is wrong. Verify `findObjectiveInternal` resolution + safeReadFile fallback chain.
If a signal accidentally fires on a clean negative case: tighten the regex / token filter. Don't loosen the test.
If full suite regresses: only df-tools.cjs was edited (additively); revert the dispatcher addition and re-add carefully — likely a misplaced `}` or `break;`.
  </recovery>
</task>

<task type="auto">
  <name>Task 3: Wire planner.md auto-trigger into mandatory_discovery</name>
  <files>plugins/devflow/agents/planner.md</files>
  <action>
Open `plugins/devflow/agents/planner.md`. Find `<step name="mandatory_discovery">` (around line 880).

Insert a new sub-step at the very TOP of that step's body, BEFORE the existing Level 0-3 description:

```markdown
**Step 0 — Auto-trigger research on novel domains (F2):**

If `--skip-research` flag is NOT set AND init JSON `has_research` is `false`:

```bash
NOVEL=$(node ~/.claude/devflow/bin/df-tools.cjs detect novel-domain "$OBJECTIVE" --raw)
NOVEL_FIRED=$(echo "$NOVEL" | jq -r '.novel')
if [[ "$NOVEL_FIRED" == "true" ]]; then
  # Surface what fired
  echo "$NOVEL" | jq '.signals'
  # Auto-spawn objective-researcher before continuing discovery
  # (Use the researcher_model from init JSON.)
fi
```

If `novel:true` and research has not run: spawn `objective-researcher` via the standard Task(...) pattern with `subagent_type="objective-researcher"` and `model="${researcher_model}"`. Pass the signals block as part of the prompt so the researcher knows what triggered it. Wait for completion before proceeding to the existing Level 0-3 logic.

If `novel:false` OR `--skip-research` was passed OR `has_research:true` already: skip auto-spawn, proceed normally.

---
```

(The `---` separator visually delineates the new Step 0 from the existing Level 0-3 content.)

Verify the existing Level 0/1/2/3 description that follows is untouched. Don't reflow paragraphs that aren't yours.

Run: `npm test`
Expected: No regressions (the change is in agent prompt text, not code; tests still pass at baseline + tasks 1-2 deltas).

Run a smoke test: invoke detector against this objective:
```bash
node plugins/devflow/devflow/bin/df-tools.cjs detect novel-domain 14 --raw | jq .
```
Expected: Returns valid JSON. Whether `novel:true` or `false` is informational (this objective has RESEARCH.md already, so any planner instance running it would skip the auto-spawn anyway via the `has_research` guard).

Commit: `feat(14-02): wire planner auto-research trigger into mandatory_discovery`

# CRITICAL: Insert at TOP of <step name="mandatory_discovery">, do NOT replace existing Level 0-3 content.
# CRITICAL: The auto-spawn must be guarded by both `--skip-research` flag AND `has_research:false` AND `novel:true`. All three required.
# GOTCHA: planner.md is also edited by TRD 14-05 (Wave 3). 14-02 lands first (Wave 2). The two edits are in different sections — `<step name="mandatory_discovery">` (this TRD) vs. confidence-scoring text (14-05). No conflict at the diff level, but verify after rebase.
# PATTERN: Existing planner.md uses `Task(...)` calls with `subagent_type="..."` — mirror exactly. See planner.md spawn calls elsewhere for syntax.
  </action>
  <verify>
`grep -c "novel-domain" plugins/devflow/agents/planner.md` returns ≥ 1.
`grep -A 3 "Step 0 — Auto-trigger research" plugins/devflow/agents/planner.md | head -5` shows the new block.
`grep -B 2 "Level 0 - Skip" plugins/devflow/agents/planner.md` shows the existing Level-0 description still present right after the new Step 0.
`npm test 2>&1 | tail -3` — no regressions.
`node plugins/devflow/devflow/bin/df-tools.cjs detect novel-domain 14 --raw | jq -e '.novel'` returns true or false (well-formed JSON).
  </verify>
  <done>
planner.md `<step name="mandatory_discovery">` has new "Step 0 — Auto-trigger research on novel domains (F2)" block at top. Existing Level 0-3 description unchanged. Smoke test against objective 14 returns valid JSON. Single commit with `feat(14-02):` prefix.
  </done>
  <recovery>
If git diff shows unrelated changes to planner.md: `git checkout -p plugins/devflow/agents/planner.md` and accept only the intended block.
If the `<step name="mandatory_discovery">` block is hard to locate: grep `mandatory_discovery` to find the exact line, then insert immediately after the `<step ...>` opening tag.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `df-tools detect novel-domain <objective>` returns structured JSON with three signals + recommendation
- All three signals fire correctly under controlled test conditions
- Word boundary checks distinguish `vs.` (fires) from "VS Code" (doesn't fire)
- planner.md has auto-trigger block at top of `<step name="mandatory_discovery">`
- All tests pass; full suite no regressions
</verification>

<success_criteria>
- [ ] `lib/novel-domain.cjs` exists, exports both `cmdDetectNovelDomain` and `detectNovelDomain`
- [ ] `lib/novel-domain.test.cjs` exists with test-list comment block + 24 tests
- [ ] `__fixtures__/novel-domain-fixtures.cjs` exists with hand-built factories
- [ ] `df-tools.cjs` dispatcher handles `detect novel-domain <objective>` and `--raw`
- [ ] `agents/planner.md` `<step name="mandatory_discovery">` has new Step 0 auto-trigger
- [ ] Three commits: RED test, GREEN feat (detector), feat (planner wiring)
- [ ] All tests pass; no regressions in baseline
</success_criteria>

<output>
After completion, create `.planning/objectives/14-phase-f-default-on-safety/14-02-SUMMARY.md`. Include:
- Three commit hashes
- Test count delta
- Sample output of `df-tools detect novel-domain 14 --raw` (which signals fire on this very objective)
- Confirmation planner.md change is at `<step name="mandatory_discovery">` Step 0 (with line numbers)
</output>
