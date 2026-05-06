'use strict';

// Hand-built fixture factories for project-state module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.
// No lorem ipsum, no randomised inputs — explicit named scenarios.
//
// 5 acceptance fixtures from #28:
//   mkAmbientProject        — .planning/ + .git/ + package.json + 5 source files
//   mkBrownfieldSubstantive — git repo (backdated commit) + package.json + 50 source files, no .planning/
//   mkScratchDirInTmp       — under /tmp (not os.tmpdir()!) + package.json
//   mkNoGitProject          — package.json + 5 source files, no .git/
//   (declined project is composed at test time via writeDecline + mkBrownfieldSubstantive)
//
// Manifest variants for detectManifest tests:
//   mkManifestVariant(lang) — dir with the correct manifest file(s) for the given language
//
// Pure-input builder:
//   buildSubstantiveInputs  — constructs the isSubstantive() parameter object

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// ─── Non-scratch temp dir helper ─────────────────────────────────────────────

/**
 * Create a temporary directory that is NOT under any scratch prefix.
 *
 * PROBLEM: On macOS, os.tmpdir() returns /var/folders/... which IS a scratch prefix.
 * Fixtures that should NOT be classified as scratch (e.g. brownfield, ambient, no-git)
 * must use a temp location outside all scratch prefixes: /tmp/, /var/folders/, ~/Downloads/.
 *
 * SOLUTION: Use ~/.devflow-test-fixtures/ — guaranteed non-scratch on all platforms.
 * Callers are responsible for cleanup via fs.rmSync(root, { recursive: true, force: true }).
 *
 * @param {string} prefix - name prefix for the temp dir (e.g. 'ps-brownfield-')
 * @returns {string} absolute path to created temp dir
 */
function mkNonScratchTempDir(prefix) {
  const base = path.join(os.homedir(), '.devflow-test-fixtures');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

// ─── mkAmbientProject ────────────────────────────────────────────────────────

/**
 * Builds an "ambient project" fixture:
 * - Has .planning/ (already initialized by DevFlow)
 * - Has .git/
 * - Has package.json (manifest)
 * - Has 5 source .js files (below the code_files > 10 threshold)
 * - No git commits (git_age_days will be null)
 *
 * Classification: has_planning:true, has_git:true, is_substantive:false
 * (5 files < 10 threshold; null git_age_days → age heuristic also false)
 *
 * @returns {string} absolute path to temp dir
 */
function mkAmbientProject() {
  const root = mkNonScratchTempDir('ps-ambient-');
  fs.mkdirSync(path.join(root, '.planning'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"ambient-project","version":"0.0.0"}');
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `'use strict';\nmodule.exports = ${i};\n`);
  }
  return root;
}

// ─── mkBrownfieldSubstantive ─────────────────────────────────────────────────

/**
 * Builds a "brownfield substantive" fixture:
 * - No .planning/ (not yet initialized)
 * - Has .git/ with a real git history (first commit backdated 30 days ago)
 * - Has package.json (manifest → primary_lang:'javascript')
 * - Has 50 source .js files (well above code_files > 10 threshold)
 *
 * Classification: has_planning:false, has_git:true, git_age_days≥28, code_files:50,
 *                 primary_lang:'javascript', is_substantive:true
 *
 * GOTCHA: Requires git binary. Caller must guard via:
 *   try { execSync('git --version', { stdio: 'ignore' }) } catch { t.skip('git unavailable') }
 *
 * @returns {string} absolute path to temp dir
 */
function mkBrownfieldSubstantive() {
  const root = mkNonScratchTempDir('ps-brownfield-');

  // Initialize a real git repo
  execSync('git init', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@devflow-test.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "DevFlow Test"', { cwd: root, stdio: 'ignore' });

  // Write manifest + 50 source files
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"brownfield-app","version":"1.0.0"}');
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `'use strict';\nmodule.exports = ${i};\n`);
  }

  // Backdated commit: 30 days in the past → git_age_days ≈ 30
  // IMPORTANT: env vars must be on git commit (not git add). git add doesn't record dates.
  // Use two separate commands to avoid shell quoting issues with date strings.
  const past = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  execSync('git add .', { cwd: root, stdio: 'ignore' });
  execSync(`GIT_AUTHOR_DATE='${past}' GIT_COMMITTER_DATE='${past}' git commit -m "init" -q`, {
    cwd: root, shell: '/bin/sh', stdio: 'ignore',
  });

  return root;
}

// ─── mkScratchDirInTmp ───────────────────────────────────────────────────────

/**
 * Builds a "scratch dir" fixture explicitly under /tmp (not os.tmpdir()).
 * On macOS os.tmpdir() returns /var/folders/... — both /tmp and /var/folders
 * are scratch prefixes, but this fixture anchors under /tmp for cross-platform
 * consistency in the isScratchDir test.
 *
 * - Under /tmp (always a scratch prefix)
 * - Has package.json (manifest present)
 *
 * Classification: is_scratch_dir:true → is_substantive:false regardless of other fields
 *
 * @returns {string} absolute path to temp dir under /tmp
 */
function mkScratchDirInTmp() {
  const root = fs.mkdtempSync('/tmp/ps-scratch-');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"scratch","version":"0.0.0"}');
  return root;
}

// ─── mkNoGitProject ──────────────────────────────────────────────────────────

/**
 * Builds a "no git project" fixture:
 * - No .git/ directory
 * - Has package.json (manifest)
 * - Has 5 source .js files (below file threshold)
 *
 * Classification: has_git:false, git_age_days:null, is_substantive:false
 * (5 files < 10 threshold; no git)
 *
 * @returns {string} absolute path to temp dir
 */
function mkNoGitProject() {
  const root = mkNonScratchTempDir('ps-nogit-');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"no-git-project","version":"0.0.0"}');
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(root, `f${i}.js`), `'use strict';\nmodule.exports = ${i};\n`);
  }
  return root;
}

// ─── Manifest variant builder ─────────────────────────────────────────────────

/**
 * Locked manifest→language mapping.
 * Each entry is either a single file descriptor or an array of file descriptors
 * (for the typescript variant which needs both package.json AND tsconfig.json).
 */
const MANIFESTS = {
  javascript: { name: 'package.json', content: '{"name":"x","version":"0.0.0"}' },
  typescript: [
    { name: 'package.json', content: '{"name":"x","version":"0.0.0"}' },
    { name: 'tsconfig.json', content: '{"compilerOptions":{}}' },
  ],
  rust:   { name: 'Cargo.toml',     content: '[package]\nname = "x"\nversion = "0.0.0"' },
  python: { name: 'pyproject.toml', content: '[project]\nname = "x"\nversion = "0.0.0"' },
  go:     { name: 'go.mod',         content: 'module x\n\ngo 1.21\n' },
  ruby:   { name: 'Gemfile',        content: 'source "https://rubygems.org"\n' },
  java:   { name: 'pom.xml',        content: '<project><modelVersion>4.0.0</modelVersion></project>' },
};

/**
 * Create a temp directory with the manifest file(s) for the given language.
 *
 * @param {'javascript'|'typescript'|'rust'|'python'|'go'|'ruby'|'java'} lang
 * @returns {string} absolute path to temp dir
 */
function mkManifestVariant(lang) {
  const root = mkNonScratchTempDir(`ps-manifest-${lang}-`);
  const variant = MANIFESTS[lang];
  if (!variant) throw new Error(`Unknown manifest variant: ${lang}`);
  const files = Array.isArray(variant) ? variant : [variant];
  for (const f of files) {
    fs.writeFileSync(path.join(root, f.name), f.content);
  }
  return root;
}

/**
 * Create a temp directory with NO manifest files (for the has_manifest:false test case).
 *
 * @returns {string} absolute path to temp dir
 */
function mkNoManifest() {
  return mkNonScratchTempDir('ps-nomanifest-');
}

// ─── buildSubstantiveInputs ───────────────────────────────────────────────────

/**
 * Build a pure isSubstantive() input object with explicit, named fields.
 * Used in pure-function tests — no filesystem I/O involved.
 *
 * @param {object} [opts]
 * @param {number|null} [opts.git_age_days=240] - git age in days (null = no git history)
 * @param {number}      [opts.code_files=47]    - source file count
 * @param {boolean}     [opts.has_manifest=true] - manifest file present
 * @param {boolean}     [opts.is_scratch=false]  - is a scratch directory
 * @returns {{ git_age_days: number|null, code_files: number, has_manifest: boolean, is_scratch_dir: boolean }}
 */
function buildSubstantiveInputs({
  git_age_days = 240,
  code_files = 47,
  has_manifest = true,
  is_scratch = false,
} = {}) {
  return { git_age_days, code_files, has_manifest, is_scratch_dir: is_scratch };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  mkAmbientProject,
  mkBrownfieldSubstantive,
  mkScratchDirInTmp,
  mkNoGitProject,
  mkManifestVariant,
  mkNoManifest,
  buildSubstantiveInputs,
};
