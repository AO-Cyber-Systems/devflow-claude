---
objective: 00-refine-defaults-table
trd: 0.6
title: Author references/testing-strategy.md (closes #7)
type: standard
confidence: high
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/references/testing-strategy.md
autonomous: true
requirements: [SC-5]
must_haves:
  truths:
    - "plugins/devflow/devflow/references/testing-strategy.md exists at the expected path"
    - "The doc carries a layer × tool × stack matrix mapping verification layers (unit, integration, system, AI exploratory, visual) to specific tools per stack family (Rails, Go/ConnectRPC, Flutter, Node CLI/plugin)"
    - "The doc includes the Flutter-web semantics gotcha paragraph"
    - "The doc includes the codegen discipline paragraph"
    - "The doc includes the platform routing paragraph"
    - "The doc is read-only reference (no executable content beyond informational examples)"
    - "The sync-runtime hook mirrors the doc to ~/.claude/devflow/references/testing-strategy.md on session start (handled by the hook automatically — verify by listing the synced runtime dir)"
    - "The planner agent (TRD 0.3) can resolve `@~/.claude/devflow/references/testing-strategy.md` reference path correctly after the doc lands"
  artifacts:
    - path: "plugins/devflow/devflow/references/testing-strategy.md"
      provides: "Layer × tool × stack matrix + 3 paragraph treatments (Flutter-web semantics, codegen, platform routing)"
      contains: "## Testing strategy matrix"
      contains_also: "Flutter-web"
  key_links:
    - from: "plugins/devflow/agents/planner.md::Step 4 (TRD 0.3)"
      to: "plugins/devflow/devflow/references/testing-strategy.md"
      via: "@~/.claude/devflow/references/testing-strategy.md path reference"
      pattern: "testing-strategy\\.md"
verification_commands:
  - "test -f plugins/devflow/devflow/references/testing-strategy.md"
  - "grep -E 'Flutter-web' plugins/devflow/devflow/references/testing-strategy.md"
  - "grep -cE '^## ' plugins/devflow/devflow/references/testing-strategy.md | awk '$1 < 4 { exit 1 }'"
  - "wc -l plugins/devflow/devflow/references/testing-strategy.md | awk '$1 < 60 { exit 1 }'"
---

<objective>
Author `plugins/devflow/devflow/references/testing-strategy.md` — a reference doc the planner agent consults after `df-tools intent resolve` returns. It supplies the layer×tool×stack matrix the resolver intentionally does NOT carry: the resolver's `verification` field is stack-agnostic ("integration tests + tenant-isolation assertions"); this doc maps that to specific tools per project stack (Rails: RSpec/Capybara; Go: testing/httpmock; Flutter: integration_test/widget; etc.).

Closes GitHub issue #7 ("testing-levels matrix") in the same PR per CONTEXT.md §"GitHub tracking" and CONTEXT.md §5 ("soft-bundled" — separate doc, no resolver coupling).

Purpose: Closes objective-0 success criterion 5. The matrix is the bridge between the (kind, work) → defaults table (which doesn't know about stacks) and the planner's verification-command emission (which does). Without this doc, the resolver's stack-agnostic verification text drops onto the floor when the planner generates TRDs — the planner has nowhere to look up "what's the right Flutter integration test command?".

Output: A single new reference doc. No code changes. The sync-runtime hook (already in place per CLAUDE.md §Hooks) will mirror it to `~/.claude/devflow/references/testing-strategy.md` automatically on session start, where the planner agent reads it via `@~/.claude/devflow/...` path conventions.

Why standard, not TDD: pure documentation. No code surface. Verification is "the file exists, has the required sections, and the planner agent can resolve its path reference."

Why Wave 1: independent of TRD 0.2's resolver schema work — the soft-bundle decision in CONTEXT.md §5 means this doc has no resolver coupling. Can ship in parallel with TRD 0.1.
</objective>

<file_tree>
plugins/devflow/devflow/references/
├── defaults-table.md           ← (modified by TRD 0.1)
├── testing-strategy.md         ← CREATE (this TRD)
└── tdd.md                      ← (existing — referenced from new doc)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Existing references in `plugins/devflow/devflow/references/` follow this shape:

```markdown
# Title

Optional intro paragraph.

## Section 1

Content.

## Section 2

Content.
```

No YAML frontmatter required for reference docs (per the existing files: tdd.md, anti-patterns.md, verification-patterns.md). The planner agent reads them via `@~/.claude/devflow/references/<name>.md` path syntax.

The closest existing analog is `references/verification-patterns.md` (verification command examples). The new doc complements it by providing the stack-aware tool selection that turns abstract layer names into concrete commands.

The user's CLAUDE.md TDD Playbook section mentions the outside-in stack: "Rails: Capybara system test → controller test → model test", "Go (ConnectRPC + templ): HTTP integration test → handler test → service test", "Flutter: integration_test → widget test → unit test". This is the matrix's stack-aware seed.

The planner agent's TRD 0.3 step 4 references this doc with: `@~/.claude/devflow/references/testing-strategy.md`. The path resolves via the sync-runtime hook's mirror.
</codebase_examples>

<anti_patterns>
- **Do NOT couple this doc to the resolver.** Per CONTEXT.md §5: "soft-bundled — separate doc, no resolver coupling". The resolver's output is stack-agnostic; this doc adds the stack dimension at planner-time. They are siblings, not a parent-child relationship.
- **Do NOT include executable code (e.g., bash scripts, JS modules, etc.) in the doc.** It's a reference, not a runtime artifact. Examples are illustrative only.
- **Do NOT prescribe tooling that doesn't exist in the org.** Per the survey (`tdd-scope-codebase-survey.md`), zero golden-file/visual-diff tooling exists in eden-ui or eden-ui-flutter. The matrix should mark visual-diff cells as "deferred — opt-in via TRD frontmatter" or similar, mirroring the (ui-lib, *) cell text in TRD 0.1.
- **Do NOT duplicate the (kind, work) defaults table.** This doc is orthogonal: it indexes by **stack** (Rails, Go, Flutter, etc.) and **layer** (unit, integration, system, AI exploratory, visual), not by (kind, work). Cross-references to the defaults table are appropriate; reproducing it is not.
- **Do NOT make the matrix exhaustive.** It needs to cover the AOCyber org's primary stacks (Rails, Go/ConnectRPC, Flutter, Node CLI/plugin). Other stacks (Python, Rust, etc.) get a "see your team's lead" note. Exhaustiveness is the org-wide rollout's job, not this TRD's.
- **Do NOT push to GitHub yet.** Per the user's instruction in this objective's prompt: "don't push to origin during planning. Commits are local on `feature/v1.1`".
</anti_patterns>

<error_recovery>
- If the doc gets too long (>200 lines): tighten the per-cell descriptions. The matrix is the load-bearing element; surrounding paragraphs are scaffolding.
- If a stack family is missing (e.g., user requests Python coverage): add a row to the matrix or document the gap as "out of scope — primary AOCyber stacks only".
- If the planner agent can't resolve the `@~/.claude/devflow/references/testing-strategy.md` path: check the sync-runtime hook's logic. The hook should pick up the new file at session start (it mirrors all of `${CLAUDE_PLUGIN_ROOT}/devflow/` to `~/.claude/devflow/`). Test by running `ls ~/.claude/devflow/references/testing-strategy.md` after a fresh session start.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/00-refine-defaults-table/00-CONTEXT.md
@.planning/objectives/00-refine-defaults-table/00-RESEARCH.md
@.planning/research/tdd-scope-summary.md
@.planning/research/tdd-scope-codebase-survey.md
@plugins/devflow/devflow/references/defaults-table.md
@plugins/devflow/devflow/references/tdd.md
@plugins/devflow/devflow/references/verification-patterns.md
</context>

<research_context>
**Source for the matrix:** GitHub issue #7 (closed by this PR per CONTEXT.md §"GitHub tracking") + the user's CLAUDE.md TDD Playbook habit 5 ("Outside-in for UI / portal flows").

**Per CONTEXT.md §5, the doc must include:**
- Layer × tool × stack matrix (unit, integration, AI exploratory, Maestro, visual)
- Flutter-web semantics gotcha paragraph
- Codegen discipline paragraph
- Platform routing paragraph

**The user's CLAUDE.md mentions specific tool names per stack** which seed the matrix:

| Stack | Outside-in chain (per user CLAUDE.md) |
|---|---|
| Rails | Capybara system test → controller test → model test |
| Go (ConnectRPC + templ) | HTTP integration test → handler test → service test |
| Flutter | integration_test → widget test → unit test |

Augmented for the matrix's full coverage:

| Layer | Rails | Go / ConnectRPC | Flutter | Node CLI/plugin |
|---|---|---|---|---|
| Unit | RSpec model spec | `*_test.go` (per-package) | `flutter test` widget/unit | `node --test` |
| Integration | RSpec request spec / system test (no JS) | `*_test.go` with httpmock cassettes | `integration_test/` driver | n/a (CLI) / fixture-driven |
| System / E2E | Capybara (Cuprite/Selenium) | (gateway level only — rare) | `integration_test/` + Patrol or Maestro | (rarely needed) |
| AI exploratory | (no formal pattern) | n/a | (no formal pattern) | n/a |
| Visual / golden | Percy / Chromatic (deferred) | n/a | `matchesGoldenFile` (deferred — no tooling currently) | n/a |
| Wrong-tenant | RSpec request spec with tenant-switch fixture | httpmock test asserting cross-tenant 403 | (not applicable to multi-tenant flutter typically) | n/a |

**Flutter-web semantics gotcha** (paragraph content, per CONTEXT.md §5):
The Flutter integration test runner has subtly different semantics on web (browser) vs mobile (real device or emulator). On web, `await tester.pumpAndSettle()` does not always wait for animations / future-microtasks the same way it does on mobile; tests that pass on mobile can flake on web. Recommendation: when targeting Flutter web specifically, add explicit `await Future.delayed(Duration(milliseconds: 100))` after navigation events, OR use the `Patrol` package which wraps these semantics. Document the failure mode so executors don't lose hours debugging "test passes on macOS, flakes on web."

**Codegen discipline paragraph** (content):
Several stacks generate code from a higher-level schema (ConnectRPC from .proto, drift/floor for Flutter SQLite, Sorbet types for Ruby). The discipline rule: **commit generated code to git** (not gitignore'd) so reviewers can spot breaking changes; **regenerate as a separate commit** when the schema changes (one commit for `.proto` change, one for `make generate`, then one for the consumer code). This makes diffs reviewable and isolates "regen broke something" from "schema change broke something." Tests against generated code should be regenerated with the code, not held back.

**Platform routing paragraph** (content):
Outside-in testing routes from the highest user-observable layer inward. The "highest layer" varies by platform:
- Web app: Capybara/Playwright (browser) → controller/route → service
- Mobile (Flutter): integration_test (driver) → widget → service
- API (Go/Ruby): HTTP integration test (real or httpmock) → handler → service → repository
- CLI: top-level `main_test.go` invoking the binary or its top-level entry point → command-tree dispatch → flag parsing → I/O snapshot

The planner agent uses this guide to pick the *outermost* layer for the project's platform when the resolver returns `outside_in: true`.
</research_context>

<gotchas>
- **The doc lives at `plugins/devflow/devflow/references/`, not at `~/.claude/devflow/references/`.** The sync-runtime hook (per CLAUDE.md §Hooks) mirrors the former to the latter on session start; the planner agent reads from the latter via `@~/.claude/devflow/references/...`. This TRD writes to the source-of-truth path; the mirror is automatic.
- **The matrix has visual-diff and AI-exploratory cells marked "deferred / no formal pattern".** Per the survey, no org repo has these as practiced patterns. Marking them deferred is honest; pretending they exist would be aspirational, which TRD 0.1 explicitly rejects for the same reason.
- **The doc is INDEPENDENT of TRD 0.1's table.** It can ship in Wave 1 in parallel because it doesn't read from or modify the table. Verifications are the file existing + content patterns; no resolver coupling.
- **Issue #7 is closed by this TRD's commit landing in the PR.** Don't add a separate close-issue commit; the PR description (when it goes up) will reference both #20 and #7.
- **The doc's tone matches existing references (`tdd.md`, `verification-patterns.md`):** matter-of-fact, second-person ("you", "the planner"), no exclamations, no enterprise-y "best practices" framing. Mirror that voice.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Author references/testing-strategy.md with matrix + 3 required paragraphs</name>
  <files>plugins/devflow/devflow/references/testing-strategy.md</files>
  <action>
Create the file with the following structure. Use Write, not Bash.

```markdown
# Testing Strategy — Layer × Tool × Stack Matrix

This reference doc maps abstract verification layers (unit / integration / system / AI exploratory / visual) to specific tools per stack family. The planner agent consults it after `df-tools intent resolve` returns: the resolver's `verification` field is stack-agnostic; this matrix tells the planner which tool to invoke for the project's stack.

Soft-bundled with `defaults-table.md` per the v1.1 design — both are read by the planner; neither is read by the resolver. The (kind, work) → defaults table answers "what testing posture does this objective need?"; this matrix answers "which specific tool at which layer for this stack?".

## Testing strategy matrix

The matrix below is **descriptive of observed AOCyber org practice**, not aspirational. Where a cell is empty or marked "deferred", the org currently lacks tooling for that combination — adding tooling is a separate objective, not a planning-time concern.

| Layer | Rails (Sorbet/RSpec) | Go (ConnectRPC + templ) | Flutter (mobile + web) | Node (CLI / plugin) |
|---|---|---|---|---|
| Unit | RSpec model spec | `*_test.go` per-package | `flutter test` (widget + unit) | `node --test` |
| Integration | RSpec request spec / Capybara (no JS) | `*_test.go` with httpmock or interceptor cassettes | `integration_test/` driver harness | Fixture-driven test against real I/O |
| System / E2E | Capybara with Cuprite / Selenium | (rare — gateway level only) | `integration_test/` + Patrol (or Maestro YAML for native flows) | (rare) |
| AI exploratory | (no formal pattern in org) | (no formal pattern in org) | (no formal pattern in org) | (no formal pattern in org) |
| Visual / golden | Percy / Chromatic — deferred until tooling lands | n/a | `matchesGoldenFile` — deferred (no current adoption) | n/a |
| Wrong-tenant assertion | RSpec request spec with tenant-switching fixture | httpmock test asserting cross-tenant 403/404 | (rarely applicable) | n/a |
| Contract / parity (port) | Pact-style consumer contract | Recorded cassettes vs source | Widget-tree behavioral parity | I/O snapshot or daemon contract test |

**How the planner uses this matrix:**

1. After `df-tools intent resolve` returns, the planner reads the project's stack family. The `kind` field is the primary anchor (`api` → likely Go or Rails; `app` → likely Flutter; `cli` → likely Go or Node; `plugin` → Node). Specific stack within a family is detected from PROJECT.md or file extensions.
2. The resolver's `config.verification` text is stack-agnostic ("full integration + tenant-isolation assertions"). The planner maps each phrase to a matrix row + cell:
   - "integration" → look up the integration row for the stack → emit the corresponding tool's invocation (e.g., for Go: "run `go test ./internal/handlers/...` against the httpmock cassette set").
   - "tenant-isolation assertions" → look up the wrong-tenant row → emit the matching test pattern.
3. When the resolver returns `outside_in: true`, the planner orders TRDs from the system layer down to the unit layer (top of the matrix to the bottom, within the project's stack column).

## Flutter-web semantics gotcha

The Flutter integration test runner has subtly different semantics between web (browser) and mobile (real device or emulator) targets:

- On mobile, `await tester.pumpAndSettle()` waits for all pending animations + microtasks to drain.
- On web, the same call sometimes returns before browser-side `requestAnimationFrame` completions. Tests that pass on mobile occasionally flake on web.

Recommendation: for Flutter projects targeting web specifically, prefer `Patrol` (which wraps these semantics) or add an explicit `await Future.delayed(Duration(milliseconds: 100))` after navigation events. Document the failure mode in the TRD's `<gotchas>` section so executors don't lose hours debugging "this test passes on macOS but flakes on web."

## Codegen discipline

Several stacks generate code from higher-level schemas:

- ConnectRPC: `.proto` → generated Go handlers/clients
- Drift / Floor (Flutter SQLite): schema → generated DAO classes
- Sorbet (Ruby): inline annotations → typecheck
- GraphQL Codegen: schema → typed clients

Discipline rule: **commit generated code to git**, not gitignore'd. Regeneration is a separate commit from the schema change. The reviewable history is:

1. `feat(rpc): add new endpoint to .proto` — schema change only
2. `chore(rpc): regenerate Go bindings` — `make generate` or equivalent
3. `feat(api): wire new handler in service` — consumer code

This makes "regen broke X" diffs distinct from "schema broke X" diffs. Tests against generated code regenerate WITH the code, not held back.

## Platform routing

Outside-in testing starts at the highest user-observable layer and drills inward. The "highest layer" varies by platform:

- **Web app:** Capybara / Playwright (browser) → controller/route handler → service → repository
- **Mobile (Flutter):** `integration_test` driver → widget tests → service → repository
- **HTTP API (Go / Rails):** HTTP integration test (real server or httpmock) → handler → service → repository
- **CLI:** Top-level `main_test.go` invoking the binary (or its top-level entry function) → command-tree dispatch → flag parsing → I/O snapshot
- **Plugin:** Host integration test (mocked host) → plugin contract surface → internal modules

The planner uses this routing when the resolver returns `outside_in: true` — order the TRDs from the topmost layer to the bottom, with each TRD covering one layer.

## Cross-references

- `defaults-table.md` — (kind, work) → defaults posture (orthogonal to this doc; both consulted by the planner)
- `tdd.md` — Iron Law TDD with RED → GREEN → REFACTOR commit conventions
- `verification-patterns.md` — concrete verification command examples per scenario
- `anti-patterns.md` — patterns to avoid in TRD generation

## Out of scope (covered by future objectives, not this doc)

- Adding visual-regression tooling (Chromatic / Percy / Flutter golden files) — separate objective when the org commits to a tool
- AI-exploratory testing patterns — no observed org adoption; revisit if/when patterns emerge
- Property-based testing infrastructure — suppressed by default per the `no_property_based_default` resolver constraint
- Stacks beyond the four AOCyber primaries (Rails, Go/ConnectRPC, Flutter, Node) — see your team's lead for stack-specific guidance

## Versioning

This doc is read at planning time by the planner agent. Changes here propagate immediately to all running planners (no rebuild needed — references are read at planning time via `@~/.claude/devflow/references/testing-strategy.md`).

When modifying the matrix, also update:
- `defaults-table.md` if a new stack-aware verification command is required at the cell level
- `CHANGELOG.md` if the change ships in a release
```

# CRITICAL: The matrix is the load-bearing artifact. Get the columns + rows right; the surrounding paragraphs are scaffolding.
# CRITICAL: Do not invent tool names. Use the names from the user's CLAUDE.md (Capybara, integration_test, httpmock, Patrol, Maestro, etc.) verbatim.
# CRITICAL: Visual / golden cells are marked "deferred" or n/a, never with aspirational tool names.
# GOTCHA: The doc references defaults-table.md and tdd.md; both must exist (defaults-table.md is modified by TRD 0.1 in same wave; tdd.md exists already). The cross-reference works regardless of TRD 0.1's exact content.
# PATTERN: Section headings use `## ` (H2). Tables use GFM-style. Code fences only when illustrating a command — most of the doc is prose + tables.
  </action>
  <verify>
1. `test -f plugins/devflow/devflow/references/testing-strategy.md` exits 0.
2. `grep -E 'Flutter-web' plugins/devflow/devflow/references/testing-strategy.md` returns at least 1 line (the gotcha section heading).
3. `grep -cE '^## ' plugins/devflow/devflow/references/testing-strategy.md` returns ≥ 4 (Testing strategy matrix, Flutter-web semantics gotcha, Codegen discipline, Platform routing — at minimum).
4. `wc -l plugins/devflow/devflow/references/testing-strategy.md` returns ≥ 60 (the doc above is ~100 lines).
5. The matrix table parses as valid Markdown (no broken pipe alignment) — visual inspection or `cat plugins/devflow/devflow/references/testing-strategy.md | grep -c '|.*|'` returns the expected number of table rows.
  </verify>
  <done>
- File exists at `plugins/devflow/devflow/references/testing-strategy.md`.
- Contains the Layer × Tool × Stack matrix with 4 stack columns + 7 layer rows.
- Contains the Flutter-web semantics gotcha section.
- Contains the Codegen discipline section.
- Contains the Platform routing section.
- Contains cross-references to defaults-table.md, tdd.md, verification-patterns.md.
- Has an out-of-scope section listing visual-regression deferral, property-based suppression, etc.
- Tone matches existing references (matter-of-fact, second-person).
  </done>
  <recovery>
- If the matrix table is too wide and breaks markdown rendering: split into two narrower tables (e.g., one for "test layers" and one for "verification layers").
- If sync-runtime hook doesn't pick up the new file: `ls ~/.claude/devflow/references/testing-strategy.md` should exist after a fresh session start. If it doesn't, the hook may be cached; check `~/.claude/devflow/.plugin-version` and force a re-sync by deleting the version file.
- If Markdown linters / hooks reject the doc: check for trailing whitespace, mixed tab/space indentation, or unbalanced code fences. The existing reference docs are clean — diff against them for style.
  </recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
1. The 4 verification commands in this TRD's frontmatter all exit 0.
2. The doc contains the matrix + 3 paragraph treatments per CONTEXT.md §5.
3. The matrix lists ≥ 4 stack families (Rails, Go/ConnectRPC, Flutter, Node) and ≥ 5 layers (unit, integration, system, AI exploratory, visual).
4. Visual + AI exploratory cells are marked deferred / no formal pattern, not with aspirational tool names.
5. The doc cross-references defaults-table.md and tdd.md.
6. After session start (or on next planner agent invocation), `~/.claude/devflow/references/testing-strategy.md` exists (sync-runtime hook handles this automatically).
</verification>

<success_criteria>
Maps to ROADMAP.md objective 0:
- Criterion 5 (`references/testing-strategy.md` exists with the layer×tool×stack matrix from #7 plus the Flutter-web semantics gotcha, codegen discipline, and platform routing paragraphs) — full coverage.

Closes GitHub issue #7 in the same PR.

Does NOT close criterion 6 (planner consults the doc when emitting verification commands) — that is TRD 0.3's concern.
</success_criteria>

<output>
After completion, create `.planning/objectives/00-refine-defaults-table/00-06-testing-strategy-doc-SUMMARY.md` documenting:
- Final structure of testing-strategy.md (table of contents)
- The matrix's row/column counts and which cells are marked deferred
- The 3 paragraph treatments — one-sentence summary each
- Confirmation that the file lands at the expected path and the sync-runtime hook will mirror it
- Note that issue #7 is closed by this TRD (referenced in the PR description when it goes up)
</output>
