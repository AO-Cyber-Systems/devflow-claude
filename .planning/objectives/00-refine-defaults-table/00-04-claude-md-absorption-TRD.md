---
objective: 00-refine-defaults-table
trd: 0.4
title: Map all 6 TDD Playbook habits to 5 structured fields + 1 freeform directive
type: tdd
confidence: high
wave: 3
depends_on: [0.2]
files_modified:
  - plugins/devflow/devflow/bin/lib/claude-md.cjs
  - plugins/devflow/devflow/bin/lib/claude-md.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs
autonomous: true
requirements: [SC-4]
must_haves:
  truths:
    - "claude-md.absorb() detects all 6 named TDD Playbook habits from the user's CLAUDE.md (including the variants used in the actual ~/.claude/CLAUDE.md observed in repo)"
    - "claude-md.deriveOverrides() returns a structured-fields map covering 5 of 6 habits (1 → tdd_default, 2 → test_list_first, 4 → fixture_strategy, 5 → outside_in, 6 → security_isolation/multitenancy)"
    - "Habit 3 (one test at a time / RED-GREEN-REFACTOR) maps to a freeform directive in result.directives, not a structured field"
    - "deriveOverrides() returns the new _playbookDetected flag as true when ANY of the 6 habits is detected"
    - "When the user's CLAUDE.md has both 'TDD Playbook' as a named section AND inline habit references in body text, both paths are detected (defensive parser)"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/claude-md.cjs"
      provides: "Extended absorption logic for the 6 TDD Playbook habits"
      exports: ["absorb", "deriveOverrides", "extractSections", "isRelevantHeading", "PLAYBOOK_HABITS"]
    - path: "plugins/devflow/devflow/bin/lib/claude-md.test.cjs"
      provides: "Behavior cases for habit detection + override derivation"
      contains: "describe('TDD Playbook habits"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/claude-md.cjs::deriveOverrides"
      to: "plugins/devflow/devflow/bin/lib/intent.cjs::resolve"
      via: "claudeOverrides applied at line 184+ of intent.cjs"
      pattern: "claudeOverrides\\.(tdd_default|test_list_first|fixture_strategy|outside_in|security_isolation)"
verification_commands:
  - "npm test"
  - "git log --oneline feature/v1.1 -- plugins/devflow/devflow/bin/lib/claude-md.cjs plugins/devflow/devflow/bin/lib/claude-md.test.cjs | grep -E '^[a-f0-9]+ test\\(' | head -1"
  - "node -e 'const cm=require(\"./plugins/devflow/devflow/bin/lib/claude-md.cjs\"); const fx=require(\"./plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs\"); const tmpdir=require(\"os\").tmpdir(); const fs=require(\"fs\"); const path=require(\"path\"); const home=fs.mkdtempSync(path.join(tmpdir,\"df-cm-\")); fs.mkdirSync(path.join(home,\".claude\")); fs.writeFileSync(path.join(home,\".claude/CLAUDE.md\"), require(\"fs\").readFileSync(\"/Users/markemerson/.claude/CLAUDE.md\",\"utf-8\")); const dirs=cm.absorb({userHome:home}); const ovs=cm.deriveOverrides(dirs); if(!ovs._playbookDetected) throw new Error(\"playbook not detected from real ~/.claude/CLAUDE.md\"); console.log(\"real CLAUDE.md round-trip OK:\", JSON.stringify({_playbookDetected:ovs._playbookDetected, fields:Object.keys(ovs).filter(k=>k!==\"_playbookDetected\")}));'"
---

<objective>
Map all 6 TDD Playbook habits from the user's `~/.claude/CLAUDE.md` to the resolver's structured-fields output. The user's actual CLAUDE.md (visible in this conversation's context as the "claudeMd" block) names 6 habits; CONTEXT.md §3 + research file `tdd-scope-refined-defaults.md` §RQ3 specify which become structured fields and which stay as freeform directives:

| # | Habit (literal CLAUDE.md text) | Mapping |
|---|---|---|
| 1 | "Force TDD TRDs at planning time" | Structured: `tdd_default` (skip→auto→strict promotion ladder) |
| 2 | "Test list first" | Structured: `test_list_first: required` |
| 3 | "One test at a time RED→GREEN→REFACTOR" | Freeform: directive in result.directives (execution-time, not planning-time) |
| 4 | "Fixture generators, not LLM-generated test data" | Structured: `fixture_strategy: generators` |
| 5 | "Outside-in for UI / portal flows" | Structured: `outside_in: true` (when kind ∈ {app, ui-lib} or kind=api+work=feature) |
| 6 | "Multitenancy guard in every test" | Structured: `security_isolation: multi_tenant_required` (api kind only) + the existing `multitenancy: 'required'` flag for back-compat |

Purpose: Closes objective-0 success criterion 4. The resolver's CLAUDE.md absorption was extended in TRD 0.2 with a stub recognition for the new fields; this TRD makes the recognition exhaustive across all 6 habits and adds the regression tests that verify the user's *actual* CLAUDE.md round-trips.

Output: Extended `claude-md.cjs::deriveOverrides` + new tests + a robust regex / phrase-match library targeting the literal text patterns from the user's CLAUDE.md.

Why TDD: pure-logic structured-input/output transformation. Same shape as TRD 0.2 (RED→GREEN→REFACTOR with fixture-builder).
</objective>

## Test list

Per CLAUDE.md TDD Playbook habit 2 — write the behavior-cases checklist before any test code. Each bullet is a planned test case.

**Group A — habit detection (literal-pattern recognition)**
- A1: A CLAUDE.md with H2 heading "## TDD Playbook" and body containing "Force TDD TRDs at planning time" → `deriveOverrides` returns `{ _playbookDetected: true, tdd_default: 'auto' }` (or `'strict'` if cell already at `auto`; this TRD covers the cell-agnostic resolver-side detection — promotion table is in TRD 0.2).
- A2: Body text "Test list first" (case-insensitive, with optional bullet prefix or h3 sub-heading) → `test_list_first: 'required'`.
- A3: Body text "Fixture generators, not LLM-generated test data" → `fixture_strategy: 'generators'`. Also matches "fixture builders", "factory functions", "no LLM-generated test data".
- A4: Body text "Outside-in for UI" or "outside-in for portal flows" → `outside_in: true`.
- A5: Body text "Multitenancy guard in every test" or "wrong-tenant" or "tenant isolation" → existing `multitenancy: 'required'` (back-compat) AND new `security_isolation: 'multi_tenant_required'`.
- A6: Body text "One test at a time" or "RED → GREEN → REFACTOR" → directive added to `result.directives` (NOT a structured field; verified by checking the absorbed text appears in `result.directives` array).

**Group B — composite habit detection (real-world CLAUDE.md round-trip)**
- B1: A CLAUDE.md identical to the user's actual `~/.claude/CLAUDE.md` (containing all 6 habits + extras) → `_playbookDetected: true` AND all 5 structured fields are emitted (`tdd_default`, `test_list_first`, `fixture_strategy`, `outside_in`, `multitenancy`/`security_isolation`).
- B2: A CLAUDE.md with only habits 1, 4, 6 (subset) → only those 3 structured fields are emitted; `outside_in` and `test_list_first` are absent from the overrides map.
- B3: A CLAUDE.md with NO TDD Playbook section but with a "## Testing Strategy" section that mentions habit 4 (fixture generators) → habit 4 STILL maps to `fixture_strategy: 'generators'` because the existing `extractSections` includes `^##.*Test` patterns and the body-text matcher is independent of the heading.

**Group C — edge cases**
- C1: A CLAUDE.md with `## TDD Playbook` heading but EMPTY body → `_playbookDetected: true` (heading alone is signal) but no structured-field overrides.
- C2: A CLAUDE.md with the literal phrase "TDD Playbook" inside a normal paragraph (not as a heading) → `_playbookDetected: false` (the existing `isRelevantHeading` only matches H2). No false-positive.
- C3: A CLAUDE.md with both user-level (`~/.claude/CLAUDE.md`) and project-level (`./CLAUDE.md`) — project-level overrides user-level (existing precedence in `deriveOverrides`). Verified by setting different fixture_strategy values in each and asserting project wins.
- C4: A CLAUDE.md mentioning "property-based testing" in a "do skip" context → existing `propertyBased: 'skip'` flag set (back-compat — no new behavior, just don't break it).

**Group D — back-compat (existing tests must continue passing)**
- D1: All existing claude-md.test.cjs tests continue passing (existing tests cover the 4 fallback patterns currently in place: tdd, multitenancy, propertyBased flags).
- D2: The `_playbookDetected` flag is added without breaking any caller that doesn't read it (TRD 0.2's resolver uses it; TRD 0.3's planner doesn't directly).
- D3: The existing `claudeOverrides.tdd === 'strict'` shape is preserved alongside the new `tdd_default` field. Both fields can coexist on the overrides map.

The 13 enumerated cases cover all 6 habits explicitly, the user's real CLAUDE.md as a regression fixture, and the 4 edge cases that historically broke the absorber.

## RED → GREEN → REFACTOR plan

Two atomic commits:

1. `test(00-04): add failing test list for 6-habit absorption mapping` — Add the 13 test cases above as failing tests in `claude-md.test.cjs`. Add a fixture builder `fixtures.realCLAUDEMd()` that returns the literal text of the user's actual CLAUDE.md (or a hand-built equivalent that exercises all 6 habits).

2. `feat(00-04): map all 6 TDD Playbook habits to structured fields and freeform directives` — Implement until all tests pass.

(No explicit refactor commit unless a clear cleanup emerges from GREEN.)

<embedded_context>

<codebase_examples>
Existing `deriveOverrides` (claude-md.cjs lines 102-130) uses regex-based phrase matching:

```javascript
if (/all\s+(business\s+logic|features?)\s+(must\s+be|default(s)?\s+to)\s+tdd/.test(body)
    || /force\s+tdd\s+trds?\s+at\s+planning/.test(body)
    || /every\s+(feature|trd)\s+(a\s+)?(`?)type\s*=\s*tdd/.test(body)) {
  overrides.tdd = 'strict';
}
```

Extension pattern: add a `PLAYBOOK_HABITS` constant at the top of the file enumerating the 6 habits with their patterns:

```javascript
const PLAYBOOK_HABITS = [
  {
    id: 1,
    name: 'force_tdd_at_planning',
    patterns: [
      /force\s+tdd\s+trds?\s+at\s+planning/i,
      /all\s+features?\s+default\s+to\s+tdd\s+strict/i,
      /every\s+feature\s+a\s+`?type\s*=\s*tdd/i,
    ],
    field: 'tdd_default',
    value: 'auto',  // promotion handled by resolver per CONTEXT.md §3
  },
  {
    id: 2,
    name: 'test_list_first',
    patterns: [
      /test\s+list\s+first/i,
      /behavior\s+cases\s+checklist/i,
      /list\s+(of\s+)?behavior\s+cases?\s+(before|first|ahead\s+of)/i,
    ],
    field: 'test_list_first',
    value: 'required',
  },
  // ... etc for habits 3, 4, 5, 6
];
```

Then `deriveOverrides` becomes a loop:

```javascript
for (const habit of PLAYBOOK_HABITS) {
  const matched = habit.patterns.some(re => re.test(body));
  if (matched) {
    if (habit.id === 3) {
      // freeform — add to directives, not overrides (handled at absorb level)
      continue;
    }
    overrides[habit.field] = habit.value;
  }
}
```

The user's actual `~/.claude/CLAUDE.md` is visible in the system context. Use its literal text as the canonical fixture for Group B test B1. Save the fixture as a hand-edited string in `intent-fixtures.cjs`:

```javascript
function realCLAUDEMd() {
  return `# Global Working Preferences

## TDD Playbook

When planning or executing any non-trivial implementation work, follow this playbook on top of DevFlow's TDD enforcement (Iron Law, RED-GREEN-REFACTOR with exit-code evidence). Applies across all projects and stacks.

### Habits to apply

1. **Force TDD TRDs at planning time.** ...
2. **Test list first.** ...
3. **One test at a time** through RED → GREEN → REFACTOR.
4. **Fixture generators, not LLM-generated test data.** ...
5. **Outside-in for UI / portal flows.** ...
6. **Multitenancy guard in every test (when applicable).** ...

(text continues...)
`;
}
```

The fixture function returns the EXACT user CLAUDE.md text (or a faithful hand-built equivalent). Per the `no_llm_test_data` constraint, the text is hand-edited from the visible system context, NOT generated by the LLM.

Existing `claude-md.test.cjs` test patterns (lines 1-172): `describe('absorb', ...)` blocks with `beforeEach(...)` setup using `fs.mkdtempSync` for sandboxed `userHome`. Mirror this for new tests.
</codebase_examples>

<anti_patterns>
- **Do NOT regex-match across multiple lines without the `s` flag.** The existing patterns intentionally bound to single lines because CLAUDE.md sections often have multi-line bullets; cross-line matches produce false positives.
- **Do NOT remove the existing `claudeOverrides.tdd === 'strict'` legacy field.** TRD 0.2 reads it for back-compat. Both `tdd` (legacy) and `tdd_default` (new) can coexist.
- **Do NOT generate the realCLAUDEMd fixture text via LLM.** The constraint `no_llm_test_data` applies. Copy from the visible system context manually, or hand-write equivalent text covering all 6 habits.
- **Do NOT match on H1 or H3 headings.** The existing parser only recognizes H2. Habits live in H3 sub-bullets under the "## TDD Playbook" H2 heading. The body-text regex matcher operates on the H2 section's body, which includes its H3 children naturally.
- **Do NOT require all 6 habits to be present for `_playbookDetected: true`.** Even one habit detected sets the flag. The flag's purpose is "user has SOME TDD playbook; apply promotions where applicable."
</anti_patterns>

<error_recovery>
- If a regex fails to match the user's actual CLAUDE.md text: open `/Users/markemerson/.claude/CLAUDE.md` (path is in the system context — read-only, do not modify) and grep for the exact phrase the test expects. Adjust the regex to match the literal text, escaping special characters as needed.
- If `deriveOverrides` test failures cluster on the "project wins over user" precedence (Group C3): the existing sort logic (claude-md.cjs lines 108-111) sorts by source. Verify the new patterns iterate in the same sorted order so project-level wins on conflict.
- If TRD 0.2's tests start failing after this TRD's changes: most likely cause is `_playbookDetected` semantics drift. TRD 0.2 set the flag on `(tddSections.length > 0)`; this TRD might want to extend the trigger to "any habit detected" — verify the flag stays as-is (heading detection) and habits-detected is a separate concept tracked via the field overrides themselves.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/00-refine-defaults-table/00-RESEARCH.md
@.planning/research/tdd-scope-refined-defaults.md
@plugins/devflow/devflow/bin/lib/claude-md.cjs
@plugins/devflow/devflow/bin/lib/claude-md.test.cjs

# After TRD 0.2 ships:
@.planning/objectives/00-refine-defaults-table/00-02-resolver-schema-SUMMARY.md
@plugins/devflow/devflow/bin/lib/intent.cjs
@plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs

# Reference (read-only — system context):
# /Users/markemerson/.claude/CLAUDE.md (the user's real playbook — visible in this prompt's <claudeMd> block)
</context>

<research_context>
**Pattern catalog for the 6 habits** (regexes target literal CLAUDE.md text from the user's actual playbook):

| # | Habit | Regex patterns (case-insensitive, single-line) |
|---|---|---|
| 1 | force TDD | `/force\s+tdd\s+trds?\s+at\s+planning/i`, `/all\s+features?\s+default\s+to\s+tdd\s+strict/i`, `/make\s+every\s+feature\s+a\s+\`?type\s*=\s*tdd/i` |
| 2 | test list first | `/test\s+list\s+first/i`, `/checklist\s+of\s+behavior\s+cases?/i`, `/before\s+any\s+test\s+code/i` |
| 3 | one test at a time | `/one\s+test\s+at\s+a\s+time/i`, `/red\s*[→\->]+\s*green\s*[→\->]+\s*refactor/i` |
| 4 | fixture generators | `/fixture\s+(generators?|builders?|factory\s+functions?)/i`, `/no\s+llm[\- ]+generated\s+test\s+data/i`, `/recorded\s+cassettes?/i` |
| 5 | outside-in | `/outside-?in\s+for\s+(ui|portal\s+flows?)/i`, `/start\s+at\s+the\s+highest\s+user-?observable\s+layer/i` |
| 6 | multitenancy guard | `/multitenancy\s+guard/i`, `/wrong-?tenant\s+isolation/i`, `/tenant\s+isolation.*every\s+test/i` |

These patterns are derived from the literal text in the user's `~/.claude/CLAUDE.md`. Test B1 verifies that the real file round-trips; the patterns above are necessary and sufficient for that file.

**Habit 3 → directive (not structured)**: The existing `absorb()` function returns `directives.tdd = [{ source, heading, body }, ...]` (see claude-md.cjs lines 71-95). This is already the freeform-text path. Habit 3 detection just needs to NOT add a structured override field; the body text containing "one test at a time" is already preserved in `directives.tdd[].body`. The planner agent can scan it.

**Promotion behavior is the resolver's job, not the absorber's.** This TRD only emits the cell-agnostic *intended values*:
- Habit 1 → `tdd_default: 'auto'` (the resolver promotes per the table — `skip → auto`, `auto → strict`)
- Habit 2 → `test_list_first: 'required'`
- Habit 4 → `fixture_strategy: 'generators'`
- Habit 5 → `outside_in: true`
- Habit 6 → `multitenancy: 'required'` (legacy; existing field) + `security_isolation: 'multi_tenant_required'` (new; resolver-side check restricts this to api kind via the kind=api guard in TRD 0.2's resolve function)
</research_context>

<gotchas>
- **`_playbookDetected` flag semantics:** Set in TRD 0.2 as `(tddSections.length > 0)`. This TRD does NOT change that semantic. Even an empty "## TDD Playbook" heading with no body sets the flag, because the heading itself is signal. Test C1 verifies this.
- **`security_isolation` from absorber:** The absorber emits `security_isolation: 'multi_tenant_required'` regardless of kind. The resolver (TRD 0.2 step 3) restricts the *application* of that override to api kind only. Tests in this TRD verify the absorber emits correctly; the kind restriction is tested in TRD 0.2.
- **Regex pattern brittleness:** The user's CLAUDE.md text WILL evolve. Patterns are designed for resilience: each habit has 2-3 alternative phrasings. If the user later rewrites their playbook, patterns may need updates. Document this expectation in claude-md.cjs's header comment.
- **The `path` to /Users/markemerson/.claude/CLAUDE.md is hardcoded in verification_commands** for the round-trip check. This is intentional for the developer's local environment — tests use sandboxed fixtures via `fs.mkdtempSync` and never read the real file directly. The verification command is a smoke check, not a CI requirement.
- **`extractSections` already handles H2 detection.** This TRD extends `deriveOverrides`, not `extractSections`. The 6 habits are detected from the *body text* of any matched H2 section, not from new heading patterns.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1 (RED): Add 13 failing test cases + realCLAUDEMd fixture, commit as test:</name>
  <files>plugins/devflow/devflow/bin/lib/claude-md.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs</files>
  <action>
1. Append 13 failing tests to `claude-md.test.cjs`, organized in 4 describe blocks:
   - `describe('TDD Playbook habits — individual detection', ...)` — Group A (6 cases, A1-A6)
   - `describe('TDD Playbook habits — composite real-world', ...)` — Group B (3 cases)
   - `describe('TDD Playbook habits — edge cases', ...)` — Group C (4 cases)
   - `describe('TDD Playbook habits — back-compat', ...)` — Group D (3 cases)

   Test scaffolding follows existing patterns (use `fs.mkdtempSync` for sandboxed `userHome`, write a CLAUDE.md per case, call `cm.absorb({ userHome })`, then `cm.deriveOverrides(absorbed)`). Cleanup in afterEach.

2. Extend `intent-fixtures.cjs` with `realCLAUDEMd()` returning the user's actual CLAUDE.md text. The function MUST be hand-edited from the visible CLAUDE.md context — copy paragraph-by-paragraph, do NOT generate via LLM. Include all 6 named habits + the "What to skip" section + the "Why" section + the "How to apply" section, faithfully reproducing the user's playbook structure.

3. For Group A tests, use minimal CLAUDE.md fixtures that exercise ONE habit each (e.g., a CLAUDE.md with just `## TDD Playbook\n\nForce TDD TRDs at planning time.`). For Group B tests, use `realCLAUDEMd()` for B1 and curated subsets for B2/B3.

4. Run `npm test` to confirm all 13 new tests fail (RED).

5. Commit with message: `test(00-04): add failing test list for 6-habit absorption mapping`

# CRITICAL: realCLAUDEMd() must be hand-edited. Per the no_llm_test_data constraint, the text comes from the visible system context, copy-pasted by Claude in code-edit mode (not generated as a "best guess").
# CRITICAL: All 13 tests must run RED. Don't skip any. The test list discipline (habit 2) requires the full list at RED stage.
# GOTCHA: Group A6's test for habit 3 needs to assert "no structured override" — i.e., assert.strictEqual(overrides.tdd_red_green_refactor, undefined). The directive is in `absorb`'s output (`directives.tdd[i].body`), not `deriveOverrides`'s.
# PATTERN: Mirror existing claude-md.test.cjs structure: imports at top, describe blocks, helper functions inline.
  </action>
  <verify>
1. `npm test 2>&1 | grep -c "fail\|FAIL"` returns approximately 13 + any pre-existing failures from upstream TRDs.
2. `git log --oneline -1` shows a `test(00-04):` commit.
3. `git diff HEAD~1 -- plugins/devflow/devflow/bin/lib/claude-md.cjs` is empty (only test files + fixture file modified).
4. `realCLAUDEMd()` exported from `intent-fixtures.cjs`; calling it returns a string of length > 1500 (the user's CLAUDE.md is ~3000 chars).
  </verify>
  <done>
- All 13 tests written, named per the test list, failing for the right reason.
- realCLAUDEMd fixture committed as hand-edited text.
- Existing tests still pass.
- Single test: commit on the branch.
  </done>
  <recovery>
- If realCLAUDEMd fixture text is corrupted (special chars, broken multi-line strings): use a JS template literal (backticks) and escape backticks/dollar-signs as needed.
- If a test asserts on a regex match that won't match the literal CLAUDE.md text: re-read the user's CLAUDE.md and copy the exact phrase into the test fixture.
- If commit fails on a hook: read the error; usually a missing scope. Use `test(00-04): ...`.
  </recovery>
</task>

<task type="auto">
  <name>Task 2 (GREEN): Implement PLAYBOOK_HABITS constant + extended deriveOverrides, commit as feat:</name>
  <files>plugins/devflow/devflow/bin/lib/claude-md.cjs</files>
  <action>
1. At the top of `claude-md.cjs`, after the HEADING_PATTERNS constant (line 17), add:

   ```javascript
   const PLAYBOOK_HABITS = [
     // ... 6 habit definitions per the research_context table above
   ];
   ```

2. Replace the body of `deriveOverrides` (lines 102-130) with a loop over `PLAYBOOK_HABITS`. Preserve:
   - The existing project-vs-user precedence (project wins on conflict)
   - The existing `_playbookDetected` flag set in TRD 0.2 (or set it here if TRD 0.2 didn't — check via grep before editing)
   - The legacy `tdd: 'strict'`, `multitenancy: 'required'`, `propertyBased: 'skip'` fields for back-compat

   New shape:

   ```javascript
   function deriveOverrides(directives) {
     const overrides = {};
     const tddSections = (directives.tdd || []).concat(directives.test || []);
     overrides._playbookDetected = tddSections.length > 0;
     if (tddSections.length === 0) return overrides;

     const sorted = [...tddSections].sort((a, b) => {
       if (a.source === b.source) return 0;
       return a.source === 'user' ? -1 : 1;
     });

     for (const section of sorted) {
       const body = section.body.toLowerCase();

       // Legacy fields (preserve back-compat with existing tests)
       if (/all\s+(business\s+logic|features?)\s+(must\s+be|default(s)?\s+to)\s+tdd/.test(body)
           || /force\s+tdd\s+trds?\s+at\s+planning/.test(body)) {
         overrides.tdd = 'strict';
       }
       if (/multi-?tenan(t|cy)\s+(guard|isolation|assertion).*every\s+test/.test(body)
           || /test\s+the\s+wrong-?tenant.*always/.test(body)) {
         overrides.multitenancy = 'required';
       }
       if (/skip\s+property-?based/.test(body) || /no\s+property-?based/.test(body)) {
         overrides.propertyBased = 'skip';
       }

       // New structured-field overrides (per PLAYBOOK_HABITS)
       for (const habit of PLAYBOOK_HABITS) {
         if (habit.field === null) continue;  // habit 3 (freeform-only)
         const matched = habit.patterns.some(re => re.test(section.body));  // case sensitivity baked into the regex flags
         if (matched) {
           overrides[habit.field] = habit.value;
         }
       }
     }

     return overrides;
   }
   ```

3. Define the 6 habits in `PLAYBOOK_HABITS` per the research_context regex catalog. Habit 3's `field: null` indicates it's freeform-only.

4. Add `PLAYBOOK_HABITS` to module.exports.

5. Run `npm test`. All 13 new tests pass GREEN. All existing tests continue passing.

6. Commit with message: `feat(00-04): map all 6 TDD Playbook habits to structured fields and freeform directives`

# CRITICAL: Test patterns from research_context use `/i` flag for case-insensitivity. Apply consistently — the existing legacy patterns rely on `body = section.body.toLowerCase()` and don't use `/i` flag. Do not break the legacy patterns; the new patterns can use either approach as long as they match the literal CLAUDE.md text.
# CRITICAL: When BOTH legacy and new patterns match (e.g., "force tdd" body sets BOTH `overrides.tdd = 'strict'` AND `overrides.tdd_default = 'auto'`), keep both fields. The resolver (TRD 0.2) reads `tdd_default` for new behavior and `tdd` for legacy fallback.
# GOTCHA: The user's actual CLAUDE.md uses Unicode arrows like "RED → GREEN → REFACTOR" (U+2192). The regex `/red\s*[→\->]+\s*green\s*[→\->]+\s*refactor/i` accommodates both arrow forms. Test the regex directly: `/red\s*[→\->]+\s*green/i.test('RED → GREEN')` returns true.
# GOTCHA: Habit 3's body match is detected but produces no structured override (field === null). The directive content is already preserved in absorb()'s `directives.tdd` array; the planner reads it from there.
# PATTERN: Single-loop iteration over PLAYBOOK_HABITS keeps the function readable. Avoid early-return inside the loop — set overrides incrementally.
  </action>
  <verify>
1. `npm test` exits 0. All 13 new tests pass; ~30 existing tests continue passing.
2. The smoke command in this TRD's verification_commands frontmatter runs: `node -e '...'` reading the real `~/.claude/CLAUDE.md` and confirming `_playbookDetected: true` plus 5 structured fields surface.
3. `git log --oneline -2` shows `test(00-04):` then `feat(00-04):` (in that order).
4. `module.exports.PLAYBOOK_HABITS.length === 6` (verifiable via `node -e 'const cm=require("./plugins/devflow/devflow/bin/lib/claude-md.cjs"); console.log(cm.PLAYBOOK_HABITS.length)'` returns 6).
  </verify>
  <done>
- All 13 tests GREEN. All existing tests still GREEN.
- Real `~/.claude/CLAUDE.md` round-trips: when absorbed, all 6 habits are detected and 5 structured fields are emitted.
- Habit 3 produces directive content (in absorb()) but no structured override (in deriveOverrides()).
- Two atomic commits: test(00-04) before feat(00-04).
- `PLAYBOOK_HABITS` exported from the module for inspection / testing.
  </done>
  <recovery>
- If the real-CLAUDE.md round-trip command fails: open `/Users/markemerson/.claude/CLAUDE.md` and verify the literal phrases the regexes target. Adjust regexes to match the actual text.
- If TRD 0.2's tests start failing after this TRD's changes: most likely `_playbookDetected` semantics changed. Verify the flag is set identically to TRD 0.2's expectations (via `tddSections.length > 0`).
- If C3 (project wins over user) fails: the sort order at line 108-111 of claude-md.cjs is the canonical precedence. Verify the new loop iterates in the sorted order.
- If a test for an individual habit fails because the regex pattern doesn't match the test fixture's CLAUDE.md text: ALIGN the regex with the fixture text. Do not weaken the test to fit a broken regex.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. `npm test` passes — 13 new tests + all existing tests green.
2. The real-CLAUDE.md smoke command returns `_playbookDetected: true` and lists at least 5 structured-field overrides.
3. Two commits on branch: `test(00-04)` followed by `feat(00-04)`.
4. `PLAYBOOK_HABITS` constant defines all 6 habits with patterns + field + value (or `field: null` for habit 3).
5. Existing back-compat fields (`tdd`, `multitenancy`, `propertyBased`) preserved.
</verification>

<success_criteria>
Maps to ROADMAP.md objective 0:
- Criterion 4 (CLAUDE.md absorption maps all 6 TDD Playbook habits to 5 structured fields + 1 freeform directive) — full coverage. Habits 1, 2, 4, 5, 6 → structured (tdd_default, test_list_first, fixture_strategy, outside_in, security_isolation/multitenancy). Habit 3 → freeform directive (preserved in `directives.tdd[].body`).

Does NOT close criteria 1 (TRD 01), 2 (TRD 02), 3/6 (TRD 03), 5 (TRD 06), 7 (TRD 05), 8/9/10 (multiple TRDs covered).
</success_criteria>

<output>
After completion, create `.planning/objectives/00-refine-defaults-table/00-04-claude-md-absorption-SUMMARY.md` documenting:
- The literal regex patterns used per habit
- The realCLAUDEMd fixture's structure (paragraph headings only, not full text — keep the SUMMARY readable)
- Confirmation of the round-trip smoke against the real file
- Any patterns that needed adjustment based on the user's actual CLAUDE.md text
- Commit hashes for the two atomic commits
</output>
