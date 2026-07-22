# Milestones

## v1.1 DevFlow Coordination Layer (Shipped: 2026-05-06)

**Objectives completed:** 13 objectives (0–9, 6, 8, 24), ~53 plans

**Delivered:** Program-aware coordination layer for the AO-Cyber-Systems org — GitHub Issues + Projects v2 as the substrate, git as the peer-awareness store.

**Key accomplishments:**
- (kind, work) intent model: 42-cell defaults table + `intent.cjs` resolver with per-field provenance; CLAUDE.md TDD-playbook absorption (`claude-md.cjs`)
- GitHub coordination layer: frontmatter GH-link conventions, `gh resolve` chain walker, `gh sync` with sticky-comment idempotency, Product Roadmap Project v2 field updates
- Cross-repo awareness: peer branch scanner (git-based) + org Project walker + `/devflow:awareness` skill + SessionStart cache populate
- Planning-time org awareness: sibling/eden-libs/org-overlap scanners feeding "Cross-Repo Considerations" into CONTEXT.md
- Duplicate-work detection with Merge/Defer/Coordinate/Proceed resolution flow at plan + execute time
- Initiative context layer: GitHub Epics projected to `~/.claude/devflow/initiatives/` for planner strategic context
- Unified `/devflow:todo list` morning-standup view; program-aware TUI viewer
- Roadmap ↔ disk reconciliation (`df-tools sync-roadmap` + skill)

**Note:** v1.1 was not formally archived at its completion; its full roadmap record is preserved inside `milestones/v1.2-ROADMAP.md`. Objective 9's 09-03 TRD shipped its deliverables (CLI + skill + lib, all live) without a SUMMARY.md — documentation gap only.

---

## v1.2 Token Efficiency + Ambient Mode + Handoff Polish (Shipped: 2026-07-22)

**Objectives completed:** 17 objectives (10-E, 11-D, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 10-autonomous, 23, 10-flutter, 25), 83 plans

**Delivered:** Cut per-invocation token cost, converted routing from advisory to authoritative (ambient mode), closed the TTY-interactive handoff gap with a PTY-backed daemon, and finished with a fleet-wide audit-fix pass.

**Key accomplishments:**
- Skill consolidation 28→14 (`/devflow:objective`, `/devflow:milestone`, `/devflow:status`, `/devflow:todo` subcommand forms) + prompt extraction to shared references (~25-55k tokens saved per build)
- Ambient mode: authoritative `route-intent.js` + `classify-session.js` SessionStart hook + strict-by-default `gate-edits.js` with skill-active marker
- `/devflow:micro` tier (~2k tokens) for sub-30-LOC changes; auto-init detection for non-DevFlow projects
- PTY-backed handoff watcher (node-pty): TTY-interactive auth flows, token-passing schema with redaction, daemon polish (notifications, auto-launch, multi-project, status-line, cross-shell)
- Bidirectional GH sync (pull + conflict resolution) + 3-tier configurable defaults table
- Autonomous mode overhaul: verifier-delegated checkpoints, decision queue, auto-resume/retry hooks, unattended runbook
- Flutter UI verification process: state-coverage schema, planner/executor/verifier gates, Maestro + integration_test pyramid, auto-generated UAT
- Fleet audit fixes (obj 25): phantom skill names corrected, VERIFY rule tightened, adoption router rules, `gates.editGate` knob, global + fleet CLAUDE.md/PROJECT.md alignment (6 repos gained `kind:` frontmatter)

**UAT:** objective 25 verified 8/8 pass (`objectives/25-fleet-audit-fixes/25-UAT.md`)

---
