# Anti-Patterns Reference

Consolidated reference of prohibited shortcuts and their detection. Cross-referenced by agents during planning and execution.

<tdd_anti_patterns>

## TDD Anti-Patterns

| Anti-Pattern | Excuse | Reality | Detection |
|---|---|---|---|
| Write tests after | "I'll add tests when it works" | Tests never get written; behavior not locked in | No `test()` commit before `feat()` commit |
| Test the implementation | "I need to test internal methods" | Brittle tests that break on refactor | Tests import private functions or mock internals |
| Skip RED phase | "I know the test will fail" | Test might actually pass (feature exists) | No failing test run recorded |
| Green bar fever | "Let me add more features while I'm here" | Scope creep; untested behavior | Implementation exceeds test coverage |
| Slow tests accepted | "It's only 30 seconds" | Compounds across suite; developers stop running | Test suite > 60s without parallelization |
| It's just a small change | "Too trivial for TDD" | Small changes cause large bugs | Production code changed without corresponding test |
| Probably passes | "The logic is simple enough" | Assumptions are the mother of all bugs | No test run output captured |
| Test and implement together | "More efficient to do both at once" | Defeats the design benefit of TDD | Single commit contains both test and implementation |
| Mock everything | "I need to isolate the unit" | Tests pass but integration breaks | >5 mocks in a single test file |
| Skip REFACTOR | "It works, ship it" | Tech debt accumulates from first commit | No refactor consideration documented |

**Exception mechanism:** When TDD genuinely doesn't apply, mark with:
```html
<!-- TDD-EXCEPTION: {reason} -->
```
Exceptions are logged in SUMMARY.md. Abusing exceptions is itself an anti-pattern.

See also: `@~/.claude/devflow/references/tdd.md` for the full TDD protocol.

</tdd_anti_patterns>

<verification_anti_patterns>

## Verification Anti-Patterns

| Anti-Pattern | Excuse | Reality | Detection |
|---|---|---|---|
| Claim without evidence | "It works, I checked" | No proof of execution | Missing command output + exit code |
| Selective evidence | "The important tests pass" | Hiding failures | Verification output filtered or truncated |
| Visual-only verification | "It looks right" | UI can render without wiring | No functional test (API call, data check) |
| Stale evidence | "It passed earlier" | Code changed since last run | Evidence timestamp older than last commit |
| Exit code ignored | "The output looks fine" | Command failed silently | No `echo $?` or exit code capture |
| Placeholder acceptance | "I'll flesh it out later" | Placeholders ship as features | Files with TODO/FIXME/placeholder in verification |
| Self-referential proof | "The summary says it's done" | Summary claims != reality | SUMMARY.md not cross-checked against disk |

**Required evidence format:**
```
Command: npm test
Exit code: 0
Output: Tests: 12 passed, 12 total
```

</verification_anti_patterns>

<planning_anti_patterns>

## Planning Anti-Patterns

| Anti-Pattern | Excuse | Reality | Detection |
|---|---|---|---|
| Skip research | "I already know this domain" | Missing edge cases, wrong library choices | No RESEARCH.md for complex objectives |
| Over-engineering | "We might need it later" | YAGNI — premature abstraction | Tasks creating unused abstractions |
| Horizontal layers | "Models first, then APIs, then UI" | Fully sequential; no parallelism | All Wave 1 jobs are same type |
| Vague actions | "Implement authentication" | Executor will interpret differently | Task action < 2 sentences |
| Missing verification | "The success criteria covers it" | No runnable command to prove completion | Task has no `<verify>` element |
| Reflexive chaining | "Job 02 depends on Job 01" | False dependencies block parallelism | `depends_on` without file overlap |
| Kitchen sink jobs | "Let's batch these together" | Context overflow; quality degradation | Job has > 3 tasks |
| Copy-paste context | "Include all prior summaries" | Wastes context; confuses executor | > 3 `@SUMMARY.md` references |

</planning_anti_patterns>

<execution_anti_patterns>

## Execution Anti-Patterns

| Anti-Pattern | Excuse | Reality | Detection |
|---|---|---|---|
| Silent failure | "No errors were shown" | Command failed but output was ignored | Missing exit code checks |
| Uncommitted work | "I'll commit at the end" | Work lost on context reset | `git status` shows changes after task |
| Bulk commits | "Everything is related" | Loses atomic revertability | Single commit with > 5 files |
| git add -A | "I know what changed" | Accidentally stages secrets/artifacts | `git add .` or `git add -A` in commands |
| Fix loop | "One more attempt should work" | Infinite retry without root cause | > 3 fix attempts on same issue |
| Scope creep fixes | "While I'm here..." | Unrelated changes mask regressions | Fixes touching files not in job's `files_modified` |
| Skip self-check | "I know it's all there" | Missing files, phantom commits | No Self-Check section in SUMMARY.md |
| Hallucinated completion | "All tasks are done" | Tasks marked complete without execution | SUMMARY claims vs git log mismatch |

</execution_anti_patterns>
