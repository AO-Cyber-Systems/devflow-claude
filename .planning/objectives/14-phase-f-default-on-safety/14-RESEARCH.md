---
objective: 14-phase-f-default-on-safety
research_kind: design-notes-and-acceptance-checks
---

# Phase F — Design notes & acceptance checks

Pre-implementation findings. Drives TRD specificity. F4 acceptance is verified here so the implementation TRDs do not duplicate the work.

## F4 acceptance check (Phase D status)

**Source of truth:** `plugins/devflow/devflow/workflows/build.md` § 8 (`## 8. Auto-Verify + Complete`).

Confirmed wiring lines (read 2026-05-04 from this branch):

```
Line 178: **First, spawn dedicated verifier as backstop.**
Line 195: subagent_type="verifier",
Line 196: model="{verifier_model}"
```

Confirmed regression tests in `plugins/devflow/devflow/bin/df-tools.test.cjs`:
- `subagent_type="verifier"` static-asserted present in build.md § 8 (test block "Phase D verifier wiring").
- `model="{verifier_model}"` static-asserted present.
- General-purpose trampoline preserved at § 7.

**Acceptance ruling:** F4 is already satisfied. The implementation TRD that touches F4 needs only to (1) re-run the existing assertion in test, (2) verify status in 14-04 SUMMARY. No build.md edits.

## F1 — Cheap CLI checker (`df-tools verify trd-pre`)

### Pattern to mirror

`plugins/devflow/devflow/bin/lib/verify.cjs` already hosts six pure-logic verify subcommands (`cmdVerifyJobStructure`, `cmdVerifyObjectiveCompleteness`, `cmdVerifyReferences`, etc.). Each takes `(cwd, args, raw)`, parses files via `safeReadFile` + `extractFrontmatter`, returns structured JSON via `output(...)`. Tests live inline in `df-tools.test.cjs` using `node:test` (`describe` / `test`).

### New subcommand surface

```
df-tools verify trd-pre <objective> [--raw]
```

### Dimensions checked (all mechanical, no LLM judgment)

| Dimension | Check | Failure mode |
|---|---|---|
| `requirement_coverage` | Every requirement ID from ROADMAP `**Requirements:**` line for the objective appears in at least one TRD's `requirements` frontmatter | Returns `requirements: { missing: [...] }` |
| `task_completeness` | For every TRD: each `<task>` has `<name>`, `<action>`, `<verify>`, `<done>` (auto/tdd tasks) | Returns `tasks: { incomplete: [{trd, task, missing: [...]}, ...] }` |
| `dependency_correctness` | Build directed graph from `depends_on`. Detect cycles. Verify each `depends_on` target exists. | Returns `dependencies: { cycles: [...], orphan_refs: [...] }` |
| `scope_sanity` | Per-TRD task count ≤ 3 (warn at 4+, fail at 6+); per-objective TRD count ≤ 10 | Returns `scope: { oversized_trds: [...], total_trds: N }` |

### Output shape

```json
{
  "objective": "14-phase-f-default-on-safety",
  "passed": true,
  "needs_agent": false,
  "checks": {
    "requirement_coverage": { "passed": true, "missing": [] },
    "task_completeness":   { "passed": true, "incomplete": [] },
    "dependency_correctness": { "passed": true, "cycles": [], "orphan_refs": [] },
    "scope_sanity": { "passed": true, "oversized_trds": [], "total_trds": 5 }
  },
  "summary": "4/4 dimensions passed",
  "elapsed_ms": 87
}
```

`needs_agent: true` is set when any dimension fails AND the failure is the kind the cheap check can spot. Callers spawn `df-job-checker` only when `needs_agent === false` AND we still want LLM-grade dimensions (must_haves quality, context compliance) — i.e. the agent is invoked _additionally_ for those dimensions, while the cheap checker handles the mechanical ones. Recommendation surfaced in `summary`.

### Performance budget

Target <2s wall clock. Operations involved per objective: read N TRDs (typically 2-7), extract frontmatter, regex-match `<task>` blocks. No subprocess spawns, no network. Easily under budget.

### Test fixture strategy (per TDD playbook habit #4)

Hand-built factory: `__fixtures__/trd-pre-fixtures.cjs` exports `makeTrdFile({ objective, trd, requirements, depends_on, tasks: [...] })` and `setupObjectiveDir({ trds: [...], roadmap_requirements: [...] })`. Tests build mini objective directories on-disk in `os.tmpdir()` and assert structured output. No LLM-generated fixtures.

## F2 — Novel-domain detection

### Signals (all lexical/file-checks; no LLM)

```
1. NEW_DEP signal:
   Extract package-name-shaped tokens (`@scope/pkg`, `pkg-name`) from objective
   description (RESEARCH.md preamble or planner-prompt context). For each token,
   check if it appears in package.json `dependencies` or `devDependencies`.
   Token in description AND not in package.json → signal fires.

2. MISSING_PATTERNS signal:
   If `.planning/codebase/PATTERNS.md` is missing → signal fires.
   If PATTERNS.md exists, lexical match: tokenize objective description, check
   if any token appears as a heading in PATTERNS.md. Zero matches → signal fires.

3. COMPARISON_KEYWORD signal:
   Regex match `\b(evaluate|compare|choose between|select between|vs\.)\b` (case-insensitive)
   against objective goal + description. Match → signal fires.
```

### Trigger semantics

ANY signal firing → `novel: true`. Returned signal block:

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

### Planner integration

A small block added to `agents/planner.md` `<step name="mandatory_discovery">`:

```
node ~/.claude/devflow/bin/df-tools.cjs detect novel-domain "$OBJECTIVE" [--description "..."]
```

If `novel: true` AND research has not already run (init JSON `has_research: false`) AND no `--skip-research` flag → planner spawns `df-objective-researcher` before continuing. Otherwise proceeds.

### Test fixture strategy

Hand-built factory generates synthetic objective descriptions, fake package.json files, fake PATTERNS.md files. Tests assert each signal fires/doesn't fire under controlled inputs. No LLM-generated test data.

## F3 — Brownfield codebase map detector

### Signal logic (pure-logic fs check)

```
1. Read .planning/ existence at <cwd>.
2. Read .planning/codebase/ existence.
3. Count source files at <cwd>: glob over **/*.{ts,tsx,js,jsx,py,go,rs,rb,java,cjs,mjs}
   excluding node_modules, .git, .planning, dist, build, .next.
4. Threshold: ≥ 50 source files = "substantial code"
   (rationale: typical scaffold is < 20 files; 50+ implies real codebase).
```

### Output

```json
{
  "should_offer_map": true,
  "planning_exists": true,
  "codebase_map_exists": false,
  "source_file_count": 127,
  "threshold": 50
}
```

`should_offer_map === (planning_exists && !codebase_map_exists && source_file_count >= 50)`.

### Phase A integration (deferred — note only)

Phase A's `classify-session.js` SessionStart hook will, on first invocation per project per session, call `df-tools detect brownfield-map "$CWD"` and if `should_offer_map === true`, inject the offer block. Decline-tracker pattern mirrors Phase C init-offer (deferred per scope lock).

### Test fixture strategy

Hand-built factory creates tmpdir scaffolds: empty repo, repo with `.planning/` only, repo with `.planning/` + `.planning/codebase/`, repo with N synthetic source files. Tests assert detector signal under each scaffold.

## F5 — Confidence scoring removal

### Surface area

| File | Change |
|---|---|
| `plugins/devflow/devflow/references/trd-spec.md` | Drop `confidence` row from frontmatter table. Drop `## Confidence Scoring` section. Document `caution` task attribute. |
| `plugins/devflow/devflow/references/auto-behaviors.md` | Drop `## Confidence-Based Model Overrides` section. Replace with single line documenting `caution` attribute. |
| `plugins/devflow/agents/executor.md` | Replace `<step name="execute_tasks">` confidence table (lines 64-71) with caution-flag handling. |
| `plugins/devflow/agents/planner.md` | Drop "confidence" from required-frontmatter list and the success criteria checklist. (Two tiny string edits.) |
| `plugins/devflow/devflow/bin/lib/frontmatter.cjs` | Add `trd` schema (currently only `plan`/`summary`/`verification`). `trd.required` does NOT include `confidence`. Keeps `plan` schema unchanged for back-compat. |

### Back-compat strategy

- Frontmatter `extractFrontmatter` already accepts arbitrary keys — `confidence` will continue to parse without warning.
- Executor: when `<step name="execute_tasks">` runs, it now branches on per-task `caution` attribute (opt-in, opt-out by absence). If frontmatter `confidence` is present, it is ignored — no error, no warning.
- Validator: `cmdFrontmatterValidate(_, _, 'trd', _)` returns `valid: true` when all new required fields exist, regardless of whether `confidence` is also present.

### Caution attribute spec (locked)

```
<task type="auto" caution="pause-before-destructive">
```

- Single allowed value: `pause-before-destructive`.
- Semantics: executor pauses before file deletion, schema drop, force push, mass-rewrite operations.
- Absent attribute → standard execution (no caution behavior).
- Other values → executor warns and treats as absent.

### Test fixture strategy

Two test scenarios:
1. TRD with `confidence: high` in frontmatter → validator returns `valid: true` against new `trd` schema (back-compat).
2. TRD without `confidence` field → validator returns `valid: true` (new normal).

## Library / dependency notes

No new dependencies introduced. All work uses Node built-ins (`fs`, `path`, `os`) plus existing `helpers.cjs` / `frontmatter.cjs` utilities.

## Anti-patterns to avoid

- **No LLM-generated test fixtures.** Build factories. (TDD playbook habit #4.)
- **No property-based testing.** Cases are well-bounded — direct case enumeration is sufficient.
- **No Gherkin syntax layer.** Descriptive `test('...', () => {})` names suffice.
- **No mutation of existing `plan` frontmatter schema.** Adding `trd` schema, not editing the legacy one.
- **No deletion of `confidence` field handling in `frontmatter.cjs`.** Field stays parseable forever.
