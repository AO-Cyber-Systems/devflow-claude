---
objective: UI-VISUAL-EVAL-DEVFLOW
status: planning
roadmap: ad-hoc (net-new; Track B "generalize into DevFlow" of the UI visual-eval initiative)
branch: feat/ui-visual-eval
worktree: /Users/markemerson/Source/devflow-claude-ui-eval
overrides:
  work: foundation
  tdd: per-feature
---

# Objective: UI Visual-Evaluation Layer — Track B "Generalize into DevFlow"

## Goal

Now that Track A shipped the web capture contract (Phase 1, eden-biz worktree) and
the scoring engine + dogfood gate (Phase 2, this repo), wire the engine into DevFlow
so EVERY project inherits visual eval — not just eden-biz. Three cohesive pieces of
DevFlow-plugin work (design doc §4, §4b, §5).

Authoritative design: `/Users/markemerson/.claude/plans/temporal-gliding-wave.md`
(§4 DevFlow integration, §4b generalization, §5 harness). Engine already exists at
`plugins/devflow/devflow/bin/lib/flutter-ui-eval.cjs` (Phase 2) with df-tools arms
`verify flutter-ui-eval` / `flutter-ui eval` and the `df-ui-evaluator` model profile.

## Scope (Track B — P3, P4, P5)

### P3 — Integration wiring (DevFlow consumes the engine)
- `plugins/devflow/agents/ui-evaluator.md` — new agent (authored like `verifier.md`:
  frontmatter tools = Read/Bash/Glob + Playwright MCP browser tools + vision; color).
  Loads a manifest, runs the capture adapter, runs `df-tools verify flutter-ui-eval`,
  judges non-skipped states, writes `*.judge.json` + `ui-eval-report.json` to the
  objective's `evidence/ui_eval/`, returns a ≤300-token rollup.
- `plugins/devflow/skills/ui-eval/SKILL.md` — `/devflow:ui-eval` (authored like
  `skills/verify-work/SKILL.md`: YAML frontmatter + `<execution_context>`
  @-referencing a new workflow). Standalone-invocable for dogfooding a surface.
- `plugins/devflow/devflow/workflows/ui-eval.md` — the workflow body (status: active).
- `plugins/devflow/agents/verifier.md` — insert **Step 8c** after the Step 8a/8b
  screenshot capture and before the Step 9 human-escalation: call
  `df-tools verify flutter-ui-eval "$OBJECTIVE" --raw`; `fail`→`gaps:` entry,
  `review`→notes, `pass`→remove that surface from the Step 9 `human_verification:`
  list. Amend Step 9 so visual UX escalates to human ONLY on `review`/SKIPPED.

### P4 — Bootstrap scaffolding (any Flutter repo gets it)
- `plugins/devflow/devflow/bin/lib/flutter-ui-eval-bootstrap.cjs` — sibling to
  `flutter-ui-bootstrap.cjs`. Scaffolds the manifest skeleton, the capture adapter,
  baseline dirs, and the `ui_eval` Playwright project into any `stack:flutter` repo.
  Reuse the detection in `flutter-ui-scope.cjs` (`type:ui` + `stack:flutter` →
  platform[]). Wire a df-tools subcommand to invoke it. TDD on scaffold output.

### P5 — Planner / build defaults (new objectives get visual eval by default)
- `plugins/devflow/agents/planner.md` (+ the flutter-ui scope tooling) — auto-emit a
  ui-eval state-matrix manifest + the verifier visual gate for every `type:ui` /
  `stack:flutter` objective, parallel to how `flutter-state-coverage` (REQ-10-05) is
  already auto-required. TDD: planner output contains the gate for a synthetic UI objective.

## Out of scope (handled separately)
- P6 global playbook habit (`~/.claude/CLAUDE.md`) — done directly by the orchestrator.
- P7 mobile/POS Maestro adapters — separate eden-biz-worktree objective.
- Re-running the real-screenshot GO/NO-GO gate (deferred; baselines blocked on :8091).
- Releasing/installing the plugin (source-only changes here).

## TDD posture (per-feature; per global CLAUDE.md playbook)
- Agent/skill/workflow markdown = prompt files, NOT unit-TDD'd (DevFlow exception:
  generated/prose). The verifier Step 8c edit is prose too. BUT: the df-tools glue,
  the bootstrap scaffold output, and the planner auto-emit are unit-TDD'd (node --test,
  zero new deps), test-list-first, fixture generators.
- bootstrap test list: scaffolds manifest skeleton; scaffolds capture adapter;
  scaffolds baseline dirs; adds ui_eval playwright project; idempotent re-run (no-op);
  skips non-flutter repos.
- planner-default test list: a synthetic type:ui/stack:flutter objective → emitted plan
  carries the ui-eval manifest stub + the visual gate; a non-ui objective → no gate.
- Atomic commits: test: → feat: per TRD; prose files get a single feat:/docs: commit.

## Verification (offline; no Docker, no network)
- `node --test` over the bootstrap + planner-default test files → exit 0, no new failures.
- `npm test` (or node --test over lib) → no regression vs baseline (known ~1 pre-existing
  awareness flake; do not add any).
- `node df-tools.cjs flutter-ui eval --help` + the new bootstrap subcommand `--help` exit cleanly.
- Skill/agent/workflow files parse (valid frontmatter); verifier.md Step 8c present;
  planner.md references the ui-eval auto-emit.
- Do NOT modify the eden-biz worktree or the installed ~/.claude plugin mirror.
