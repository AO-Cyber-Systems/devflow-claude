---
title: TDD Scope by (kind, work) — Codebase Survey
date: 2026-04-29
purpose: Step 1+2 raw findings for the TDD-defaults research. Sample what real AOCyber codebases actually do per kind and work-type, so the (kind, work) defaults table can be validated or refined against evidence.
status: research-survey
related:
  - tdd-scope-by-kind-work.md (framing)
  - tdd-scope-refined-defaults.md (synthesis, written next)
  - plugins/devflow/devflow/references/defaults-table.md (table being validated)
---

# TDD Scope by (kind, work) — Codebase Survey

## Methodology and limits

- **Time-boxed.** ~2.5h of `find` / `grep` / `git log` / `Read` against sibling repos under `/Users/markemerson/Source/`. No code modified.
- **Adherence heuristic.** Three signals, applied in combination:
  1. *Commit ordering*: `git log --oneline --reverse -- <src> <test>` — does the `test:` commit precede the `feat:` commit for the same surface?
  2. *Frontmatter signals*: TRD `type: tdd|standard|auto` and SUMMARY `tdd_evidence: true|false`, `test_pairing: true|false` (auto-emitted by DevFlow's verifier).
  3. *File pairing*: does every `foo.go` have a `foo_test.go` adjacent? What's the test-file count vs source-file count?
- **Limits**: Adherence is genuinely hard to measure post-hoc — a `test:` commit landing one commit *after* `feat:` doesn't prove anti-TDD (could be split out for review). The signals correlate but do not prove. Treat percentages as triangulated estimates, not measurements.

## Per-kind findings

### kind = api (samples: aosentry, aodex-go, aohealth-go)

**Test-file counts (find + wc):**

| repo | `*_test.go` count | `*.go` (non-test) count | ratio |
|---|---|---|---|
| `aodex-go/` | 87 | 204 | 43% |
| `aosentry/` | 13 | 150 | 8.7% |
| `aohealth-go/` | 10 | 115 | 8.7% |

(Reproduce: `find <repo> -name '*_test.go' \| wc -l` and `find <repo> -name '*.go' ! -name '*_test.go' \| wc -l`.)

**Adherence (commit ordering signal):**

- `aosentry/internal/llm/provider/openai.go` vs `openai_test.go`: `git log --reverse -- internal/llm/provider/openai.go internal/llm/provider/openai_test.go` shows `e14587a34 feat: replace Python/LiteLLM proxy with Go rewrite` precedes `3142ba642 test: add comprehensive unit and E2E test suites` — **tests retrofitted, not TDD**.
- `aodex-go/internal/handler/conversations.go` vs `conversations_test.go`: `cddb52e AODex Go backend — full Rails replacement` (initial drop) precedes `0857bcd test: add comprehensive unit and E2E tests` by 3 commits — **same retrofit pattern**.
- TRD frontmatter signal: in `aosentry/.planning/objectives/`:
  - `01-go-rails-feature-parity` (port, Rails→Go): 5/5 TRDs `type: standard`, all SUMMARY `tdd_evidence: false`, `test_pairing: false`.
  - `02-remaining-scheduler-jobs` (foundation/feature): 5/5 `type: standard`, 5/5 `tdd_evidence: false`.
  - `03-unified-knowledge-aosentry` (feature/integration): 5/6 `type: standard`, 1/6 `type: tdd` (the lone TDD one is `03-03-TRD.md`, an explicit "write failing tests first" client API surface, see `aosentry/.planning/objectives/03-unified-knowledge-aosentry/03-03-TRD.md:1-15`). Even there, only 2/6 SUMMARY `test_pairing: true`.
- TRD totals across 3 aosentry objectives: **15× `type: standard`, 1× `type: tdd`** — TDD is the rare exception.

**Test taxonomy mix (eyeballed across sampled files):**

- ~70% unit tests, table-driven (`testify/assert`, `testify/require`). Example: `aosentry/internal/auth/auth_test.go:14-58` is canonical Go table-driven style.
- ~25% integration via `httptest.Server` for external API stubs (no VCR/cassettes). Example: `aosentry/internal/llm/provider/openai_test.go:53-100` spins a `httptest.NewServer` per test.
- ~5% E2E (`aosentry/e2e_test.go`, `aodex-go/e2e_test.go`, `aodex-go/e2e_knowledge_test.go`) — gated by `AODEX_BASE_URL` env, opt-in.
- Property-based: 0 hits for `rapid.\|gopter.\|Hypothesis` across all 3 api repos.
- Benchmarks: 0 hits for `func Benchmark` in test files. Performance is verified via the *separate k6 harness* at `aodex-go/test/loadtest/` with explicit p95/p99 thresholds (`thresholds.js:6-40`).

**Fixture strategy:**

- **Hand-built fakes inside each test file** — not factory libraries. `aodex-go/internal/handler/conversations_test.go:19-75` defines `fakeConversationsHandler`, `fakeConversation`, `fakePersona` structs with hand-rolled add/list methods.
- **No VCR / recorded cassettes**. External APIs (OpenAI/Anthropic/Google) stubbed via `httptest.NewServer` per test. `aosentry/internal/llm/provider/openai_test.go:76-100`.
- **No central `testutil/` or `testfactory/` package** in any of aodex-go, aosentry, aohealth-go.

**Multitenancy assertions:**

- `grep -c 'wrong.user\|other.user\|differentUser\|otherUser'` across `aodex-go/internal/handler/conversations_test.go`, `teams_delete_cascade_test.go`, `conversation_shares_test.go`: **2 hits in conversations_test.go, 0 in the others**.
- Authorization is checked structurally (sessions middleware injects `current_user`) but **explicit "wrong-tenant returns 403/404" assertions are sparse**. The user's CLAUDE.md "multitenancy guard" habit is **NOT** the codebase norm today.

**Performance baselines:**

- aodex-go has `test/loadtest/` (k6 + thresholds): `http_req_duration p(95)<500`, `p(99)<1000`, per-flow tags for login/list/create. `aodex-go/test/loadtest/thresholds.js:1-40`. **Real, but lives outside the test suite**.
- aosentry, aohealth-go: no perf baselines found.

**Notable patterns the kind enforces structurally:**

- table-driven tests are universal in Go.
- `httptest` for both inbound (handler tests) and outbound (provider tests).
- E2E uses live server + real Postgres, gated on env vars — opt-in, not in CI default path.

---

### kind = app (sample: aodex-flutter; secondary: aohealth-go's Flutter portion via the quick task)

**Test-file counts:**

| repo | `*_test.dart` (test/) | `*_test.dart` (integration_test/) | dart non-test files |
|---|---|---|---|
| `aodex-flutter/` | 107 | 7 | (large, ratio not computed) |

(Reproduce: `find aodex-flutter/test -name '*_test.dart' \| wc -l` = 107; `find aodex-flutter/integration_test -name '*_test.dart' \| wc -l` = 7.)

**Adherence (TRD/SUMMARY signal):**

- 24/24 sampled TRDs across 11 aodex-flutter objectives: **100% `type: standard`**. Zero `type: tdd`. Zero `type: auto`.
- 22/22 SUMMARY frontmatter: **100% `tdd_evidence: false`**. test_pairing distribution: 15 false, 7 true (the 7 are foundation/core-chat objectives that did pair tests with implementation).
- Reproduce: `grep 'type: ' /Users/markemerson/Source/aodex-flutter/.planning/objectives/*/*-TRD.md \| grep -E 'type:\s*(tdd|standard|auto)' \| sort \| uniq -c`.
- Commit-ordering check on `lib/features/onboarding/presentation/tier_selection_screen.dart` vs its regression test: only one entry (`63d0e53 feat(aodex-flutter): onboarding tier regression test + sign-out button`) — test landed *with* the feature, not before.

**Test taxonomy mix:**

- Widget tests dominate (`testWidgets` + `flutter_test` package). Example: `aodex-flutter/test/widgets/eden_form_test.dart:43-80`.
- Integration tests using `integration_test` + `mocktail` for HTTP mocking. Example: `aodex-flutter/integration_test/login_redirect_test.dart:1-50`. Comment header explicitly calls out the test as a "Regression guard for the login-success -> 'Page Not Found' race".
- E2E via Maestro YAML flows (`aodex-flutter/flows/login_email.yaml`) and Playwright (`aodex-flutter/e2e/tests/`) — outside `flutter test`, run via separate harness.
- **Zero golden-file usage**: `grep -l 'matchesGoldenFile\|goldenFile' /Users/markemerson/Source/aodex-flutter/test/**/*.dart` returns nothing.
- A11y/Semantics: 4 hits in eden-ui-flutter test files, none in aodex-flutter app tests.

**Fixture strategy:**

- `mocktail` for HTTP repo mocks (`_MockDio`, `_MockAuthRepository`).
- `MockClient` from `package:http/testing` for raw HTTP stubbing (`eden-ai-dart/test/aosentry/client_test.dart:12-45`).
- Hand-built mock data inline in each test file, no shared factory.

**Notable structural patterns:**

- Outside-in is real: integration_test layer + widget test layer + unit test layer is consistently observed (matches user's CLAUDE.md habit 5).
- The Maestro YAML + Playwright e2e harnesses are the *real* "system test" tier — Capybara-equivalent for Flutter.

---

### kind = library (samples: eden-libs/eden-ai-go, eden-libs/eden-ai-dart, eden-libs/eden-platform-go)

**Test-file counts:**

| repo | `*_test.{go,dart}` | source files | ratio |
|---|---|---|---|
| `eden-libs/eden-ai-go/` | 21 | 72 | 29% |
| `eden-libs/eden-ai-dart/test/` | 7 | (large) | — |

**Adherence (TRD/SUMMARY signal):**

- Across all 16 eden-libs objectives (`/Users/markemerson/Source/eden-libs/.planning/objectives/`): **53× `type: standard`, 11× `type: auto`, 3× `type: tdd`** (the 3 TDD ones are all in objective `07-go-test-coverage` — an explicit *test-retrofit* objective where tests **are** the deliverable, not where they were written first; see `eden-libs/.planning/objectives/07-go-test-coverage/07-01-TRD.md:1-15`).
- 15/15 SUMMARY records `tdd_evidence: false`. 14/15 `test_pairing: false`, 1/15 `test_pairing: true` (`15-support-panel-tours/15-05`).
- Commit ordering for `eden-ai-go/orchestration/pipeline.go` vs `pipeline_test.go`: `5794c4d feat(15-08): add orchestration package — pipeline, tools, resilience, signals` precedes `5ef37e8 feat(15-09): add integration examples and orchestration tests` — **tests followed implementation**.

**Test taxonomy mix:**

- Almost entirely unit-shaped: `testing.T` + `httptest` for transport mocking. Example: `eden-libs/eden-ai-go/orchestration/pipeline_test.go:13-49`.
- Dart side uses `MockClient` from `package:http/testing`, similar shape: `eden-libs/eden-ai-dart/test/aosentry/client_test.dart:13-58`.
- **Property-based**: zero hits.
- **Benchmarks**: zero `func Benchmark` in eden-ai-go test files.

**Fixture strategy:**

- `newMockServer()` helper in `eden-ai-go/orchestration/pipeline_test.go:13` is the closest thing to a fixture generator — but it's per-package, not a shared factory.
- No VCR. No central testutil package.

**Notable patterns:**

- Public-API contract testing **is** the dominant style — every public type/function in `eden-ai-go/orchestration/` has a paired `_test.go` for its contract.
- The "unit > integration" posture in the table matches reality, but the table's claim of "comprehensive edge cases" is inconsistent — eden-ai-go tests cover happy paths thoroughly but edge-case coverage is uneven.

---

### kind = ui-lib (samples: eden-ui Rails gem, eden-ui-flutter)

**Test-file counts:**

| repo | tests | source artifacts | ratio |
|---|---|---|---|
| `eden-ui/` | 2 (`brand_presets_test.rb`, `eden_ui_test.rb`) | 394 `.html.erb` partials | <1% |
| `eden-ui-flutter/test/widgets/` | 21 widget tests + 1 dev-app test | (large widget catalog) | — |

**Adherence:**

- eden-ui (Rails gem): **2 test files for ~400 ERB partials**. The 2 tests cover *configuration logic* (brand presets, color resolution) — not visual output. There is **no visual regression suite** in this codebase.
- eden-ui-flutter: 21 widget tests under `test/widgets/`. Tests cover behavior (validators, form state, render checks) using `find.text`, `tester.tap`. **Zero `matchesGoldenFile` hits** — no golden-file regression.

**Test taxonomy mix:**

- eden-ui: 100% unit (config logic).
- eden-ui-flutter: 100% widget tests (`testWidgets`). 4 files reference Semantics/a11y; not the dominant pattern.

**Fixture strategy:**

- eden-ui: `Minitest` with hand-rolled config builders, test-helper.
- eden-ui-flutter: hand-built `EdenForm` / `EdenValidators` test data inline.

**Notable patterns:**

- The shipped table assumes `tdd: "strict; visual + a11y + API"` for `(ui-lib, feature)`. **Real UI libraries in the org test only behavior + config — no visual diffing tooling is present anywhere**. The "visual + a11y" defaults overshoot reality by a wide margin.

---

### kind = cli (sample: eden-libs/eden-cli; secondary: devflow CLI is charter-only, 1 file)

**Test-file counts:**

| repo | `*_test.go` | `*.go` non-test | ratio |
|---|---|---|---|
| `eden-libs/eden-cli/` | 1 (`internal/daemon/dns_test.go`) | 28 | 3.6% |
| `devflow/` (separate repo) | 0 | 1 (charter-only) | — |

**Adherence:**

- One test file across the entire eden-cli daemon code (28 source files). The single test (`dns_test.go:1-30`) tests DNS responder logic via `dns.Client.Exchange` against a live in-process server.
- TRDs in `eden-libs/.planning/objectives/01-eden-cli/`: 5 TRDs, all `type: standard` from the broader survey above.
- Commit log: `feat(14-02): add DNS responder and local CA for eden dev server`, `feat(14-03): add HTTP/HTTPS reverse proxy with host-based routing`, etc. — features ship without test commits in between.

**Test taxonomy:** unit (the one test).

**Fixture strategy:** hand-built (spawn an in-process DNS server, query it).

**Notable patterns:**

- The shipped table assumes `tdd: "strict; I/O snapshot + exit codes"` for `(cli, feature)`. Real CLI in the org has no I/O-snapshot pattern; daemon-shaped CLIs (eden-cli is a daemon-launcher) test internal modules unit-style instead.

---

### kind = plugin (sample: devflow-claude itself)

**Test-file counts:**

```
plugins/devflow/devflow/bin/df-tools.test.cjs
plugins/devflow/devflow/bin/handoff-e2e.test.cjs
plugins/devflow/devflow/bin/devflow-watch.test.cjs
plugins/devflow/devflow/bin/lib/intent.test.cjs
plugins/devflow/devflow/bin/lib/migrate.test.cjs
plugins/devflow/devflow/bin/lib/watcher-state.test.cjs
plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
plugins/devflow/devflow/bin/lib/intent-cli.test.cjs
plugins/devflow/devflow/bin/lib/watcher-allowlist.test.cjs
plugins/devflow/devflow/bin/lib/claude-md.test.cjs
```

**Adherence (commit-ordering signal):**

- `2783c32 test(handoff): watcher-state lib (PID file, liveness, done records)` precedes `f193a71 feat(handoff): watcher-state library (TRD 01-01)` — **true TDD**.
- `8994341 test(handoff): watcher allowlist validation` precedes `9450b92 feat(handoff): watcher allowlist (TRD 01-02)` — TDD.
- Counter-example: `4bc918d test(intent): add CLI integration + table completeness` follows `79ea5e9 feat(intent): resolve (kind, work) → defaults with precedence chain (TRD 03)` — same TRD, **test commit landed after feat commit**.
- TRDs in `01-handoff-watcher`: **8/8 `type: tdd`**. Only objective in this repo with this density of TDD adoption.

**Test taxonomy:**

- ~80% unit tests via `node:test` describe/test blocks.
- ~20% integration / e2e (`handoff-e2e.test.cjs`, `intent-cli.test.cjs` — exercises the actual CLI binary end-to-end).
- Property-based: zero. Benchmarks: zero.

**Fixture strategy:**

- **`__fixtures__/intent-fixtures.cjs`** — explicit fixture-builder module (`fixtures.buildProject(...)`). Intent test loads via `require('./__fixtures__/intent-fixtures.cjs')`. **Closest thing to user's "fixture generators, not LLM-generated test data" habit found in the org.** See `plugins/devflow/devflow/bin/lib/intent.test.cjs:9`.
- `tmpHome()` helper in `watcher-state.test.cjs:31-43` builds isolated `$HOME` per test, cleans up after.
- "Test list first" pattern: `watcher-state.test.cjs:1-15` literally numbers 11 behaviors at the file head — exactly the user's habit 2.

**Notable patterns the kind enforces structurally:**

- Plugin contract testing **is** the dominant style — `df-tools.test.cjs` exercises every CLI subcommand via spawning the real binary.
- Sentinel-based testing for hooks (the user's CLAUDE.md alludes to this).

---

## Per-work-type findings

The framing requires 3-5 sampled objectives per work type. Mapping objectives to work types from their structure / SUMMARY content:

### work = feature (≥3 sampled)

1. **`aodex-flutter/02-core-chat`** (kind=app) — net-new conversation list / streaming. 3 TRDs, all `type: standard`, all `tdd_evidence: false`, `test_pairing: true` for 2 of 3. **Was TDD posture proportional to risk?** No — it's a complex realtime chat feature; the table says `(app, feature)` should be "strict; integration > unit"; reality was `standard` retrofit. *In retrospect*: the regression-style integration tests that landed (`integration_test/chat_test.dart`, `app_test.dart`) are valuable; full TDD would have been overkill for a UI feature where Maestro flows do the real coverage.
2. **`aosentry/03-unified-knowledge-aosentry`** (kind=api) — feature work calling external knowledge API. 6 TRDs: 5 `standard`, 1 `tdd`. The TDD one is the client-API surface (`03-03-TRD.md`). Was TDD posture proportional? **Yes** — TDD was applied exactly where it carried weight (a typed API client surface that other code depends on). The shipped table's "strict + multi-tenancy assertion" overstates the typical case.
3. **`eden-libs/16-ai-platform-sdk`** (kind=library) — 12 TRDs to build a platform SDK. All `type: standard`. Tests retrofitted in `07-go-test-coverage` *afterward*. Was posture proportional? **No** — for a public SDK that other apps consume, TDD-first would have caught the contract surprises that the test-coverage objective later exposed.
4. **`devflow-claude/01-handoff-watcher`** (kind=plugin) — 8 TRDs, 8/8 `type: tdd`. Posture **was** proportional: the handoff watcher is a daemon with a sentinel protocol and security-relevant allowlist; TDD made sense and the test-list-first pattern is visible in `watcher-state.test.cjs:1-15`.

**Pattern**: feature work TDD posture in real life ranges from "100% TDD when the user dogfoods their own playbook" (devflow-claude) to "0% TDD with retrofit" (aodex-flutter, aosentry, eden-libs). The shipped table's "strict" default does not match observed practice — it matches *aspiration*.

### work = port (≥3 sampled)

1. **`aosentry/01-go-rails-feature-parity`** (kind=api) — Rails→Go port. 5 TRDs all `type: standard`, 0 `tdd_evidence`. The ported source's tests (Rails) were **not** treated as fixtures — Go tests retrofitted later by the separate test-coverage initiative. The shipped table says `(api, port)` = "spec-match (source's tests as fixtures)". **Reality contradicts**: source tests were re-implemented from scratch in Go, not reused.
2. **`aodex-go/01-eden-libs-sdk-extraction`** (kind=api) — extract aodex-go's AOSentry client into eden-libs. NOTES.md only (no TRDs yet); planned port-style refactor. No test artifacts.
3. **`eden-libs/01-eden-cli`** (kind=cli, port-shape — ports parts of older eden tooling). 5 TRDs all `type: standard`, daemon shape, 1 unit test for the entire daemon.

**Pattern**: ports in this org **do not** treat source tests as fixtures. The "spec-match (source's tests as fixtures)" cell is more aspiration than practice. Closer to reality: port-target tests are *deferred* until the port is functionally complete, then a separate test-coverage objective retrofits.

### work = refactor (≥3 sampled)

Did **not** find 3 cleanly tagged refactor objectives. Closest matches:

1. **`eden-libs/05-cicd-all-packages`** — partly refactor work, partly foundation. 5 TRDs `type: auto`/`standard`. No characterization-test pattern visible.
2. **`devflow-claude` post-handoff cleanup commits** — `7477c79 refactor(sdk): consolidate SDK locations across Go and Dart packages` is a real refactor commit but shipped without paired test commits.
3. Various small `refactor:` commits across repos (`refactor(xyz)` conventional-commit type) — none with characterization tests.

**Pattern**: characterization-tests-first is **not** the org norm. Most refactors rely on existing test coverage (where it exists) plus `go vet` / `dart analyze`. The shipped table's "characterization first" recommendation is good practice but not codified anywhere in the sampled repos.

### work = foundation (≥3 sampled)

1. **`aosentry/02-remaining-scheduler-jobs`** (kind=api, foundation = scheduler scaffold). 5 TRDs all `type: standard`, all `tdd_evidence: false`. **Verification was integration-shaped**: gates_passed counts all came from `go build` + `go vet` exit codes, not test runs. Matches table's "integration > unit" but not its TDD claim.
2. **`aodex-flutter/01-foundation`** (kind=app, foundation = auth scaffold + theme). 3 TRDs `type: standard`, 3/3 `test_pairing: true` (the only flutter objective where pairing was true across all jobs). Matches table's "integration > unit" reasonably well — auth is hard to unit-test without integration.
3. **`eden-libs/14-eden-dev-server`** (kind=cli, foundation = daemon scaffold). 5 TRDs `type: standard` / `auto`. 1 unit test exists.

**Pattern**: foundation work in practice is "wire it up + smoke it" — verified by `go build` exit codes and a few integration tests. Unit-test density is universally low for foundations.

### work = bugfix (≥3 sampled)

1. **`aodex-flutter/12-github-issue-triage`** (kind=app). 4 TRDs `type: standard`. SUMMARY 12-01 describes "regression guard for issue #13", "in-flight guard on submit", explicit reasoning about why the test had to inject `autofillFinisherProvider`. **This is the closest the org gets to "regression test required" — and it does it well**. See `aodex-flutter/.planning/objectives/12-github-issue-triage/12-01-SUMMARY.md:32-37`.
2. **`aosentry` "fix(observability)" commits** (kind=api). E.g., `eb99844d9 fix(observability): reduce Sentry noise, add proxy error logging` — bugfix as conventional commit, no associated test commit before/after.
3. **`aodex-go` "fix(conversations)" commits** — `a8d1bcd fix(conversations): replace grok default with claude-sonnet-4-6, auto-detect provider` — landed without a paired regression test.

**Pattern**: only the planning-driven bugfix objective (flutter #12) actually shipped regression tests. Ad-hoc `fix(*)` commits typically don't. The table's "regression test required" rightly demands more than the codebase currently delivers.

### work = prototype (≥3 sampled)

Did **not** find 3 cleanly tagged prototype objectives. Closest:

1. **`aohealth-go/.planning/quick/1-implement-remaining-feature-screens`** (kind=api+app, prototype-shaped quick task). 13 files modified, **0 are test files**. No SUMMARY tdd evidence. The job IS prototype-shape.
2. **devflow-claude `feature/seamless-handoff` Approach A** — prototyped first, then upgraded to Approach B (the formal objective). No tests on the prototype.

**Pattern**: prototypes universally skip tests. Table's `tdd: skip` is correct.

### work = spike (≥3 sampled)

1. **This research itself** (kind=plugin, work=spike). Output is markdown writeups, not code. `tdd: none` is correct.
2. **`aodex-flutter/.planning/objectives/<NN>-RESEARCH.md` files** are spike outputs — research deliverables, no tests.
3. **`aosentry/.planning/objectives/01/01-RESEARCH.md`** — same shape.

**Pattern**: spikes deliver writeups. Table's `tdd: none` is correct.

## Cross-cutting findings

### CLAUDE.md TDD Playbook habits — actual adherence

| Habit | Found in org? | Evidence |
|---|---|---|
| 1. Force TDD TRDs at planning time | **No** — only devflow-claude has TDD-default TRDs (8/8 in handoff-watcher). aodex-flutter has 0/24, aosentry has 1/16, eden-libs has 3/64. | TRD frontmatter survey above. |
| 2. Test list first per TRD | **Yes, in devflow-claude only.** `watcher-state.test.cjs:1-15` literally numbers 11 behaviors. Not seen elsewhere. | File header. |
| 3. One test at a time RED→GREEN→REFACTOR | **Yes, in devflow-claude only.** Commit pattern `test(handoff): X` → `feat(handoff): X` for TRDs 01-01 and 01-02. | git log. |
| 4. Fixture generators (not LLM-generated test data) | **Partially.** Hand-built fixtures everywhere (good); explicit fixture-builder modules exist only in devflow-claude (`__fixtures__/intent-fixtures.cjs`). | File search. |
| 5. Outside-in for UI/portal flows | **Yes, in aodex-flutter.** integration_test → widget test → unit test layering is consistently observed. Maestro YAML + Playwright add the "Capybara-equivalent" outermost layer. | Directory layout. |
| 6. Multitenancy guard in every test | **No** — sparse adoption. 2 hits across 3 sampled aodex-go handler test files. The user's CLAUDE.md habit is genuinely uncommon in the codebase. | grep counts. |

### Anti-patterns user explicitly de-prioritized

- Property-based testing: **0 hits across all repos** — already absent, no constraint needed.
- Gherkin / BDD layer: **0 hits** for `.feature` files or `cucumber` / `bdd` libraries — already absent.
- LLM-generated test data: not directly visible in commits, but the pattern of inline-fake-handler-per-test (e.g., `aodex-go/internal/handler/conversations_test.go:19-75`) suggests hand-built work, not LLM dumps.

### Missing dimensions (RQ2)

- **Performance baselines**: real for `(api, feature)` and `(api, foundation)` in aodex-go (k6 thresholds) — but lives in a separate harness, not in the test suite. Absent in aosentry, aohealth-go.
- **Property-based testing**: 0 hits — confirms user's "skip unless math-heavy" stance and reflects reality.
- **Security/RBAC explicit**: aodex-go has 23 references to TeamID/UserID in `conversations_test.go`, but explicit "wrong-tenant returns 403" assertions are sparse (2 hits). Auth is tested unit-style (`aosentry/internal/auth/auth_test.go`) but not crossed with handler tests.
- **Back-compat for port/refactor**: nowhere observed. Source tests are not preserved or compared against in any port. The "API contract parity" verification claim in the table is not reflected by any concrete tooling in the org.
- **Outside-in stack discipline**: real for kind=app (aodex-flutter), partial for kind=api (no Capybara equivalent in Go land — `httptest.Server` does the job at handler layer; e2e is opt-in).
- **Visual regression**: nowhere observed. The `(ui-lib, *)` cells assume tooling that doesn't exist in eden-ui or eden-ui-flutter.

## Limitations of this survey

- **Single observer.** No second eye on the heuristic interpretation.
- **Commit-ordering heuristic is noisy.** Devs squash, rebase, or split commits for review — a `feat:` precedes a `test:` doesn't strictly prove "no TDD".
- **TRD frontmatter is a planner choice, not a runtime fact.** A TRD marked `type: standard` may have actually been built TDD (and a `type: tdd` may have ended up retrofitted). The signals are correlated but not definitive.
- **Sample sizes for refactor and prototype are below the 3-objective bar.** Findings there are weaker.
- **Did not run any test suites.** Adherence is structural inference only.

Despite limits, the directional finding is robust: **the shipped defaults table is more aspirational than descriptive**. Real codebases are more pragmatic, more test-light, and lean heavier on integration/E2E harnesses than on classical TDD.
