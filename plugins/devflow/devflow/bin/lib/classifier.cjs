'use strict';

/**
 * classifier.cjs — Session classification + routing preamble generator
 *
 * Pure-logic module (no fs I/O). Exported functions are called by
 * classify-session.js SessionStart hook after filesystem probing.
 *
 * API:
 *   classifySession({ planningDir, hasGitDir, hasDeclineMarker, isSubstantive?, previouslyDeclined? })
 *     → 'ambient' | 'init-offer' | 'skip'  (17-03 extended — back-compat via default params)
 *   renderRoutingPreamble({ mode }) → string  (modes: ambient | init-offer | auto-init | skip)
 *   CONSOLIDATED_SKILLS → Array (snapshot from 12-RESEARCH.md Phase G handoff 2026-05-06)
 */

// ─── classifySession ──────────────────────────────────────────────────────────

/**
 * Pure function — no filesystem I/O.
 *
 * Truth table (17-03 extended, 5-input):
 *   hasDeclineMarker=true                                    → 'skip'  (legacy marker, highest priority)
 *   planningDir non-null                                     → 'ambient'
 *   hasGitDir=true AND isSubstantive=true AND !previouslyDeclined → 'init-offer'
 *   (else)                                                   → 'skip'
 *
 * Back-compat: isSubstantive defaults to true and previouslyDeclined defaults to false,
 * so existing call sites that only pass {planningDir, hasGitDir, hasDeclineMarker}
 * continue to work without modification (same behavior as before 17-03).
 *
 * @param {object} opts
 * @param {string|null} opts.planningDir         - path to .planning/ dir, or null if not found
 * @param {boolean}     opts.hasGitDir           - true if .git/ found in ancestor
 * @param {boolean}     opts.hasDeclineMarker    - true if .planning/.devflow-init-declined exists (legacy 15-01)
 * @param {boolean}     [opts.isSubstantive=true]       - true if project meets substantive heuristic (17-03)
 * @param {boolean}     [opts.previouslyDeclined=false] - true if user declined via df-tools project-decline (17-03)
 * @returns {'ambient'|'init-offer'|'skip'}
 */
function classifySession({
  planningDir,
  hasGitDir,
  hasDeclineMarker,
  isSubstantive = true,       // default true → existing 15-01 tests pass without modification
  previouslyDeclined = false, // default false → existing 15-01 tests pass without modification
}) {
  // Legacy decline marker (15-01) — highest priority
  if (hasDeclineMarker) return 'skip';

  // Ambient — DevFlow already initialized
  if (planningDir) return 'ambient';

  // Init-offer extended: gate on substantive AND not declined (17-03)
  if (hasGitDir && isSubstantive && !previouslyDeclined) return 'init-offer';

  return 'skip';
}

// ─── Preamble constants ───────────────────────────────────────────────────────

/**
 * Routing decision table preamble for ambient mode (DevFlow project with .planning/).
 *
 * LOCKED TEXT — from 15-RESEARCH.md (preamble structure) and 16-PHASE-B (micro shipped).
 * Update only in a dedicated TRD.
 */
const AMBIENT_PREAMBLE = `DEVFLOW PROJECT DETECTED — ROUTING DIRECTIVE

This project has .planning/ — DevFlow ambient mode is active.

ROUTING DECISION TABLE:
  • Q&A / explanation / exploration       → respond directly, no skill
  • Sub-30-LOC, single-file change        → /devflow:micro (~2k token floor)
  • <5 files, <200 LOC, no new abstractions → /devflow:quick
  • Multi-file feature                    → /devflow:build
  • Bug investigation                     → /devflow:debug
  • Plan an objective                     → /devflow:plan-objective
  • Verify work                           → /devflow:verify-work
  • Status check                          → /devflow:status
  • Resume work                           → /devflow:status resume
  • Pause work                            → /devflow:status pause

CONSOLIDATED SKILLS (Phase G, v1.2 obj 12):
  /devflow:objective    add | remove
  /devflow:milestone    new | audit | complete | gaps
  /devflow:workstreams  setup | status | merge | run
  /devflow:todo         add | list
  /devflow:status       (no arg) | check | pause | resume

GATE: gate-edits.js will DENY direct Edit/Write/MultiEdit in ambient mode
unless an active skill marker (.planning/.skill-active) is present, or the
user prompt contains an explicit override phrase ("skip devflow", "just edit",
"bypass devflow", "force edit").

You MUST route through the appropriate skill BEFORE editing code.`;

/**
 * Init-offer preamble for substantive git repos without .planning/ (no decline, no auto-init).
 *
 * LOCKED TEXT — updated 17-03 per #28 spec (replaces 15-RESEARCH.md version).
 * Mentions /devflow:new-project --auto and df-tools project-decline.
 */
const INIT_OFFER_PREAMBLE = `DEVFLOW INIT OFFER — substantive non-DevFlow project detected

This is a git repository without .planning/ that meets the substantive-project
heuristic (git history >7 days OR >10 source files, with a manifest, not a
scratch dir). If the user requests a non-trivial change (multi-file feature,
plan, milestone work), offer:

  "This looks like a substantive project but DevFlow isn't set up.
   Want me to run /devflow:new-project --auto to bootstrap it (~2 min),
   or skip and edit directly?"

If the user declines, run: df-tools project-decline
This suppresses future offers in this project for 30 days.

For trivial changes (single-file, <2 line), proceed directly without offering.`;

/**
 * Auto-init preamble — emitted when user has opted into auto-init mode
 * (auto_init_substantive_projects=true in ~/.claude/devflow/global-config.json).
 *
 * NEW constant — 17-03 per #28 spec.
 * LOCKED TEXT — byte-locked to 17-RESEARCH.md "Locked preamble texts".
 */
const AUTO_INIT_PREAMBLE = `DEVFLOW AUTO-INIT ACTIVE — substantive non-DevFlow project detected

This is a substantive git repository without .planning/, and the user has
opted into auto-init mode (auto_init_substantive_projects=true in
~/.claude/devflow/global-config.json).

When the user submits their first work-flavored request (not Q&A or
exploration), automatically invoke:

  /devflow:new-project --auto

Do NOT prompt. The user has pre-authorized this via global config. If you
need to abort, the user can run: df-tools global-config set auto_init_substantive_projects false

For Q&A or exploration prompts, respond directly without auto-initing.`;

// ─── renderRoutingPreamble ────────────────────────────────────────────────────

/**
 * Pure function — returns the appropriate preamble text for a given mode.
 *
 * @param {object} opts
 * @param {string} opts.mode - 'ambient' | 'init-offer' | 'auto-init' | 'skip' | (any other → '')
 * @returns {string}
 */
function renderRoutingPreamble({ mode }) {
  if (mode === 'ambient') return AMBIENT_PREAMBLE;
  if (mode === 'init-offer') return INIT_OFFER_PREAMBLE;
  if (mode === 'auto-init') return AUTO_INIT_PREAMBLE;  // 17-03: new mode
  return '';
}

// ─── CONSOLIDATED_SKILLS ─────────────────────────────────────────────────────

/**
 * Locked snapshot from 12-RESEARCH.md Phase G handoff (2026-05-06T02:32:48Z).
 * Generated by: node plugins/devflow/devflow/bin/df-tools.cjs skill-route --list --raw
 *
 * ANTI-PATTERN: Do NOT shell out to df-tools to fetch this at runtime.
 * SessionStart hooks are hot-path — subprocess overhead is unacceptable.
 * Drift across versions is acceptable for the routing-table preamble.
 */
const CONSOLIDATED_SKILLS = [
  { name: 'objective',   subcommands: ['add', 'remove'] },
  { name: 'milestone',   subcommands: ['new', 'audit', 'complete', 'gaps'] },
  { name: 'workstreams', subcommands: ['setup', 'status', 'merge', 'run'] },
  { name: 'todo',        subcommands: ['add', 'list'] },
  { name: 'status',      subcommands: [null, 'check', 'pause', 'resume'] },
];

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { classifySession, renderRoutingPreamble, CONSOLIDATED_SKILLS };
