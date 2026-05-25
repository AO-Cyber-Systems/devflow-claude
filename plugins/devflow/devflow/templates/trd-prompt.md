# Task Requirements Document (TRD) Template

> **Note:** Planning methodology is in `agents/planner.md`.
> This template defines the TRD.md output format that the agent produces.
> TRD replaces JOB.md as the primary execution document. Old JOB.md files still work for backward compatibility.

Template for `.planning/objectives/XX-name/{objective}-{trd}-TRD.md` - self-contained task documents optimized for parallel execution.

**Naming:** Use `{objective}-{trd}-TRD.md` format (e.g., `01-02-TRD.md` for Objective 1, TRD 2)

---

## File Template

```markdown
---
objective: XX-name
trd: NN
type: standard                # standard | tdd | ui
wave: N                       # Execution wave (1, 2, 3...). Pre-computed at plan time.
depends_on: []                # TRD IDs this task requires (e.g., ["01-01"]).
files_modified: []            # Files this TRD modifies.
autonomous: true              # false if TRD has checkpoints requiring user interaction
requirements: []              # REQUIRED — Requirement IDs from ROADMAP. MUST NOT be empty.
user_setup: []                # Human-required setup Claude cannot automate (see below)

# Goal-backward verification (derived during planning, verified after execution)
must_haves:
  truths: []                  # Observable behaviors that must be true
  artifacts: []               # Files that must exist with real implementation
  key_links: []               # Critical connections between artifacts

# ── Flutter UI fields (OPTIONAL — present only when type: ui) ──
# When type: ui, the planner (TRD 10-03) requires all of these via PLANNING INCONCLUSIVE.
# The validator schema (FRONTMATTER_SCHEMAS.trd) does NOT enforce them — non-UI TRDs are unaffected.
stack: flutter                 # currently only 'flutter' is meaningful for type: ui
platform: [mobile, web]        # DEFAULT for Flutter UI TRDs: BOTH platforms are required coverage.
                               # Allowed: [mobile, web], [mobile], [web]. Default if planner detects Flutter UI scope: [mobile, web].
state_management: riverpod     # one of: riverpod | bloc | setState | provider | other
api_contract:                  # SHA pinning for referenced API contract files (per REQ-10-08)
  - path: "lib/api/user_client.dart"
    sha: "ab12cd34ef..."       # SHA256, populated at plan time by api-contract.cjs helper
# The per-artifact `states:` and `tests:` sub-fields live under must_haves.artifacts:
# must_haves:
#   artifacts:
#     - path: "lib/screens/user_list_screen.dart"
#       provides: "User list screen"
#       contains: "AsyncValue"
#       states: [loading, data, error, empty]   # NEW: required for type: ui artifacts
#       tests:                                  # NEW: required for type: ui artifacts
#         widget: "test/screens/user_list_screen_test.dart"
#         integration: "integration_test/user_list_flow_test.dart"
#         maestro: ".maestro/user_list.yaml"
---

<objective>
[What this TRD accomplishes]

Purpose: [Why this matters for the project]
Output: [What artifacts will be created]
</objective>

<file_tree>
<!-- Optional: Include when TRD creates 2+ new files -->
Files created/modified by this TRD:
```
src/
├── middleware/
│   └── auth.ts          ← CREATE
├── lib/
│   └── jwt.ts           ← CREATE
└── app/api/auth/
    └── login/route.ts   ← MODIFY
```
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
[If TRD contains checkpoint tasks (type="checkpoint:*"), add:]
@~/.claude/devflow/references/checkpoints.md
[If TRD has type: tdd, add:]
@~/.claude/devflow/references/tdd.md
</execution_context>

<embedded_context>
<!-- Key code snippets pulled during planning — not just @path references -->
<!-- Include actual relevant code the executor needs to see -->
[Relevant existing implementations, type definitions, or patterns
that the executor needs to understand and follow]
</embedded_context>

<codebase_examples>
<!-- Existing patterns to follow — actual code, not descriptions -->
[Real code snippets from the codebase showing the patterns
this TRD should follow for consistency]
</codebase_examples>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Only reference prior SUMMARY refs if genuinely needed
@src/relevant/source.ts
</context>

<research_context>
<!-- Optional: Include when RESEARCH.md exists and is relevant -->
[Key findings relevant to THIS TRD's scope]
</research_context>

<anti_patterns>
<!-- Task-specific anti-patterns to avoid -->
[What NOT to do for this specific task, with reasons]
See also: @~/.claude/devflow/references/anti-patterns.md
</anti_patterns>

<gotchas>
<!-- Optional: Include when TRD touches areas with known issues -->
[Warnings about this TRD's specific domain/libraries]
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: [Action-oriented name]</name>
  <files>path/to/file.ext, another/file.ext</files>
  <action>[Specific implementation — what to do, how to do it, what to avoid and WHY]</action>
  <verify>[Command or check to prove it worked]</verify>
  <recovery>[What to do if verification fails]</recovery>
  <done>[Measurable acceptance criteria]</done>
</task>

<!-- For TDD TRDs (type: tdd), use this task structure instead: -->
<task type="tdd">
  <name>Task 1: [Feature name]</name>
  <files>path/to/source.ts, path/to/source.test.ts</files>
  <test>[Test to write — what behavior to assert]</test>
  <verify_red>[Command to run test — MUST fail]</verify_red>
  <action>[Implementation to make test pass]</action>
  <verify_green>[Command to run test — MUST pass]</verify_green>
  <recovery>[What to do if stuck in RED or GREEN]</recovery>
  <done>[Feature works, tests pass, refactored]</done>
</task>

</tasks>

<validation_gates>
<!-- Populated from STACK.md with runnable commands. Run after all tasks complete. -->
<lint>[e.g., npm run lint]</lint>
<test>[e.g., npm test]</test>
<build>[e.g., npm run build]</build>
</validation_gates>

<error_recovery>
<!-- What to do when things go wrong -->
[Recovery steps for common failure modes in this TRD's domain]
[When to retry vs when to escalate]
[Max retry attempts before stopping]
</error_recovery>

<verification>
Before declaring TRD complete:
- [ ] [Specific test command]
- [ ] [Build/type check passes]
- [ ] [Behavior verification]
</verification>

<success_criteria>
- All tasks completed with evidence
- All verification checks pass
- No errors or warnings introduced
- [TRD-specific criteria]
</success_criteria>

<output>
After completion, create `.planning/objectives/XX-name/{objective}-{trd}-SUMMARY.md`
</output>
```

---

## Key Differences from JOB.md

| Feature | JOB.md (legacy) | TRD.md (v2) |
|---|---|---|
| Field name | `job: NN` | `trd: NN` |
| Context | `@path` references only | `<embedded_context>` with actual code |
| Examples | None | `<codebase_examples>` with real patterns |
| Anti-patterns | None | `<anti_patterns>` per-TRD |
| Recovery | None | `<recovery>` per task + `<error_recovery>` |
| TDD tasks | `tdd="true"` attribute | `type="tdd"` with structured RED/GREEN |
| Evidence | Optional | Required per-task verification |
| Flutter UI fields | None | Optional fields when `type: ui` (REQ-10-01) |

## Backward Compatibility

Old JOB.md files continue to work. The system detects file suffix:
- Files ending in `-TRD.md` use TRD format
- Files ending in `-JOB.md` use legacy JOB format
- When both exist for same objective, TRD takes precedence

---

## Frontmatter Fields

| Field | Required | Purpose |
|---|---|---|
| `objective` | Yes | Objective identifier (e.g., `01-foundation`) |
| `trd` | Yes | TRD number within objective (e.g., `01`, `02`) |
| `type` | Yes | `standard`, `tdd`, or `ui` |
| `wave` | Yes | Execution wave number (1, 2, 3...) |
| `depends_on` | Yes | Array of TRD IDs this task requires |
| `files_modified` | Yes | Files this TRD touches |
| `autonomous` | Yes | `true` if no checkpoints, `false` if has checkpoints |
| `requirements` | Yes | **MUST** list requirement IDs from ROADMAP |
| `user_setup` | No | Array of human-required setup items |
| `must_haves` | Yes | Goal-backward verification criteria |

### Flutter UI fields (optional; required semantically when `type: ui`)

| Field | Required when `type: ui` | Purpose |
|---|---|---|
| `stack` | Yes | Stack family. Currently only `flutter` is meaningful. |
| `platform` | Yes | Array of `mobile`, `web`. **Default `[mobile, web]`** — BOTH platforms are required coverage for Flutter UI TRDs. Narrow only if a TRD genuinely targets a single platform. |
| `state_management` | Yes | One of `riverpod`, `bloc`, `setState`, `provider`, `other`. Drives state-coverage regex set (see `references/flutter-state-patterns.md`). |
| `api_contract` | No | List of `{path, sha}` for SHA-pinning referenced contract files. Drift detection is advisory. |
| `must_haves.artifacts[*].states` | Yes (per artifact) | Non-empty list of state names this artifact must render and test. Example: `[loading, data, error, empty]`. |
| `must_haves.artifacts[*].tests.widget` | Yes (per artifact) | Path to widget test file. |
| `must_haves.artifacts[*].tests.integration` | Yes (per artifact) | Path to integration_test file. **Single path used by BOTH platforms.** Mobile runs `flutter test <path>` (or `flutter test integration_test/`); web runs `flutter drive --driver=test_driver/integration_test.dart --target=<path> -d chrome`. The `test_driver/integration_test.dart` driver is auto-scaffolded by TRD 10-04a's bootstrap task. |
| `must_haves.artifacts[*].tests.maestro` | Yes (per artifact) | Path to Maestro flow YAML. **Mobile-only BY DESIGN** — Maestro on Flutter web has an upstream blocker (mobile-dev-inc/maestro#2591) so the web-tier black-box verifier is `flutter drive` instead of Maestro. There is no web opt-in flag; web coverage flows entirely through `tests.integration` via `flutter drive`. |

**Enforcement model:** These fields are NOT in `FRONTMATTER_SCHEMAS.trd.required`. A non-Flutter TRD that omits them validates fine. The planner agent (`agents/planner.md` `<step name="break_into_tasks">`) calls `df-tools detect flutter-ui-scope <objective>`; if scope detected, it semantically requires these fields and emits `## PLANNING INCONCLUSIVE` for missing ones. See TRD 10-03.

**Web verification mechanism:** `tests.integration` is a single source path; the executor (TRD 10-04b) invokes it twice — once for each platform — using different drivers. Mobile uses the standard `flutter test` runner. Web uses `flutter drive` plus a chromedriver, with `test_driver/integration_test.dart` serving as the driver entrypoint. This substitution model — `flutter drive` IS the web-tier black-box verifier — exists because Maestro's web semantics overlay is broken upstream (issue mobile-dev-inc/maestro#2591). See TRD 10-02 for the full rationale.
