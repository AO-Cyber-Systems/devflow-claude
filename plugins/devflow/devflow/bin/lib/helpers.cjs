'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// ─── Model Profile Table ──────────────────────────────────────────────────────

const MODEL_PROFILES_PATH = path.join(__dirname, '../../references/model-profiles.json');
const _modelProfilesData = JSON.parse(fs.readFileSync(MODEL_PROFILES_PATH, 'utf-8'));
const MODEL_PROFILES = _modelProfilesData.agents;
// tier -> concrete API model id (live: flutter-ui-eval sends it to the Messages API)
const MODEL_IDS = _modelProfilesData.models || {};

// ─── Output / Error ──────────────────────────────────────────────────────────

/**
 * Emit a result and exit.
 *
 * `exitCode` defaults to 0 — the overwhelmingly common case. Pass a non-zero
 * code for a result that reports a FAILURE: a payload saying `committed:false`
 * beside `rc=0` is how a refused commit read as a no-op (issue #100 finding 5).
 */
function output(result, raw, rawValue, exitCode = 0) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    const json = JSON.stringify(result, null, 2);
    // Large payloads exceed Claude Code's Bash tool buffer (~50KB).
    // Write to tmpfile and output the path prefixed with @file: so callers can detect it.
    if (json.length > 50000) {
      const tmpPath = path.join(require('os').tmpdir(), `df-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      process.stdout.write('@file:' + tmpPath);
    } else {
      process.stdout.write(json);
    }
  }
  process.exit(exitCode);
}

function error(message) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}

// ─── Pure Utilities ───────────────────────────────────────────────────────────

function parseIncludeFlag(args) {
  const includeIndex = args.indexOf('--include');
  if (includeIndex === -1) return new Set();
  const includeValue = args[includeIndex + 1];
  if (!includeValue) return new Set();
  return new Set(includeValue.split(',').map(s => s.trim()));
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Reads the running engine's version so evidence-producing outputs (e.g.
// flutter-ui-eval's scoreRun) can stamp `engine_version` — a verifier then rejects
// evidence produced by a stale engine (a stale mirror once silently passed unjudged
// states). Prefers the plugin manifest relative to this file; falls back to the
// `.plugin-version` marker sync-runtime.js writes into the home mirror; then '0.0.0'.
//
// NOTE: when df-tools runs from the ~/.claude/devflow mirror (how every skill
// invokes it) the first candidate never exists — the mirror carries no
// .claude-plugin/plugin.json — so "running" equals the mirror marker BY
// CONSTRUCTION. It says which engine is executing, not which plugin is
// installed. installedPlugin() below is the plugin-registry truth; compare
// against that (validate health E020) to detect a stale mirror.
function pluginVersion({ homeDir, manifestPath } = {}) {
  const candidates = [
    manifestPath || path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json'),
    path.join(homeDir || os.homedir(), '.claude', 'devflow', '.plugin-version'),
  ];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    try {
      const txt = fs.readFileSync(c, 'utf-8');
      const v = c.endsWith('.json') ? JSON.parse(txt).version : txt.trim();
      // A parseable plugin.json with no (or an empty) `version` field is not usable
      // evidence of the running engine's version — fall through to the next candidate
      // instead of returning `undefined`/'' up to a caller expecting a semver string.
      if (typeof v === 'string' && v) return v;
    } catch {}
  }
  return '0.0.0';
}

// Reads the installed plugin's version from the Claude Code plugin manager's
// own bookkeeping — NOT the running-engine lookup `pluginVersion()` does.
// When df-tools runs from the ~/.claude/devflow mirror (as every skill
// invokes it), `pluginVersion()`'s first candidate (a .claude-plugin/plugin.json
// relative to __dirname) doesn't exist there, so it falls through to the same
// ~/.claude/devflow/.plugin-version file health's mirror-staleness check also
// reads — making "installed" and "mirror" the same value by construction and
// the E020 check structurally dead. This reads the independent source of
// truth instead: ~/.claude/plugins/installed_plugins.json, which the plugin
// manager (not sync-runtime) maintains.
// Returns { version, installPath } or null when the entry/file is absent.
function installedPlugin(opts) {
  const homeDir = (opts && opts.homeDir) || os.homedir();
  const registryPath = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const entries = registry && registry.plugins && registry.plugins['devflow@aocyber'];
    if (!entries) return null;
    const list = Array.isArray(entries) ? entries : [entries];
    const entry = list.find(e => e && e.scope === 'user') || list[0] || null;
    if (!entry) return null;

    const installPath = entry.installPath || null;
    let version = null;
    if (installPath) {
      try {
        const pj = JSON.parse(fs.readFileSync(path.join(installPath, '.claude-plugin', 'plugin.json'), 'utf-8'));
        if (pj && typeof pj.version === 'string' && pj.version) version = pj.version;
      } catch {
        // Cache dir missing/unreadable/unparseable — fall back to the
        // registry's own `version` field below rather than failing outright.
      }
    }
    if (!version && typeof entry.version === 'string' && entry.version) version = entry.version;
    if (!version) return null;

    return { version, installPath };
  } catch {
    return null;
  }
}

// Reads the local marketplace checkout path for the `aocyber` marketplace
// from ~/.claude/plugins/known_marketplaces.json (maintained by the plugin
// manager, distinct from any devflow-claude dev checkout on disk). Returns
// the path if it names an existing directory, else null.
function marketplaceCheckout(opts) {
  const homeDir = (opts && opts.homeDir) || os.homedir();
  const registryPath = path.join(homeDir, '.claude', 'plugins', 'known_marketplaces.json');
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const entry = registry && registry.aocyber;
    const installLocation = entry && entry.installLocation;
    if (!installLocation) return null;
    const stat = fs.statSync(installLocation);
    return stat.isDirectory() ? installLocation : null;
  } catch {
    return null;
  }
}

// ─── TRD/JOB Dual-Pattern Helpers ────────────────────────────────────────────

function findPlanFiles(dirFiles) {
  const trdFiles = dirFiles.filter(f => f.endsWith('-TRD.md') || f === 'TRD.md');
  const jobFiles = dirFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
  return trdFiles.length > 0 ? trdFiles : jobFiles;
}

function stripPlanSuffix(filename) {
  return filename.replace(/-?TRD\.md$/, '').replace(/-?JOB\.md$/, '');
}

function isTaskDoc(filename) {
  return filename.endsWith('-TRD.md') || filename.endsWith('-JOB.md') ||
         filename === 'TRD.md' || filename === 'JOB.md';
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeObjectiveName(objective) {
  const match = objective.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return objective;
  const num = match[1];
  const parts = num.split('.');
  const padded = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}

function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Git Helpers ──────────────────────────────────────────────────────────────

function isGitIgnored(cwd, targetPath) {
  try {
    execSync('git check-ignore -q -- ' + targetPath.replace(/[^a-zA-Z0-9._\-/]/g, ''), {
      cwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function execGit(cwd, args) {
  try {
    const escaped = args.map(a => {
      if (/^[a-zA-Z0-9._\-/=:@]+$/.test(a)) return a;
      return "'" + a.replace(/'/g, "'\\''") + "'";
    });
    const stdout = execSync('git ' + escaped.join(' '), {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function pathExistsInternal(cwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MODEL_PROFILES_PATH,
  MODEL_PROFILES,
  MODEL_IDS,
  output,
  error,
  parseIncludeFlag,
  safeReadFile,
  pluginVersion,
  installedPlugin,
  marketplaceCheckout,
  findPlanFiles,
  stripPlanSuffix,
  isTaskDoc,
  normalizeObjectiveName,
  generateSlugInternal,
  isGitIgnored,
  execGit,
  pathExistsInternal,
};
