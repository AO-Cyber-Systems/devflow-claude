#!/usr/bin/env node
// Mirror plugin-bundled devflow runtime to ~/.claude/devflow/.
// Skills and agents reference @~/.claude/devflow/* paths which are not
// interpolated against ${CLAUDE_PLUGIN_ROOT}, so the runtime is mirrored
// to the home location on each session start when the version differs.
//
// Design (TRD 23-01):
//  - Atomic per-subdirectory swap via temp dir + fs.renameSync (POSIX-atomic)
//  - Exclusion filter: *.test.cjs, *.test.js, __fixtures__/ never mirrored
//  - Content sentinel: early-exit requires bin/df-tools.cjs present (not just targetDir)
//  - .plugin-version written ONLY after ALL four subdir swaps succeed
//  - On any error: stderr warning, best-effort tmp cleanup, exit 0 (retry next session)

const fs = require('fs');
const path = require('path');
const os = require('os');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
if (!pluginRoot) {
  process.exit(0);
}

const sourceDir = path.join(pluginRoot, 'devflow');
const targetDir = path.join(os.homedir(), '.claude', 'devflow');
const manifestPath = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
const versionFile = path.join(targetDir, '.plugin-version');

let pluginVersion = 'unknown';
try {
  pluginVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || 'unknown';
} catch {
  process.exit(0);
}

let installedVersion = null;
try {
  installedVersion = fs.readFileSync(versionFile, 'utf8').trim();
} catch {}

// Content sentinel: version match alone is not proof of an intact mirror.
// Also require the primary executable to exist (self-heal for corruption mode).
if (
  installedVersion === pluginVersion &&
  fs.existsSync(path.join(targetDir, 'bin', 'df-tools.cjs'))
) {
  process.exit(0);
}

if (!fs.existsSync(sourceDir)) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Exclusion filter
// ---------------------------------------------------------------------------

const MIRROR_EXCLUDE = [
  /\.test\.cjs$/,
  /\.test\.js$/,
  /(^|\/)__fixtures__(\/|$)/,
];

/**
 * Returns true if the entry should be excluded from the mirror.
 * @param {string} entryName  — basename of the entry (file or dir)
 * @param {string} relPath    — path relative to the subdir root (e.g. "lib/helper.test.cjs")
 */
function shouldExclude(entryName, relPath) {
  return MIRROR_EXCLUDE.some(
    r => r.test(entryName) || r.test(relPath)
  );
}

// ---------------------------------------------------------------------------
// copyDir with exclusion filter
// ---------------------------------------------------------------------------

/**
 * Recursively copy src → dest, skipping excluded entries.
 * @param {string} src
 * @param {string} dest
 * @param {string} [relBase]  — relative path from the subdir root (for relPath tests)
 */
function copyDir(src, dest, relBase) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const relPath = relBase ? relBase + '/' + entry.name : entry.name;
    if (shouldExclude(entry.name, relPath)) {
      continue;
    }
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

// ---------------------------------------------------------------------------
// removeDir helper
// ---------------------------------------------------------------------------

function removeDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Atomic per-subdir swap
// ---------------------------------------------------------------------------

const SUBDIRS = ['workflows', 'references', 'templates', 'bin'];

// Sweep any stale devflow-tmp-* entries left by a previously crashed run.
function sweepStaleTmpDirs() {
  try {
    if (!fs.existsSync(targetDir)) return;
    for (const entry of fs.readdirSync(targetDir)) {
      if (entry.startsWith('devflow-tmp-')) {
        removeDir(path.join(targetDir, entry));
      }
    }
  } catch (err) {
    process.stderr.write(`[devflow] sweep stale tmp warning: ${err.message}\n`);
  }
}

const tmpDirsCreated = [];

try {
  fs.mkdirSync(targetDir, { recursive: true });

  sweepStaleTmpDirs();

  for (const sub of SUBDIRS) {
    const source = path.join(sourceDir, sub);
    const target = path.join(targetDir, sub);
    const tmpPath = path.join(targetDir, `devflow-tmp-${sub}-${process.pid}`);

    if (!fs.existsSync(source)) {
      // Source subdir absent — remove target subdir if present
      removeDir(target);
      continue;
    }

    // Copy source into a fresh temp dir (with exclusions applied)
    copyDir(source, tmpPath, '');
    tmpDirsCreated.push(tmpPath);

    // POSIX-atomic swap: remove old target then rename tmp into place.
    // On POSIX, renameSync onto a non-existent path is atomic.
    // On Windows, renameSync over an existing dir fails — we removeDir first (best-effort).
    removeDir(target);
    fs.renameSync(tmpPath, target);

    // Remove from cleanup list once successfully renamed
    tmpDirsCreated.pop();
  }

  // Write version marker ONLY after all swaps succeed
  fs.writeFileSync(versionFile, pluginVersion);
  process.stderr.write(`[devflow] runtime synced to ~/.claude/devflow (v${pluginVersion})\n`);
} catch (err) {
  process.stderr.write(`[devflow] sync-runtime failed: ${err.message}\n`);
  // Best-effort cleanup of any tmp dirs that were created but not yet renamed
  for (const tmp of tmpDirsCreated) {
    try { removeDir(tmp); } catch {}
  }
  // Do NOT write versionFile — preserve retry-next-session semantics
  process.exit(0);
}
