<overview>
TDD is enforced, not optional. The red-green-refactor cycle forces you to think about behavior before implementation, producing cleaner interfaces and more testable code.

**The Iron Law:** No production code without a failing test first. No exceptions without explicit `<!-- TDD-EXCEPTION: {reason} -->` markers.

**Key insight:** TDD work is fundamentally heavier than standard tasks — it requires 2-3 execution cycles (RED → GREEN → REFACTOR), each with file reads, test runs, and potential debugging. TDD features get dedicated TRDs to ensure full context is available throughout the cycle.
</overview>

<iron_law>
## The Iron Law of TDD

**No production code without a failing test first.**

This is not a guideline. This is not a suggestion. This is a rule enforced at execution time.

**What this means:**
1. Write the test FIRST
2. Run it — it MUST fail (RED)
3. Write the minimum code to pass (GREEN)
4. Clean up (REFACTOR)
5. Verify tests still pass

**What this prevents:**
- Writing code that "should work" but has no proof
- Tests that pass because they don't test anything
- Implementation that drifts from specification
- Bugs that hide in untested paths

**Evidence required at each step:**
```
RED:    Command: npm test -- --grep "feature"    Exit: 1 (FAIL expected)
GREEN:  Command: npm test -- --grep "feature"    Exit: 0 (PASS)
REFACTOR: Command: npm test                      Exit: 0 (ALL PASS)
```
</iron_law>

<anti_pattern_rationalization>
## Anti-Pattern Rationalization Table

Every excuse has been heard. None are valid.

| Excuse | Reality | What To Do Instead |
|---|---|---|
| "It's just a small change" | Small changes cause large bugs. The regex fix that broke email validation. The null check that masked a logic error. | Write a test for the small change. It takes 2 minutes. |
| "I'll add tests later" | "Later" never comes. Test debt compounds faster than code debt. | Write the test now. The RED phase takes < 5 minutes. |
| "This can't be tested" | Almost everything can be tested. If it truly can't, use `<!-- TDD-EXCEPTION: {reason} -->`. | Refactor to make it testable, or document the exception. |
| "The tests are slowing me down" | Tests slow you down NOW and save you 10x LATER. Every production bug was "faster" to skip testing. | Invest in test speed (parallelization, mocking, fixtures). |
| "I know it works" | You believe it works. Beliefs are not evidence. | Prove it works. Run the test. Capture the output. |
| "It's just configuration" | Config bugs are the hardest to diagnose. Wrong port, wrong env, wrong URL. | Test the config. Verify it loads. Check the values. |
| "The framework handles it" | Frameworks have bugs too. Your usage of the framework has bugs. | Test your integration with the framework. |
| "Tests are for CI" | CI catches bugs AFTER you've moved on. TDD catches bugs BEFORE you commit. | Run tests locally. Every time. Before every commit. |
| "I'll refactor to be testable first" | Refactoring without tests is flying blind. How do you know the refactor didn't break anything? | Write characterization tests first, then refactor. |
| "It probably passes" | "Probably" is not "definitely." Run the test. | Run the test. Capture the output. Include the exit code. |

</anti_pattern_rationalization>

<red_flags>
## Red Flags — Prohibited Language

These phrases in executor output indicate TDD violations. Grep for them:

```bash
grep -iE "(should work|probably passes|I believe this works|I think it's correct|looks right to me|seems to work|appears to function|ought to pass)" SUMMARY.md
```

**Prohibited phrases:**
- "should work" — Run the test instead of guessing
- "probably passes" — Probably ≠ definitely
- "I believe this works" — Beliefs need evidence
- "I think it's correct" — Thinking needs proving
- "looks right to me" — Looking is not testing
- "seems to work" — Seeming is not passing
- "appears to function" — Appearances deceive
- "ought to pass" — Run it and find out

**Required replacements:**
- "Tests pass with exit code 0"
- "All 12 assertions pass"
- "npm test output: PASS (captured above)"
- "Verified: command exits 0, output matches expected"

</red_flags>

<exception_mechanism>
## TDD Exception Mechanism

When TDD genuinely doesn't apply, you MUST:

1. Add an HTML comment in the TRD or source file:
```html
<!-- TDD-EXCEPTION: Configuration-only change, no testable behavior -->
```

2. Document in SUMMARY.md under "TDD Exceptions":
```markdown
## TDD Exceptions
- Task 2: Configuration change (no testable behavior) — `<!-- TDD-EXCEPTION: ... -->`
```

3. Valid exception reasons:
   - Configuration-only changes (env vars, build config)
   - Pure UI styling (CSS/Tailwind only, no logic)
   - Documentation-only changes
   - Dependency version bumps
   - Generated code (migrations, type definitions)

4. **Invalid exception reasons:**
   - "Too simple to test" — Simple things are simple to test
   - "No time" — TDD saves time
   - "Will add tests later" — No you won't
   - "Framework handles it" — Test your usage

Abusing TDD exceptions is itself an anti-pattern tracked in SUMMARY.md.
</exception_mechanism>

<when_to_use_tdd>
## When TDD Improves Quality

**TDD candidates (create a TDD TRD):**
- Business logic with defined inputs/outputs
- API endpoints with request/response contracts
- Data transformations, parsing, formatting
- Validation rules and constraints
- Algorithms with testable behavior
- State machines and workflows
- Utility functions with clear specifications

**Skip TDD (use standard TRD with `type="auto"` tasks):**
- UI layout, styling, visual components
- Configuration changes
- Glue code connecting existing components
- One-off scripts and migrations
- Simple CRUD with no business logic
- Exploratory prototyping

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
→ Yes: Create a TDD TRD
→ No: Use standard TRD, add tests after if needed
</when_to_use_tdd>

<tdd_plan_structure>
## TDD Plan Structure

Each TDD TRD implements **one feature** through the full RED-GREEN-REFACTOR cycle.

```markdown
---
objective: XX-name
trd: NN
type: tdd
---

<objective>
[What feature and why]
Purpose: [Design benefit of TDD for this feature]
Output: [Working, tested feature]
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@relevant/source/files.ts
</context>

<feature>
  <name>[Feature name]</name>
  <files>[source file, test file]</files>
  <behavior>
    [Expected behavior in testable terms]
    Cases: input → expected output
  </behavior>
  <implementation>[How to implement once tests pass]</implementation>
</feature>

<verification>
[Test command that proves feature works]
</verification>

<success_criteria>
- Failing test written and committed
- Implementation passes test
- Refactor complete (if needed)
- All 2-3 commits present
</success_criteria>

<output>
After completion, create SUMMARY.md with:
- RED: What test was written, why it failed
- GREEN: What implementation made it pass
- REFACTOR: What cleanup was done (if any)
- Commits: List of commits produced
</output>
```

**One feature per TDD TRD.** If features are trivial enough to batch, they're trivial enough to skip TDD — use a standard TRD and add tests after.
</tdd_plan_structure>

<execution_flow>
## Red-Green-Refactor Cycle

**RED - Write failing test:**
1. Create test file following project conventions
2. Write test describing expected behavior (from `<behavior>` element)
3. Run test — it MUST fail
4. Capture evidence: command, output, exit code
5. If test passes: feature exists or test is wrong. Investigate.
6. Commit: `test({objective}-{trd}): add failing test for [feature]`

**GREEN - Implement to pass:**
1. Write minimal code to make test pass
2. No cleverness, no optimization — just make it work
3. Run test — it MUST pass
4. Capture evidence: command, output, exit code
5. Commit: `feat({objective}-{trd}): implement [feature]`

**REFACTOR (if needed):**
1. Clean up implementation if obvious improvements exist
2. Run tests — MUST still pass
3. Capture evidence: command, output, exit code
4. Only commit if changes made: `refactor({objective}-{trd}): clean up [feature]`

**Result:** Each TDD TRD produces 2-3 atomic commits with full evidence trail.
</execution_flow>

<test_quality>
## Good Tests vs Bad Tests

**Test behavior, not implementation:**
- Good: "returns formatted date string"
- Bad: "calls formatDate helper with correct params"
- Tests should survive refactors

**One concept per test:**
- Good: Separate tests for valid input, empty input, malformed input
- Bad: Single test checking all edge cases with multiple assertions

**Descriptive names:**
- Good: "should reject empty email", "returns null for invalid ID"
- Bad: "test1", "handles error", "works correctly"

**No implementation details:**
- Good: Test public API, observable behavior
- Bad: Mock internals, test private methods, assert on internal state
</test_quality>

<framework_setup>
## Test Framework Setup (If None Exists)

When executing a TDD TRD but no test framework is configured, set it up as part of the RED phase:

**1. Detect project type:**
```bash
# JavaScript/TypeScript
if [ -f package.json ]; then echo "node"; fi

# Python
if [ -f requirements.txt ] || [ -f pyproject.toml ]; then echo "python"; fi

# Go
if [ -f go.mod ]; then echo "go"; fi

# Rust
if [ -f Cargo.toml ]; then echo "rust"; fi
```

**2. Install minimal framework:**
| Project | Framework | Install |
|---------|-----------|---------|
| Node.js | Jest | `npm install -D jest @types/jest ts-jest` |
| Node.js (Vite) | Vitest | `npm install -D vitest` |
| Python | pytest | `pip install pytest` |
| Go | testing | Built-in |
| Rust | cargo test | Built-in |

**3. Create config if needed:**
- Jest: `jest.config.js` with ts-jest preset
- Vitest: `vitest.config.ts` with test globals
- pytest: `pytest.ini` or `pyproject.toml` section

**4. Verify setup:**
```bash
# Run empty test suite — should pass with 0 tests
npm test  # Node
pytest    # Python
go test ./...  # Go
cargo test    # Rust
```

Framework setup is a one-time cost included in the first TDD TRD's RED phase.
</framework_setup>

<error_handling>
## Error Handling

**Test doesn't fail in RED phase:**
- Feature may already exist — investigate
- Test may be wrong (not testing what you think)
- Fix before proceeding

**Test doesn't pass in GREEN phase:**
- Debug implementation
- Don't skip to refactor
- Keep iterating until green

**Tests fail in REFACTOR phase:**
- Undo refactor
- Commit was premature
- Refactor in smaller steps

**Unrelated tests break:**
- Stop and investigate
- May indicate coupling issue
- Fix before proceeding
</error_handling>

<commit_pattern>
## Commit Pattern for TDD TRDs

TDD TRDs produce 2-3 atomic commits (one per phase):

```
test(08-02): add failing test for email validation

- Tests valid email formats accepted
- Tests invalid formats rejected
- Tests empty input handling

feat(08-02): implement email validation

- Regex pattern matches RFC 5322
- Returns boolean for validity
- Handles edge cases (empty, null)

refactor(08-02): extract regex to constant (optional)

- Moved pattern to EMAIL_REGEX constant
- No behavior changes
- Tests still pass
```

**Comparison with standard TRDs:**
- Standard TRDs: 1 commit per task, 2-4 commits per TRD
- TDD TRDs: 2-3 commits for single feature

Both follow same format: `{type}({objective}-{trd}): {description}`
</commit_pattern>

<context_budget>
## Context Budget

TDD TRDs target **~40% context usage** (lower than standard TRDs' ~50%).

Why lower:
- RED phase: write test, run test, potentially debug why it didn't fail
- GREEN phase: implement, run test, potentially iterate on failures
- REFACTOR phase: modify code, run tests, verify no regressions

Each phase involves reading files, running commands, analyzing output. The back-and-forth is inherently heavier than linear task execution.

Single feature focus ensures full quality throughout the cycle.
</context_budget>
