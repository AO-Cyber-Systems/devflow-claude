---
objective: 17-phase-c-auto-init
github_issue: AO-Cyber-Systems/devflow-claude#28
parent_issue: AO-Cyber-Systems/devflow-claude#25
work: feature
created: 2026-05-04
---

# Phase C — Auto-init detection for non-DevFlow projects: Context

## What this objective does

When a user opens a substantive project that lacks `.planning/`, detect it and offer to initialize DevFlow. Currently DevFlow only activates when `.planning/` already exists — every new project requires manual `/devflow:new-project` invocation. Plan B's "if it's installed, it should be used" principle requires automatic discovery of init opportunities.

Four pieces ship together:

1. **`df-tools project-state`** (C1) — JSON describing the cwd: `has_planning`, `has_git`, `git_age_days`, `code_files`, `primary_lang`, `is_substantive`, `previously_declined`, `decline_expires`. Pure-logic detection driven by fixtures.
2. **`classify-session.js` init-offer mode** (C2) — Phase A's classifier shipped a 3-mode classifier (`ambient` / `init-offer` / `skip`); obj 17 extends it so `init-offer` only fires when `is_substantive && !previously_declined`. Today the classifier returns `init-offer` for ANY git repo without `.planning/` — too noisy.
3. **Decline tracking** (C3) — `df-tools project-decline` writes a per-cwd marker to `~/.claude/devflow/declined-projects.json` with 30-day expiry. `df-tools project-accept` clears the marker. `project-state` reads the file to populate `previously_declined`.
4. **Optional auto-init mode** (C4, off by default) — `~/.claude/devflow/global-config.json` key `auto_init_substantive_projects`. When `true`, `classify-session.js` skips the offer and emits a directive to fire `/devflow:new-project --auto` on the first work-flavored prompt.

## Why now

Phase C depends on Phase A (#26, obj 15 — shipped 2026-05-04) and is independent of B/D/E. The classify-session.js hook already exists and routes to `init-offer` mode when a git repo without `.planning/` is detected — but the detection is too coarse:

- Today's `classify-session.js` returns `init-offer` for any git repo without `.planning/`. That includes cloned-but-never-touched repos, fork experiments, scratch dirs that happened to `git init`, etc.
- We need a "substantive project" filter so the offer only fires where the user is actually likely to do work.
- Once a user declines, we need to remember the decline for 30 days so we don't pester them every session.

Phase C closes that gap. The 30-day metric (≥30% of substantive non-DevFlow sessions either accept or explicitly decline vs 100% silent skip today) requires both the substantive filter AND decline tracking.

## Scope (locked from issue #28)

### C1 — `df-tools project-state`

- New CLI: `df-tools project-state [<cwd>]` returns JSON:
  ```json
  {
    "has_planning": false,
    "has_git": true,
    "git_age_days": 240,
    "code_files": 47,
    "primary_lang": "typescript",
    "is_substantive": true,
    "previously_declined": false,
    "decline_expires": null
  }
  ```
- Substantive heuristic (locked from #28):
  - Has git history >7 days OR has >10 source files
  - Has a manifest (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `Gemfile`, `pom.xml`)
  - NOT a scratch dir (`/tmp/...`, `~/Downloads/...`, `/var/folders/...`)
- New file: `plugins/devflow/devflow/bin/lib/project-state.cjs` — pure-logic + I/O wrapper, mirror brownfield-detector.cjs two-tier pattern
- Source-file counting: reuse the EXCLUDE/EXTS pattern from brownfield-detector.cjs (extract to a shared helper if duplication grows)

### C2 — `classify-session.js` init-offer mode extension

- Modified: `plugins/devflow/devflow/bin/lib/classifier.cjs`
- Current `classifySession` truth table (from 15-01):
  - `hasDeclineMarker=true` → `'skip'`
  - `planningDir non-null` → `'ambient'`
  - `hasGitDir=true` → `'init-offer'`
  - else → `'skip'`
- New truth table (additive, back-compat):
  - `hasDeclineMarker=true` → `'skip'` (unchanged)
  - `planningDir non-null` → `'ambient'` (unchanged)
  - `hasGitDir=true` AND `isSubstantive=true` AND `previouslyDeclined=false` → `'init-offer'`
  - `hasGitDir=true` AND `isSubstantive=true` AND `previouslyDeclined=true` → `'skip'`
  - `hasGitDir=true` AND `isSubstantive=false` → `'skip'`
  - else → `'skip'`
- Modified: `plugins/devflow/hooks/classify-session.js` — calls project-state internally to derive `isSubstantive` and `previouslyDeclined` before invoking `classifySession`
- INIT_OFFER_PREAMBLE updates: mention `/devflow:new-project --auto` (today text says `/devflow:new-project`); document decline option

### C3 — Decline tracking

- New file: `plugins/devflow/devflow/bin/lib/decline-tracker.cjs` — read/write `~/.claude/devflow/declined-projects.json`
- New CLI:
  - `df-tools project-decline [<cwd>] [--duration-days N]` — writes entry; default 30 days
  - `df-tools project-accept [<cwd>]` — clears entry (idempotent — no error if missing)
- File format:
  ```json
  {
    "/Users/justin/dev/some-repo": {
      "declined_at": "2026-05-05T12:00:00Z",
      "expires_at": "2026-06-04T12:00:00Z"
    }
  }
  ```
- Atomic write pattern: write to `<file>.tmp`, then rename
- `readDecline(cwd)` returns `{ declined: bool, expires_at: string|null }` — checks expiry against now

### C4 — Optional auto-init mode

- New file: `plugins/devflow/devflow/bin/lib/global-config.cjs` — read/write `~/.claude/devflow/global-config.json`
- Default config: `{ "auto_init_substantive_projects": false }`
- New CLI:
  - `df-tools global-config get <key>` — reads value (or default if missing)
  - `df-tools global-config set <key> <value>` — writes value (creates file if missing, JSON-validates)
- Modified: `plugins/devflow/hooks/classify-session.js` — when mode is `'init-offer'` AND `auto_init_substantive_projects=true`, emit a different preamble (AUTO_INIT_PREAMBLE) that fires `/devflow:new-project --auto` on first work-flavored prompt

## Acceptance criteria (from #28)

- [ ] `df-tools project-state` returns correct JSON for 5 test fixtures (ambient project, brownfield no-planning, scratch dir, no-git, declined project)
- [ ] Substantive heuristic excludes `/tmp/`, `~/Downloads/`, `/var/folders/`
- [ ] Init-offer injection appears in classify-session output for substantive non-DevFlow projects
- [ ] Decline marker persists across sessions, expires after 30 days
- [ ] Auto-init mode off by default; when on, fires `/devflow:new-project --auto` without prompt

## Locked decisions

1. **Substantive heuristic = ((git_age_days > 7) OR (code_files > 10)) AND has_manifest AND NOT is_scratch_dir.** All four conditions evaluated; substantive only if all clauses match.
2. **Default decline duration = 30 days.** Configurable via `--duration-days N` flag on `project-decline`.
3. **Auto-init off by default.** Opt-in only via `df-tools global-config set auto_init_substantive_projects true`.
4. **classify-session.js extends, never breaks back-compat.** All existing 15-01 tests must continue to pass.
5. **TDD playbook applies to C1, C3, C4.** C2 is an extension to existing TDD'd classifier — TDD continues. C4 is small but still TDD because the config CLI is well-defined.
6. **Anti-patterns: no LLM-generated test data, no property-based tests by default, no Gherkin layer.** All fixtures hand-built factories.

## Sequencing

| Wave | TRD | Owns | Depends on |
|------|-----|------|------------|
| 1 | 17-02 | decline-tracker.cjs + project-decline/-accept CLI | — |
| 1 | 17-04 | global-config.cjs + global-config CLI | — |
| 2 | 17-01 | project-state.cjs + project-state CLI | 17-02 (reads decline file) |
| 3 | 17-03 | classifier extension + classify-session.js wiring | 17-01 (uses project-state) + 17-04 (consumes auto-init config) |

## Out of scope

- Documentation file `docs/auto-init.md` (mentioned in #28 "Files" section) — defer to obj 18+ docs sweep
- Telemetry / 30-day metric collection — instrumentation lives in audit log (obj 15-05); analysis is a separate v1.2 closeout task
- Migration from v1.1 (no migration needed — this is purely additive)
- `/devflow:new-project --auto` flag implementation — the existing skill already supports auto mode via flag inspection; C4 just invokes it
