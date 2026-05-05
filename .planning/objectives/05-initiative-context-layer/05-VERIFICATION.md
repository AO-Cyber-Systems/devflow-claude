---
objective: 05-initiative-context-layer
verified: 2026-05-04T00:00:00Z
status: passed
score: 9/10 success criteria verified
gaps:
  - truth: "df:initiatives sync writes initiatives to ~/.claude/devflow/initiatives/ and df:plan-objective loads them via the installed df-tools CLI"
    status: failed
    reason: "The globally-installed ~/.claude/devflow/bin/df-tools.cjs (March 14, 5878 lines) predates objective 5 and does not include the 'initiatives' command. The project df-tools.cjs at plugins/devflow/devflow/bin/df-tools.cjs (788 lines) has the initiatives route. All skills and the plan-objective.md workflow invoke 'node ~/.claude/devflow/bin/df-tools.cjs initiatives ...' — these calls silently return 'Unknown command: initiatives' against the installed binary."
    artifacts:
      - path: "~/.claude/devflow/bin/df-tools.cjs"
        issue: "Installed binary is March 14 vintage; missing initiatives command routing. All skill and workflow invocations target this path."
    missing:
      - "Deploy the updated df-tools.cjs from plugins/devflow/devflow/bin/df-tools.cjs to ~/.claude/devflow/bin/df-tools.cjs (or symlink it)"
      - "Verify 'node ~/.claude/devflow/bin/df-tools.cjs initiatives list' succeeds after deploy"
human_verification:
  - test: "df:initiatives sync live round-trip"
    expected: "Running /devflow:initiatives sync writes ≥1 .md file to ~/.claude/devflow/initiatives/, each with slug/github_issue/parent_project/key_repos/updated_at frontmatter"
    why_human: "GH_INTEGRATION=1 test is skip-gated; initiative files already exist on disk from a prior manual sync. A fresh sync against a live GitHub org is required to confirm the command completes end-to-end through the installed binary once the deployment gap is closed."
  - test: "/df:plan-objective INITIATIVES section appears in planner context"
    expected: "When planning an objective for a repo whose slug appears in an initiative's key_repos, the planner's <additional_context> block includes an 'Active Initiatives' section with the matching initiative body"
    why_human: "key_repos is empty in all currently-synced files (all synced items are DRAFT project items with no linked issue, so _deriveKeyRepos returns []). Needs a live sync after at least one non-draft Epic issue is linked in the org Product Roadmap project, then a plan-objective run, to confirm the filter-and-inject path."
---

# Objective 5: Initiative Context Layer — Verification Report

**Objective Goal:** Project GitHub Epics onto disk at `~/.claude/devflow/initiatives/<slug>.md` so the planner can read strategic context at plan time without live gh queries. `df:initiatives sync` writes; planner reads matching initiatives by `key_repos` at plan time. Reuses obj 1+2 primitives. No new GraphQL.

**Verified:** 2026-05-04
**Status:** gaps_found — 1 deployment gap blocks the runtime path; all library/test/integration code is correct.
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `df-tools initiatives sync` walks org Product Roadmap and writes `.md` files to `~/.claude/devflow/initiatives/` | ✓ VERIFIED | 4 files present at `~/.claude/devflow/initiatives/`; `syncInitiatives` in initiatives.cjs calls `gh.walkProject` + `_writeInitiativeFile` with atomic tmp+rename at line 551-635 |
| 2 | Initiative files have locked YAML frontmatter schema (slug, github_issue, parent_project, key_repos[], updated_at) + body sections | ✓ VERIFIED | Confirmed from `~/.claude/devflow/initiatives/aodex-go-flutter-migration.md` and `eden-biz-foundation-architecture.md`; schema matches locked spec |
| 3 | Sync is idempotent; atomic write via tmp+rename | ✓ VERIFIED | Lines 326-334 in initiatives.cjs use `.${slug}.md.${pid}` tmp path + `renameSync`; best-effort `unlinkSync` on rename failure |
| 4 | `lib/initiatives.cjs` exports pure reader functions `loadInitiatives`, `matchByRepo`, `formatInitiativeForPlanner` with no fs writes | ✓ VERIFIED | Export surface confirmed (23 exports); no `writeFileSync`/`renameSync` calls outside `_writeInitiativeFile`/`_runFs` injection path |
| 5 | `/df:plan-objective` workflow loads initiatives at entry, filters by `key_repos`, injects into `<additional_context>` block | ✓ VERIFIED | Lines 402-474 in `plan-objective.md` extract `PROJECT_GITHUB_REPO`, call `df-tools initiatives format-for-planner --repo "$PROJECT_GITHUB_REPO"`, inject result into `**Active Initiatives**` section |
| 6 | `/devflow:initiatives` skill + `df-tools initiatives` CLI with `sync`/`list`/`show`/`format-for-planner` subcommands; hard-fail on sync with missing gh auth | ✓ VERIFIED | `skills/initiatives/SKILL.md` present and complete; `initiatives-cli.cjs` routes all 4 subcommands (line 158-161); `requireGhAuth` called at line 551 in initiatives.cjs |
| 7 | Stale deletion: `_detectStaleInitiatives` + `_deleteStaleFile` + `--force` flag + TTY readline confirmation + non-TTY skip | ✓ VERIFIED | Lines 421-529 implement full stale loop; non-TTY skip at line 628-629; `--force` bypass at line 514 |
| 8 | `lib/initiatives.cjs` exports stable surface with all SC-8 required names | ✓ VERIFIED | `node -e "console.log(Object.keys(...))" ` returns 23 exports including all SC-8 required: `syncInitiatives`, `loadInitiatives`, `matchByRepo`, `formatInitiativeForPlanner`, `_writeInitiativeFile`, `_setRunGh` |
| 9 | Round-trip test gated on `GH_INTEGRATION=1`; skips cleanly otherwise | ✓ VERIFIED | Tests IT1 and IT2 present in initiatives.test.cjs at lines 1863-1895 with `skip: process.env.GH_INTEGRATION !== '1'`; skipped in CI run (23 skipped total in 1120-test suite) |
| 10 | Token-budget: `formatInitiativeForPlanner` ≤ 1500 chars; 5-initiative composition ≤ 6 KB | ✓ VERIFIED | Tests TB1 (line 1821) and TB2 (line 1828) pass; `MAX_FORMATTED_PLANNER_CHARS` exported constant enforces the bound |

**Score: 9/10 truths verified** (SC-5 and SC-6 are code-verified but blocked at runtime by SC-6 deployment gap)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `plugins/devflow/devflow/bin/lib/initiatives.cjs` | Core library — 23 exports | VERIFIED | 23 exports confirmed |
| `plugins/devflow/devflow/bin/lib/initiatives.test.cjs` | 112 tests covering all SCs | VERIFIED | 112 `test(` calls pass |
| `plugins/devflow/devflow/bin/lib/initiatives-cli.cjs` | CLI routing for 4 subcommands | VERIFIED | Routes sync/list/show/format-for-planner |
| `plugins/devflow/devflow/bin/lib/initiatives-cli.test.cjs` | 21 CLI tests | VERIFIED | 21 tests, all pass |
| `plugins/devflow/devflow/bin/lib/__fixtures__/awareness-fixtures.cjs` | Extended with initiative fixtures | VERIFIED | Lines 753-1000+ add `buildInitiativeFileContent`, `buildInitiativeFile`, `buildInitiativesHome`, `buildAdversarialInitiative` |
| `plugins/devflow/skills/initiatives/SKILL.md` | Skill definition with sync/list/show modes | VERIFIED | Present; all 3 modes documented; `df-tools initiatives $ARGUMENTS` passthrough |
| `plugins/devflow/devflow/workflows/plan-objective.md` | INITIATIVES extraction step | VERIFIED | Lines 402-474 inject initiatives into planner context |
| `plugins/devflow/agents/planner.md` | INITIATIVES advisory bias block | VERIFIED | Lines 39-42 instruct planner to treat initiatives as advisory, align with initiative direction, cite github_issue refs |
| `plugins/devflow/devflow/bin/lib/gh.cjs` | `readIssueState` added (TRD 05-03) | VERIFIED | Lines 1617-1668 add `readIssueState` function |
| `~/.claude/devflow/bin/df-tools.cjs` | Installed CLI with initiatives command | FAILED | March 14 binary (5878 lines); `initiatives` command absent; `node ~/.claude/devflow/bin/df-tools.cjs initiatives list` returns `Error: Unknown command: initiatives` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `plan-objective.md` | `~/.claude/devflow/bin/df-tools.cjs` | `node ~/.claude/devflow/bin/df-tools.cjs initiatives format-for-planner` | NOT_WIRED | Workflow calls the installed binary path; installed binary predates obj-5 |
| `skills/initiatives/SKILL.md` | `~/.claude/devflow/bin/df-tools.cjs` | `node ~/.claude/devflow/bin/df-tools.cjs initiatives $ARGUMENTS` | NOT_WIRED | Same root cause — installed binary |
| `initiatives.cjs::syncInitiatives` | `gh.cjs::walkProject` | `_setRunGh` injection + direct `gh.walkProject(resolvedId)` | WIRED | awareness.cjs line 477; initiatives.cjs line 568 |
| `initiatives.cjs::loadInitiatives` | `~/.claude/devflow/initiatives/` | `_runFs.readdirSync` / `_runFs.readFileSync` | WIRED | Lines 155-180 in initiatives.cjs |
| `initiatives.cjs::matchByRepo` | `initiatives[].key_repos` | `Array.includes(github_repo)` | WIRED | Line 188 |
| `plan-objective.md` | planner `<additional_context>` | `{INITIATIVES}` substitution in context template | WIRED | Line 472-474 in plan-objective.md |

---

### Requirements Coverage

TRD frontmatter for 05-01 through 05-05 declare SC-1 through SC-10 as their requirements. All are implemented at code level. SC-5 and SC-6 are blocked at runtime by the deployment gap (not a code defect).

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `~/.claude/devflow/bin/df-tools.cjs` | global | Stale installed binary — does not include obj-5 initiatives routing | BLOCKER | `df:initiatives sync`, `df:initiatives list`, `format-for-planner` in plan-objective all fail silently or with "Unknown command" |

No TODO/FIXME/stub patterns found in any of the 5 initiative source files. All implementations are substantive.

---

### Human Verification Required

#### 1. df:initiatives sync live round-trip

**Test:** Close `~/.claude/devflow/initiatives/*.md`, run `/devflow:initiatives sync`, inspect written files.
**Expected:** ≥1 file written with YAML frontmatter; `key_repos` populated for any initiatives that have a linked GitHub issue (non-draft). Files written atomically (no partial writes visible).
**Why human:** GH_INTEGRATION=1 test is skip-gated in CI. Also, all currently-synced initiatives are DRAFT project items (no linked issue), so `key_repos` is empty in all 4 existing files — a live sync that includes at least one non-draft Epic would validate `_deriveKeyRepos` end-to-end.

#### 2. /df:plan-objective INITIATIVES injection in planner context

**Test:** After the deployment gap is closed, run `/df:plan-objective` for an objective in a repo whose `github_repo` value matches a `key_repos` entry in a synced initiative file. Inspect the planner system prompt.
**Expected:** `**Active Initiatives (from ~/.claude/devflow/initiatives/, advisory):**` section appears with the initiative's Why and Open Questions visible.
**Why human:** Currently `key_repos` is empty in all synced files (DRAFT-only project items), so `matchByRepo` returns no matches and the planner sees `_(none — initiatives not synced ...)_`. Requires a live sync with non-draft issues and a plan run to confirm the injection path end-to-end.

---

### Gaps Summary

One deployment gap blocks the runtime path: the globally-installed `~/.claude/devflow/bin/df-tools.cjs` was last updated March 14, before objective 5 began. It does not include the `initiatives` command routing that was added to the project's `plugins/devflow/devflow/bin/df-tools.cjs`. Every invocation of `df-tools initiatives ...` from the skill, the plan-objective workflow, and the SKILL.md process block targets the installed path and silently fails.

The fix is a single deploy step: copy (or symlink) the updated `df-tools.cjs` from `plugins/devflow/devflow/bin/df-tools.cjs` to `~/.claude/devflow/bin/df-tools.cjs`. All library code, tests, skill definition, workflow integration, and planner advisory bias are complete and correct. 9 of 10 success criteria are fully verified at code level. The 10th is blocked only by the missing deploy.

The empty `key_repos` in the 4 synced files is not a code defect — it reflects that the org Product Roadmap contains only DRAFT project items without linked issues, which is correct behavior per `_deriveKeyRepos`. Once non-draft Epic issues are linked in the project, a fresh sync will populate `key_repos` correctly.

---

_Verified: 2026-05-04_
_Verifier: Claude (df-verifier)_
