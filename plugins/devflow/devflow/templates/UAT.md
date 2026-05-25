# UAT Template

Template for `.planning/objectives/XX-name/{phase_num}-UAT.md` — persistent UAT session tracking.

---

## File Template

```markdown
---
status: testing | complete | diagnosed
objective: XX-name
source: [list of SUMMARY.md files tested]
started: [ISO timestamp]
updated: [ISO timestamp]
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: [N]
name: [test name]
expected: |
  [what user should observe]
awaiting: user response

## Tests

### 1. [Test Name]
expected: [observable behavior - what user should see]
result: [pending]

### 2. [Test Name]
expected: [observable behavior]
result: pass

### 3. [Test Name]
expected: [observable behavior]
result: issue
reported: "[verbatim user response]"
severity: major

### 4. [Test Name]
expected: [observable behavior]
result: skipped
reason: [why skipped]

...

## Summary

total: [N]
passed: [N]
issues: [N]
pending: [N]
skipped: [N]

## Gaps

<!-- YAML format for plan-objective --gaps consumption -->
- truth: "[expected behavior from test]"
  status: failed
  reason: "User reported: [verbatim response]"
  severity: blocker | major | minor | cosmetic
  test: [N]
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis
```

---

## Auto-generated UAT (REQ-10-06)

For `type: ui` + `stack: flutter` Flutter objectives, `df-tools generate uat <objective>` auto-derives the test list from:

- **State coverage rows:** each `(must_haves.artifacts[*].states[*], platform)` pair across all `type: ui` TRDs — one test row per (state, platform) combination. E.g., a TRD with `platform: [mobile, web]` and 3 states per artifact produces 6 state-coverage rows per artifact (state matrix expansion).
- **Maestro flow rows:** each YAML file in `.maestro/` — one **mobile-only** test row. (Maestro is mobile-only by design — Maestro on Flutter web is blocked upstream by mobile-dev-inc/maestro#2591. See `references/flutter-state-patterns.md` "Web verification mechanism" section.)
- **Web integration rows:** when a TRD has `web` in `platform:`, one row per artifact instructing the user to run `flutter drive --driver=test_driver/integration_test.dart --target=<tests.integration> -d chrome`. The web verifier is `flutter drive`, NOT Maestro.

The auto-generated body conforms to the same format as manually-authored UAT.md — `### N. {test name}\nexpected: ...\nresult: [pending]`. The user walks through it in ~5 min before marking the objective done.

Invocation:

```bash
node ~/.claude/devflow/bin/df-tools.cjs generate uat <objective>
# Writes to .planning/objectives/<obj-dir>/<obj>-UAT.md
```

**Safety:** the generator REFUSES to overwrite an existing UAT.md with non-pending results (i.e., once you've started walkthrough, the auto-generator is locked out).

**State descriptions:** the generator uses human-readable text for common state names (`loading`, `data`, `error`, `empty`, `initial`). Custom state names get a generic "the `<state>` state UI is rendered correctly" template.

**Per-platform expansion:** A TRD with `platform: [mobile, web]` produces row pairs for every (state, platform) combination — verifying the same UI on both platforms. This is REQUIRED coverage by default, not opt-in.

**Web verification mechanism:** Maestro flows are mobile-only. Web verification flows through `flutter drive` invoking the same `tests.integration` path that mobile uses via `flutter test`. There is no web opt-in flag for Maestro — see TRD 10-02's "Web verification mechanism" section for the rationale.

---

<section_rules>

**Frontmatter:**
- `status`: OVERWRITE - "testing" or "complete"
- `objective`: IMMUTABLE - set on creation
- `source`: IMMUTABLE - SUMMARY files being tested
- `started`: IMMUTABLE - set on creation
- `updated`: OVERWRITE - update on every change

**Current Test:**
- OVERWRITE entirely on each test transition
- Shows which test is active and what's awaited
- On completion: "[testing complete]"

**Tests:**
- Each test: OVERWRITE result field when user responds
- `result` values: [pending], pass, issue, skipped
- If issue: add `reported` (verbatim) and `severity` (inferred)
- If skipped: add `reason` if provided

**Summary:**
- OVERWRITE counts after each response
- Tracks: total, passed, issues, pending, skipped

**Gaps:**
- APPEND only when issue found (YAML format)
- After diagnosis: fill `root_cause`, `artifacts`, `missing`, `debug_session`
- This section feeds directly into /devflow:plan-objective --gaps

</section_rules>

<diagnosis_lifecycle>

**After testing complete (status: complete), if gaps exist:**

1. User runs diagnosis (from verify-work offer or manually)
2. diagnose-issues workflow spawns parallel debug agents
3. Each agent investigates one gap, returns root cause
4. UAT.md Gaps section updated with diagnosis:
   - Each gap gets `root_cause`, `artifacts`, `missing`, `debug_session` filled
5. status → "diagnosed"
6. Ready for /devflow:plan-objective --gaps with root causes

**After diagnosis:**
```yaml
## Gaps

- truth: "Comment appears immediately after submission"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
  debug_session: ".planning/debug/comment-not-refreshing.md"
```

</diagnosis_lifecycle>

<lifecycle>

**Creation:** When /devflow:verify-work starts new session
- Extract tests from SUMMARY.md files
- Set status to "testing"
- Current Test points to test 1
- All tests have result: [pending]

**During testing:**
- Present test from Current Test section
- User responds with pass confirmation or issue description
- Update test result (pass/issue/skipped)
- Update Summary counts
- If issue: append to Gaps section (YAML format), infer severity
- Move Current Test to next pending test

**On completion:**
- status → "complete"
- Current Test → "[testing complete]"
- Commit file
- Present summary with next steps

**Resume after /clear:**
1. Read frontmatter → know objective and status
2. Read Current Test → know where we are
3. Find first [pending] result → continue from there
4. Summary shows progress so far

</lifecycle>

<severity_guide>

Severity is INFERRED from user's natural language, never asked.

| User describes | Infer |
|----------------|-------|
| Crash, error, exception, fails completely, unusable | blocker |
| Doesn't work, nothing happens, wrong behavior, missing | major |
| Works but..., slow, weird, minor, small issue | minor |
| Color, font, spacing, alignment, visual, looks off | cosmetic |

Default: **major** (safe default, user can clarify if wrong)

</severity_guide>

<good_example>
```markdown
---
status: diagnosed
objective: 04-comments
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md
started: 2025-01-15T10:30:00Z
updated: 2025-01-15T10:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. View Comments on Post
expected: Comments section expands, shows count and comment list
result: pass

### 2. Create Top-Level Comment
expected: Submit comment via rich text editor, appears in list with author info
result: issue
reported: "works but doesn't show until I refresh the page"
severity: major

### 3. Reply to a Comment
expected: Click Reply, inline composer appears, submit shows nested reply
result: pass

### 4. Visual Nesting
expected: 3+ level thread shows indentation, left borders, caps at reasonable depth
result: pass

### 5. Delete Own Comment
expected: Click delete on own comment, removed or shows [deleted] if has replies
result: pass

### 6. Comment Count
expected: Post shows accurate count, increments when adding comment
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Comment appears immediately after submission in list"
  status: failed
  reason: "User reported: works but doesn't show until I refresh the page"
  severity: major
  test: 2
  root_cause: "useEffect in CommentList.tsx missing commentCount dependency"
  artifacts:
    - path: "src/components/CommentList.tsx"
      issue: "useEffect missing dependency"
  missing:
    - "Add commentCount to useEffect dependency array"
  debug_session: ".planning/debug/comment-not-refreshing.md"
```
</good_example>
