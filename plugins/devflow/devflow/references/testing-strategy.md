# Testing Strategy — Layer x Tool x Stack Matrix

This reference doc maps abstract verification layers (unit / integration / system / AI exploratory / visual) to specific tools per stack family. The planner agent consults it after `df-tools intent resolve` returns: the resolver's `verification` field is stack-agnostic; this matrix tells the planner which tool to invoke for the project's stack.

Soft-bundled with `defaults-table.md` per the v1.1 design — both are read by the planner; neither is read by the resolver. The (kind, work) defaults table answers "what testing posture does this objective need?"; this matrix answers "which specific tool at which layer for this stack?".

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

1. After `df-tools intent resolve` returns, the planner reads the project's stack family. The `kind` field is the primary anchor (`api` maps to likely Go or Rails; `app` maps to likely Flutter; `cli` maps to likely Go or Node; `plugin` maps to Node). Specific stack within a family is detected from PROJECT.md or file extensions.
2. The resolver's `config.verification` text is stack-agnostic ("full integration + tenant-isolation assertions"). The planner maps each phrase to a matrix row + cell:
   - "integration" maps to the integration row for the stack; emit the corresponding tool's invocation (e.g., for Go: "run `go test ./internal/handlers/...` against the httpmock cassette set").
   - "tenant-isolation assertions" maps to the wrong-tenant row; emit the matching test pattern.
3. When the resolver returns `outside_in: true`, the planner orders TRDs from the system layer down to the unit layer (top of the matrix to the bottom, within the project's stack column).

## Flutter-web semantics gotcha

The Flutter integration test runner has subtly different semantics between web (browser) and mobile (real device or emulator) targets:

- On mobile, `await tester.pumpAndSettle()` waits for all pending animations + microtasks to drain.
- On web, the same call sometimes returns before browser-side `requestAnimationFrame` completions. Tests that pass on mobile occasionally flake on web.

Recommendation: for Flutter projects targeting web specifically, prefer `Patrol` (which wraps these semantics) or add an explicit `await Future.delayed(Duration(milliseconds: 100))` after navigation events. Document the failure mode in the TRD's `<gotchas>` section so executors don't lose hours debugging "this test passes on macOS but flakes on web."

## Codegen discipline

Several stacks generate code from higher-level schemas:

- ConnectRPC: `.proto` files generate Go handlers/clients
- Drift / Floor (Flutter SQLite): schema generates DAO classes
- Sorbet (Ruby): inline annotations generate typecheck artifacts
- GraphQL Codegen: schema generates typed clients

Discipline rule: **commit generated code to git**, not gitignore'd. Regeneration is a separate commit from the schema change. The reviewable history is:

1. `feat(rpc): add new endpoint to .proto` — schema change only
2. `chore(rpc): regenerate Go bindings` — `make generate` or equivalent
3. `feat(api): wire new handler in service` — consumer code

This makes "regen broke X" diffs distinct from "schema broke X" diffs. Tests against generated code regenerate WITH the code, not held back.

## Platform routing

Outside-in testing starts at the highest user-observable layer and drills inward. The "highest layer" varies by platform:

- **Web app:** Capybara / Playwright (browser) then controller/route handler then service then repository
- **Mobile (Flutter):** `integration_test` driver then widget tests then service then repository
- **HTTP API (Go / Rails):** HTTP integration test (real server or httpmock) then handler then service then repository
- **CLI:** Top-level `main_test.go` invoking the binary (or its top-level entry function) then command-tree dispatch then flag parsing then I/O snapshot
- **Plugin:** Host integration test (mocked host) then plugin contract surface then internal modules

The planner uses this routing when the resolver returns `outside_in: true` — order the TRDs from the topmost layer to the bottom, with each TRD covering one layer.

## Cross-references

- `defaults-table.md` — (kind, work) to defaults posture (orthogonal to this doc; both consulted by the planner)
- `tdd.md` — Iron Law TDD with RED to GREEN to REFACTOR commit conventions
- `verification-patterns.md` — concrete verification command examples per scenario
- `anti-patterns.md` — patterns to avoid in TRD generation

## Out of scope

Covered by future objectives, not this doc:

- Adding visual-regression tooling (Chromatic / Percy / Flutter golden files) — separate objective when the org commits to a tool
- AI-exploratory testing patterns — no observed org adoption; revisit if/when patterns emerge
- Property-based testing infrastructure — suppressed by default per the `no_property_based_default` resolver constraint
- Stacks beyond the four AOCyber primaries (Rails, Go/ConnectRPC, Flutter, Node) — see your team's lead for stack-specific guidance

## Versioning

This doc is read at planning time by the planner agent. Changes here propagate immediately to all running planners (no rebuild needed — references are read at planning time via `@~/.claude/devflow/references/testing-strategy.md`).

When modifying the matrix, also update:

- `defaults-table.md` if a new stack-aware verification command is required at the cell level
- `CHANGELOG.md` if the change ships in a release
