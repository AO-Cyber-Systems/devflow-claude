'use strict';

/**
 * flutter-ui-scope.cjs — Flutter UI scope detector.
 *
 * Implements:
 *  - `df-tools detect flutter-ui-scope <objective>`
 *  - In-memory detection for planner agent
 *
 * Pure logic, no LLM, no network. Modeled on novel-domain.cjs.
 * Failsafe-permissive: errors return { detected: false, error: '...' }.
 *
 * Per user correction (2026-05-24): derivePlatform ALWAYS returns ['mobile', 'web']
 * when Flutter UI scope is detected. Both platforms are required coverage.
 * There is no pubspec.platforms.web gating.
 */

const fs = require('fs');
const path = require('path');
const { output } = require('./helpers.cjs');

// ─── Signal 1: lib/**/*.dart in TRD files_modified ───────────────────────────

/**
 * Matches paths that start with `lib/` and end with `.dart`.
 * Does NOT match `test/` or other directories — only the `lib/` tree.
 */
const LIB_DART_RE = /^lib\/.*\.dart$/;

/**
 * Pure function — detects lib/**\/*.dart entries in a files_modified list.
 *
 * @param {string[]} trdFiles
 * @returns {{ fired: boolean, matches: string[] }}
 */
function detectLibDartFiles(trdFiles) {
  if (!Array.isArray(trdFiles)) return { fired: false, matches: [] };
  const matches = trdFiles.filter(f => LIB_DART_RE.test(f));
  return { fired: matches.length > 0, matches };
}

// ─── Signal 2: pubspec.yaml with flutter SDK dep ─────────────────────────────

/**
 * Matches the Flutter SDK dependency block in pubspec.yaml:
 *   flutter:
 *     sdk: flutter
 *
 * Multiline mode required — the key and value appear on adjacent lines.
 */
const PUBSPEC_FLUTTER_DEP_RE = /^\s*flutter\s*:\s*\n\s+sdk\s*:\s*flutter\s*$/m;

/**
 * Pure function — detects Flutter SDK dependency in pubspec.yaml content.
 *
 * @param {string|null} pubspecContent
 * @returns {{ fired: boolean, error?: string }}
 */
function detectPubspecFlutter(pubspecContent) {
  if (!pubspecContent || typeof pubspecContent !== 'string') {
    return { fired: false, error: 'pubspec content empty or not a string' };
  }
  return { fired: PUBSPEC_FLUTTER_DEP_RE.test(pubspecContent) };
}

// ─── Signal 3: Flutter keywords in objective text ────────────────────────────

/**
 * Word-boundary anchored keywords. Capital-initial for Flutter/Riverpod/Bloc
 * to avoid incidental matches. `widget` is lower-case but anchored with \b to
 * avoid substring matches like "kitewidget".
 *
 * Per TRD anti-pattern: do NOT match "flutter" inside "kiteflutter" etc.
 */
const FLUTTER_KEYWORD_RE = /\b(Flutter|widget|Riverpod|Bloc)\b/;

/**
 * Pure function — detects Flutter/widget/Riverpod/Bloc keywords in text.
 * Word-boundary anchored to prevent false positives from substrings.
 *
 * @param {string} text
 * @returns {{ fired: boolean }}
 */
function detectFlutterKeywords(text) {
  if (!text || typeof text !== 'string') return { fired: false };
  return { fired: FLUTTER_KEYWORD_RE.test(text) };
}

// ─── Derived: platform ───────────────────────────────────────────────────────

/**
 * Per user correction (2026-05-24): both platforms are required coverage by
 * default. derivePlatform IGNORES pubspec.platforms.web — it returns
 * ['mobile', 'web'] whenever Flutter UI scope is detected.
 *
 * The pubspecContent argument is retained for future extensibility (e.g., if
 * a TRD author explicitly overrides platform: [mobile] in OBJECTIVE.md context
 * the planner can pass that through), but the DEFAULT behavior is hardcoded
 * both-platforms.
 *
 * @param {string} pubspecContent - unused; kept for future per-TRD overrides
 * @returns {string[]}
 */
function derivePlatform(pubspecContent /* unused — hardcoded both platforms */) {
  return ['mobile', 'web'];
}

// ─── Derived: state_management ───────────────────────────────────────────────

/**
 * Detects state management library from Dart source file contents.
 *
 * Priority (highest first):
 *   1. package:flutter_riverpod → 'riverpod'
 *   2. package:flutter_bloc OR package:bloc → 'bloc'
 *   3. setState( in widget code → 'setState'
 *   4. else → 'other'
 *
 * Per TRD constraint: Patrol, Provider (non-Riverpod), MobX are NOT detected.
 * `package:(flutter_)?bloc\b` uses word boundary to avoid `package:bloc_stuff`.
 *
 * @param {string[]} fileContents - array of Dart source file contents
 * @returns {'riverpod'|'bloc'|'setState'|'other'}
 */
function deriveStateManagement(fileContents) {
  if (!Array.isArray(fileContents) || fileContents.length === 0) return 'other';
  const joined = fileContents.join('\n');
  if (/package:flutter_riverpod/.test(joined)) return 'riverpod';
  if (/package:(flutter_)?bloc\b/.test(joined)) return 'bloc';
  if (/setState\s*\(/.test(joined)) return 'setState';
  return 'other';
}

// ─── Composer ────────────────────────────────────────────────────────────────

/**
 * Pure function — aggregates all three signals and derives platform/state_management.
 *
 * Failsafe-permissive: if all three input categories are empty/absent, returns
 * { detected: false, error: 'no inputs' } and never throws.
 *
 * @param {object} opts
 * @param {string[]} [opts.trdFiles] - files_modified entries from drafted TRDs
 * @param {string} [opts.pubspecContent] - raw pubspec.yaml content
 * @param {string[]} [opts.descriptions] - description text strings to keyword-scan
 * @param {string[]} [opts.fileContents] - Dart source file contents (for state_management)
 * @returns {{
 *   detected: boolean,
 *   signals: object,
 *   platform?: string[],
 *   state_management?: string,
 *   error?: string
 * }}
 */
function detectFlutterUIScope({ trdFiles, pubspecContent, descriptions, fileContents } = {}) {
  // Failsafe: no inputs at all
  const noTrdFiles = !Array.isArray(trdFiles) || trdFiles.length === 0;
  const noPubspec = !pubspecContent || pubspecContent === '';
  const noDescriptions = !Array.isArray(descriptions) || descriptions.length === 0;
  if (noTrdFiles && noPubspec && noDescriptions) {
    return { detected: false, error: 'no inputs' };
  }

  const signals = {
    lib_dart_files: detectLibDartFiles(trdFiles || []),
    pubspec_flutter_dep: detectPubspecFlutter(pubspecContent || ''),
    flutter_keywords: {
      fired: (descriptions || []).some(d => detectFlutterKeywords(d).fired),
    },
  };

  const detected = Object.values(signals).some(s => s.fired);
  const result = { detected, signals };

  if (detected) {
    result.platform = derivePlatform(pubspecContent);
    result.state_management = deriveStateManagement(fileContents || []);
  }

  return result;
}

// ─── df-tools command handler ────────────────────────────────────────────────

/**
 * CLI handler for `df-tools detect flutter-ui-scope <objective> [--raw]`.
 *
 * Gathers signal inputs from the objective's on-disk TRDs:
 *   - files_modified arrays (both block-array and inline-array shapes)
 *   - pubspec.yaml at cwd (cross-repo consumer scanning deferred — RESEARCH.md Q4)
 *   - TRD body text for keyword scanning (descriptions)
 *   - any .dart files listed in files_modified that exist on disk (fileContents)
 *
 * Failsafe-permissive: any I/O failure returns { detected: false, error: ... }.
 *
 * @param {string} cwd
 * @param {string} objectiveArg - objective number or slug
 * @param {boolean} raw
 */
function cmdDetectFlutterUIScope(cwd, objectiveArg, raw) {
  // Failsafe: no objective argument
  if (!objectiveArg) {
    output({ detected: false, error: 'objective argument required' }, raw);
    return;
  }

  // Find .planning/objectives directory
  const objectivesRoot = path.join(cwd, '.planning', 'objectives');
  if (!fs.existsSync(objectivesRoot)) {
    output({ detected: false, error: `no .planning/objectives directory in ${cwd}` }, raw);
    return;
  }

  // Find directory matching the objective number/slug
  // Supports: '99' → '99-*', '10' → '10-*', slug match
  const padded = String(objectiveArg).padStart(2, '0');
  const dirs = fs.readdirSync(objectivesRoot).filter(d => {
    return d.startsWith(padded + '-') || d === objectiveArg;
  });
  if (dirs.length === 0) {
    output({ detected: false, error: `no objective directory matching ${objectiveArg}` }, raw);
    return;
  }
  const objDir = path.join(objectivesRoot, dirs[0]);

  // Gather TRD files_modified and body text from all TRDs in the directory
  const trdFiles = [];
  const descriptions = [];

  let trdEntries;
  try {
    trdEntries = fs.readdirSync(objDir).filter(f => f.endsWith('-TRD.md'));
  } catch (e) {
    output({ detected: false, error: `failed to read objective directory: ${e.message}` }, raw);
    return;
  }

  for (const f of trdEntries) {
    let trdContent;
    try {
      trdContent = fs.readFileSync(path.join(objDir, f), 'utf-8');
    } catch (e) {
      continue; // Skip unreadable TRDs — failsafe
    }

    // Extract frontmatter block
    const fmMatch = trdContent.match(/^---\n([\s\S]+?)\n---/);
    if (fmMatch) {
      const fmBody = fmMatch[1];

      // Shape 1: block-array (multi-line)
      //   files_modified:
      //     - lib/foo.dart
      //     - lib/bar.dart
      const filesBlock = fmBody.match(/files_modified:\s*\n((?:\s+-\s+.+\n?)+)/);
      if (filesBlock) {
        for (const line of filesBlock[1].split('\n')) {
          const m = line.match(/^\s+-\s+(.+)$/);
          if (m) trdFiles.push(m[1].trim());
        }
      }

      // Shape 2: inline array
      //   files_modified: [lib/foo.dart, lib/bar.dart]
      const inlineBlock = fmBody.match(/files_modified:\s*\[([^\]]+)\]/);
      if (inlineBlock) {
        inlineBlock[1].split(',').forEach(p => {
          const t = p.trim();
          if (t) trdFiles.push(t);
        });
      }
    }

    // Add full TRD body as description source for keyword scanning
    descriptions.push(trdContent);
  }

  // Read pubspec.yaml at cwd (may not exist for non-Flutter projects — silent)
  const pubspecPath = path.join(cwd, 'pubspec.yaml');
  const pubspecContent = fs.existsSync(pubspecPath)
    ? (() => { try { return fs.readFileSync(pubspecPath, 'utf-8'); } catch { return ''; } })()
    : '';

  // Read source-file contents for state_management detection
  // (only .dart files in trdFiles that actually exist on disk)
  const fileContents = [];
  for (const f of trdFiles) {
    if (f.endsWith('.dart')) {
      const abs = path.isAbsolute(f) ? f : path.join(cwd, f);
      if (fs.existsSync(abs)) {
        try {
          fileContents.push(fs.readFileSync(abs, 'utf-8'));
        } catch {
          // Skip unreadable files — failsafe
        }
      }
    }
  }

  const result = detectFlutterUIScope({ trdFiles, pubspecContent, descriptions, fileContents });

  // Add evidence metadata for callers
  result.evidence = {
    objDir,
    trdFiles_count: trdFiles.length,
    trd_count: trdEntries.length,
  };

  output(result, raw);
}

module.exports = {
  detectLibDartFiles,
  detectPubspecFlutter,
  detectFlutterKeywords,
  derivePlatform,
  deriveStateManagement,
  detectFlutterUIScope,
  cmdDetectFlutterUIScope,
};
