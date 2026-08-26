# Objective 25: Fleet Audit Fixes - Research

**Researched:** 2026-07-22
**Domain:** DevFlow plugin internals (route-intent.js, gate-edits.js, CLAUDE.md playbook absorption) + fleet repo inspection (8 external repos) + session-transcript forensics
**Confidence:** HIGH (all findings are direct file/transcript inspection, not library research — no Context7/WebSearch applicable to this domain)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. **Prune `join-discord` ONLY.** Remove `plugins/devflow/skills/join-discord/` and any references to it. Keep `tui` and `awareness` as manual-only skills — do NOT prune them.
2. **Drive adoption of exactly four skills:** `milestone`, `todo`, `gh-sync`, `discuss-objective`. Each gets (a) realistic router rules in `route-intent.js` INTENT_MAP and (b) a mention in the global `~/.claude/CLAUDE.md` DevFlow Routing table.
3. **TDD posture for the new global `## TDD & Quality` playbook section: BY KIND.** TDD strict for `library | api | cli` kinds; pragmatic tests-with-code for `app | ui-lib` kinds. This section must use headings the intent-model level-3 scan matches (`^##.*TDD`, `^##.*Test`, `^##.*Quality`, `^##.*Scope`).
4. **Edit-gate config knob:** if investigation supports it, add `.planning/config.json` → `gates.editGate: "warn" | "strict" | "off"` to `gate-edits.js`. Default remains `strict`. eden-press gets the value the investigation supports.
5. **Phantom skill names correct to consolidated forms:** `/devflow:new-milestone` → `/devflow:milestone new`, `/devflow:add-todo` → `/devflow:todo add`, `/devflow:check-todos` → `/devflow:todo list`, `/devflow:audit-milestone` → `/devflow:milestone audit`.

### Claude's Discretion
- Exact router regex wording for the 4 adoption-target skills (as long as "realistic" / evidenced by real phrasing).
- Exact prose/wording of the new `## TDD & Quality` CLAUDE.md section and the 2 new fleet CLAUDE.md files.
- Which `kind:` value to assign per inferred repo/package (CONTEXT.md says "infer from stack").

### Deferred Ideas (OUT OF SCOPE)
- Pruning `tui` or `awareness`.
- Changing the defaults table or intent-model resolution order.
- Any deploy/release/tag; version bump happens in a later release objective.
- Rewriting gate-edits default behavior — strict stays the default.

### Cross-Repo Considerations
Items 2, 3a/3b, 4 touch files OUTSIDE devflow-claude. `~/.claude/CLAUDE.md` is not a git repo — edit in place, verify by re-reading, no commit. Fleet repos (aocore, aodex, eden-circle, eden-libs, eden-biz, devflowops, opsCluster, eden-press) are their own git repos — commits happen IN the target repo, never in devflow-claude. The plugin mirrors to `~/.claude/devflow/` via sync-runtime on version change; hook code under `plugins/devflow/hooks/` runs from `${CLAUDE_PLUGIN_ROOT}` directly (no mirror needed for hook-only changes), but any `bin/`/`lib/` df-tools change needs the mirror refreshed before live verification. Port 8080 forbidden everywhere; use 8091 if a server is ever needed (unlikely here).
</user_constraints>

## Summary

This objective is pure codebase/fleet archaeology — no external library research applies. All 7 items were investigated by direct file inspection (8 fleet repos + `~/.claude/CLAUDE.md` + devflow-claude internals) and by forensic sampling of eden-press's Claude Code session transcripts (main session + 51 subagent transcripts). Every finding below is HIGH confidence (verified by reading the actual file/transcript), except where explicitly flagged.

**Three findings materially change how the planner should scope tasks:**

1. **The 6 "kind: unset" repos are not 6 flat PROJECT.md edits.** aocore, aodex, eden-libs, and eden-biz are monorepos where `.planning/PROJECT.md` lives **per sub-package**, not at repo root. Two of those per-package files (`eden-biz/flutter`, `eden-libs/eden-ui-flutter`) **already have `kind:` set correctly** — they are not part of the gap. aocore has **no PROJECT.md anywhere in the repo** (root or per-package) — item 3b cannot literally "set kind: in .planning/PROJECT.md" for aocore without first creating the file. See the full per-repo table below.

2. **eden-press's 52-denial gate friction is a false-positive pattern, not reckless ambient editing.** Forensic sampling of the session found the denials are dominated by `devflow:executor` subagents running **inside git worktrees** (`.claude/worktrees/agent-*/`) performing legitimate TDD work on `.go` source files (31/38 sampled denials were `.go` files, 0 were markdown/content). The root cause: `.skill-active` and `.edit-override` markers are written to the **main repo's** `.planning/`, but `findPlanningDir()` in a worktree-rooted subagent resolves to the **worktree's own separate** `.planning/` copy (each worktree has its own PROJECT.md/ROADMAP.md — confirmed by direct inspection), which never receives either marker. This strongly supports `gates.editGate: "warn"` for eden-press (not `"off"` — there's no evidence of careless ambient editing to suppress entirely; not `"strict"` — it's actively blocking legitimate wave-executor work).

3. **gate-edits.js has zero config-reading code today.** There is no existing `readConfig`-style helper in `gate-edits.js` to extend — the planner must add one from scratch, following the established defensive pattern used by `verify-commits.js`'s `isAutonomousMode()` (try/catch around `fs.readFileSync` + `JSON.parse`, silent-false on any error). Bonus: `gate-edits.js`'s own header comment documents the **prior** implementation used `permissionDecision: 'ask'` for warn-only mode before the strict-by-default rewrite — this is the exact mechanism to resurrect for `"warn"`.

**Primary recommendation:** Treat item 3 (kind: + CLAUDE.md) as 8-10 discrete file edits (not 6), treat item 7 (gate-edits knob) as new code with `"warn"` as the eden-press value backed by transcript evidence, and treat item 4 (new CLAUDE.mds) using the concrete stack/build/test facts gathered below.

---

## Item 1 — Phantom Skill Names in `route-intent.js`

**File:** `plugins/devflow/hooks/route-intent.js` (confirmed line numbers, current as of research date):

| Line | Current (phantom) | Fix to |
|---|---|---|
| 147 | `skill: '/devflow:new-milestone'` | `/devflow:milestone new` |
| 203 | `skill: '/devflow:add-todo'` | `/devflow:todo add` |
| 210 | `skill: '/devflow:check-todos'` | `/devflow:todo list` |
| 231 | `skill: '/devflow:audit-milestone'` | `/devflow:milestone audit` |

Confirmed the consolidated skills exist and take subcommand-style args:
- `plugins/devflow/skills/milestone/SKILL.md` — routes `new|audit|complete|gaps`, `argument-hint: "<new|audit|complete|gaps> [args...]"`. Replaces 4 sibling skills (new-milestone, audit-milestone, complete-milestone, plan-milestone-gaps).
- `plugins/devflow/skills/todo/SKILL.md` — routes `add|list`, `argument-hint: "<add|list> [args...]"`. Replaces 2 sibling skills (add-todo, check-todos).

**Also broken (missed by the audit's line numbers but same root cause):** `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs` contains `FIRE_FIXTURES` entries at lines 349, 466-522 that assert `expected_skill: '/devflow:add-todo'`, `/devflow:check-todos'`, `/devflow:audit-milestone'`, `/devflow:new-milestone'` — these are consumed by `route-intent.test.js` (`require('../devflow/bin/lib/__fixtures__/intent-fixtures.cjs')`). **Both files must change together** or the fixture assertions will fail against the corrected INTENT_MAP.

**Test location (research gap 4a):** `plugins/devflow/hooks/route-intent.test.js` (497 lines), sibling to `route-intent.js`, NOT in `df-tools.test.cjs`. Pattern:
- Imports `{ INTENT_MAP, matchIntent, renderDirective }` directly from `./route-intent.js` (these must stay exported).
- Imports `{ FIRE_FIXTURES, NO_FIRE_FIXTURES }` from `intent-fixtures.cjs`.
- `describe('INTENT_MAP — exported shape', ...)` — array-shape assertions, includes a literal test asserting the **consolidated** skill list is present (line 58): `'INTENT_MAP contains consolidated skills: build, debug, plan-objective, verify-work, status, ..., todo add, quick'` — this test's string list will need the milestone/todo consolidated forms added when item 6 lands.
- Fixture-driven fire/no-fire loop tests (each `FIRE_FIXTURES` entry has `prompt`, `expected_skill`, `label`, `why_fires`).
- Subprocess e2e tests via `spawnSync` for 2 realistic cases (ambient tmpdir fires / non-devflow project silent).

## Item 2 — `~/.claude/CLAUDE.md` Routing Table

Current content (verbatim, lines 11-24 of `/Users/justin/.claude/CLAUDE.md`):

```markdown
# DevFlow Routing

The DevFlow plugin (`devflow@aocyber`) is installed. When the user's request fits a DevFlow workflow, invoke the matching skill via the Skill tool instead of editing files directly.

- Building a feature end-to-end → `/devflow:build`
- Planning before building → `/devflow:plan-objective`
- Executing a planned objective → `/devflow:execute-objective`
- Verifying / UAT → `/devflow:verify-work`
- Debugging a bug → `/devflow:debug`
- Quick ad-hoc task with atomic commits → `/devflow:quick`
- New project setup → `/devflow:new-project`
- Resume / status / progress → `/devflow:resume-work`, `/devflow:progress`

Skills enforce atomic commits, state tracking, and verification. Bypassing them causes drift. Run `/devflow:help` to list all commands.
```

**Confirmed retired:** `/devflow:resume-work` and `/devflow:progress` are gone; the consolidated replacement is `/devflow:status` (with `status resume` / `status pause` subcommands per `route-intent.js`'s own INTENT_MAP, lines 108-119). Line 22 must become something like `- Resume / status / progress → \`/devflow:status\`, \`/devflow:status resume\`, \`/devflow:status pause\``.

**Confirmed missing tier:** `/devflow:micro` exists (`plugins/devflow/skills/micro/SKILL.md`) — "Sub-30-LOC, single-file changes. The cheapest DevFlow path (~2k tokens)... No planner, no executor, no verifier." It sits below `/devflow:quick` in the ladder and has zero mention in this table.

**File format constraint:** this file is NOT a git repo (per CONTEXT.md) — edit in place with Edit tool, verify by re-reading afterward; there is no commit step for this file.

**Note (not in the 7 items but visible in the same file):** `docs/USER-GUIDE.md` (in devflow-claude, IS a git repo file) has the same stale `/devflow:resume-work`, `/devflow:progress`, and a `/devflow:pause-work`/`/devflow:add-objective` that don't match current skill names, plus its own `join-discord` row. Only the join-discord row is in scope per decision #1 ("any references to it"); the other staleness is adjacent but not one of the 7 items — flagged in Open Questions.

## Item 3a — New `## TDD & Quality` Section in `~/.claude/CLAUDE.md`

**Mechanism it must satisfy:** `plugins/devflow/devflow/bin/lib/claude-md.cjs` — `HEADING_PATTERNS`:
```js
const HEADING_PATTERNS = [
  /^##\s+.*\bTDD\b/i,
  /^##\s+.*\bTest(ing)?\b/i,
  /^##\s+.*\bQuality\b/i,
  /^##\s+.*\bScope\b/i,
];
```
A heading of exactly `## TDD & Quality` matches both the TDD and Quality patterns (belt-and-suspenders) — this is a safe heading choice.

**Important architectural caveat (surfaced by research, not obvious from the CONTEXT.md decision text alone):** `claude-md.cjs`'s `PLAYBOOK_HABITS` absorber (the thing that turns CLAUDE.md prose into structured resolver overrides) is **not kind-conditional**. It has exactly 6 hardcoded phrase-detectors (`force_tdd_at_planning`, `test_list_first`, `one_test_at_a_time` [freeform-only], `fixture_generators`, `outside_in`, `multitenancy_guard`), each of which sets ONE global override field applied uniformly regardless of `kind`. There is no code path today that reads "strict for library|api|cli; pragmatic for app|ui-lib" out of a CLAUDE.md section and differentially applies it per kind — that differentiation already lives in `defaults-table.md` (the (kind,work) table), which decision text explicitly puts out of scope to change.

Checked `defaults-table.md`'s actual current values: `tdd_default: strict` for `api.feature`, `library.feature`, AND `app.feature`/`ui-lib.feature` today (all use `strict` except `prototype`/`spike` work types, which are `skip` for every kind). So the "app|ui-lib pragmatic" distinction the decision wants is **not yet encoded anywhere machine-readable** — this new CLAUDE.md section will describe an aspiration/policy, not flip a resolver knob. None of the 6 `PLAYBOOK_HABITS` patterns push toward a softer/"skip" value (all 6 patterns only strengthen: auto/required/generators/true/multi_tenant_required), so wording this section safely will not accidentally regress api/library/cli's already-strict posture.

**Recommendation:** Write the section as descriptive human/Claude-readable policy (mirrors what the defaults table SHOULD represent architecturally), phrased so the by-kind split reads clearly to a human, while accepting it will not literally branch resolver behavior without a future claude-md.cjs change (out of scope here). Do not claim in the section that it "enforces" per-kind behavior — the defaults table already does the enforcement.

## Item 3b — `kind:` Frontmatter Across 6 Fleet Repos (ground truth)

**Critical finding:** these are NOT 6 single-file edits. Four of the six repos are monorepos where `.planning/PROJECT.md` lives per sub-package, and 2 of those sub-package files already have `kind:` set (contradicts the audit's "6 unset" framing at the file level — the audit counted at repo granularity).

`defaults-table.md`'s kind enum: `api | app | library | ui-lib | cli | plugin`. Template shape (from `plugins/devflow/devflow/templates/project.md`): frontmatter block `---\nkind: <value>\ndefault_work: <value>\norg: ...\ngithub_repo: ...\n---` at the top of `PROJECT.md`.

| Repo | PROJECT.md location(s) found | Current frontmatter | Recommended `kind` | Evidence |
|---|---|---|---|---|
| **aocore** | **NONE FOUND** — root `.planning/` has `AOCORE_VISION.md`/`ROADMAP.md`/`STATE.md` but no `PROJECT.md`; `go/`, `admin/`, `portal/`, `sdk/`, `proto/` sub-dirs have no `.planning/PROJECT.md` either (only `go/.planning/` exists, and it's just `.awareness-cache.json` + `.skill-active`) | n/a | **Gap — no file exists to edit.** If created: `go/` → `api` (Go module `github.com/AO-Cyber-Systems/aocore`, "LLM API Gateway with guardrails"); `admin/` + `portal/` → `app` (Flutter, `pubspec.yaml` each); `sdk/python` → `library` (no `.planning/` there, out of scope) | README: "Go backend + Flutter admin dashboard" monorepo |
| **aodex** | `flutter/.planning/PROJECT.md` only. Root has no PROJECT.md. `go/.planning/` exists but has no PROJECT.md (only `objectives/` + awareness cache) | `flutter/`: no `kind:` field (frontmatter absent entirely — file opens straight into `# AODex Flutter Mobile App`) | `flutter/` → **app** (Flutter mobile app, "AI conversations on the go") | `go/go.mod`: `module aodex-go`; `flutter/pubspec.yaml`: `name: aodex`. README: "go/ backend (HTTP API, WebSocket hub, RAG pipeline, job queue)" would be `api` if a PROJECT.md existed there |
| **eden-circle** | Single root `.planning/PROJECT.md` (not a per-package split — one file covers the whole monorepo: Go backend `cmd/`/`internal/`/`migrations/` + Flutter `client/` with `pubspec.yaml`) | frontmatter: `org: AO-Cyber-Systems` + `github_repo` only, no `kind:` | **app** (single PROJECT.md represents the whole product; README/PROJECT.md both frame it as the end-user "unified communications platform," not a backend service) | `go.mod`: `module github.com/aocybersystems/eden-circle`; `client/pubspec.yaml` present |
| **eden-libs** | Root: none (it's a poly-package workspace: `eden-cli`, `devflow-addon`, `eden-docs`, 3× `-api-dart`, `eden-platform-flutter`, `eden-platform-go`, `eden-ui-flutter`, `eden-web`). Only 2 packages have `.planning/PROJECT.md`: `eden-platform-go/` and `eden-ui-flutter/` | `eden-platform-go/`: **no frontmatter block at all** (file opens with `# Project` heading, no `---` delimiters). `eden-ui-flutter/`: **already has `kind: ui-lib` set** — not part of the gap | `eden-platform-go/` → **library** (README: "canonical backend platform contract and service layer... every Eden-family product consumes") | Other packages (`eden-cli`→cli candidate, `eden-web`→library candidate) have no `.planning/` at all — out of scope, no file to edit |
| **eden-biz** | Root: none (`.planning/CONVENTIONS.md` is the monorepo policy doc, referenced by sub-PROJECT.md files). `go/.planning/PROJECT.md` and `flutter/.planning/PROJECT.md` exist. `mobile/`, `pos/`, `api-dart/` have `CLAUDE.md` but **no `.planning/` at all** | `go/`: frontmatter has `org` + `github_repo` only, no `kind:`. `flutter/`: **already has `kind: app` set** — not part of the gap | `go/` → **api** (module `github.com/aocybersystems/eden-biz-go`, "Financial system of record," `biz-api` dir, `sqlc.yaml`, migrations) | `mobile/pos/api-dart` sub-packages have no `.planning/` — out of scope for kind-setting (no target file) |
| **devflowops** | Single root `.planning/PROJECT.md` (Gitea hard-fork; `flutter/` frontend dir exists but has no separate `.planning/`) | **No frontmatter block at all** — file opens directly with `# DevFlow-Ops` heading | **app** (PROJECT.md's own framing: "a full SDLC and operations platform built by hard-forking Gitea and replacing its entire frontend with a Flutter application... under one roof with complete control over the experience"; active requirements include "Build a Flutter web application that replaces Gitea's entire UI") | `go.mod` at root (upstream Gitea fork, README is literal upstream Gitea README — not yet rebranded); `flutter/pubspec.yaml` exists |

**Net count of actual file edits for item 3b: 6** (aocore has no target — flag as open question; aodex `flutter/`; eden-circle root; eden-libs `eden-platform-go/`; eden-biz `go/`; devflowops root). 2 files (`eden-biz/flutter`, `eden-libs/eden-ui-flutter`) need **no change** — they already conform.

**Constraint reminder:** every one of these fleet repos is its own git repo; edits + commits happen IN that repo (`docs(...)` or `chore(...)` conventional commit), never inside devflow-claude.

## Item 4 — New CLAUDE.md for opsCluster and eden-press

Both repos **already have DevFlow onboarded correctly** (`.planning/PROJECT.md` with `kind:` set — opsCluster is `kind: api`, eden-press is `kind: library` — neither is in the item-3b unset list, consistent with the audit). What's missing is a root `CLAUDE.md` (confirmed absent via `find` at both repo roots).

### opsCluster

- **Stack:** Go control-plane (`control-plane/`, module `github.com/AO-Cyber-Systems/opscluster/control-plane`, go 1.26.4) behind `api.aocyber.ai`; Terraform IaC (`terraform/`, DigitalOcean Kubernetes/DOKS, HA Postgres+PgBouncer, HA Valkey, Cloudflare Tunnel+Access); GitOps via a **companion repo** `AO-Cyber-Systems/opscluster-gitops` (ArgoCD source of truth — NOT in this repo).
- **Build/test:** CI is `.github/workflows/go.yml`, path-filtered on `control-plane/**`, runs `go test` from `control-plane/` working directory against a `pgvector/pgvector:pg16` service container (DB **must** be named `opscluster` — a dbprovisioner integration test does `REVOKE ALL ON DATABASE "opscluster"` by literal name). No repo-root Makefile; `control-plane/` has `smoke/`, `democtl/`, `Dockerfile`/`Dockerfile.smoke`.
- **Conventions:** `.planning/PROJECT.md` already documents the 3-plane deployment model (OCI FedRAMP plane / `aocyber-deploy` self-deploy plane / opsCluster DOKS plane) and "deployment profiles" (config selection, not code fork). `CONTRIBUTING.md` mandates a `gitleaks` pre-commit hook (`cp scripts/hooks/pre-commit .git/hooks/pre-commit`) for secret scanning. Deploy model is release-tag-gated for platform changes (`refs/tags/vX.Y.Z`), main-tracking for tenant values — **do not suggest touching this in objective 25** (deploy/tag is explicitly out of scope for this objective, and it's the companion gitops repo's concern, not opsCluster's own CLAUDE.md content beyond documenting the pointer).
- **`.planning/config.json` already has `"kind": "api"`** (project-level config field, separate from PROJECT.md frontmatter — both agree).
- **CLAUDE.md content to include:** stack table (Go control-plane + Terraform + ArgoCD-via-companion-repo), `go build`/`go vet`/`go test` from `control-plane/`, gitleaks pre-commit requirement, pointer to `.planning/PROJECT.md` for the 3-plane architecture, DevFlow routing pointer (mirrors the global CLAUDE.md's routing section).

### eden-press

- **Stack:** Go engine (`bind/`, `chase/`, `press/`, `profiles/`, `convert/`, `conformance/`, `cmd/eden-press/`, `tools/`) — "a Go (+ Dart/Flutter client) framework and CLI for generating documents from Markdown," Marp-compatible, **zero JavaScript in the backend** (clean-room reimplementation, explicitly not affiliated with Marp). `bind/dart` + `bind/wasm` + `bind/capi` give language bindings.
- **Build/test (from `CONTRIBUTING.md` + `Makefile`):** `go build ./...`, `go vet ./...`, `go test ./...` (covers `conformance/...` too). CI = `.github/workflows/ci.yml` (build/vet/test/license-header), `dart-native.yml`, `upstream-drift.yml` (auto-files an issue when Marp releases a newer version than `UPSTREAM-VERSIONS.txt` pins — currently `marpit v3.2.2`, `marp-core v4.4.0`, `marp-cli v4.5.0`, reconfirmed 2026-07-20).
- **Hard conventions a CLAUDE.md MUST carry (these are load-bearing, not optional style notes):**
  - **NEVER run `go mod tidy`** — `go.mod`/`go.sum` are hand-authored and version-pinned; additive-only changes (`go mod download <module>` to record checksums). Parallel-worktree workflow: `tidy` prunes requires a sibling branch legitimately needs.
  - **License headers enforced by `addlicense -check` in CI.** Two templates: Eden Press original files get the MIT/AO-Cyber-Systems header (`addlicense -l mit -s -c "AO Cyber Systems" -y 2026`); the 3 vendored Marp theme files (`default`, `gaia`, `uncover`) + browser-fit script MUST preserve Marp's **original** copyright/year — never relabel them.
  - `make check-no-chromedp` — enforces `press/`+`chase/`+`profiles/` (the public render path) carry **zero** chromedp dependency (chromedp is only for `convert/` export path).
  - `make check-cli-imports` — `cmd/eden-press` may import ONLY `press/` directly (transitive chase/profiles-via-press is fine; direct imports are not).
  - Chrome/PDF export path uses a **pinned** `CHROME_VERSION` in the `Makefile` (currently `151.0.7922.34`) — never "latest"; two independently-documented Chrome regressions hit the PDF export path specifically per an internal research doc citation in the Makefile comment.
- **`kind: library` already correctly set** in `.planning/PROJECT.md` frontmatter (confirmed) — CLAUDE.md should reflect "library-first, CLI second" positioning explicitly since that shapes TDD posture (item 3's by-kind guidance: `library` → strict TDD).

## Item 5 — VERIFY Trigger Regex Over-Fires

**File:** `plugins/devflow/hooks/route-intent.js`, lines 96-101 (the broad, original rule):
```js
{
  rx: /\b(?:verify|test|validate|check)\s+(?:the\s+)?(?:work|build|objective|feature|implementation)\b/i,
  skill: '/devflow:verify-work',
  label: 'verify',
},
```
This is a 4-verb × 5-noun combinatorial match (20 phrase shapes) that fires on completely generic developer speech — "check the build," "test the feature," "validate the implementation" — none of which necessarily mean "run the DevFlow verify-work skill." This is almost certainly the rule responsible for the audit's "fired 15×, followed 0×" finding (build 21/42 followed, but verify-work 0/8 — the widest gap in the whole audit).

A second, narrower VERIFY rule exists at lines 214-220 (`/\bverify\s+(?:this|the\s+current)\s+objective\b/i`) — this one is possessive/specific and is much less likely to be the noisy one.

**Recommendation for planner:** tighten line 98's regex to require possessive/imperative framing consistent with the other consolidated rules (compare to the STATUS rule's `\b(?:what'?s?\s+(?:our|the)\s+...)` pattern) — e.g. require "the current/this objective/build" rather than bare "the work/build/objective," or drop the broadest nouns (`work`, `implementation`) entirely since those two are the most common false-positive triggers in ordinary conversation.

## Item 6 — Prune `join-discord`; Adoption Rules

**Full reference list found (grep across whole repo):**

| File | Line(s) | Content |
|---|---|---|
| `plugins/devflow/skills/join-discord/SKILL.md` | whole file | The skill itself — delete the directory |
| `plugins/devflow/devflow/workflows/help.md` | 265, 271 | `**\`/devflow:join-discord\`**` heading + `Usage: \`/devflow:join-discord\`` — remove this help-listing block |
| `docs/USER-GUIDE.md` | 164 | Table row: `| \`/devflow:join-discord\` | Open Discord community invite | Questions or community |` — remove row |
| `.planning/ROADMAP.md` | 796, 802 | This objective's OWN planning text describing the fix — **do not edit, this is the plan describing itself** |
| `CHANGELOG.md` | 748 | Historical entry: `` `/df:join-discord` command to quickly access the GSD Discord community invite link `` — **do not edit; changelogs are historical record, not live docs** |

Confirmed NOT referenced in `.claude-plugin/marketplace.json` or `plugins/devflow/.claude-plugin/plugin.json` (skill dirs aren't individually enumerated in the manifest — no manifest edit needed).

**Adoption rules — current router state for the 4 target skills** (all 4 already have SOME rule, per CONTEXT.md's audit note that they exist but matched zero prompts in 2 months):
- `milestone` (new-milestone rule, line ~146): `/\b(?:make|create|start)\s+a\s+new\s+milestone\b/i` — narrow but not unreasonable; `audit-milestone` rule (line ~230): `/\baudit\s+(?:the\s+)?milestone\b/i` — reasonably realistic already.
- `todo`: add-todo rule (line ~202): `/\b(?:add|create)\s+a\s+todo\s+(?:for|item|about)\b/i` — requires "for/item/about" suffix, likely too narrow (misses bare "add a todo: <text>" or "add a todo to do X"). check-todos rule (line ~209): `/\b(?:any\s+todos|check\s+(?:this|the|my)\s+todos?)\b/i` — reasonably realistic.
- `gh-sync` (line ~237): `/\b(?:sync|push)\s+to\s+github\b/i` — matches CONTEXT.md's own audit note verbatim ("sync to github" too narrow — misses "sync the objective to GH", "push this to github issues", etc).
- `discuss-objective` (line ~244): `/\bdiscuss\s+(?:the|this)\s+objective\b/i` — matches CONTEXT.md's audit note verbatim ("discuss the objective" too narrow — misses "let's talk through this objective", "walk me through the plan for X").

Since decision text leaves exact wording to discretion, the planner should broaden each with 1-2 additional phrasings mirroring the style already used for the "extension" rules elsewhere in the file (e.g. STATUS's `what'?s\s+next` style additions) — but must add the milestone/todo consolidated skill names to the exported-shape test list at `route-intent.test.js` line 58 when done (see Item 1).

## Item 7 — eden-press Gate Friction Investigation

**Source data:** `~/.claude/projects/-Users-justin-dev-eden-press/670c1efd-8a87-47a7-9b7d-8bbf71ee2250.jsonl` (main session, 1894 lines) + its `subagents/` dir (51 subagent transcripts + `.meta.json` files) + `tool-results/` dir. Only one session exists for this project (matches CONTEXT.md's "1 session with any devflow skill").

**Main-session facts:**
- 4 `Skill` tool_use invocations in the main transcript (roughly matches CONTEXT.md's "3 skill invocations" — small discrepancy likely a counting-methodology difference, not a contradiction).
- 51 subagents spawned via `Task`, broken down by `agentType` (read from each `.meta.json`): **35 `devflow:executor`**, 6 `devflow:planner`, 5 `devflow:objective-researcher`, 5 `devflow:verifier`. This is a full autonomous `/devflow:build`-style run across multiple objectives/waves, not "a user editing files with DevFlow ambient/idle."
- Every sampled executor subagent's `.meta.json` shows `"worktreePath": "/Users/justin/dev/eden-press/.claude/worktrees/agent-<id>"` and `cwd` set to that worktree path.
- The literal main-session hits for "skip devflow"/"bypass devflow"/"force edit" (2 each) are **all instances of the route-intent DIRECTIVE text itself** (the box-drawn message that documents the override phrases) — not the user actually typing an override. **No evidence found of the user using an override phrase in this session.**

**Denial evidence (the actual smoking gun):** searched for gate-edits.js's exact deny-reason substring `"direct Edit/Write/MultiEdit denied"`:
- 0 occurrences in the main session transcript.
- **92 occurrences across 36 of the 51 subagent transcripts** (all in `tool_result` content following an `Edit`/`Write`/`MultiEdit` `tool_use`).
- Parsed 38 denial events with their preceding tool-call file path (sampling limit, not full 92): **31/38 (82%) were `.go` source files**, remainder were `.mod`, `.sh`, `.py`, `.txt`, `.json`, `.yaml` — **zero were markdown/content files**. Every sampled path with a repo-relative prefix was inside a `.claude/worktrees/agent-*/` directory (a few were in the scratchpad temp dir instead, same story).
- Every `.meta.json` checked for a denial-heavy subagent showed `"agentType":"devflow:executor"` — e.g. `agent-a9a84aa2121f07201` (5 denials, task "Execute 03-08 sanitize policy"), `agent-a09538ab0e4c9bfc0` (task "Execute 05-02 determinism + font").

**Root-cause hypothesis (HIGH confidence given direct evidence, though the underlying code fix is out of scope for this objective):** `gate-edits.js`'s `findPlanningDir()` walks up from `process.cwd()` looking for the nearest `.planning/` directory. Confirmed by direct inspection that `~/dev/eden-press/.claude/worktrees/agent-ac10bb2f5bf0873d1/.planning/` is a **full separate copy** with its own `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `config.json`, `objectives/` — i.e., every worktree has its own `.planning/` tree. The `.skill-active` marker and `.edit-override` marker are per-`.planning/` files. Nothing in `executor.md` (grepped, zero hits for "skill-active") or any SKILL.md writes `.skill-active` into a spawned worktree's own `.planning/` — the marker only ever gets written in the **orchestrating** (main-repo) `.planning/` before the Task tool spawns the executor. An executor subagent whose `cwd` is the worktree therefore resolves `findPlanningDir` to the worktree's `.planning/` (which never has `.skill-active` or a fresh `.edit-override`), so **every single non-markdown edit it attempts is denied**, regardless of whether the parent flow is a completely legitimate `/devflow:execute-objective` run.

**Recommendation: `gates.editGate: "warn"` for eden-press.** Evidence: the denials are not evidence of the user bypassing DevFlow — they are false positives against legitimate, fully-orchestrated executor work. `"strict"` (current default) actively blocks correct TDD execution here. `"off"` would be too permissive (there's no signal that ambient/careless direct edits are actually a problem in this repo — the friction is 100% attributable to the worktree/marker gap, and turning the gate fully off would also silence it for any genuinely-ambient future edit in the main worktree). `"warn"` preserves a visible signal (via `permissionDecision: 'ask'`, see Code Examples below) without hard-blocking wave execution.

**Flag for the planner as a separate future concern (explicitly NOT in scope here per "Rewriting gate-edits default behavior — strict stays the default" and no mention of worktree-marker propagation in the 7 items):** this same worktree/`.planning/` isolation almost certainly affects EVERY fleet repo that uses `.claude/worktrees/` for parallel wave execution — `aocore`, `aodex`, `eden-libs`, `eden-biz`, `opsCluster`, and `eden-press` all have `.claude/worktrees/` directories today. A durable fix (e.g., marker propagation into spawned worktrees, or `findPlanningDir` recognizing worktree-relative paths back to the main repo's `.planning/`) is a good candidate for a future objective, but is out of scope for objective 25.

---

## Item 7 (mechanics) — `gate-edits.js` Config-Reading Today

**Confirmed: `gate-edits.js` reads NO config file at all today.** Its only external-state reads are:
1. `findPlanningDir(start)` — walks up from cwd for a `.planning/` directory (existence check only).
2. `hasSkillActiveMarker(planningDir)` — `fs.existsSync(path.join(planningDir, '.skill-active'))` (existence only, doesn't even parse contents).
3. `consumeEditOverrideMarker(planningDir)` — imported from `./lib/edit-override.js` (not `gate-edits.js` itself).
4. `process.env.DEVFLOW_SKIP_EDIT_GATE === '1'` — env var escape hatch.

**The established pattern to follow (used by 2 sibling hooks reading `.planning/config.json` today):**
```js
// verify-commits.js (plugins/devflow/hooks/verify-commits.js) — isAutonomousMode()
function isAutonomousMode(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.mode === 'autonomous';
  } catch {
    return false;
  }
}
```
`verify-completion.js` has an equivalent (`config.json` read wrapped in try/catch, silent-false on malformed JSON, per its own comment "Hooks cannot require df-tools, so we read config.json directly"). `statusline.js` has a third instance (reads `cfg.daemon.status_line`). **All three hooks independently hand-roll the same read+try/catch — there is no shared config-loader lib for hooks to import** (hooks can't `require` df-tools per the verify-completion.js comment; this is a hooks-specific constraint, not a general codebase one).

**Planner should add a `readEditGateMode(planningDir)` helper in `gate-edits.js` following this exact defensive shape:** default `'strict'` on missing file, missing key, or malformed JSON; read `config.gates && config.gates.editGate`; validate against the 3-value enum (fall back to `'strict'` on any unrecognized value too, since silently mis-parsing to something permissive would be a correctness bug).

**`permissionDecision` values already in use elsewhere in the hooks (confirms `'warn'` mode's mechanism):** `gate-edits.js`'s own header comment (line 27) states the **prior** implementation (before the strict-by-default rewrite) used `permissionDecision: 'ask'` for warn-only mode. `gate-commits.js`, `gate-interactive.js`, `changelog-on-tag.js` all currently only use `'deny'`. No hook currently emits `'ask'` live — this would be reviving a documented-but-currently-unused code path, not inventing new hook-output behavior.

**Test file to extend:** `plugins/devflow/hooks/gate-edits.test.js` — existing `describe` blocks include `shouldGate decision matrix`, `hasSkillActiveMarker — fs interaction`, 8 `subprocess e2e —` blocks (ALLOW/DENY under various marker states via `spawnSync`), and `env var escape hatch`. A new `describe('gates.editGate config — warn/strict/off', ...)` block following the same subprocess-e2e pattern (write a `.planning/config.json` with each of the 3 values, spawn the hook, assert the resulting `permissionDecision`) is the natural extension point.

---

## Common Pitfalls (Fleet-Wide)

### Pitfall 1: Assuming 1 repo = 1 PROJECT.md
**What goes wrong:** treating item 3b as "6 files to edit `kind:` into."
**Why it happens:** the CONTEXT.md decision text lists 6 repo names, which reads like 6 files.
**How to avoid:** use the per-repo table above — some repos need 0 edits (already conform), some need edits in a sub-package path, one (aocore) has no target file at all.
**Warning sign:** `find <repo> -iname PROJECT.md` returning more than one result, or zero results.

### Pitfall 2: Editing `.claude/worktrees/*/` copies instead of the real repo
**What goes wrong:** several fleet repos have live `.claude/worktrees/agent-*/` directories that are full working-tree copies (their own `.planning/`, their own git branch). Editing inside one of these by accident edits a throwaway worktree, not the repo the objective intends to change.
**How to avoid:** always resolve fleet-repo paths to the repo root (e.g. `~/dev/eden-libs/eden-platform-go/`, not `~/dev/eden-libs/.claude/worktrees/ws-.../`).

### Pitfall 3: CHANGELOG.md / ROADMAP.md historical text looks like a "reference to prune" but isn't
**What goes wrong:** grepping for `join-discord` turns up `CHANGELOG.md:748` (historical release note) and `.planning/ROADMAP.md:796/802` (this objective's own plan describing itself) alongside the real prune targets.
**How to avoid:** only prune the skill directory + `help.md` workflow doc + `docs/USER-GUIDE.md` row; leave changelog/roadmap prose untouched.

### Pitfall 4: Assuming the new CLAUDE.md TDD section changes resolver behavior
**What goes wrong:** believing "by kind" language in `~/.claude/CLAUDE.md` will make the intent resolver treat `app`/`ui-lib` objectives differently than it does today.
**Why it happens:** the resolution-chain doc (project CLAUDE.md's own "Intent Model" section) states CLAUDE.md playbook directives outrank the defaults table — true, but only for the ~6 hardcoded phrase-detectors in `claude-md.cjs`, none of which are kind-conditional.
**How to avoid:** word the section as policy documentation; don't claim it enforces a split the code doesn't implement.

---

## Code Examples

### route-intent.js phantom-name fix locations (exact, verified)
```js
// Line 147 (was '/devflow:new-milestone')
skill: '/devflow:milestone new',

// Line 203 (was '/devflow:add-todo')
skill: '/devflow:todo add',

// Line 210 (was '/devflow:check-todos')
skill: '/devflow:todo list',

// Line 231 (was '/devflow:audit-milestone')
skill: '/devflow:milestone audit',
```

### gate-edits.js config-read pattern to add (mirrors verify-commits.js's isAutonomousMode)
```js
const VALID_EDIT_GATE_MODES = new Set(['strict', 'warn', 'off']);

function readEditGateMode(planningDir) {
  try {
    if (!planningDir) return 'strict';
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return 'strict';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const mode = config.gates && config.gates.editGate;
    return VALID_EDIT_GATE_MODES.has(mode) ? mode : 'strict';
  } catch {
    return 'strict';
  }
}
```

### warn-mode hook output (reviving the documented-but-dormant prior behavior)
```js
// main()'s current DENY output block (permissionDecision: 'deny') becomes conditional:
const out = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: editGateMode === 'warn' ? 'ask' : 'deny',
    permissionDecisionReason: result.reason,
  },
};
```

---

## Open Questions

1. **aocore has no PROJECT.md anywhere — how should item 3b handle it?**
   - What we know: root `.planning/` predates or bypassed the PROJECT.md convention (has `AOCORE_VISION.md`/`ROADMAP.md`/`STATE.md` but never a `PROJECT.md`); no sub-package (`go/`, `admin/`, `portal/`, `sdk/`) has one either.
   - What's unclear: whether the objective wants a net-new minimal `PROJECT.md` created (just to carry `kind:`) or wants aocore skipped/flagged for a future onboarding pass.
   - Recommendation: planner should treat this as a small explicit task — create a minimal `.planning/PROJECT.md` (frontmatter + 1-2 line pointer, not a full rewrite) in whichever sub-package makes most sense (likely `go/`, since it already has a `.planning/` directory with `.awareness-cache.json`), OR explicitly descope aocore from item 3b and note it in the objective's SUMMARY as a known gap.

2. **devflowops and eden-circle's PROJECT.md files use a single-file (not per-package) shape despite being multi-stack (Go + Flutter) monorepos — is `app` really right, or should these eventually split like aodex/eden-biz did?**
   - What we know: both currently have exactly one PROJECT.md at repo root describing the whole product.
   - What's unclear: whether a future objective will split them into per-package PROJECT.md files (mirroring aodex/eden-biz's pattern), which would make today's single `kind: app` choice temporary.
   - Recommendation: set `kind: app` now (matches current single-file reality and both READMEs' own framing); note in the commit message that a future split is possible but out of scope today.

3. **Does the new `## TDD & Quality` CLAUDE.md section need any NEW phrase patterns in `claude-md.cjs` to make the "by kind" split real, or is documentation-only acceptable?**
   - What we know: the decision explicitly locks the heading requirement (for the regex scan) but doesn't ask for a `claude-md.cjs` code change, and "changing... intent-model resolution order" is out of scope.
   - What's unclear: whether stakeholders will be satisfied with a documentation-only section that doesn't literally branch behavior by kind.
   - Recommendation: ship documentation-only per the locked out-of-scope constraint; flag the gap explicitly in the section's own text (e.g., "see defaults-table.md for the machine-enforced version of this split") so it's not misleading.

4. **USER-GUIDE.md's broader staleness (resume-work/progress/pause-work/add-objective) is adjacent to item 2/6 but not explicitly one of the 7 items.**
   - Recommendation: fix only the `join-discord` row (in scope per decision #1's "any references to it"); leave the rest for a future docs-cleanup task unless the planner decides it's cheap enough to bundle.

## Sources

All findings in this document are direct-inspection (Read/Bash/grep) of local files and Claude Code session transcripts — no Context7, WebFetch, or WebSearch applicable to this domain (internal codebase + private fleet repos + local session data).

### Primary (HIGH confidence — direct file/transcript read)
- `/Users/justin/dev/devflow-claude/.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md` — locked decisions, audit evidence
- `/Users/justin/dev/devflow-claude/plugins/devflow/hooks/route-intent.js` + `route-intent.test.js` + `plugins/devflow/devflow/bin/lib/__fixtures__/intent-fixtures.cjs`
- `/Users/justin/dev/devflow-claude/plugins/devflow/hooks/gate-edits.js` + `gate-edits.test.js`
- `/Users/justin/dev/devflow-claude/plugins/devflow/hooks/verify-commits.js`, `verify-completion.js`, `statusline.js` (config-read pattern precedent)
- `/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/lib/claude-md.cjs` (PLAYBOOK_HABITS, HEADING_PATTERNS)
- `/Users/justin/dev/devflow-claude/plugins/devflow/devflow/references/defaults-table.md` (kind × work tdd_default values)
- `/Users/justin/dev/devflow-claude/plugins/devflow/devflow/templates/project.md` (PROJECT.md frontmatter shape)
- `/Users/justin/dev/devflow-claude/plugins/devflow/devflow/workflows/help.md`, `/Users/justin/dev/devflow-claude/docs/USER-GUIDE.md`, `/Users/justin/dev/devflow-claude/CHANGELOG.md`, `/Users/justin/dev/devflow-claude/.planning/ROADMAP.md` (join-discord reference sweep)
- `/Users/justin/.claude/CLAUDE.md` (routing table current state)
- Fleet repos (direct `ls`/`find`/`Read`): `~/dev/aocore`, `~/dev/aodex`, `~/dev/eden-circle`, `~/dev/eden-libs`, `~/dev/eden-biz`, `~/dev/devflowops`, `~/dev/opsCluster`, `~/dev/eden-press` — go.mod/pubspec.yaml/README.md/PROJECT.md/config.json/Makefile/CONTRIBUTING.md files in each
- `~/.claude/projects/-Users-justin-dev-eden-press/670c1efd-8a87-47a7-9b7d-8bbf71ee2250.jsonl` + its `subagents/*.jsonl` + `*.meta.json` (52-denial forensic sampling)

### Secondary / Tertiary
None — no WebSearch or external-web sources were applicable to this objective's domain.

## Metadata

**Confidence breakdown:**
- Phantom skill names + route-intent test location (item 1): HIGH — exact line numbers verified by Read
- Routing table + missing tiers (item 2): HIGH — direct read of `~/.claude/CLAUDE.md`
- CLAUDE.md TDD-by-kind mechanism caveat (item 3a): HIGH for the code-path facts; MEDIUM for the "will stakeholders accept documentation-only" judgment call (that's a product decision, not a fact)
- kind: fleet ground truth (item 3b): HIGH — every PROJECT.md location/frontmatter was directly read; recommended kind values are MEDIUM (inference from stack, standard practice, no ground truth "correct answer" exists)
- New CLAUDE.md content (item 4): HIGH for stack/build/test facts (directly read Makefiles/CONTRIBUTING.md/go.mod/pubspec.yaml/CI workflows)
- VERIFY regex over-fire diagnosis (item 5): HIGH for the regex text itself; MEDIUM for the causal attribution to the audit's 0/8 follow rate (plausible and well-evidenced, but the audit's raw per-prompt data wasn't available to this research pass to confirm 1:1)
- join-discord reference sweep (item 6): HIGH — full-repo grep, cross-checked against manifest files
- eden-press gate friction (item 7): HIGH — transcript-forensic evidence (92 raw denial occurrences, 38 sampled with file paths, `.meta.json` agentType/worktreePath confirmed) directly supports the root-cause hypothesis and the `"warn"` recommendation
- gate-edits.js config-read mechanics (item 7 secondary): HIGH — full file read, cross-referenced against 3 sibling hooks' existing config-read patterns

**Research date:** 2026-07-22
**Valid until:** this is a point-in-time fleet snapshot (repo stacks, PROJECT.md states, and the eden-press session transcript will all keep changing) — treat as stale for re-planning purposes after ~2 weeks, and definitely re-verify the eden-press transcript sampling if significant new eden-press sessions occur before this objective executes.
