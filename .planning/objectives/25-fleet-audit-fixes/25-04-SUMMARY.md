---
objective: 25-fleet-audit-fixes
job: "04"
subsystem: docs
tags: [claude-md, intent-model, routing, tdd-playbook, defaults-table]

# Dependency graph
requires:
  - objective: 00-refine-defaults-table
    provides: "(kind, work) defaults table + intent resolver + claude-md.cjs absorption mechanism (PLAYBOOK_HABITS, HEADING_PATTERNS, deriveOverrides)"
provides:
  - "Global ~/.claude/CLAUDE.md routing table aligned with current DevFlow skill surface (status, micro, milestone, todo, gh-sync, discuss-objective)"
  - "Global '## TDD & Quality' by-kind playbook section that engages claude-md.cjs's level-3 scan (_playbookDetected: true) with zero accidental structured overrides"
affects: [25-06-fleet-claude-md]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Phrase-safe playbook wording — new CLAUDE.md sections must avoid all PLAYBOOK_HABITS regex phrases unless a structured override is intentionally desired"]

key-files:
  created: []
  modified:
    - "/Users/justin/.claude/CLAUDE.md (NOT a git repo — no commit; verified by re-read + resolver diff)"

key-decisions:
  - "Wrote the TDD & Quality section as documentation-only policy pointing to defaults-table.md, per orchestrator disposition 3 — claude-md.cjs's absorber is not kind-conditional, so the section must not claim to 'enforce' per-kind behavior"
  - "Heading '## TDD & Quality' deliberately hits both /^##\\s+.*\\bTDD\\b/i and /^##\\s+.*\\bQuality\\b/i for belt-and-suspenders HEADING_PATTERNS coverage"

patterns-established:
  - "Pattern: playbook section wording must be checked against claude-md.cjs's PLAYBOOK_HABITS + legacy phrase regexes before landing in ~/.claude/CLAUDE.md, since section EXISTENCE (not just phrase content) flips _playbookDetected and triggers fleet-wide resolver promotions"

requirements-completed: []  # ad-hoc audit objective — roadmap Objective 25 SC-5 is the contract, not REQUIREMENTS.md IDs

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 12min
completed: 2026-07-22
---

# Objective 25 TRD 04: Global CLAUDE.md Routing + TDD Playbook Summary

**Fixed the retired resume-work/progress routing row, added the micro tier + four adoption-skill mentions, and added a phrase-safe by-kind `## TDD & Quality` section to `~/.claude/CLAUDE.md` — verified the section engages the intent-model's level-3 scan without introducing any accidental structured overrides.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-22T13:27:00Z (approx, first backup command)
- **Completed:** 2026-07-22T13:39:50Z
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`/Users/justin/.claude/CLAUDE.md`, outside repo, not committed)

## Accomplishments
- Retired `/devflow:resume-work` and `/devflow:progress` routing row replaced with `/devflow:status` (+ `status resume`/`status pause` subcommands); zero remaining references to the retired names in the file
- Added the missing `/devflow:micro` tier (trivial single-token changes) below `/devflow:quick`
- Added routing mentions for all four adoption-target skills locked in decision 2b: `milestone`, `todo`, `gh-sync`, `discuss-objective`
- Added a new `## TDD & Quality` H2 section stating the by-kind policy (strict test-first for `library`/`api`/`cli`; pragmatic tests-alongside-code for `app`/`ui-lib`; prototypes/spikes exempt), pointing to `defaults-table.md` as the machine-enforced source of truth
- Confirmed `deriveOverrides()` over the edited file yields exactly `{"_playbookDetected":true}` — no accidental PLAYBOOK_HABITS phrase matches
- Confirmed `df-tools intent resolve --objective 25` in devflow-claude produces an identical `config` block before and after the edit (strict→strict promotion is a no-op for the `plugin` kind)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Update DevFlow Routing table | `grep -c "resume-work\|/devflow:progress" ~/.claude/CLAUDE.md` (→0); `grep -c "devflow:micro"` (→1); `grep -E "milestone\|todo\|gh-sync\|discuss-objective"` (→4 rows) | 0 | PASS |
| 2: Add `## TDD & Quality` section | `grep -n "^## TDD & Quality" ~/.claude/CLAUDE.md` (→1 match); `node -e "...deriveOverrides..."` (→ `{"_playbookDetected":true}`); resolve-before/after config diff (→ identical) | 0 | PASS |

## Task Commits

Not applicable — `/Users/justin/.claude/CLAUDE.md` is outside any git repository (per TRD constraint: "NOT a git repo — no commit for that file"). Both tasks were verified by re-reading the file and running the resolver/absorber checks below instead of via commit.

**Plan metadata:** captured in this SUMMARY.md's own commit within the devflow-claude repo (see Files Created/Modified).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Routing table correctness | `grep` checks (retired names gone; micro present; 4 adoption rows present) | 0 | PASS |
| deriveOverrides no-regression | `node -e "...claude-md.cjs..."` → `{"_playbookDetected":true}` only | 0 | PASS |
| Resolver no-regression | `df-tools intent resolve --objective 25` config diff before/after edit | 0 | PASS (identical) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `must_haves.truths` from TRD frontmatter confirmed — see below)
- **Gate failures:** None

### Must-haves truth-by-truth

1. Routing table routes resume/status/progress to `/devflow:status` (with `status resume`/`status pause`) — retired `/devflow:resume-work` and `/devflow:progress` appear nowhere in the file. **Confirmed** (`grep -c` → 0).
2. Routing table has a `/devflow:micro` tier below `/devflow:quick`. **Confirmed** (`grep -c` → 1, positioned directly after the quick row).
3. Routing table mentions all four adoption-target skills: `milestone`, `todo`, `gh-sync`, `discuss-objective`. **Confirmed** — all four rows present.
4. A `## TDD & Quality` H2 section exists whose heading matches claude-md.cjs `HEADING_PATTERNS` (`^##.*TDD` and `^##.*Quality`). **Confirmed** — heading matches both patterns (belt-and-suspenders).
5. `deriveOverrides()` over the file yields ONLY `{ _playbookDetected: true }` — zero structured field overrides. **Confirmed** via direct `node -e` invocation of `claude-md.cjs`.
6. `df-tools intent resolve --objective 25` in devflow-claude produces config values identical to the pre-edit baseline (plugin-kind strict→strict promotion is a no-op). **Confirmed** — `config` blocks byte-identical (JSON.stringify equal) before/after; only the `directives` metadata array (listing the newly-detected playbook source) changed, which is expected and outside the `config` contract.

## Files Created/Modified
- `/Users/justin/.claude/CLAUDE.md` — routing table updated (status/micro/four adoption rows); new `## TDD & Quality` section added after the DevFlow Routing section. **Not a git repo — no commit.** Byte-identical elsewhere (HARD RULES, Deliverables, AO Cyber brand guide sections unchanged, confirmed via `diff` against the pre-edit backup).
- `.planning/objectives/25-fleet-audit-fixes/25-04-SUMMARY.md` (this file, in the devflow-claude repo, committed).

## Decisions Made
- Used the exact routing table text supplied in the TRD's `codebase_examples` (verbatim target table) rather than paraphrasing, to minimize risk of drift from the audit's intended wording.
- Wrote the TDD & Quality section body using only paraphrased language ("write the failing test before the implementation," "tests are written alongside the code they cover") specifically chosen to avoid every regex in `PLAYBOOK_HABITS` and the legacy `deriveOverrides()` phrase checks, while still conveying the by-kind policy from LOCKED decision 3.
- Kept the pointer sentence to `defaults-table.md` explicit and unambiguous ("this section is human-readable policy, not a resolver override") per orchestrator disposition 3, since `claude-md.cjs`'s absorber is existence-gated (not kind-conditional) — the section text itself cannot restrict which kinds it applies to at the mechanism level.

## Deviations from Plan

None — TRD executed exactly as written. Both tasks completed with the exact verification commands specified in the TRD, no auto-fixes needed, no unexpected `deriveOverrides()` keys encountered on the first attempt.

## Issues Encountered
None.

## Expected Promotion Side Effects (informational — not a deviation)

Per the TRD's `research_context`, the new `## TDD & Quality` section's mere EXISTENCE (not its specific wording) flips `_playbookDetected` to `true` fleet-wide for every repo that reads `~/.claude/CLAUDE.md` via `claude-md.cjs`'s absorber. This engages two resolver-side promotions documented in `intent.cjs`:

1. **`tdd_default` one-step promotion at resolve time:** `skip → auto` (for `prototype`/`spike` work) and `auto → strict` (otherwise). For **devflow-claude itself** (`kind: plugin`, `work: feature`), `tdd_default` was already `strict` in the defaults table, so `strict → strict` is a **no-op** — confirmed empirically above (identical `config` before/after). Other fleet repos whose defaults-table cell currently resolves to `auto` (or `skip` for prototype/spike work) WILL see a one-step promotion the next time they run `df-tools intent resolve` or plan a new objective, once their own `~/.claude/CLAUDE.md` absorption also detects this section (this file is the user-global CLAUDE.md, shared across the whole fleet).
2. **`security_isolation` promotion for `kind: api` projects:** `n/a → multi_tenant_required` at resolve time. devflow-claude is `kind: plugin`, not `api`, so this promotion does not apply here — but any fleet `api`-kind repo (e.g., AODex-Go, AOSentry) resolving intent after this change will see `security_isolation` flip to `multi_tenant_required` unless already set.

These are the intent-model's designed "playbook present" promotions and are the intended outcome of this audit fix (per roadmap goal: "so intent-model resolution engages fleet-wide"). No code changes were made to `intent.cjs` or `claude-md.cjs` — this TRD only edited the global CLAUDE.md file that the existing (unmodified) mechanism reads.

## User Setup Required
None — no external service configuration required. Note: `/Users/justin/.claude/CLAUDE.md` was edited directly on disk (not via git); the change is already live for all future Claude Code sessions on this machine, no additional action needed.

## Next Objective Readiness
- Objective 25 TRD 06 (fleet-claude-md) can proceed — it applies the equivalent per-repo `CLAUDE.md` playbook additions across the fleet, now that the global template/pattern has been validated end-to-end (heading match + zero accidental overrides + no-op resolver diff for a `strict`-tdd kind).
- Any fleet repo whose `(kind, work)` cell resolves to `tdd_default: auto` or `security_isolation: n/a` (api kind) should expect a one-step promotion at next `intent resolve` — flagged above, not a blocker, but worth a heads-up if any repo's tests aren't ready for a global-CLAUDE.md-triggered TDD tightening.

## Self-Check: PASSED

- FOUND: `/Users/justin/.claude/CLAUDE.md` (edited file exists)
- FOUND: `.planning/objectives/25-fleet-audit-fixes/25-04-SUMMARY.md` (this file)
- Confirmed `## TDD & Quality` heading present at line 31 of `~/.claude/CLAUDE.md`
- Confirmed all 6 new routing skill references (`micro`, `status`, `milestone`, `todo`, `gh-sync`, `discuss-objective`) present in `~/.claude/CLAUDE.md`

---
*Objective: 25-fleet-audit-fixes*
*Completed: 2026-07-22*
