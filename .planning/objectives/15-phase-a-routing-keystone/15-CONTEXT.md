---
objective: 15-phase-a-routing-keystone
github_issue: AO-Cyber-Systems/devflow-claude#26
parent_issue: AO-Cyber-Systems/devflow-claude#25
work: foundation
created: 2026-05-04
---

# Phase A — Authoritative routing keystone: Context

## What this objective does

Convert DevFlow's intent routing from advisory to authoritative. Today `route-intent.js` fires correctly in DevFlow projects but the model ignores it (0% obedience across 43 fired sessions in the Phase E audit). Plan B's whole architecture (#25) depends on this conversion.

Three layers of intervention land together:

1. **System-level routing instructions** (new `classify-session.js` SessionStart hook) — injects a routing decision table at session start so the model has the mapping from intent → consolidated skill before the first user prompt.
2. **Strengthened directive language + tighter regex** (modified `route-intent.js`) — replace advisory tone with obligatory tone; tighten regex to reject Q&A false positives; add fixture suite (10 fire / 5 no-fire).
3. **Hard-gate fallback** (modified `gate-edits.js`) — in ambient mode, DENY Edit/Write by default unless `.planning/.skill-active` marker exists OR user override phrase present. Skills mark themselves active via new `df-tools skill-active --start <name>` / `--end` CLI.

A fourth observability change (`verify-completion.js` audit log) lets us measure obedience quantitatively over the 7-day pilot specified in #26.

## Why now

Phase A is the **keystone** of v1.2's ambient-mode arc (#25). It blocks:
- **Phase B** (#27) — `/devflow:micro` cheap target needs a working routing layer to be selected
- **Phase C** (#28) — auto-init for non-DevFlow projects shares the SessionStart pipeline

Phase G (skill consolidation, obj 12) shipped the consolidated skill list (5 skills × subcommands) on 2026-05-06. The `skill-route --list` snapshot in `12-RESEARCH.md` is the inventory `classify-session.js` injects. Phase A consumes that handoff verbatim.

Phase F (default-on safety, obj 14, in flight) ships the `df-tools detect brownfield-map` helper. The `classify-session.js` hook is where that detector eventually wires into a brownfield-map offer — but that wire-up is **out of scope for this objective** per #26 (Phase F's own TRD 14-03 explicitly punts the hook integration to "Phase A, deferred until A1 lands"). For now, A1 ships `classify-session.js` with the routing-table injection only; brownfield-map offer wiring is a follow-up.

## Scope (locked from issue #26)

### A1 — `classify-session.js` SessionStart hook

- New file: `plugins/devflow/hooks/classify-session.js`
- Register in `plugins/devflow/hooks/hooks.json` AFTER `sync-runtime.js` (sync-runtime mirrors the runtime; classify-session reads from it)
- Logic: detect project mode (`ambient` / `init-offer` / `skip`), inject strong system-level routing instructions
- New helper: `plugins/devflow/devflow/bin/lib/classifier.cjs` — pure-logic shared classification helper (testable)
- Routing decision table to inject (uses Phase G's consolidated skill names from 12-RESEARCH.md snapshot):
  - Q&A / explanation / exploration → respond directly, no skill
  - 1–2 line change, single file → `/devflow:micro` (Phase B — currently inert; ships in obj 7)
  - <5 files, <200 LOC → `/devflow:quick`
  - Multi-file feature → `/devflow:build`
  - Bug investigation → `/devflow:debug`
  - Status check → `/devflow:status` (consolidated; no-arg form)
  - Resume → `/devflow:status resume`

### A2 — Strengthen `route-intent.js`

- Modified: `plugins/devflow/hooks/route-intent.js`
- Replace advisory injection (`'You MUST invoke ...'`) with **box-drawn directive block** (obligatory tone, mentions gate-edits will deny direct Edits)
- Tighten regex at lines 34–49: imperative/possessive forms only (`fix the X`, `build the Y`) — drop bare verbs that match Q&A like `what's the bug in X` or `is this broken`
- Update regex map to use Phase G consolidated skills (`/devflow:status` instead of `/devflow:progress`, `/devflow:status pause` instead of `/devflow:pause-work`, etc.)
- Test fixtures (10 fire / 5 no-fire) — hand-built in `lib/__fixtures__/intent-fixtures.cjs` (extends existing fixture file)

### A3 — Strict `gate-edits.js`

- Modified: `plugins/devflow/hooks/gate-edits.js`
- Today: warns only via `permissionDecision: 'ask'` unless `DEVFLOW_STRICT_EDITS=1`
- New behavior in ambient mode (default-on): **DENY** Edit/Write/MultiEdit unless either:
  - `.planning/.skill-active` marker file exists (skill is currently running)
  - User message contains explicit override phrase (`skip devflow`, `just edit`, `bypass devflow`)
- Gate ONLY modifying tools (Edit, Write, MultiEdit) — NEVER Read, Grep, Glob (unchanged from today)
- Permits unchanged: `.planning/**`, `*.md` paths (planning artifacts + docs always allowed)

### A4 — Stop-hook self-audit

- Modified: `plugins/devflow/hooks/verify-completion.js`
- After each Stop event in ambient mode, append obedience log line to `~/.claude/devflow/audit.log`
- Format: `{timestamp, session_id, route_recommended, skill_invoked: bool, prompt_summary}`
- Pure observability — no behavior change, no blocking. Lets us measure Plan B success quantitatively over the 7-day pilot.

### Supporting CLI: `df-tools skill-active`

- New CLI subcommand: `df-tools skill-active --start <skill-name>` writes `.planning/.skill-active` with `{skill, started_at, pid}` JSON; `--end` removes the file
- Used by skill workflows on entry/exit so `gate-edits.js` knows when a skill is in progress
- Skills don't all need to use it immediately — opt-in ramp; A3 ships the gate, individual skill workflows adopt the marker as they're updated

## Out of scope (deferred)

- **Brownfield-map offer wiring** in `classify-session.js` — Phase F's TRD 14-03 ships the detector helper; wiring it into the SessionStart hook is a follow-up after A1 lands the hook surface. Tracked as a comment on #26.
- **Updating all skill workflows to use `skill-active --start/--end`** — opt-in; this objective only ships the CLI and the gate. Bulk migration of existing skills is a follow-up.
- **`/devflow:micro` skill** — the routing table references it but it's inert until Phase B (obj 7). The classify-session injection notes this with a parenthetical so the model doesn't try to invoke a missing skill.
- **System-prompt-style stronger injection** (e.g. `additionalSystemMessage`) — out of scope; we use `additionalContext` (the existing mechanism) with stronger formatting. If 7-day audit shows <30% obedience improvement, escalation to a stronger Claude Code hook surface is a follow-up.
- **Bidirectional GH sync of the audit log** — log stays local-only.
- **Cross-machine audit aggregation** — single-user file at `~/.claude/devflow/audit.log` is sufficient for the 7-day pilot.

## Dependencies

- **Hard requires (already shipped):**
  - Phase G consolidation snapshot (obj 12, DONE 2026-05-06) — provides consolidated skill names + `skill-route --list` JSON contract
  - Phase E agent audit (obj 10) — provides 0% obedience baseline that motivates the work
- **Soft requires (in flight, not blocking):**
  - Phase F brownfield detector (obj 14, TRD 14-03) — A1 leaves space for the wire-up but doesn't ship it
- **Phase A blocks:**
  - Phase B `/devflow:micro` (obj 7) — needs working routing
  - Phase C auto-init detection (obj 8) — shares SessionStart pipeline

## Acceptance criteria (from #26)

- [ ] `classify-session.js` correctly classifies 5 test scenarios: ambient project, init-offer-eligible, scratch dir, no-git dir, decline-marker present
- [ ] `route-intent.js` regex passes 10 fixture prompts, fails 5 false-positives
- [ ] `gate-edits.js` denies direct Edit in ambient mode without skill marker
- [ ] `gate-edits.js` allows Edit when `.planning/.skill-active` exists
- [ ] `gate-edits.js` allows Edit on user override phrase
- [ ] `audit.log` records ≥10 turns of obedience data over 7-day pilot (post-merge measurement; this objective ships the logger)

## Quality gate (from orchestrator)

- All 4 acceptance criteria from #26 shipped
- 10 fire / 5 no-fire fixtures pass
- gate-edits override phrases work
- skill-active marker tracked
- All 1551 pre-existing tests still pass (1 pre-existing E2E1 failure stays the same — unrelated)
- Output ends with `## PLANNING COMPLETE`

## TDD playbook directives

Per the orchestrator's `<tdd_playbook_directives>` block + global TDD playbook:

- `classify-session.js` + `lib/classifier.cjs` — **type: tdd**; pure-logic detection (mode classification, routing-table injection)
- `route-intent.js` regex tightening — **type: tdd**; fixture-driven (10 fire / 5 no-fire enumeration)
- `gate-edits.js` DENY logic + skill-active marker + override-phrase parsing — **type: tdd**; pure-logic + fs check
- `df-tools skill-active` CLI — **type: tdd**; small CLI surface, fully testable
- `verify-completion.js` audit log — **type: standard** (logging side effect, fixture pollution risk for tests)

Anti-patterns: no LLM-generated test data (use hand-built fixture builders), no property-based testing (subcommand parsing + regex enumeration is finite), no Gherkin/BDD layer (descriptive `test()` names suffice).
