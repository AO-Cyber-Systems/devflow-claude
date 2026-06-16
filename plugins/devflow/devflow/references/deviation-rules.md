# Deviation Rules Reference

**Purpose:** Full definitions of executor deviation Rules 1-4, consumed via @-reference from executor.md. Executors apply these rules automatically during task execution to handle work discovered outside the TRD.

---

**While executing, you WILL discover work not in the TRD.** Apply these rules automatically. Track all deviations for Summary.

**Shared process for Rules 1-3:** Fix inline → add/update tests if applicable → verify fix → continue task → track as `[Rule N - Type] description`

No user permission needed for Rules 1-3.

---

**RULE 1: Auto-fix bugs**

**Trigger:** Code doesn't work as intended (broken behavior, errors, incorrect output)

**Examples:** Wrong queries, logic errors, type errors, null pointer exceptions, broken validation, security vulnerabilities, race conditions, memory leaks

---

**RULE 2: Auto-add missing critical functionality**

**Trigger:** Code missing essential features for correctness, security, or basic operation

**Examples:** Missing error handling, no input validation, missing null checks, no auth on protected routes, missing authorization, no CSRF/CORS, no rate limiting, missing DB indexes, no error logging

**Critical = required for correct/secure/performant operation.** These aren't "features" — they're correctness requirements.

---

**RULE 3: Auto-fix blocking issues**

**Trigger:** Something prevents completing current task

**Examples:** Missing dependency, wrong types, broken imports, missing env var, DB connection error, build config error, missing referenced file, circular dependency

---

**RULE 4: Ask about architectural changes**

**Trigger:** Fix requires significant structural modification

**Examples:** New DB table (not column), major schema changes, new service layer, switching libraries/frameworks, changing auth approach, new infrastructure, breaking API changes

**Action:** STOP → return a structured, queueable checkpoint. **User decision required.**

The Rule 4 return MUST be structured so the orchestrator can park it in the decision queue. Include ALL of the following fields:

```
decision: [one-line statement of what is being decided — e.g., "Switch auth library from custom JWT to jose"]

context: |
  What found: [describe the structural issue encountered]
  Why needed: [why the current approach cannot proceed without this change]
  Impact: [files/systems affected, risk level, migration effort]

options:
  option-a:
    name: [Current approach — keep as-is]
    pros: [what works about it]
    cons: [why it cannot proceed / the blocker]
  option-b:
    name: [Proposed change — executor's recommendation]
    pros: [benefits]
    cons: [risks / additional work]
  option-c:  # optional — add when a meaningful third path exists
    name: [Alternative]
    pros: [benefits]
    cons: [tradeoffs]

recommendation: option-b  # executor's pick
rationale: [one-line reason for the recommendation]
```

**In autonomous mode:** The orchestrator parks this return in the decision queue and continues independent work — your structured return IS the decision file content. Make options self-contained (no implicit context); the reader will see only this return, not your conversation history.

---

**Edge cases:**
- Missing validation → Rule 2 (security)
- Crashes on null → Rule 1 (bug)
- Need new table → Rule 4 (architectural)
- Need new column → Rule 1 or 2 (depends on context)

**When in doubt:** "Does this affect correctness, security, or ability to complete task?" YES → Rules 1-3. MAYBE → Rule 4.

---

**SCOPE BOUNDARY:**
Only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing warnings, linting errors, or failures in unrelated files are out of scope.
- Log out-of-scope discoveries to `deferred-items.md` in the objective directory
- Do NOT fix them
- Do NOT re-run builds hoping they resolve themselves

**FIX ATTEMPT LIMIT:**
Track auto-fix attempts per task. After 3 auto-fix attempts on a single task:
- STOP fixing — document remaining issues in SUMMARY.md under "Deferred Issues"
- Continue to the next task (or return checkpoint if blocked)
- Do NOT restart the build to find more issues
