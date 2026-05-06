'use strict';

/**
 * project-state.cjs — Project substantiveness detection for DevFlow auto-init (Phase C, C1)
 *
 * Implements `df-tools project-state [<cwd>]`:
 * - Pure logic helpers (isSubstantive, isScratchDir, detectManifest, countSourceFiles, gitAgeDays)
 * - I/O assembly (getProjectState)
 * - CLI entry (cmdProjectState)
 *
 * Output schema (locked per #28):
 * {
 *   "has_planning":       boolean,   — .planning/ exists
 *   "has_git":            boolean,   — .git/ exists
 *   "git_age_days":       number|null, — days since first commit; null = no git history
 *   "code_files":         number,    — source files (excluding node_modules/.git/.planning etc.)
 *   "primary_lang":       string|null, — detected from manifest file
 *   "is_substantive":     boolean,   — ((git_age_days > 7) OR (code_files > 10)) AND has_manifest AND NOT is_scratch_dir
 *   "previously_declined": boolean,  — user declined DevFlow init for this cwd
 *   "decline_expires":    string|null — ISO 8601 expiry timestamp or null
 * }
 *
 * Substantive heuristic (locked per #28 + 17-CONTEXT §"Locked decisions"):
 *   is_substantive = ((git_age_days > 7) OR (code_files > 10))
 *                    AND has_manifest
 *                    AND NOT is_scratch_dir
 *
 * Phase C integration: classify-session.js (17-03) consumes getProjectState() JSON
 * to decide between init-offer mode and skip mode for non-DevFlow projects.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { output, error } = require('./helpers.cjs');
const { readDecline } = require('./decline-tracker.cjs');

// ─── Pure functions (testable without filesystem) ─────────────────────────────

/**
 * Unconditional scratch directory prefixes.
 * Paths starting with any of these are always considered scratch/ephemeral.
 * Note: ~/Downloads is handled separately via os.homedir() below.
 */
const SCRATCH_PREFIXES = [
  '/tmp/',
  '/var/folders/',
];

/**
 * Determine if the given absolute path is a scratch/ephemeral directory.
 * Scratch dirs are excluded from the substantiveness heuristic.
 *
 * Scratch prefixes (locked per #28):
 *   - /tmp/... (Linux + macOS Linux compat)
 *   - /var/folders/... (macOS default os.tmpdir())
 *   - ~/Downloads/... (resolved via os.homedir() + '/Downloads')
 *
 * GOTCHA: /tmp on macOS is a symlink to /private/tmp. We check the path AS PROVIDED
 * (no realpath resolution) — tests should use the same form.
 *
 * @param {string} absPath - absolute path to check (not normalized via realpath)
 * @returns {boolean}
 */
function isScratchDir(absPath) {
  // Match unconditional scratch prefixes
  for (const prefix of SCRATCH_PREFIXES) {
    if (absPath.startsWith(prefix)) return true;
  }

  // Match ~/Downloads/ — resolved via os.homedir() (not HOME env var)
  // Also match the Downloads dir itself (without trailing sep)
  const homeDownloads = path.join(os.homedir(), 'Downloads');
  if (absPath === homeDownloads || absPath.startsWith(homeDownloads + path.sep)) {
    return true;
  }

  return false;
}

/**
 * Evaluate the substantiveness heuristic from already-evaluated inputs.
 * No filesystem I/O — takes pre-computed values.
 *
 * Heuristic (locked per #28):
 *   is_substantive = ((git_age_days > 7) OR (code_files > 10))
 *                    AND has_manifest
 *                    AND NOT is_scratch_dir
 *
 * @param {object} opts
 * @param {number|null} opts.git_age_days  - days since first commit; null treated as 0 (not age-substantive)
 * @param {number}      opts.code_files    - source file count
 * @param {boolean}     opts.has_manifest  - manifest file detected
 * @param {boolean}     opts.is_scratch_dir - is a scratch/ephemeral directory
 * @returns {boolean}
 */
function isSubstantive({ git_age_days, code_files, has_manifest, is_scratch_dir }) {
  // Guard: scratch dirs are never substantive
  if (is_scratch_dir) return false;

  // Guard: no manifest → not a recognized project
  if (!has_manifest) return false;

  // Heuristic: at least one of (old enough git history OR enough source files)
  // git_age_days = null means no commits → null > 7 is false in JS → treat as 0
  const ageOk = (git_age_days !== null && git_age_days > 7);
  const filesOk = (code_files > 10);

  return ageOk || filesOk;
}

/**
 * Locked manifest→language mapping.
 * Order matters: first match wins. package.json checked first.
 */
const MANIFEST_LANG = [
  ['package.json',   'javascript'],  // refined to 'typescript' when tsconfig.json present
  ['Cargo.toml',     'rust'],
  ['pyproject.toml', 'python'],
  ['go.mod',         'go'],
  ['Gemfile',        'ruby'],
  ['pom.xml',        'java'],
];

/**
 * Detect the primary language from manifest files in the project root.
 * First match wins (per MANIFEST_LANG order).
 *
 * Special case: package.json + tsconfig.json → 'typescript' (not 'javascript').
 *
 * @param {string} rootDir - absolute path to the project root
 * @returns {{ has_manifest: boolean, primary_lang: string|null }}
 */
function detectManifest(rootDir) {
  for (const [filename, lang] of MANIFEST_LANG) {
    if (fs.existsSync(path.join(rootDir, filename))) {
      // Refine package.json → 'typescript' when tsconfig.json is also present
      if (filename === 'package.json' && fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
        return { has_manifest: true, primary_lang: 'typescript' };
      }
      return { has_manifest: true, primary_lang: lang };
    }
  }
  return { has_manifest: false, primary_lang: null };
}

// ─── File counting (mirrors brownfield-detector.cjs exactly) ─────────────────

/**
 * Directory names excluded at every level of the walk.
 * Matches brownfield-detector.cjs EXCLUDE set — must not diverge.
 */
const EXCLUDE = new Set([
  'node_modules',
  '.git',
  '.planning',
  'dist',
  'build',
  '.next',
  'out',
  'coverage',
]);

/**
 * Source file extensions to count.
 * Matches brownfield-detector.cjs EXTS set — must not diverge.
 */
const EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.py', '.go', '.rs', '.rb', '.java',
]);

/**
 * Recursively count source files under root, excluding directories in EXCLUDE.
 * Mirrors brownfield-detector.cjs:countSourceFiles exactly.
 * - ENOENT / EACCES on a subdirectory → skip that dir, continue (never crash)
 * - Symlinks: isDirectory() returns false → naturally skipped
 *
 * PARALLEL NOTE: This function is intentionally duplicated from brownfield-detector.cjs.
 * Extract to a shared helper on third use (per TRD comment).
 *
 * @param {string} root - absolute path to walk
 * @returns {number}
 */
function countSourceFiles(root) {
  let count = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // ENOENT, EACCES, permission denied, etc. — skip and continue
      return;
    }

    for (const e of entries) {
      // Skip excluded directory names (by name, not full path)
      if (EXCLUDE.has(e.name)) continue;

      // Skip dotdirs (e.g. .vscode) — but allow dotfiles (e.g. .eslintrc.cjs)
      if (e.isDirectory() && e.name.startsWith('.')) continue;

      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile() && EXTS.has(path.extname(e.name))) {
        count++;
      }
      // Symlinks: isDirectory() false, isFile() false → ignored (no circular following)
    }
  }

  walk(root);
  return count;
}

// ─── I/O wrappers ────────────────────────────────────────────────────────────

/**
 * Compute the number of days since the first git commit in the repo at cwd.
 * Returns null when:
 *   - No git binary available (ENOENT)
 *   - No .git directory / not a git repo (non-zero exit)
 *   - No commits yet (empty output)
 *   - Timeout exceeded (2s — hard limit to avoid blocking SessionStart)
 *
 * @param {string} cwd - absolute path to the git repository root
 * @returns {number|null}
 */
function gitAgeDays(cwd) {
  try {
    const r = spawnSync('git', ['log', '--reverse', '--format=%ct', '-n', '1'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (r.error || r.status !== 0) return null;

    const firstCommitUnix = parseInt(r.stdout.trim(), 10);
    if (isNaN(firstCommitUnix)) return null;

    const nowUnix = Math.floor(Date.now() / 1000);
    return Math.floor((nowUnix - firstCommitUnix) / 86400);
  } catch {
    // ENOENT (no git binary), permission errors, etc.
    return null;
  }
}

/**
 * Assemble the full project state for the given directory.
 * Composes pure helpers + I/O + decline tracking.
 *
 * @param {string} cwd - absolute path to the project directory
 * @param {object} [opts]
 * @param {string} [opts.now] - ISO 8601 timestamp for decline expiry check (default: current time)
 * @returns {{
 *   has_planning: boolean,
 *   has_git: boolean,
 *   git_age_days: number|null,
 *   code_files: number,
 *   primary_lang: string|null,
 *   is_substantive: boolean,
 *   previously_declined: boolean,
 *   decline_expires: string|null
 * }}
 */
function getProjectState(cwd, { now = new Date().toISOString() } = {}) {
  const root = path.resolve(cwd);

  // 1. Filesystem checks
  const has_planning = fs.existsSync(path.join(root, '.planning'));
  const has_git = fs.existsSync(path.join(root, '.git'));
  const code_files = countSourceFiles(root);
  const { has_manifest, primary_lang } = detectManifest(root);
  const is_scratch_dir = isScratchDir(root);

  // 2. Git age (only meaningful when .git exists)
  const git_age_days = has_git ? gitAgeDays(root) : null;

  // 3. Decline tracking (from 17-02 decline-tracker)
  let decline = { declined: false, expires_at: null };
  try {
    decline = readDecline(root, { now });
  } catch (e) {
    // fail-open: decline tracking is best-effort; don't crash the whole command
    process.stderr.write(`[project-state] decline read failed: ${e.message}\n`);
  }

  // 4. Substantiveness heuristic
  const is_substantive = isSubstantive({
    git_age_days,
    code_files,
    has_manifest,
    is_scratch_dir,
  });

  return {
    has_planning,
    has_git,
    git_age_days,
    code_files,
    primary_lang,
    is_substantive,
    previously_declined: decline.declined,
    decline_expires: decline.expires_at,
  };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/**
 * CLI handler for `df-tools project-state [<cwd>] [--raw]`
 *
 * @param {string} cwd       - process.cwd() (default root for resolution)
 * @param {string} targetCwd - optional override path (args[1] from CLI)
 * @param {boolean} raw      - --raw flag (true = compact JSON, false = pretty JSON)
 */
function cmdProjectState(cwd, targetCwd, raw) {
  const root = targetCwd ? path.resolve(targetCwd) : cwd;

  if (!fs.existsSync(root)) {
    process.stderr.write(`Error: cwd not found: ${root}\n`);
    process.exit(1);
    return; // unreachable — process.exit throws in test harness
  }

  const state = getProjectState(root);
  output(state, raw, JSON.stringify(state));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  isSubstantive,
  isScratchDir,
  detectManifest,
  countSourceFiles,
  gitAgeDays,
  getProjectState,
  cmdProjectState,
};
