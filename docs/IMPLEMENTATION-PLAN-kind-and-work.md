# Implementation Plan: `kind` and `work` Two-Axis Intent Model

**Status:** Draft for review
**Companion to:** `docs/PROPOSAL-kind-and-work.md`
**Branch:** `proposal/kind-and-work`
**Date:** 2026-04-27

---

## Approach

This plan mirrors the structure DevFlow's own planner produces (TRD shape with frontmatter, tasks, verification, validation gates) without invoking the planner agent — devflow-claude doesn't self-host a `.planning/` project, so the planner has no PROJECT.md/ROADMAP.md to read. The plan is structured as 7 TRDs across 6 waves, designed for the existing executor to consume once the contribution is approved.

If devflow-claude later self-hosts as a DevFlow project, these TRDs become the seed of `.planning/objectives/01-kind-and-work-intent-model/`.

---

## Wave/TRD Structure

```
Wave 1 — Schema & Defaults
  ├── TRD 01: PROJECT.md + OBJECTIVE.md frontmatter schema
  └── TRD 02: defaults-table.md reference doc

Wave 2 — Resolution Logic (depends on 01, 02)
  └── TRD 03: df-tools `intent resolve` + CLAUDE.md absorption [TDD]

Wave 3 — Planner Integration (depends on 03)
  └── TRD 04: planner.md agent integration

Wave 4 — Workflow Updates (depends on 04, parallelizable)
  ├── TRD 05a: new-project + plan-objective workflows
  └── TRD 05b: build + df-quick workflows

Wave 5 — Migration (parallel with Wave 4)
  └── TRD 06: /devflow:health --migrate flag [TDD]

Wave 6 — Docs (depends on all preceding)
  └── TRD 07: README + CLAUDE.md + CHANGELOG updates
```

**Critical path:** 01 → 03 → 04 → 05a → 07 (5 sequential TRDs). Parallel work cuts wall time by ~30%.

---

## TRD 01: Schema — `kind`, `work`, `default_work` frontmatter

```yaml
---
trd: 01
type: standard
wave: 1
depends_on: []
confidence: high
files_modified:
  - plugins/devflow/devflow/templates/project.md
  - plugins/devflow/devflow/templates/objective.md   # NEW FILE
autonomous: true
must_haves:
  truths:
    - "PROJECT.md template includes kind field with 6-value enum documentation"
    - "OBJECTIVE.md template exists and includes work + overrides frontmatter"
  artifacts:
    - plugins/devflow/devflow/templates/project.md
    - plugins/devflow/devflow/templates/objective.md
---
```

**Scope:** Define the data shape. No logic, no behavior change yet — just the templates that the planner will write into user projects' `.planning/` directories.

**Tasks:**
1. Edit `plugins/devflow/devflow/templates/project.md` — add `kind` (required, enum: `api|app|library|ui-lib|cli|plugin`) and `default_work` (optional, enum matches OBJECTIVE.md `work`) to frontmatter. Document each enum value with a one-line description.
2. Create `plugins/devflow/devflow/templates/objective.md` — new template. Frontmatter includes `work` (optional, enum: `feature|port|refactor|foundation|bugfix|prototype|spike`) and `overrides` block (`tdd`, `depth`, `model_profile`).
3. Verify: open both templates, confirm enum values match `PROPOSAL-kind-and-work.md` exactly.

**Validation:**
- `grep -E '^kind:|^work:|^default_work:' plugins/devflow/devflow/templates/{project,objective}.md` returns expected fields.
- No existing tests should break — these are template additions, not runtime changes.

---

## TRD 02: `defaults-table.md` reference doc

```yaml
---
trd: 02
type: standard
wave: 1
depends_on: []
confidence: high
files_modified:
  - plugins/devflow/devflow/references/defaults-table.md   # NEW FILE
autonomous: true
must_haves:
  truths:
    - "defaults-table.md exists with all 42 (kind, work) cells"
    - "Each cell specifies tdd, depth, model_profile, verification"
  artifacts:
    - plugins/devflow/devflow/references/defaults-table.md
---
```

**Scope:** Machine-readable defaults table. Format: YAML inside markdown code fence so df-tools can parse it.

**Tasks:**
1. Create `plugins/devflow/devflow/references/defaults-table.md` — copy the 42-cell table from `PROPOSAL-kind-and-work.md` "Defaults Table" section, formatted as YAML with one entry per `(kind, work)` key.
2. Apply the four corrections already in the proposal: `(plugin, prototype)`, `(library, foundation)`, `(api, foundation)`, `(app, foundation)` — verify these match.
3. Add a header explaining the schema and pointing back to the proposal for the rationale.

**Sample shape:**
```yaml
defaults:
  api:
    feature:
      tdd: "strict + multi-tenancy assertion"
      depth: comprehensive
      model_profile: quality
      verification: "API contract + multi-tenancy + integration"
    port:
      tdd: "spec-match (source's tests as fixtures)"
      depth: comprehensive
      model_profile: quality
      verification: "API contract parity"
    # ... 5 more works
  # ... 5 more kinds
```

**Validation:**
- File loads as valid YAML when extracted from the markdown fence.
- All 42 cells present (6 × 7).
- Schema fields per cell: `tdd`, `depth`, `model_profile`, `verification` (all strings).

---

## TRD 03: df-tools `intent resolve` + CLAUDE.md absorption

```yaml
---
trd: 03
type: tdd                              # Pure logic with defined I/O — TDD strict
wave: 2
depends_on: ["01", "02"]
confidence: high
files_modified:
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/intent.cjs           # NEW FILE
  - plugins/devflow/devflow/bin/lib/intent.test.cjs      # NEW FILE
  - plugins/devflow/devflow/bin/lib/claude-md.cjs        # NEW FILE
  - plugins/devflow/devflow/bin/lib/claude-md.test.cjs   # NEW FILE
autonomous: true
must_haves:
  truths:
    - "df-tools intent resolve --objective <id> returns resolved configuration as JSON"
    - "Resolution applies precedence: TRD frontmatter > OBJECTIVE.md overrides > CLAUDE.md > defaults table > built-in fallback"
    - "CLAUDE.md absorption returns extracted directives, not raw markdown"
    - "All resolution paths covered by unit tests including precedence edge cases"
  artifacts:
    - plugins/devflow/devflow/bin/lib/intent.cjs
    - plugins/devflow/devflow/bin/lib/claude-md.cjs
    - plugins/devflow/devflow/bin/lib/intent.test.cjs
    - plugins/devflow/devflow/bin/lib/claude-md.test.cjs
---
```

**Scope:** The brain of the contribution. Pure logic, no side effects beyond reading files. TDD-strict because:
- Defined I/O contract (resolved configuration shape).
- Multiple precedence levels — easy to get wrong without exhaustive tests.
- The whole proposal stands or falls on this resolving correctly.

**Test list (write before implementation):**

*Happy path:*
1. `intent resolve` reads PROJECT.md `kind: api`, OBJECTIVE.md `work: port` → returns `(api, port)` defaults.
2. OBJECTIVE.md missing `work` → falls back to PROJECT.md `default_work`.
3. PROJECT.md missing `default_work` → falls back to `work: feature`.

*Precedence:*
4. TRD frontmatter `type: tdd` overrides defaults table's `tdd: skip` for `(api, prototype)`.
5. OBJECTIVE.md `overrides.tdd: skip` overrides defaults table's `tdd: strict` for `(api, feature)`.
6. CLAUDE.md "all features default to TDD strict" overrides defaults table's `tdd: skip` for `(api, prototype)` but does NOT override an explicit OBJECTIVE.md override.

*CLAUDE.md absorption:*
7. CLAUDE.md with `## TDD Playbook` section returns directives.
8. CLAUDE.md without TDD-related sections returns empty directives.
9. Both `~/.claude/CLAUDE.md` and project `./CLAUDE.md` read; project-level wins on conflict.

*Failure modes:*
10. Unknown `kind` → throws with helpful error listing valid values.
11. Unknown `work` → same.
12. Missing PROJECT.md → throws "no PROJECT.md found" (not silent fallback).

*Edge cases:*
13. PROJECT.md present but missing `kind` → returns warning, defaults to `api`.
14. defaults-table.md malformed → throws with line/column.
15. Resolution output stable across calls (deterministic).

**Tasks:** Each test above gets RED → GREEN → REFACTOR per Iron Law. Fixture builder for synthetic PROJECT.md/OBJECTIVE.md/CLAUDE.md content (no LLM-generated test data per global TDD playbook).

**Validation gates:**
- `npm test` passes (all 15+ new tests).
- `node ~/.claude/devflow/bin/df-tools.cjs intent resolve --objective 01-test --dry-run` returns valid JSON.

---

## TRD 04: Planner agent integration

```yaml
---
trd: 04
type: standard
wave: 3
depends_on: ["03"]
confidence: medium
files_modified:
  - plugins/devflow/agents/planner.md
autonomous: true
must_haves:
  truths:
    - "Planner reads kind/work via df-tools intent resolve"
    - "Planner replaces today's silent TDD heuristic with defaults-table lookup"
    - "Planner prints resolved configuration before TRD generation"
    - "Planner louder when work is INHERITED from default_work (per proposal)"
  artifacts:
    - plugins/devflow/agents/planner.md
---
```

**Scope:** Wire the resolution logic into the planner's execution flow. Replaces lines 200–209 (`## TDD Detection`) with a deterministic call to `df-tools intent resolve`.

**Tasks:**
1. Replace the TDD-detection heuristic section in planner.md with a step that invokes `intent resolve`.
2. Add a print step that emits the resolved-configuration message (terse for explicit `work`, louder for inherited — per proposal "UX" section).
3. Update planner's TRD-generation step to consume the resolved config rather than running its own TDD heuristic.
4. Preserve the `<!-- TDD-EXCEPTION: {reason} -->` opt-out path.

**Type:** `standard` not `tdd` — markdown agent prompts are hard to test in isolation; the underlying logic is already TDD-tested in TRD 03.

**Validation:**
- Manually run `/devflow:plan-objective` against a test fixture project with PROJECT.md + OBJECTIVE.md present.
- Output must include the resolved-configuration block.
- Generated TRDs must reflect the resolved `tdd` posture (not the old heuristic).

**Risk note:** The planner is 1284 lines. Surgical edit only — do not rewrite. Easy to break unrelated planning behavior; review carefully.

---

## TRD 05a: `new-project` + `plan-objective` workflow updates

```yaml
---
trd: 05a
type: standard
wave: 4
depends_on: ["04"]
confidence: high
files_modified:
  - plugins/devflow/devflow/workflows/new-project.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/skills/df-new-project/SKILL.md
  - plugins/devflow/skills/df-plan-objective/SKILL.md
autonomous: false                      # New-project intake is interactive
---
```

**Scope:** The two main intake points. `new-project` asks `kind` (required) + `default_work` (optional). `plan-objective` accepts `--work`, `--tdd`, `--depth`, `--model` override flags.

**Tasks:**
1. `new-project.md`: add intake step asking `kind` (required) and `default_work` (optional, skippable).
2. `plan-objective.md`: parse override flags from skill args, pass to `df-tools intent resolve` as overrides.
3. Update SKILL.md `argument-hint` for both skills to document the new flags.

**Validation:**
- Run `/devflow:new-project` against an empty test directory, confirm `kind` is asked.
- Run `/devflow:plan-objective foo --work refactor` against a test project, confirm override applied.

---

## TRD 05b: `build` + `df-quick` workflow updates

```yaml
---
trd: 05b
type: standard
wave: 4
depends_on: ["04"]
confidence: high
files_modified:
  - plugins/devflow/devflow/workflows/build.md
  - plugins/devflow/skills/df-build/SKILL.md
  - plugins/devflow/skills/df-quick/SKILL.md
autonomous: false                      # build's internal plan step is interactive
---
```

**Scope:** Secondary entry points. `build` inherits `plan-objective`'s behavior. `df-quick` defaults `work: bugfix` and skips CLAUDE.md absorption.

**Tasks:**
1. `build.md`: ensure plan step calls `intent resolve` (likely already covered if it shares plan-objective logic).
2. `df-quick/SKILL.md`: hardcode `work: bugfix`, add `--no-claude-md` semantic to df-tools call.

**Validation:**
- `/devflow:quick "fix the typo in the README"` should not invoke CLAUDE.md absorption (verifiable via debug log).
- `/devflow:build` should print resolved configuration like `plan-objective`.

---

## TRD 06: `/devflow:health --migrate` flag

```yaml
---
trd: 06
type: tdd                              # Pure logic — migration steps with defined I/O
wave: 5
depends_on: ["03"]                     # Doesn't need 04/05; can run parallel with Wave 4
confidence: medium
files_modified:
  - plugins/devflow/skills/df-health/SKILL.md
  - plugins/devflow/devflow/bin/lib/migrate.cjs           # NEW FILE
  - plugins/devflow/devflow/bin/lib/migrate.test.cjs      # NEW FILE
  - plugins/devflow/devflow/bin/df-tools.cjs              # add `migrate` subcommand
autonomous: false                      # Migration is interactive — asks user for kind
---
```

**Scope:** One-time migration for projects that pre-date `kind`/`work`.

**Test list:**
1. PROJECT.md without `kind` → migrate prompts user for kind, writes it to frontmatter.
2. PROJECT.md with `kind` → migrate is no-op, exits with "already migrated."
3. OBJECTIVE.md files without `work` → migrate inserts `work:` based on user's choice (or PROJECT.md `default_work`).
4. Backup created before any modification (`.planning/.migrate-backup-{timestamp}/`).
5. Dry-run mode prints planned changes without writing.
6. Idempotent: running migrate twice on a migrated project is a no-op.

**Validation:**
- `npm test` passes (6 new tests).
- Run against a fixture project lacking `kind`/`work`, confirm successful migration + backup creation.

---

## TRD 07: README + CLAUDE.md + CHANGELOG updates

```yaml
---
trd: 07
type: standard                         # <!-- TDD-EXCEPTION: pure documentation -->
wave: 6
depends_on: ["01", "02", "03", "04", "05a", "05b", "06"]
confidence: high
files_modified:
  - README.md
  - CLAUDE.md
  - CHANGELOG.md
autonomous: true
---
```

**Scope:** Document the new fields, the resolution flow, and the migration path.

**Tasks:**
1. README: add a "Configuring Intent" section covering `kind` / `work` / `default_work` with one example per `kind`.
2. CLAUDE.md: add a section under "User-Facing Workflow" explaining the resolution chain and where users can express defaults (CLAUDE.md absorption).
3. CHANGELOG: add a `## [Unreleased]` entry under "Added" — list new fields, new skill flag, migration path. Reference the proposal doc.

**Validation:**
- README example commands run cleanly against a test project.
- `node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased` passes.

---

## Cross-Cutting Concerns

### Backwards compatibility

- Projects without `kind` get a warning (not an error) and default to `kind: api`. Verified in TRD 03 test #13.
- OBJECTIVE.md files without `work` fall back to `default_work` then `feature`. Silent — verified in TRD 03 tests #2, #3.
- TRD frontmatter remains unchanged. The defaults table only changes how `type=auto` resolves; explicit `type: tdd` and `type: standard` continue working.

### Test data

Per global TDD playbook: hand-built fixture builders for PROJECT.md/OBJECTIVE.md/CLAUDE.md content. No LLM-generated test data. Fixture builder lives in `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` (new file in TRD 03).

### Multi-tenancy guard

Not applicable — devflow-claude is not a multi-tenant codebase. Skip the multi-tenancy assertion habit from the global TDD playbook for these TRDs.

### Atomic commits

Per existing convention. TDD TRDs (03, 06) produce 2-3 atomic commits each (`test:` → `feat:` → optional `refactor:`). Standard TRDs produce one commit each. Total: ~15-18 commits across the contribution.

---

## Success Criteria (whole contribution)

The contribution is complete when:

1. **Functional**: A user running `/devflow:plan-objective` against a `kind: api` project sees resolved-configuration output before TRD generation, with the right defaults applied per the table.
2. **Backward compatible**: Existing devflow-claude projects (none locally — but at least the test fixtures from `aodex`, `aosentry`, `aodex-flutter`) continue to plan without `kind`/`work` set, with the warning and `kind: api` fallback.
3. **Override paths work**: All four override mechanisms (TRD frontmatter, OBJECTIVE.md `overrides`, CLAUDE.md, skill flag) verified to take precedence in the documented order.
4. **CLAUDE.md absorption works**: Mark's `~/.claude/CLAUDE.md` TDD Playbook is read and applied — concretely: a `(api, prototype)` objective gets `tdd: strict` instead of `tdd: skip` because the playbook says so.
5. **Migration works**: `/devflow:health --migrate` successfully promotes an unmigrated test project to having `kind` set.
6. **Documented**: README, CLAUDE.md, CHANGELOG all reference the new model.
7. **Tests green**: `npm test` passes with at least 21 new tests (15 from TRD 03 + 6 from TRD 06).

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Planner edits break existing planning flows | Medium | High | TRD 04 is `standard` not `tdd`; surgical edits only; manual smoke against fixture project |
| Defaults table evolves before consensus | Low | Medium | Open Questions 6 & 7 in proposal explicitly defer collapsing decision until implementation |
| CLAUDE.md absorption matches false positives (e.g., a section titled "TDD" in a totally unrelated context) | Medium | Low | Conservative regex; require `^##.*TDD\|^##.*Test\|^##.*Quality\|^##.*Scope`; document for users to put TDD guidance in dedicated section |
| Migration loses data (frontmatter rewrite goes wrong) | Low | High | Backup directory created before any write; dry-run mode required to ship |
| User experience louder-on-inherit message becomes annoying | Medium | Low | Easy to dial down post-ship; gather feedback after first real use |
| `default_work` masks wrong defaults despite louder message | Low | Medium | Already mitigated by Option 3 design; revisit if real users miss the inheritance signal |

---

## What This Plan Doesn't Cover

- **Fixing or restructuring the existing planner agent.** Surgical edits only. Larger refactor is its own project.
- **Adding new `kind` or `work` values.** Both enums are locked at the proposal level; expansion is a follow-up RFC.
- **Configurable defaults table.** Open Question 3 — deferred.
- **Performance / property-based / security testing dimensions.** Open Question 7 — deferred.
- **Initializing devflow-claude as a self-hosted DevFlow project.** Separate decision; this plan ships even if devflow-claude never self-hosts.
- **PR review / merge.** Out of scope. Plan ships as a series of commits on `proposal/kind-and-work` ready for review.

---

## Order of Operations Summary

1. **Now:** Review this plan + the proposal. Redline as needed.
2. **Implementation kick-off:** Execute TRD 01, TRD 02 (Wave 1, parallelizable).
3. **Logic core:** TRD 03 — TDD strict, the foundation everything else depends on.
4. **Integration:** TRD 04 — wire planner to the resolution logic.
5. **Surface:** TRDs 05a, 05b, 06 (Waves 4, 5 — parallel).
6. **Polish:** TRD 07 — docs.
7. **Verify:** Run success criteria checklist; smoke against fixture projects; commit any final fixes.
8. **PR:** Open `proposal/kind-and-work` against `main`. Reference both `PROPOSAL-kind-and-work.md` and this plan.
