'use strict';

/**
 * flutter-ui-eval-resolve.cjs — the ONE, tested implementation of the ui-eval
 * objective-id -> manifest lookup (TRD 33-01, aodex#485 defect 5).
 *
 * The verifier's Step 8c invokes `verify flutter-ui-eval <objective-id>`, but the engine
 * (flutter-ui-eval.cjs) only ever accepted a manifest PATH. That mismatch means the visual
 * gate has never actually run in production — every "advisory"/"binding" rollup this repo
 * has produced was against a `{ error: 'manifest/captureResults not found' }` short-circuit
 * that Step 8c silently routes to SKIPPED.
 *
 * resolveUIEvalTarget(cwd, arg) answers, once, in code:
 *   1. Is this even a Flutter UI objective? (mirrors flutter-state-coverage.cjs's
 *      `fm.type === 'ui' && fm.stack === 'flutter'` gate — reuses the word, not a new one)
 *   2. If so, where is its manifest — and if there isn't one, is that ABSENCE (nothing
 *      written yet) or BREAKAGE (something is there but unusable)?
 *
 * Four distinguishable statuses, never collapsed into one generic error:
 *   - not_applicable — no type:ui + stack:flutter TRD in this objective (or the objective
 *     id doesn't resolve to a directory at all). NEVER a throw — Step 8c's contract is
 *     "never a hard fail", and this module is the layer that promise now runs through.
 *   - absent         — applicable, but no manifest at any lookup tier. `searched[]` names
 *     every location checked, in order, so the operator knows where to put one.
 *   - invalid        — a manifest-shaped file exists but is unparseable, structurally wrong
 *     (no `states` array), or is a `.yaml`/`.yml` file with no `.json` sibling (this repo
 *     has no YAML parser and adds none here — see anti_patterns).
 *   - resolved       — a manifest was found, loaded, and validated. `manifest` carries the
 *     PARSED object on every resolved result, including the explicit-path branch — this is
 *     the contract 33-02's handler depends on (`const manifest = target.manifest`).
 *
 * Lookup order (implemented ONCE, here):
 *   Tier 1  arg names an existing FILE (resolved against cwd)      -> source: 'explicit-path'
 *   Tier 2  <objective_dir>/evidence/ui_eval/manifest.json          -> source: 'objective-evidence'
 *   Tier 3  <cwd>/ui_eval/manifests/*.manifest.json                 -> source: 'repo-manifests'
 *           <cwd>/flutter/ui_eval/manifests/*.manifest.json         (both prefixes; sorted)
 *
 * Reuses (does not re-implement):
 *   - findObjectiveInternal (objective.cjs)     — objective-id -> directory + TRD filenames
 *   - extractFrontmatter (frontmatter.cjs)      — TRD frontmatter parsing
 *   - loadManifest (flutter-ui-eval.cjs)        — fs.readFileSync + JSON.parse + shape-guard.
 *     Required LAZILY (inside the function) to avoid a require cycle: 33-02 requires THIS
 *     module from the handler that flutter-ui-eval.cjs's CLI dispatch lives behind.
 *
 * This module reads the filesystem and nothing else: no network, no new dependency, no
 * YAML parser. It never throws at its callers — every fs call is wrapped, and a garbage
 * id or an unreadable directory resolves to `not_applicable` rather than an exception.
 */

const fs = require('fs');
const path = require('path');
const { findObjectiveInternal } = require('./objective.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// ─── Small fs guards (never throw at the caller) ──────────────────────────────

function isExistingFile(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch (_) {
    return false;
  }
}

function isExistingDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch (_) {
    return false;
  }
}

function readDirSafe(p) {
  try {
    return fs.readdirSync(p);
  } catch (_) {
    return [];
  }
}

// ─── Applicability scan — mirrors flutter-state-coverage.cjs:233-240 ──────────
// BOTH type:ui AND stack:flutter are required (case A3). A TRD with type:ui and no
// stack (or stack:react) is not a Flutter UI TRD.

function isApplicableTRD(fm) {
  return fm && fm.type === 'ui' && fm.stack === 'flutter';
}

function scanApplicability(cwd, info) {
  const uiTrds = [];
  let visualGate = false;

  for (const trdFile of info.jobs || []) {
    try {
      const trdPath = path.join(cwd, info.directory, trdFile);
      const content = fs.readFileSync(trdPath, 'utf-8');
      const fm = extractFrontmatter(content);
      if (isApplicableTRD(fm)) {
        uiTrds.push(trdFile);
        if (fm.visual_gate === true || fm.visual_gate === 'true') {
          visualGate = true;
        }
      }
    } catch (_) {
      // An unreadable/malformed TRD file is skipped, never a throw.
    }
  }

  return { uiTrds, visualGate };
}

// ─── Manifest validation — reuses flutter-ui-eval.cjs's loadManifest ──────────
// Lazy require: flutter-ui-eval.cjs is untouched by this TRD, but 33-02 will require THIS
// module from the handler living behind flutter-ui-eval.cjs's dispatch — a top-level
// require here would create a cycle.

function loadManifestLazy(manifestPath) {
  const { loadManifest } = require('./flutter-ui-eval.cjs');
  return loadManifest(manifestPath);
}

function loadCandidate(candidatePath, extra) {
  let parsed;
  try {
    parsed = loadManifestLazy(candidatePath);
  } catch (e) {
    // 'invalid' NEVER carries a `manifest` field (Case M8).
    const result = { resolution: 'invalid', manifest_path: candidatePath, reason: e.message };
    if (extra.searched) result.searched = extra.searched;
    return result;
  }

  const result = {
    resolution: 'resolved',
    manifest_path: candidatePath,
    manifest: parsed,
    source: extra.source,
  };
  if (extra.searched) result.searched = extra.searched;
  if (extra.additional_candidates && extra.additional_candidates.length > 0) {
    result.additional_candidates = extra.additional_candidates;
  }
  return result;
}

// ─── Tier 2 — <objective_dir>/evidence/ui_eval/manifest.json ──────────────────

function tier2Locate(objectiveDirAbs) {
  const dir = path.join(objectiveDirAbs, 'evidence', 'ui_eval');
  const jsonPath = path.join(dir, 'manifest.json');
  const jsonExists = isExistingFile(jsonPath);

  let yamlPath = null;
  if (!jsonExists && isExistingDir(dir)) {
    const files = readDirSafe(dir);
    const yamlFile = files.find(f => f === 'manifest.yaml' || f === 'manifest.yml');
    if (yamlFile) yamlPath = path.join(dir, yamlFile);
  }

  return { jsonPath, jsonExists, yamlPath };
}

// ─── Tier 3 — <cwd>/ui_eval/manifests/*.manifest.json (+ flutter/ prefix) ─────
// Both prefixes searched; matches sorted lexicographically before picking [0] —
// fs.readdirSync order is not guaranteed across platforms (this repo's gotcha catalog).

function tier3Locate(cwd) {
  const jsonCandidates = [];
  const yamlCandidates = [];
  const searchedDirs = [];

  for (const prefix of ['', 'flutter']) {
    const dir = prefix ? path.join(cwd, prefix, 'ui_eval', 'manifests') : path.join(cwd, 'ui_eval', 'manifests');
    searchedDirs.push(path.join(dir, '*.manifest.json'));

    if (!isExistingDir(dir)) continue;
    const files = readDirSafe(dir);
    for (const f of files) {
      if (f.endsWith('.manifest.json')) jsonCandidates.push(path.join(dir, f));
      else if (f.endsWith('.manifest.yaml') || f.endsWith('.manifest.yml')) yamlCandidates.push(path.join(dir, f));
    }
  }

  jsonCandidates.sort();
  yamlCandidates.sort();

  return { jsonCandidates, yamlCandidates, searchedDirs };
}

// ─── Manifest lookup (only reached once the objective is confirmed applicable) ─

function lookupManifest(cwd, info, uiTrds, visualGate) {
  const objectiveDirAbs = path.join(cwd, info.directory);
  const searched = [];

  const tier2 = tier2Locate(objectiveDirAbs);
  searched.push(tier2.jsonPath);

  const tier3 = tier3Locate(cwd);
  searched.push(...tier3.searchedDirs);

  if (tier2.jsonExists) {
    return loadCandidate(tier2.jsonPath, {
      source: 'objective-evidence',
      searched,
      additional_candidates: tier3.jsonCandidates,
    });
  }

  if (tier3.jsonCandidates.length > 0) {
    return loadCandidate(tier3.jsonCandidates[0], { source: 'repo-manifests', searched });
  }

  // No .json manifest anywhere. Before declaring 'absent', check for a yaml-only sibling
  // at either tier — the file is right there, so this must be 'invalid', never silently
  // treated as absent (that would recreate this objective's bug in a new location).
  const yamlFound = tier2.yamlPath || tier3.yamlCandidates[0] || null;
  if (yamlFound) {
    return {
      resolution: 'invalid',
      manifest_path: yamlFound,
      reason: 'yaml-manifest-unsupported',
      searched,
    };
  }

  return {
    resolution: 'absent',
    objective_dir: info.directory,
    ui_trds: uiTrds,
    visual_gate: visualGate,
    searched,
  };
}

// ─── classifyUIEvalOutcome — the pure routing policy (TRD 33-03) ──────────────
//
// resolveUIEvalTarget answers "what did we find on disk". This function answers "what does
// that mean for the verifier" — a separate, PRODUCT decision that will change over time
// (e.g. the visual_gate ratchet widening), while the filesystem fact above it will not.
//
// The failure mode this function is designed against: replacing a gate that never runs
// with a gate that always gaps is worse, because people disable it. `absent` therefore
// routes to 'missing' — loud enough that nobody thinks the surface was checked, quiet
// enough that the existing backlog does not turn red overnight — with a ratchet that
// flips it to 'gap' once the objective declares `visual_gate: true`.
//
// House style mirrors decideUIEvalDefault (flutter-ui-eval-planner-default.cjs): plain
// object in, plain object out, never throws, failsafe-permissive on garbage input.

/**
 * Pure routing policy. Given what resolveUIEvalTarget found, decide what the verifier does.
 * Never throws; unknown input routes to 'missing' (the safe answer: assume nothing was
 * judged, so the human check must stay queued).
 *
 * @param {{resolution?, visual_gate?, reason?, searched?, manifest_path?, ui_trds?, objective_dir?}} target
 * @returns {{route: 'skip'|'missing'|'gap'|'score',
 *            silent: boolean,
 *            keeps_human_verification: boolean,
 *            note?: string, gap?: string, todo?: string}}
 */
function classifyUIEvalOutcome(target) {
  try {
    const resolution = target && target.resolution;

    if (resolution === 'not_applicable') {
      // The ONLY silent route. Step 8c's existing "run ONLY when this objective has a
      // Flutter UI TRD" gate is why this stays quiet on every non-Flutter objective.
      return { route: 'skip', silent: true, keeps_human_verification: false };
    }

    if (resolution === 'absent') {
      const searched = Array.isArray(target.searched) ? target.searched : [];
      if (target.visual_gate === true) {
        // The ratchet: an objective planned after the gate became auto-required has no
        // excuse for shipping without a manifest.
        return {
          route: 'gap',
          silent: false,
          keeps_human_verification: true,
          gap: 'objective declares visual_gate: true but has no ui-eval manifest',
        };
      }
      // The central product decision this TRD exists to make: MISSING, not skipped and
      // not gapped. Nothing judged this surface, so the human check stays queued — but the
      // absence is recorded, loudly, rather than disappearing the way aodex#485 did.
      return {
        route: 'missing',
        silent: false,
        keeps_human_verification: true,
        note: `no ui-eval manifest found; searched: ${searched.join(', ')}`,
        todo: `author a ui_eval manifest for ${target.objective_dir || 'this objective'}`,
      };
    }

    if (resolution === 'invalid') {
      // A manifest-shaped file exists but is unusable. A defect, not an absence — must
      // never be indistinguishable from 'absent' (33-01's whole point, restated in policy).
      return {
        route: 'gap',
        silent: false,
        keeps_human_verification: true,
        gap: `ui-eval manifest present but unloadable: ${target.reason || 'unknown parse error'}`,
      };
    }

    if (resolution === 'resolved') {
      // Scoring semantics (verdict/gate/binding routing) belong to objective 32's rules at
      // Step 8c — this function does not second-guess them and adds nothing else.
      return { route: 'score', silent: false, keeps_human_verification: true };
    }

    // Failsafe: unknown/garbage resolution. Never throw; assume nothing was judged.
    return { route: 'missing', silent: false, keeps_human_verification: true };
  } catch (_) {
    // Never throw at the caller, matching resolveUIEvalTarget's own contract.
    return { route: 'missing', silent: false, keeps_human_verification: true };
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} cwd
 * @param {string} arg — either an objective id or a manifest/captureResults file path
 * @returns {{resolution: 'not_applicable'|'absent'|'invalid'|'resolved', ...}}
 */
function resolveUIEvalTarget(cwd, arg) {
  try {
    // Tier 1: arg names an existing FILE (path-vs-id discriminator is statSync().isFile(),
    // not a regex — a directory like `.planning` must not be mistaken for a manifest).
    if (typeof arg === 'string' && arg.length > 0) {
      const absArg = path.isAbsolute(arg) ? arg : path.join(cwd, arg);
      if (isExistingFile(absArg)) {
        return loadCandidate(absArg, { source: 'explicit-path' });
      }
    }

    // Otherwise treat arg as an objective id. Pass it through unchanged — findObjectiveInternal
    // owns prefix-matching semantics; do not add a second normalisation layer.
    const info = findObjectiveInternal(cwd, arg);
    if (!info) {
      return { resolution: 'not_applicable', reason: `objective '${arg}' not found` };
    }

    const { uiTrds, visualGate } = scanApplicability(cwd, info);
    if (uiTrds.length === 0) {
      return {
        resolution: 'not_applicable',
        reason: 'no type:ui + stack:flutter TRD',
        objective_dir: info.directory,
      };
    }

    return lookupManifest(cwd, info, uiTrds, visualGate);
  } catch (e) {
    // Step 8c's standing contract: NEVER a hard fail. Any unexpected error resolves to
    // not_applicable with the error recorded, rather than escaping as an exception.
    return { resolution: 'not_applicable', reason: 'resolution error: ' + e.message };
  }
}

module.exports = { resolveUIEvalTarget, classifyUIEvalOutcome };
