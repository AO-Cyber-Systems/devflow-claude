'use strict';

/**
 * flutter-ui-eval-bootstrap.cjs — UI-visual-eval scaffolder (P4).
 *
 * Sibling to flutter-ui-bootstrap.cjs. Scaffolds the visual-eval wiring into any
 * `stack:flutter` repo so every Flutter project inherits the eden-biz hand-wiring
 * as a generated default:
 *   - a Shape-A manifest skeleton (ui_eval/manifests/web.manifest.json)
 *   - a capture-adapter stub (web_e2e/lib/uiEval/captureWeb.js)
 *   - baseline dirs (web __screenshots__ + widget goldens)
 *   - a `ui_eval` Playwright project entry (playwright.config.js)
 *   - a `.planning/.flutter-ui-eval-bootstrap-done` marker (written LAST)
 *
 * Pure logic, no LLM, no network. Two-part split mirrors flutter-ui-bootstrap.cjs:
 *   - checkScaffoldState({ projectDir })  — PURE planner (existence-reads only, no writes)
 *   - scaffoldUIEval({ projectDir })      — impure writer (idempotent, marker-last)
 *   - cmdFlutterUIEvalBootstrap(...)       — CLI I/O wrapper
 *
 * Flutter detection is delegated to detectPubspecFlutter from flutter-ui-scope.cjs
 * (locked reuse per OBJECTIVE.md P4 — no reinvented pubspec parse).
 */

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');
const { detectPubspecFlutter } = require('./flutter-ui-scope.cjs');

// ─── Canonical scaffold target paths (repo-relative) ─────────────────────────

const MANIFEST_REL = path.join('ui_eval', 'manifests', 'web.manifest.json');
const ADAPTER_REL = path.join('web_e2e', 'lib', 'uiEval', 'captureWeb.js');
const BASELINE_WEB_REL = path.join('web_e2e', 'tests', 'ui_eval', '__screenshots__');
const BASELINE_GOLDENS_REL = path.join('test', 'ui_eval', 'goldens');
const PLAYWRIGHT_REL = 'playwright.config.js';
const MARKER_REL = path.join('.planning', '.flutter-ui-eval-bootstrap-done');

// Token used to detect (and to mark) the `ui_eval` Playwright project entry.
const PLAYWRIGHT_PROJECT_TOKEN = "name: 'ui_eval'";

// ─── checkScaffoldState (pure planner) ───────────────────────────────────────

/**
 * Pure function: decide what UI-visual-eval scaffolding is missing in projectDir.
 * Performs existence-reads only — NEVER writes.
 *
 * @param {object} opts
 * @param {string} opts.projectDir - absolute path to the candidate repo root
 * @returns {{ action:'scaffold'|'skip', missing:string[], reason?:string }}
 */
function checkScaffoldState({ projectDir }) {
  if (!projectDir) {
    return { action: 'skip', missing: [], reason: 'projectDir-required' };
  }

  // Flutter gate — reuse detectPubspecFlutter (no reinvented pubspec parse).
  const pubspecPath = path.join(projectDir, 'pubspec.yaml');
  const pubspecContent = fs.existsSync(pubspecPath) ? safeRead(pubspecPath) : '';
  if (!detectPubspecFlutter(pubspecContent).fired) {
    return { action: 'skip', missing: [], reason: 'flutter-not-detected' };
  }

  const missing = [];

  if (!fs.existsSync(path.join(projectDir, MANIFEST_REL))) missing.push('manifest');
  if (!fs.existsSync(path.join(projectDir, ADAPTER_REL))) missing.push('adapter');

  const baselineDirsPresent =
    fs.existsSync(path.join(projectDir, BASELINE_WEB_REL)) &&
    fs.existsSync(path.join(projectDir, BASELINE_GOLDENS_REL));
  if (!baselineDirsPresent) missing.push('baseline_dirs');

  if (!playwrightProjectPresent(projectDir)) missing.push('playwright_project');

  if (missing.length === 0) {
    return { action: 'skip', missing: [] };
  }
  return { action: 'scaffold', missing };
}

// ─── scaffoldUIEval (impure writer) — implemented in next TDD cycle ──────────

function scaffoldUIEval(/* { projectDir } */) {
  throw new Error('scaffoldUIEval not implemented — scaffolded stub');
}

// ─── internals ───────────────────────────────────────────────────────────────

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function playwrightProjectPresent(projectDir) {
  const cfg = path.join(projectDir, PLAYWRIGHT_REL);
  if (!fs.existsSync(cfg)) return false;
  return (safeRead(cfg) || '').includes(PLAYWRIGHT_PROJECT_TOKEN);
}

module.exports = {
  checkScaffoldState,
  scaffoldUIEval,
};
