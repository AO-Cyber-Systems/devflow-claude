#!/usr/bin/env node

/**
 * DevFlow Edit Gate (PreToolUse, Edit|Write|MultiEdit)
 *
 * Strict DENY by default in ambient mode (DevFlow project detected, no skill running).
 *
 * Three escape hatches:
 *   1. .planning/.skill-active marker file — written by `df-tools skill-active --start`,
 *      removed by `--end`. Indicates an executor/skill is actively running.
 *   2. Override phrase in user prompt — detected by route-intent.js (UserPromptSubmit)
 *      which writes .planning/.edit-override; this hook consumes the marker
 *      (single-turn, TTL-bounded). Phrases: "skip devflow", "just edit",
 *      "bypass devflow", "force edit".
 *   3. DEVFLOW_SKIP_EDIT_GATE=1 env var — debugging / manual escape hatch.
 *   4. .planning/config.json → gates.editGate: "warn" | "strict" | "off"
 *      (default "strict", unchanged from above). "warn" softens the deny into
 *      permissionDecision 'ask' (visible but non-blocking) — see Prior behavior
 *      note below. "off" disables the gate entirely for that project (hook
 *      emits nothing, same as DEVFLOW_SKIP_EDIT_GATE=1). Any missing file/key,
 *      malformed JSON, or unrecognized value falls back to "strict" — never
 *      silently softens the gate.
 *
 * Permits edits to:
 *   - .planning/**        (planning artifacts are edited directly)
 *   - *.md docs           (documentation always allowed)
 *
 * Non-modifying tools (Read, Grep, Glob, etc.) never fire this hook — the
 * hooks.json matcher is `Edit|Write|MultiEdit`. Defensive guard inside handles
 * future matcher changes.
 *
 * Non-DevFlow projects (no .planning/) — hook no-ops.
 *
 * Prior behavior: `permissionDecision: 'ask'` warn-only + `DEVFLOW_STRICT_EDITS=1`
 * hard-deny. The new default IS strict deny. Migrate env var references:
 *   Old: DEVFLOW_STRICT_EDITS=1 (opt-in strict)
 *   New: DEVFLOW_SKIP_EDIT_GATE=1 (opt-out from strict)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Shared lib — single source of truth for phrases + marker lifecycle
// ---------------------------------------------------------------------------

const {
  OVERRIDE_PHRASES,
  hasOverridePhrase,
  consumeEditOverrideMarker,
} = require('./lib/edit-override.js');

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable without side effects)
// ---------------------------------------------------------------------------

/**
 * Walk up from `start` to find the nearest `.planning` directory.
 * Returns the full path to `.planning` or null if not found.
 */
function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Walk up from `start` to the nearest directory containing `.git`
 * (a directory in a normal checkout, a file in a linked worktree).
 */
function findRepoRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * The MAIN checkout's `.planning/`, resolved from anywhere inside a linked
 * worktree. Returns null when unresolvable or absent.
 *
 * TRD 27-01 — `.planning/.skill-active` is gitignored (.gitignore:44), so a
 * worktree checks out all tracked `.planning` files but NEVER the marker.
 * Resolving only from cwd therefore denied every worktree-isolated agent —
 * 77.2% of all edit-gate denials in the 2026-08-18 audit.
 *
 * Deliberately does not shell out to git: hooks run on every Edit/Write and
 * must stay cheap and dependency-free.
 */
function sharedPlanningDir(start) {
  const repoRoot = findRepoRoot(start);
  if (!repoRoot) return null;

  let mainRoot = repoRoot;
  try {
    // In a worktree, `.git` is a file: "gitdir: /main/.git/worktrees/<name>"
    const raw = fs.readFileSync(path.join(repoRoot, '.git'), 'utf8');
    const m = /^gitdir:\s*(.+)$/m.exec(String(raw));
    if (m) {
      const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
      const idx = m[1].trim().indexOf(marker);
      if (idx !== -1) mainRoot = m[1].trim().slice(0, idx);
    }
  } catch {
    // `.git` is a directory → already the main checkout
  }

  const p = path.join(mainRoot, '.planning');
  return fs.existsSync(p) ? p : null;
}

/**
 * True if a live `.skill-active` marker exists in EITHER the caller's own
 * `.planning/` or the MAIN checkout's `.planning/`.
 *
 * A marker carrying an `expires_at` in the past does not count — a crashed
 * skill must not hold the gate open forever. Markers written before TRD 27-01
 * have no `expires_at` and never expire (back-compat).
 *
 * @param {string|null} planningDir
 * @param {string|null} [sharedDir]
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function hasSkillActiveMarker(planningDir, sharedDir, nowMs) {
  const at = Number.isFinite(nowMs) ? nowMs : Date.now();
  const dirs = [];
  if (planningDir) dirs.push(planningDir);
  if (sharedDir && sharedDir !== planningDir) dirs.push(sharedDir);

  for (const dir of dirs) {
    const p = path.join(dir, '.skill-active');
    if (!fs.existsSync(p)) continue;
    try {
      const marker = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (marker && marker.expires_at) {
        const t = Date.parse(marker.expires_at);
        if (Number.isFinite(t) && at > t) continue; // expired — keep looking
      }
    } catch {
      // Unparseable marker still counts as active (fail open — prior behavior)
    }
    return true;
  }
  return false;
}

/**
 * Per-repo edit-gate severity knob (TRD 25-02).
 * Valid values only — any missing file/key, malformed JSON, or unrecognized
 * value falls back to 'strict'. Never silently soften the gate on a read failure.
 */
const VALID_EDIT_GATE_MODES = new Set(['strict', 'warn', 'off']);

/**
 * Reads `.planning/config.json` → `gates.editGate` ('warn'|'strict'|'off').
 * Defaults to 'strict' on any missing/malformed/unrecognized input.
 *
 * @param {string|null} planningDir
 * @returns {'strict'|'warn'|'off'}
 */
function readEditGateMode(planningDir) {
  try {
    if (!planningDir) return 'strict';
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return 'strict';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const mode = config.gates && config.gates.editGate;
    return VALID_EDIT_GATE_MODES.has(mode) ? mode : 'strict';
  } catch {
    return 'strict';
  }
}

/**
 * True when `filePath` resolves outside `projectRoot`.
 *
 * Conservative by design: a relative path (whose meaning depends on the
 * agent's cwd) or a missing root returns false, so the gate still applies.
 * Only an unambiguous absolute path outside the project is exempted.
 *
 * @param {string|null} projectRoot
 * @param {string} filePath
 * @returns {boolean}
 */
function realpathDeep(p) {
  // realpathSync fails on a path that does not exist yet (Write of a new file,
  // possibly into a new directory). Resolve the deepest ancestor that DOES
  // exist and re-append the remaining segments.
  let cur = path.resolve(p);
  const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...tail); } catch { /* keep walking up */ }
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(p); // hit the root, nothing resolvable
    tail.unshift(path.basename(cur));
    cur = parent;
  }
}

function isOutsideProject(projectRoot, filePath) {
  if (!projectRoot || !filePath || !path.isAbsolute(filePath)) return false;

  // Symlink-aware: on macOS `process.cwd()` reports /private/var/... while the
  // tool payload carries /var/... (and likewise /tmp vs /private/tmp). Comparing
  // raw strings would call an in-project file "outside" and silently open the
  // gate, so compare every spelling we can resolve and treat "inside by any of
  // them" as inside — the conservative direction.
  const roots = new Set([path.resolve(projectRoot), realpathDeep(projectRoot)]);
  const targets = new Set([path.resolve(filePath), realpathDeep(filePath)]);

  for (const root of roots) {
    for (const target of targets) {
      const rel = path.relative(root, target);
      const outside = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
      if (!outside) return false; // inside by at least one resolution — gate applies
    }
  }
  return true;
}

/**
 * Core gate decision — pure function, no I/O.
 *
 * @param {object} opts
 * @param {string} opts.tool         - Tool name (e.g. 'Edit', 'Write', 'Read')
 * @param {string} opts.filePath     - Target file path (tool_input.file_path)
 * @param {string|null} opts.planningDir  - Ancestor .planning dir or null
 * @param {boolean} opts.skillActive - True if .skill-active marker exists
 * @param {boolean} opts.overrideActive  - True if .edit-override marker was fresh (consumed)
 * @returns {{ decision: 'deny'|'allow'|'noop', reason?: string }}
 */
function shouldGate({ tool, filePath, planningDir, skillActive, overrideActive }) {
  // Only gate Edit/Write/MultiEdit — defensive check for future matcher changes
  if (!/^(Edit|Write|MultiEdit)$/.test(tool)) return { decision: 'noop' };

  if (!filePath) return { decision: 'noop' };

  // Always allow planning artifacts (planning docs are edited directly)
  if (/\/\.planning\//.test(filePath)) return { decision: 'allow', reason: 'planning artifact' };

  // Always allow markdown documentation
  if (/\.md$/i.test(filePath)) return { decision: 'allow', reason: 'markdown doc' };

  // Non-DevFlow project — gate doesn't apply
  if (!planningDir) return { decision: 'noop' };

  // TRD 27-02 — the target is not in this project at all (session scratchpad,
  // /private/tmp, another repo). DevFlow's atomic-commit guarantee only covers
  // files it can commit, so gating these buys nothing. 20.6% of all edit-gate
  // denials in the 2026-08-18 audit were scratchpad/tmp writes.
  if (isOutsideProject(path.dirname(planningDir), filePath)) {
    return { decision: 'allow', reason: 'target outside project root' };
  }

  // Escape hatch: active skill marker
  if (skillActive) return { decision: 'allow', reason: 'skill-active marker present' };

  // Escape hatch: user override phrase (via .edit-override marker consumed in main())
  if (overrideActive) return { decision: 'allow', reason: 'user override phrase detected' };

  // Default: DENY in ambient mode
  return {
    decision: 'deny',
    reason: [
      'DevFlow ambient mode active — direct Edit/Write/MultiEdit denied.',
      'Route through a /devflow: skill so atomic commits + state tracking + verification fire correctly.',
      'For a tiny ad-hoc fix, prefer /devflow:quick.',
      'To bypass this gate explicitly, include "skip devflow" or "just edit" in your prompt.',
      'Skills mark themselves active via df-tools skill-active --start <name> / --end.',
    ].join(' '),
  };
}

// ---------------------------------------------------------------------------
// Entry point (run as hook)
// ---------------------------------------------------------------------------

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  // Env var escape hatch — disable the gate entirely for debugging
  if (process.env.DEVFLOW_SKIP_EDIT_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }

  const tool = input.tool_name;
  const filePath = (input.tool_input && input.tool_input.file_path) || '';

  const planningDir = findPlanningDir(process.cwd());
  const sharedDir = sharedPlanningDir(process.cwd());
  const editGateMode = readEditGateMode(planningDir);
  if (editGateMode === 'off') return; // project opted out entirely

  // TRD 27-01 — check the MAIN checkout's marker too, so worktree-isolated
  // agents are not denied by a marker they can never see.
  const skillActive = hasSkillActiveMarker(planningDir, sharedDir);
  // Override phrase is signaled via .edit-override marker written by route-intent.js
  // (route-intent runs on UserPromptSubmit which has access to the prompt text;
  //  PreToolUse payloads carry no user_message/prompt field — consume the marker instead)
  const overrideActive = consumeEditOverrideMarker(planningDir);

  const result = shouldGate({ tool, filePath, planningDir, skillActive, overrideActive });

  if (result.decision === 'noop' || result.decision === 'allow') return;

  // DENY (or ASK in 'warn' mode) — emit the structured hook output
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: editGateMode === 'warn' ? 'ask' : 'deny',
      permissionDecisionReason: result.reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) main();

// ---------------------------------------------------------------------------
// Exports (for unit tests)
// Back-compat: OVERRIDE_PHRASES and hasOverridePhrase are re-exported from
// lib/edit-override.js so existing imports (route-intent TRD 24-02, tests) keep working.
// ---------------------------------------------------------------------------

module.exports = {
  OVERRIDE_PHRASES,
  hasSkillActiveMarker,
  sharedPlanningDir,
  findRepoRoot,
  isOutsideProject,
  hasOverridePhrase,
  shouldGate,
  findPlanningDir,
  readEditGateMode,
  VALID_EDIT_GATE_MODES,
};
