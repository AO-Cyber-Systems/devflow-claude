# Summary Template

Template for `.planning/objectives/XX-name/{objective}-{trd}-SUMMARY.md` - task completion documentation with evidence.

---

## File Template

```markdown
---
objective: XX-name
job: YY
subsystem: [primary category: auth, payments, ui, api, database, infra, testing, etc.]
tags: [searchable tech: jwt, stripe, react, postgres, prisma]

# Dependency graph
requires:
  - objective: [prior objective this depends on]
    provides: [what that objective built that this uses]
provides:
  - [bullet list of what this objective built/delivered]
affects: [list of objective names or keywords that will need this context]

# Tech tracking
tech-stack:
  added: [libraries/tools added in this objective]
  patterns: [architectural/code patterns established]

key-files:
  created: [important files created]
  modified: [important files modified]

key-decisions:
  - "Decision 1"
  - "Decision 2"

patterns-established:
  - "Pattern 1: description"
  - "Pattern 2: description"

requirements-completed: []  # REQUIRED — Copy ALL requirement IDs from this TRD's `requirements` frontmatter field.

# Verification evidence
verification:
  gates_defined: 3          # Number of validation gates in TRD
  gates_passed: 3           # Number that passed
  auto_fix_cycles: 0        # 0, 1, or 2 auto-fix cycles used
  tdd_evidence: false       # true if type: tdd with RED/GREEN/REFACTOR evidence
  test_pairing: true        # true if all source files have test pairs

# Metrics
duration: Xmin
completed: YYYY-MM-DD
---

# Objective [X]: [Name] Summary

**[Substantive one-liner describing outcome - NOT "objective complete" or "implementation finished"]**

## Performance

- **Duration:** [time] (e.g., 23 min, 1h 15m)
- **Started:** [ISO timestamp]
- **Completed:** [ISO timestamp]
- **Tasks:** [count completed]
- **Files modified:** [count]

## Accomplishments
- [Most important outcome]
- [Second key accomplishment]
- [Third if applicable]

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: [task name] | `[verify command]` | 0 | PASS |
| 2: [task name] | `[verify command]` | 0 | PASS |
| 3: [task name] | `[verify command]` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1: [task name]** - `abc123f` (feat/fix/test/refactor)
2. **Task 2: [task name]** - `def456g` (feat/fix/test/refactor)
3. **Task 3: [task name]** - `hij789k` (feat/fix/test/refactor)

**Plan metadata:** `lmn012o` (docs: complete plan)

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | `[lint command]` | 0 | PASS |
| test | `[test command]` | 0 | PASS |
| build | `[build command]` | 0 | PASS |

## TDD Evidence
<!-- Only include for type: tdd TRDs -->

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `[test command]` | 1 | FAIL (correct) |
| GREEN | `[test command]` | 0 | PASS (correct) |
| REFACTOR | `[test command]` | 0 | PASS (correct) |

## Post-TRD Verification

- **Auto-fix cycles used:** [0|1|2]
- **Must-haves verified:** [N]/[M]
- **Gate failures:** [list or "None"]

## TDD Exceptions
<!-- Only include if TDD-EXCEPTION markers were used -->
[List any tasks that used TDD exceptions with reasons]

## Files Created/Modified
- `path/to/file.ts` - What it does
- `path/to/another.ts` - What it does

## Decisions Made
[Key decisions with brief rationale, or "None - followed plan as specified"]

## Deviations from Plan

[If no deviations: "None - TRD executed exactly as written"]

[If deviations occurred:]

### Auto-fixed Issues

**1. [Rule X - Category] Brief description**
- **Found during:** Task [N] ([task name])
- **Issue:** [What was wrong]
- **Fix:** [What was done]
- **Files modified:** [file paths]
- **Verification:** [How it was verified]
- **Committed in:** [hash] (part of task commit)

[... repeat for each auto-fix ...]

---

**Total deviations:** [N] auto-fixed ([breakdown by rule])
**Impact on plan:** [Brief assessment - e.g., "All auto-fixes necessary for correctness/security. No scope creep."]

## Issues Encountered
[Problems and how they were resolved, or "None"]

## User Setup Required

[If USER-SETUP.md was generated:]
**External services require manual configuration.** See [{objective}-USER-SETUP.md](./{objective}-USER-SETUP.md) for:
- Environment variables to add
- Dashboard configuration steps
- Verification commands

[If no USER-SETUP.md:]
None - no external service configuration required.

## Next Objective Readiness
[What's ready for next objective]
[Any blockers or concerns]

---
*Objective: XX-name*
*Completed: [date]*
```

<frontmatter_guidance>
**Purpose:** Enable automatic context assembly via dependency graph. Frontmatter makes summary metadata machine-readable so plan-objective can scan all summaries quickly and select relevant ones based on dependencies.

**Fast scanning:** Frontmatter is first ~30 lines, cheap to scan across all summaries without reading full content.

**Dependency graph:** `requires`/`provides`/`affects` create explicit links between objectives, enabling transitive closure for context selection.

**Verification fields:** `verification` section tracks evidence completeness — gates defined vs passed, auto-fix cycles, TDD evidence, test pairing.

**Key-files:** Important files for @context references in TRD.md.

**Patterns:** Established conventions future objectives should maintain.

**Population:** Frontmatter is populated during summary creation. See `<step name="create_summary">` for field-by-field guidance.
</frontmatter_guidance>

<one_liner_rules>
The one-liner MUST be substantive:

**Good:**
- "JWT auth with refresh rotation using jose library"
- "Prisma schema with User, Session, and Product models"
- "Dashboard with real-time metrics via Server-Sent Events"

**Bad:**
- "Objective complete"
- "Authentication implemented"
- "Foundation finished"
- "All tasks done"

The one-liner should tell someone what actually shipped.
</one_liner_rules>

<evidence_rules>
## Evidence Requirements

**Task Evidence table is MANDATORY.** Every task must have:
- Verify command that was run
- Exit code (0 = pass, non-zero = fail)
- Status (PASS/FAIL)

**Validation Gate Results are MANDATORY** when gates are defined in the TRD.

**TDD Evidence is MANDATORY** for `type: tdd` TRDs:
- RED phase: test command, exit code (must be non-zero), output
- GREEN phase: test command, exit code (must be 0), output
- REFACTOR phase: test command, exit code (must be 0), output

**Post-TRD Verification is MANDATORY:**
- Auto-fix cycles used (0, 1, or 2)
- Must-haves verified count
- Any gate failures

**Prohibited:** Summary claiming completion without evidence tables populated.
</evidence_rules>

<example>
```markdown
# Objective 1: Foundation Summary

**JWT auth with refresh rotation using jose library, Prisma User model, and protected API middleware**

## Performance

- **Duration:** 28 min
- **Started:** 2025-01-15T14:22:10Z
- **Completed:** 2025-01-15T14:50:33Z
- **Tasks:** 5
- **Files modified:** 8

## Accomplishments
- User model with email/password auth
- Login/logout endpoints with httpOnly JWT cookies
- Protected route middleware checking token validity
- Refresh token rotation on each request

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Prisma schema | `npx prisma db push` | 0 | PASS |
| 2: Login endpoint | `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/auth/login` | 0 | PASS |
| 3: JWT helpers | `npm test -- --grep "jwt"` | 0 | PASS |
| 4: Auth middleware | `npm test -- --grep "auth"` | 0 | PASS |
| 5: Logout endpoint | `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/auth/logout` | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| build | `npm run build` | 0 | PASS |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5
- **Gate failures:** None

## Files Created/Modified
- `prisma/schema.prisma` - User and Session models
- `src/app/api/auth/login/route.ts` - Login endpoint
- `src/app/api/auth/logout/route.ts` - Logout endpoint
- `src/middleware.ts` - Protected route checks
- `src/lib/auth.ts` - JWT helpers using jose

## Decisions Made
- Used jose instead of jsonwebtoken (ESM-native, Edge-compatible)
- 15-min access tokens with 7-day refresh tokens
- Storing refresh tokens in database for revocation capability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added password hashing with bcrypt**
- **Found during:** Task 2 (Login endpoint implementation)
- **Issue:** Plan didn't specify password hashing
- **Fix:** Added bcrypt hashing on registration, comparison on login
- **Files modified:** src/app/api/auth/login/route.ts, src/lib/auth.ts
- **Verification:** Password hash test passes
- **Committed in:** abc123f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for security. No scope creep.

## Issues Encountered
None

## Next Objective Readiness
- Auth foundation complete, ready for feature development

---
*Objective: 01-foundation*
*Completed: 2025-01-15*
```
</example>

<guidelines>
**Frontmatter:** MANDATORY - complete all fields including verification section. Enables automatic context assembly and evidence tracking.

**Evidence:** MANDATORY - Task Evidence table, Validation Gate Results, Post-TRD Verification. No evidence = incomplete summary.

**One-liner:** Must be substantive. "JWT auth with refresh rotation using jose library" not "Authentication implemented".

**Decisions section:**
- Key decisions made during execution with rationale
- Extracted to STATE.md accumulated context
- Use "None - followed plan as specified" if no deviations

**After creation:** STATE.md updated with position, decisions, issues.
</guidelines>
