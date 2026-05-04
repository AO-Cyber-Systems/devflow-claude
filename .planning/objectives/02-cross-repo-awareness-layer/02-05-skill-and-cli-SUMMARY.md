---
objective: 02-cross-repo-awareness-layer
job: 05
subsystem: awareness
tags: [awareness, cli, skill, markdown-renderer, flag-parser]

# Dependency graph
requires:
  - objective: 02-02
    provides: scanPeer — walks origin/* git refs
  - objective: 02-03
    provides: scanOrg — walks org Product Roadmap via walkProject
  - objective: 02-04
    provides: readCache, writeCache, isStale — TTL-aware cache layer
provides:
  - /devflow:awareness slash command (plugins/devflow/skills/awareness/SKILL.md)
  - df-tools awareness subcommand router (cmdAwarenessRoute dispatches scan-peer, scan-org, show)
  - parseShowFlags — pure flag parser with --peer-only, --org-only, --quarter, --product, --refresh, --no-fetch
  - renderMarkdown — pure markdown renderer grouping peer branches + org items by Product x Quarter
affects: [02-06-lifecycle-integration, 02-07-library-export-and-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-helper pattern: parseShowFlags + renderMarkdown are I/O-free; cmd handlers wrap them"
    - "Soft-fail org auth: when peer is available and org auth fails in default mode, render peer-only with warning"
    - "Hard-fail org auth: when --org-only or peer is also unavailable, exit 1 with structured JSON to stderr"

key-files:
  created:
    - plugins/devflow/skills/awareness/SKILL.md
    - plugins/devflow/devflow/bin/lib/awareness-cli.cjs
    - plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "Standard TRD pattern — tests + impl in one feat commit per CONTEXT.md §TRD types (not TDD strict)"
  - "cmdAwarenessRoute delegates to per-subcommand functions (mirrors gh case pattern)"
  - "Soft-fail on org GhAuthError in default mode: render peer-only + warning, not exit 1"
  - "Quarter filter normalizes dash/space: Q2-2026 matches Q2 2026 (case-insensitive substring)"
  - "Two feat commits: d183052 (lib/CLI/tests) + 183339b (SKILL.md)"

patterns-established:
  - "Flag parser pattern: while(a.length>0) shift + consume next token for valued flags"
  - "Subcommand router: cmdAwarenessRoute follows gh case else-if chain + error() on unknown"
  - "Skill-to-CLI wiring: SKILL.md body calls df-tools.cjs subcommand with $ARGUMENTS passthrough"

requirements-completed: [SC-6]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true

# Metrics
duration: 3min
completed: 2026-05-04
---

# Objective 02 TRD 05: Skill + CLI Surface Summary

**`/devflow:awareness` slash command + `df-tools awareness show` CLI with parseShowFlags + renderMarkdown pure helpers and 29 unit tests, wiring scanPeer/scanOrg/cache to a user-facing markdown view**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-04T22:08:34Z
- **Completed:** 2026-05-04T22:11:41Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `lib/awareness-cli.cjs`: parseShowFlags (pure flag parser), renderMarkdown (pure markdown formatter), cmdAwarenessShow/ScanPeer/ScanOrg/Route (I/O handlers)
- `df-tools.cjs`: `case 'awareness':` router added — dispatches to `cmdAwarenessRoute`
- `skills/awareness/SKILL.md`: `/devflow:awareness` slash command with frontmatter + process invoking `df-tools awareness show $ARGUMENTS`
- 29 new unit tests for pure helpers (15 parseShowFlags + 14 renderMarkdown); 696/705 total pass (up from 667)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Create awareness-cli.cjs | `node -e 'const c=require("./plugins/devflow/devflow/bin/lib/awareness-cli.cjs"); for (const k of ["cmdAwarenessRoute","cmdAwarenessScanPeer","cmdAwarenessScanOrg","cmdAwarenessShow","parseShowFlags","renderMarkdown"]) if (typeof c[k] !== "function") throw new Error(k); console.log("OK")'` | 0 | PASS |
| 2: Wire df-tools.cjs + tests | `node plugins/devflow/devflow/bin/df-tools.cjs awareness --help 2>&1 \| grep -q awareness` | 0 | PASS |
| 2: scan-peer raw output | `node plugins/devflow/devflow/bin/df-tools.cjs awareness scan-peer --no-fetch --raw 2>&1 \| head -1 \| grep -q '{'` | 0 | PASS |
| 3: SKILL.md exists | `test -f plugins/devflow/skills/awareness/SKILL.md` | 0 | PASS |
| 3: Frontmatter name=awareness | `node -e '...fm.extractFrontmatter(c).name === "awareness"...'` | 0 | PASS |
| 3: Skill invokes df-tools | `grep -q "df-tools.cjs awareness show" plugins/devflow/skills/awareness/SKILL.md` | 0 | PASS |

## Task Commits

1. **Tasks 1+2: awareness-cli.cjs + df-tools wiring + tests** - `d183052` (feat(02-05))
2. **Task 3: SKILL.md** - `183339b` (feat(02-05))

**Plan metadata:** (final docs commit — see below)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| test --grep awareness | `npm test -- --grep awareness` | 0 | PASS |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 10/10 (all truths + artifacts from TRD must_haves)
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/skills/awareness/SKILL.md` — /devflow:awareness slash command; frontmatter name=awareness; body invokes df-tools awareness show $ARGUMENTS
- `plugins/devflow/devflow/bin/lib/awareness-cli.cjs` — parseShowFlags, renderMarkdown (pure); cmdAwarenessShow/ScanPeer/ScanOrg/Route (I/O handlers)
- `plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs` — 29 unit tests for pure helpers
- `plugins/devflow/devflow/bin/df-tools.cjs` — added case 'awareness': + require('./lib/awareness-cli.cjs') + updated usage string

## Decisions Made
- Standard TRD pattern: single `feat(02-05)` commit for lib/CLI/tests together per CONTEXT.md §"TRD types" (not TDD strict)
- Two commits total: d183052 (lib/CLI/tests) + 183339b (SKILL.md) — separate surfaces per TRD instructions
- Soft-fail for org auth errors in default (both sections) mode: render peer-only with warning line vs hard-fail. Hard-fail only when --org-only or peer is also unavailable
- Quarter filter normalizes dash/space so `--quarter Q2-2026` matches items with `quarter: "Q2 2026"` (and vice versa)

## Deviations from Plan

None — TRD executed exactly as written. 29 tests written (TRD spec said "~16"; additional tests added for edge cases including quarter normalization, product exact-match, DESC sort, org-only filtering — all within the same pure-function surface).

## Issues Encountered
None.

## Next Objective Readiness
- TRD 02-06 (lifecycle integration) can proceed: awareness-cli.cjs exports are stable; df-tools awareness show works end-to-end
- TRD 02-07 (library export) can proceed: all public functions are already exported from awareness.cjs and awareness-cli.cjs

---
*Objective: 02-cross-repo-awareness-layer*
*Completed: 2026-05-04*

## Self-Check: PASSED

- FOUND: plugins/devflow/skills/awareness/SKILL.md
- FOUND: plugins/devflow/devflow/bin/lib/awareness-cli.cjs
- FOUND: plugins/devflow/devflow/bin/lib/awareness-cli.test.cjs
- FOUND: .planning/objectives/02-cross-repo-awareness-layer/02-05-skill-and-cli-SUMMARY.md
- FOUND commit: d183052 (feat(02-05): awareness CLI)
- FOUND commit: 183339b (feat(02-05): SKILL.md)
- FOUND commit: c0bcff6 (docs(02-05): metadata)
