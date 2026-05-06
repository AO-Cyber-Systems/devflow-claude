---
objective: 13-phase-h-prompt-extraction
github_issue: AO-Cyber-Systems/devflow-claude#33
parent_issue: AO-Cyber-Systems/devflow-claude#25
work: refactor
---

# Phase H — Prompt extraction to references/templates: Context

## What this objective does

Move duplicated content out of agent preambles into shared `references/` files and `templates/` files, replacing inline blocks with `@~/.claude/devflow/references/<name>.md` references. The `sync-runtime` SessionStart hook already mirrors `plugins/devflow/devflow/` → `~/.claude/devflow/`, so `@~`-prefixed references resolve at runtime.

## Why now

Per Phase E (objective 10) audit, dedicated agents now spawn correctly across 14 workflow sites. Per Phase G (objective 12) skill consolidation, agent invocations are about to land more frequently as ambient mode (Phase A) lights up. Every duplicated block of generic methodology gets paid in tokens on every spawn. Extracting to shared references removes that tax permanently.

Target: ~25–55k tokens saved per `/devflow:build` invocation.

## Scope (locked from issue #33)

### H1 — Create 5 shared reference files at `plugins/devflow/devflow/references/`

| File | Source | Used by |
|---|---|---|
| `trd-spec.md` | planner.md `<plan_format>` (lines 477-641) | planner, executor, verifier, job-checker (referenced; only planner has the inline) |
| `research-tooling.md` | project-researcher.md `<tool_strategy>` + `<verification_protocol>` (lines 63-166) | project-researcher, objective-researcher |
| `goal-backward.md` | planner.md `<goal_backward>` (lines 643-743) | planner, verifier, roadmapper, job-checker |
| `debugging-methods.md` | debugger.md `<hypothesis_testing>` + `<investigation_techniques>` + `<verification_patterns>` + `<research_vs_reasoning>` (lines 102-725) | debugger only |
| `stub-patterns.md` | verifier.md `<stub_detection_patterns>` (lines 629-678) | verifier, job-checker (referenced; only verifier has the inline) |

### H2 — Edit agent preambles (replace inline with @-reference)

| File | Lines removed | Replaced with |
|---|---|---|
| `agents/planner.md:477-641` (`<plan_format>`) | TRD spec inline | `@~/.claude/devflow/references/trd-spec.md` |
| `agents/planner.md:643-743` (`<goal_backward>`) | goal-backward inline | `@~/.claude/devflow/references/goal-backward.md` |
| `agents/debugger.md:102-725` (4 sections) | debugging methodology inline | `@~/.claude/devflow/references/debugging-methods.md` |
| `agents/project-researcher.md:63-166` (2 sections) | research tooling inline | `@~/.claude/devflow/references/research-tooling.md` |
| `agents/objective-researcher.md:85-175` (3 sections) | research tooling inline | `@~/.claude/devflow/references/research-tooling.md` |
| `agents/verifier.md:629-678` | stub patterns inline | `@~/.claude/devflow/references/stub-patterns.md` |
| `agents/job-checker.md:41-61` (`<core_principle>`) | goal-backward principle inline | `@~/.claude/devflow/references/goal-backward.md` |

### H3 — Inline template extraction

| Source | Target | Notes |
|---|---|---|
| `agents/codebase-mapper.md:169-672` (8 inline templates) | `templates/codebase/{stack,integrations,architecture,structure,conventions,testing,patterns,concerns}.md` | 7 already exist on disk; only `patterns.md` needs creation |
| `agents/project-researcher.md:168-493` (5 inline templates) | `templates/research-project/{SUMMARY,STACK,FEATURES,ARCHITECTURE,PITFALLS}.md` | All 5 exist on disk; just delete inline + reference |
| `agents/verifier.md:467-557` (VERIFICATION.md template) | `templates/verification-report.md` | Already exists on disk; delete inline + reference |

## Locked decisions (non-negotiable, from planning_context)

1. **Each reference file is self-contained** — no fragmentation across multiple references. One concern, one file.
2. **Agent preamble cuts replace inline content with `@~/.claude/devflow/references/<name>.md`** — sync-runtime hook handles mirroring; `@~`-prefix resolves to mirrored runtime location.
3. **Token-savings measurement: sum line-count delta across edited agent files** — record in TRD 04 SUMMARY.
4. **Back-compat: extracted content is semantically identical** — no behavior change. Quoted/templated content (code blocks, YAML examples, tables) copied verbatim into reference files. Surrounding XML wrapper tags preserved on reference files (e.g. `<plan_format>`, `<goal_backward>`) so consumers can still grep for them by section name.
5. **Reference files use existing format** — XML-tagged sections matching the source agent's structure (mirror `references/anti-patterns.md` and `references/tdd.md` precedent).

## Wave structure (locked)

- **Wave 1:** TRD 01 (create 5 reference files + 1 new template — `codebase/patterns.md`).
- **Wave 2:** TRD 02 (edit 5 agents: planner, job-checker, debugger, objective-researcher, verifier) + TRD 03 (edit 2 agents: project-researcher full + codebase-mapper templates). Parallel — disjoint file ownership.
- **Wave 3:** TRD 04 (token-savings measurement + full test suite + final report).

Total: 4 TRDs, 3 waves.

## File ownership (no overlap between Wave 2 TRDs)

| TRD | Agent files modified |
|---|---|
| 02 | planner.md, job-checker.md, debugger.md, objective-researcher.md, verifier.md |
| 03 | project-researcher.md, codebase-mapper.md |

verifier.md is owned solely by TRD 02 (both `<stub_detection_patterns>` and `<verification>` template inline come out in the same TRD to avoid same-file edits across parallel TRDs). project-researcher.md is owned solely by TRD 03 (preamble research-tooling extraction + templates extraction land together for the same reason).

## Quality gate (from planning_context)

- 5 new reference files exist at `plugins/devflow/devflow/references/`
- 1 new template exists at `plugins/devflow/devflow/templates/codebase/patterns.md`
- 7 agent preambles edited (planner, job-checker, debugger, objective-researcher, verifier, project-researcher, codebase-mapper)
- Inline templates removed (codebase-mapper 8, project-researcher 5, verifier 1)
- Token-savings measurement: ≥25k delta across all edited agents (line-count × ~3 tokens/line approximation; logged in TRD 04 SUMMARY)
- All 1471 tests still pass (no behavior regressions)
- Output ends with `## PLANNING COMPLETE`

## Out of scope (deferred)

Per issue #33 H4 ("Compress verbose examples") is NOT in this objective's H1-H3 scope. Discovery-levels compression, dependency-graph 6-task ASCII walkthrough cuts, debugger cognitive-biases table cut, and verifier functional-verification block extraction are deferred to a follow-on objective.
