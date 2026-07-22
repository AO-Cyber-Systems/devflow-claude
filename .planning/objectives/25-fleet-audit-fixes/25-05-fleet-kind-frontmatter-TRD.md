---
objective: 25-fleet-audit-fixes
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - /Users/justin/dev/eden-circle/.planning/PROJECT.md
  - /Users/justin/dev/eden-biz/go/.planning/PROJECT.md
  - /Users/justin/dev/aodex/flutter/.planning/PROJECT.md
  - /Users/justin/dev/eden-libs/eden-platform-go/.planning/PROJECT.md
  - /Users/justin/dev/devflowops/.planning/PROJECT.md
  - /Users/justin/dev/aocore/.planning/PROJECT.md
autonomous: true
requirements: []   # ad-hoc audit objective — roadmap Objective 25 SC-6 (kind: half) is the contract

must_haves:
  truths:
    - "All six target PROJECT.md files carry a valid YAML frontmatter block whose kind: value is one of the defaults-table enum (api|app|library|ui-lib|cli|plugin)"
    - "aocore has a net-new minimal /Users/justin/dev/aocore/.planning/PROJECT.md (frontmatter + 1-2 line pointer) alongside its existing root STATE/ROADMAP files — nothing else restructured"
    - "eden-biz/flutter and eden-libs/eden-ui-flutter are UNTOUCHED (they already have kind: set correctly)"
    - "Each edit is committed IN its own repo with a conventional docs(...) commit — zero commits about fleet files land in devflow-claude"
    - "No edit touched a .claude/worktrees/ copy"
  artifacts:
    - "/Users/justin/dev/eden-circle/.planning/PROJECT.md — kind: app added to existing frontmatter"
    - "/Users/justin/dev/eden-biz/go/.planning/PROJECT.md — kind: api added to existing frontmatter"
    - "/Users/justin/dev/aodex/flutter/.planning/PROJECT.md — new frontmatter block with kind: app"
    - "/Users/justin/dev/eden-libs/eden-platform-go/.planning/PROJECT.md — new frontmatter block with kind: library"
    - "/Users/justin/dev/devflowops/.planning/PROJECT.md — new frontmatter block with kind: app"
    - "/Users/justin/dev/aocore/.planning/PROJECT.md — CREATED, minimal, kind: api"
  key_links:
    - "kind: frontmatter ↔ df-tools intent resolve level-4 defaults-table lookup — an invalid enum value silently falls back; values must match the enum exactly"
    - "Frontmatter must open at byte 0 of the file (--- on line 1) or extractFrontmatter won't parse it"
---

<objective>
Set `kind:` frontmatter across the six fleet repos where the intent model currently cannot resolve a defaults-table row. Audit item 3b, with the research-corrected ground truth: 4 of 6 repos are monorepos with per-package PROJECT.md files; two files already conform (skip); aocore has no PROJECT.md anywhere (create one, per orchestrator disposition 1).

Purpose: roadmap SC-6 (kind: half) — "kind: set in 6 fleet PROJECT.mds".
Output: six fleet-repo edits, each committed in its own repo. Nothing committed in devflow-claude except this TRD's SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
Ground-truth table (every file directly inspected 2026-07-22 — do NOT re-derive from repo names):

| Target file | Current state | Edit | kind | Evidence |
|---|---|---|---|---|
| eden-circle/.planning/PROJECT.md | frontmatter has org + github_repo only | add `kind: app` line inside existing block | app | whole-product PROJECT.md; end-user comms platform (Go backend + Flutter client/) |
| eden-biz/go/.planning/PROJECT.md | frontmatter has org + github_repo only | add `kind: api` line inside existing block | api | module eden-biz-go, "financial system of record", biz-api, sqlc, migrations |
| aodex/flutter/.planning/PROJECT.md | NO frontmatter (opens `# AODex Flutter Mobile App`) | prepend new `---\nkind: app\n---\n\n` block | app | Flutter mobile app (pubspec name: aodex) |
| eden-libs/eden-platform-go/.planning/PROJECT.md | NO frontmatter (opens `# Project`) | prepend new block `kind: library` | library | "canonical backend platform contract... every Eden-family product consumes" |
| devflowops/.planning/PROJECT.md | NO frontmatter (opens `# DevFlow-Ops`) | prepend new block `kind: app` | app | Gitea hard-fork with full Flutter frontend replacement; single root PROJECT.md |
| aocore/.planning/PROJECT.md | FILE DOES NOT EXIST | CREATE minimal file | api | monorepo (Go LLM API gateway w/ guardrails + Flutter admin/portal); gateway is the product core |

Already conform — DO NOT TOUCH: eden-biz/flutter/.planning/PROJECT.md (`kind: app`), eden-libs/eden-ui-flutter/.planning/PROJECT.md (`kind: ui-lib`).

Existing frontmatter shape to preserve (eden-circle, eden-biz/go — insert kind as the first field):
```yaml
---
kind: app
org: AO-Cyber-Systems
github_repo: AO-Cyber-Systems/eden-circle
---
```

aocore minimal file to create at /Users/justin/dev/aocore/.planning/PROJECT.md (root, alongside existing STATE.md/ROADMAP.md — orchestrator disposition 1: do not restructure anything else):
```markdown
---
kind: api
---

# AOCore

LLM API Gateway with guardrails (Go backend + Flutter admin/portal monorepo).
See AOCORE_VISION.md and ROADMAP.md in this directory for project context.
```
</codebase_examples>

<anti_patterns>
- Do NOT treat this as "6 repos = 6 root files" — research Pitfall 1. Use the exact paths in the table.
- Do NOT edit `.claude/worktrees/agent-*/` copies — research Pitfall 2: several fleet repos have live worktrees that are full working-tree copies with their own .planning/. Always resolve to the real repo path listed above.
- Do NOT add default_work/org/github_repo to files that lack them — item 3b scope is `kind:` only; minimal diffs.
- Do NOT commit fleet-repo changes from devflow-claude, and never batch multiple repos into one commit.
</anti_patterns>

<error_recovery>
- If a file's current content differs from the table (fleet repos move fast — research flags the snapshot stale after ~2 weeks): re-read the file, adapt the edit (the invariant is "valid frontmatter block at byte 0 containing a correct kind:"), and note the drift in the SUMMARY.
- If gate-commits blocks a commit: preferred path is `cd <repo> && node ~/.claude/devflow/bin/df-tools.cjs commit "docs(planning): ..." --files .planning/...`; fallback `DEVFLOW_ALLOW_RAW_COMMIT=1 git -C <repo> commit` (document use in SUMMARY).
- If a target repo has uncommitted unrelated changes, commit ONLY the PROJECT.md path (pathspec-limited) — never `git add -A` in a fleet repo.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md
@.planning/objectives/25-fleet-audit-fixes/25-RESEARCH.md
</context>

<gotchas>
- HARD CONSTRAINT: port 8080 forbidden in every task/verification (no servers needed here); no version bump/tag/release/deploy anywhere, and NEVER in fleet repos.
- gate-edits allows all these edits without markers (.planning/** paths and .md files are always-allow) — no skill-active gymnastics needed in fleet repos.
- devflowops + eden-circle single-file `kind: app` choice: orchestrator disposition 2 — commit message must note a future per-package split is possible but out of scope (e.g. trailer line "Note: future per-package PROJECT.md split possible; out of scope today").
- Valid kind enum (defaults-table.md): api | app | library | ui-lib | cli | plugin. Anything else silently fails to resolve a table row.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Add kind: to the two existing frontmatter blocks (eden-circle, eden-biz/go)</name>
  <files>/Users/justin/dev/eden-circle/.planning/PROJECT.md, /Users/justin/dev/eden-biz/go/.planning/PROJECT.md</files>
  <action>
eden-circle: insert `kind: app` as the first line inside the existing `---` block. Commit in ~/dev/eden-circle: `docs(planning): set kind: app in PROJECT.md frontmatter` with the disposition-2 future-split note in the body.
eden-biz: insert `kind: api` likewise in go/.planning/PROJECT.md. Commit in ~/dev/eden-biz (pathspec-limited to go/.planning/PROJECT.md): `docs(planning): set kind: api in go PROJECT.md frontmatter`.
Use df-tools commit from inside each repo (fallback per error_recovery).
  </action>
  <verify>head -6 of each file shows the kind line inside the --- block; `git -C ~/dev/eden-circle log -1 --stat` and `git -C ~/dev/eden-biz log -1 --stat` show exactly the one file each</verify>
  <done>Both files parse with kind present; one conventional commit per repo, nothing else staged</done>
  <recovery>git -C <repo> checkout -- <file> and re-apply if the block gets malformed</recovery>
</task>

<task type="auto">
  <name>Task 2: Create frontmatter blocks where absent (aodex/flutter, eden-libs/eden-platform-go, devflowops)</name>
  <files>/Users/justin/dev/aodex/flutter/.planning/PROJECT.md, /Users/justin/dev/eden-libs/eden-platform-go/.planning/PROJECT.md, /Users/justin/dev/devflowops/.planning/PROJECT.md</files>
  <action>
Prepend a minimal block at byte 0 of each file (`---`, `kind: <value>`, `---`, blank line, then the untouched existing content):
- aodex/flutter → `kind: app`. Commit in ~/dev/aodex: `docs(planning): set kind: app in flutter PROJECT.md frontmatter`.
- eden-libs/eden-platform-go → `kind: library`. Commit in ~/dev/eden-libs: `docs(planning): set kind: library in eden-platform-go PROJECT.md frontmatter`.
- devflowops → `kind: app`. Commit in ~/dev/devflowops: `docs(planning): set kind: app in PROJECT.md frontmatter` + disposition-2 future-split note in the body.
One commit per repo, pathspec-limited to the single file.
  </action>
  <verify>head -4 of each file is exactly the new frontmatter block; existing first heading (`# AODex Flutter Mobile App` / `# Project` / `# DevFlow-Ops`) still present immediately after; one commit per repo confirmed via git -C <repo> log -1 --stat</verify>
  <done>Three files open with valid frontmatter carrying the correct kind; body content byte-identical below the block</done>
  <recovery>git -C <repo> checkout -- <file>; re-prepend ensuring no BOM/leading blank line before the first ---</recovery>
</task>

<task type="auto">
  <name>Task 3: Create aocore's minimal root PROJECT.md</name>
  <files>/Users/justin/dev/aocore/.planning/PROJECT.md</files>
  <action>
Create the file exactly per the codebase_examples template (frontmatter `kind: api` + 1-2 line pointer to AOCORE_VISION.md/ROADMAP.md). Orchestrator disposition 1: root .planning/, alongside the existing STATE/ROADMAP files; do not restructure anything else, do not touch go/.planning/ or admin/portal dirs. Commit in ~/dev/aocore: `docs(planning): add minimal PROJECT.md with kind: api`.
Then run the fleet-wide verification sweep for ALL six files:
`for f in ~/dev/eden-circle/.planning/PROJECT.md ~/dev/eden-biz/go/.planning/PROJECT.md ~/dev/aodex/flutter/.planning/PROJECT.md ~/dev/eden-libs/eden-platform-go/.planning/PROJECT.md ~/dev/devflowops/.planning/PROJECT.md ~/dev/aocore/.planning/PROJECT.md; do echo "== $f"; head -5 "$f"; done` — every file must show `---` on line 1 and a valid `kind:` line.
  </action>
  <verify>File exists with kind: api; sweep shows valid frontmatter in all six; git -C ~/dev/aocore log -1 --stat shows only .planning/PROJECT.md; eden-biz/flutter + eden-libs/eden-ui-flutter untouched (git -C status clean for those paths)</verify>
  <done>All six target files conform; the two already-correct files untouched; six commits across six repos</done>
  <recovery>If aocore's .planning/ layout has drifted (e.g. a PROJECT.md appeared since research), read it and ADD kind: instead of creating a duplicate — never create a second PROJECT.md</recovery>
</task>

</tasks>

<verification>
1. Sweep loop (Task 3) shows valid `kind:` frontmatter in all six files with enum-valid values.
2. `git -C <repo> log -1` in each of the six repos shows a conventional docs(planning) commit touching only its PROJECT.md.
3. `git -C /Users/justin/dev/devflow-claude status` — no fleet-file changes leaked here.
4. Spot-check resolution: from ~/dev/devflowops (or any target repo with objectives) the kind now feeds the resolver; at minimum `node -e` extractFrontmatter on each file returns the kind value.
</verification>

<success_criteria>
- Roadmap SC-6 (kind: half): kind set in the six fleet PROJECT.mds per the research ground-truth table; aocore gains its minimal PROJECT.md; already-conforming files untouched; commits live in their own repos.
</success_criteria>

<output>
After completion, create `.planning/objectives/25-fleet-audit-fixes/25-05-SUMMARY.md` — list the six commit SHAs (one per repo).
</output>
