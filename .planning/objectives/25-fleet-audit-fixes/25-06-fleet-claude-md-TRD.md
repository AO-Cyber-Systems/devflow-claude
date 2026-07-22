---
objective: 25-fleet-audit-fixes
trd: "06"
type: standard
wave: 2
depends_on: ["25-02"]
files_modified:
  - /Users/justin/dev/opsCluster/CLAUDE.md
  - /Users/justin/dev/eden-press/CLAUDE.md
  - /Users/justin/dev/eden-press/.planning/config.json
autonomous: true
requirements: []   # ad-hoc audit objective — roadmap SC-6 (CLAUDE.md half) + SC-4 (eden-press application) are the contract

must_haves:
  truths:
    - "opsCluster and eden-press each have a root CLAUDE.md grounded in repo inspection (stack, build/test commands, load-bearing conventions, DevFlow routing pointer)"
    - "eden-press CLAUDE.md carries ALL five load-bearing conventions: never go-mod-tidy, addlicense dual-header policy, check-no-chromedp, check-cli-imports, pinned CHROME_VERSION"
    - "eden-press .planning/config.json has gates.editGate: 'warn'; running devflow-claude's updated gate-edits.js with cwd inside eden-press on a .go payload emits permissionDecision 'ask' (not 'deny')"
    - "All three changes committed IN their target repos (docs/chore conventional commits) — nothing in devflow-claude"
    - "No deploy, tag, or release action suggested or performed in either repo"
  artifacts:
    - "/Users/justin/dev/opsCluster/CLAUDE.md — CREATED"
    - "/Users/justin/dev/eden-press/CLAUDE.md — CREATED"
    - "/Users/justin/dev/eden-press/.planning/config.json — gates.editGate: warn added"
  key_links:
    - "eden-press config value ↔ TRD 25-02's readEditGateMode enum — the string must be exactly 'warn' (lowercase) or it falls back to strict"
    - "CLAUDE.md files are .md → gate-edits always allows; config.json lives under .planning/ → also always allowed"
---

<objective>
Create root CLAUDE.md files for the two fleet repos that have DevFlow onboarded but no Claude context file (audit item 4), and apply the evidence-backed `gates.editGate: "warn"` to eden-press (audit item 7, application half — LOCKED decision 4: eden-press gets the value the investigation supports; investigation concluded "warn").

Purpose: roadmap SC-6 (CLAUDE.md half) — "CLAUDE.md created for opsCluster + eden-press" — and SC-4's fleet application.
Output: two new CLAUDE.md files + one config edit, three commits across two fleet repos.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>
All facts below were directly inspected 2026-07-22 (Makefiles, CONTRIBUTING.md, go.mod, CI workflows) — write the CLAUDE.mds from THESE facts, not from memory or inference.

### opsCluster (kind: api — already set; do not change)
- Stack: Go control-plane (`control-plane/`, module github.com/AO-Cyber-Systems/opscluster/control-plane, go 1.26.4) behind api.aocyber.ai; Terraform IaC (`terraform/`: DigitalOcean DOKS, HA Postgres+PgBouncer, HA Valkey, Cloudflare Tunnel+Access); GitOps via COMPANION repo AO-Cyber-Systems/opscluster-gitops (ArgoCD source of truth — NOT in this repo; document as a pointer).
- Commands: from `control-plane/` — `go build ./...`, `go vet ./...`, `go test ./...`. CI (.github/workflows/go.yml) path-filters on control-plane/** and runs tests against a pgvector/pgvector:pg16 service container whose DB MUST be named `opscluster` (a dbprovisioner integration test does `REVOKE ALL ON DATABASE "opscluster"` by literal name). No repo-root Makefile.
- Conventions: gitleaks pre-commit hook is MANDATORY (`cp scripts/hooks/pre-commit .git/hooks/pre-commit` per CONTRIBUTING.md); 3-plane deployment model + "deployment profiles" documented in .planning/PROJECT.md (point to it, don't duplicate); platform deploys are release-tag-gated (refs/tags/vX.Y.Z) — DOCUMENT ONLY, never instruct deploying/tagging.

### eden-press (kind: library — already set; do not change)
- Stack: Go engine for generating documents from Markdown (Marp-compatible, clean-room, explicitly NOT affiliated with Marp; ZERO JavaScript in the backend). Packages: bind/ (dart, wasm, capi bindings), chase/, press/, profiles/, convert/, conformance/, cmd/eden-press/, tools/. Library-first, CLI second — strict TDD posture per the global by-kind playbook.
- Commands: `go build ./...`, `go vet ./...`, `go test ./...` (covers conformance/...); `make check-no-chromedp`; `make check-cli-imports`. CI: ci.yml (build/vet/test/license-header), dart-native.yml, upstream-drift.yml (auto-files an issue when Marp releases exceed UPSTREAM-VERSIONS.txt pins — currently marpit v3.2.2, marp-core v4.4.0, marp-cli v4.5.0).
- LOAD-BEARING conventions (all five MUST appear in the CLAUDE.md):
  1. NEVER run `go mod tidy` — go.mod/go.sum are hand-authored + version-pinned; additive-only via `go mod download <module>`; tidy prunes requires that sibling worktree branches legitimately need.
  2. License headers enforced by `addlicense -check` in CI. Two templates: original files get MIT/AO-Cyber-Systems (`addlicense -l mit -s -c "AO Cyber Systems" -y 2026`); the 3 vendored Marp theme files (default, gaia, uncover) + browser-fit script MUST keep Marp's ORIGINAL copyright/year — never relabel.
  3. `make check-no-chromedp` — press/ + chase/ + profiles/ (public render path) must carry ZERO chromedp dependency (chromedp only in convert/ export path).
  4. `make check-cli-imports` — cmd/eden-press may import ONLY press/ directly.
  5. Chrome/PDF export uses PINNED `CHROME_VERSION` in the Makefile (currently 151.0.7922.34) — never "latest" (two documented Chrome regressions hit the PDF path).

### eden-press current .planning/config.json (verbatim — has NO gates key yet):
```json
{
  "mode": "yolo",
  "depth": "comprehensive",
  "parallelization": true,
  "commit_docs": true,
  "model_profile": "balanced",
  "workflow": { "research": true, "job_check": true, "verifier": true, "auto_advance": true }
}
```
Add a sibling top-level key: `"gates": { "editGate": "warn" }`.
</codebase_examples>

<anti_patterns>
- Do NOT choose "off" for eden-press — forensics show zero careless ambient editing; "off" would silence the gate for genuinely-ambient future edits too. Do NOT leave "strict" — it blocks legitimate wave-executor work (92 denials, 82% .go files in worktrees). "warn" is the evidence-backed value (LOCKED decision 4 + research recommendation).
- Do NOT suggest touching opsCluster's deploy/tag flow, the gitops companion repo's contents, or any rollout — deploys are out of scope for this objective AND require explicit per-action approval per global HARD RULES.
- Do NOT copy the AO Cyber brand guide or global rules into repo CLAUDE.mds — repo files carry repo facts; global context stays global.
- Do NOT edit inside .claude/worktrees/ copies of either repo (research Pitfall 2).
</anti_patterns>

<error_recovery>
- If the gate-edits live check emits 'deny' instead of 'ask': confirm you invoked devflow-claude's WORKING-TREE hook (post-25-02 merge), the config JSON parses, and the value is exactly "warn". If 25-02 hasn't merged into the branch you're on, stop and report — this TRD depends on it (wave 2).
- If either repo root already gained a CLAUDE.md since research (fleet moves fast): read it, MERGE the required facts instead of overwriting, note drift in SUMMARY.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/25-fleet-audit-fixes/25-CONTEXT.md
@.planning/objectives/25-fleet-audit-fixes/25-RESEARCH.md
</context>

<research_context>
- Both repos already have .planning/PROJECT.md with correct kind (opsCluster: api — also mirrored in its .planning/config.json "kind" field; eden-press: library) — they are NOT in the item-3b list; only the root CLAUDE.md is missing (confirmed via find at both roots).
- eden-press gate friction root cause (for the CLAUDE.md's DevFlow section + SUMMARY context): worktree-rooted executor subagents resolve findPlanningDir to the worktree's own .planning/ which never receives .skill-active — every non-md edit denied despite legitimate orchestration. Durable worktree-marker fix is explicitly a FUTURE objective; "warn" is the mitigation now.
- The live-session hook comes from the INSTALLED plugin, which lags this repo until the next release — the config value is forward-compatible and inert until then. Expected; no version bump in this objective.
</research_context>

<gotchas>
- HARD CONSTRAINT: port 8080 forbidden in every step (no servers needed; 8091 if ever). No deploy/tag/release in ANY repo.
- Each CLAUDE.md should include a short "DevFlow Routing" pointer (the plugin is installed; fit-a-workflow → use the matching /devflow: skill) — mirror the global table's spirit in 2-3 lines, don't duplicate it.
- Keep each CLAUDE.md focused and scannable (~60-100 lines): What This Is, Stack, Commands, Hard Conventions (eden-press) / Architecture pointers (opsCluster), DevFlow note.
- Commits: `cd <repo> && node ~/.claude/devflow/bin/df-tools.cjs commit "docs: add CLAUDE.md" --files CLAUDE.md` (fallback DEVFLOW_ALLOW_RAW_COMMIT=1 per 25-05 pattern); config commit: `chore(planning): enable gates.editGate warn`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Create opsCluster CLAUDE.md</name>
  <files>/Users/justin/dev/opsCluster/CLAUDE.md</files>
  <action>
Write /Users/justin/dev/opsCluster/CLAUDE.md from the codebase_examples facts: What This Is (Go control-plane + Terraform DOKS IaC behind api.aocyber.ai; GitOps lives in companion repo AO-Cyber-Systems/opscluster-gitops via ArgoCD); Commands (go build/vet/test from control-plane/; CI pgvector:pg16 service container with DB literally named `opscluster` — note the REVOKE-by-name test); Conventions (MANDATORY gitleaks pre-commit hook install command; pointer to .planning/PROJECT.md for the 3-plane deployment model + deployment profiles; note that platform deploys are release-tag-gated and NEVER performed casually); short DevFlow Routing pointer. Before writing, `test -f ~/dev/opsCluster/CLAUDE.md` — if it exists, merge per error_recovery. Commit in ~/dev/opsCluster: `docs: add CLAUDE.md (stack, commands, conventions, DevFlow routing)`.
  </action>
  <verify>File exists; grep confirms: "opscluster-gitops", "gitleaks", "opscluster" DB-name note, "control-plane"; no "8080", no deploy instructions; git -C ~/dev/opsCluster log -1 --stat shows only CLAUDE.md</verify>
  <done>opsCluster has a repo-inspection-grounded CLAUDE.md committed in its own repo</done>
  <recovery>git -C ~/dev/opsCluster checkout -- CLAUDE.md (or rm if untracked) and rewrite</recovery>
</task>

<task type="auto">
  <name>Task 2: Create eden-press CLAUDE.md</name>
  <files>/Users/justin/dev/eden-press/CLAUDE.md</files>
  <action>
Write /Users/justin/dev/eden-press/CLAUDE.md from the codebase_examples facts: What This Is (Go Markdown→document engine, Marp-compatible clean-room, zero-JS backend, library-first/CLI-second, kind: library → strict test-first posture per the global by-kind playbook); Commands (go build/vet/test ./..., make check-no-chromedp, make check-cli-imports); a "Hard Rules" section carrying ALL FIVE load-bearing conventions verbatim in spirit (never go mod tidy + the additive-only alternative; dual addlicense header policy incl. vendored-Marp-files exception; chromedp only in convert/; cmd imports only press/; pinned CHROME_VERSION never latest); upstream pins note (UPSTREAM-VERSIONS.txt + upstream-drift.yml); short DevFlow Routing pointer. Check-then-merge if a CLAUDE.md appeared. Commit in ~/dev/eden-press: `docs: add CLAUDE.md (stack, commands, hard conventions, DevFlow routing)`.
  </action>
  <verify>File exists; grep confirms all five: "go mod tidy", "addlicense", "check-no-chromedp", "check-cli-imports", "CHROME_VERSION"; no "8080"; git -C ~/dev/eden-press log -1 --stat shows only CLAUDE.md</verify>
  <done>eden-press has a CLAUDE.md carrying every load-bearing convention, committed in its own repo</done>
  <recovery>git -C ~/dev/eden-press checkout -- CLAUDE.md (or rm if untracked) and rewrite</recovery>
</task>

<task type="auto">
  <name>Task 3: Apply gates.editGate "warn" to eden-press and live-verify against 25-02's hook</name>
  <files>/Users/justin/dev/eden-press/.planning/config.json</files>
  <action>
Edit ~/dev/eden-press/.planning/config.json: add top-level `"gates": { "editGate": "warn" }` (preserve all existing keys; keep valid JSON). Live-verify against the 25-02 implementation (devflow-claude working tree, post-merge):

`printf '{"tool_name":"Edit","tool_input":{"file_path":"/Users/justin/dev/eden-press/press/x.go"}}' | (cd ~/dev/eden-press && node /Users/justin/dev/devflow-claude/plugins/devflow/hooks/gate-edits.js)`

Expected stdout: JSON with `"permissionDecision":"ask"` (warn mode; no .skill-active marker present). Also verify default-parity: the same command with cwd in a no-config tmpdir still yields `"deny"`. Then commit in ~/dev/eden-press: `chore(planning): set gates.editGate warn` with a body noting the evidence (52 denials were worktree-executor false positives; warn preserves signal without blocking waves; value goes live at next devflow release).
  </action>
  <verify>node -e JSON.parse of the config succeeds and gates.editGate === 'warn'; live hook check emits 'ask'; git -C ~/dev/eden-press log -1 --stat shows only .planning/config.json</verify>
  <done>eden-press config carries warn; behavior proven 'ask' against the new hook code; committed in eden-press</done>
  <recovery>If JSON edit breaks parsing, git -C ~/dev/eden-press checkout -- .planning/config.json and re-apply; if hook emits 'deny', see error_recovery (verify 25-02 merged + exact lowercase value)</recovery>
</task>

</tasks>

<verification>
1. Both CLAUDE.md files exist, grounded in the embedded repo facts (spot-check the five eden-press conventions + opsCluster gitleaks/companion-repo/DB-name notes).
2. eden-press config parses; live gate-edits check: 'ask' with eden-press cwd, 'deny' with a bare tmpdir cwd.
3. Three conventional commits across the two fleet repos; `git -C /Users/justin/dev/devflow-claude status` clean of fleet files.
4. Zero occurrences of "8080" in the new files; zero deploy/tag instructions.
</verification>

<success_criteria>
- Roadmap SC-6 (CLAUDE.md half): CLAUDE.md created for opsCluster + eden-press from repo inspection.
- Roadmap SC-4 (application): eden-press runs gates.editGate "warn" — the value the investigation supports (LOCKED decision 4).
</success_criteria>

<output>
After completion, create `.planning/objectives/25-fleet-audit-fixes/25-06-SUMMARY.md` — include the three fleet commit SHAs and the note that the knob activates fleet-wide at the next devflow release (no version bump in this objective).
</output>
