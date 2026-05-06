'use strict';

/**
 * global-config.cjs — Read/write helpers for ~/.claude/devflow/global-config.json
 *
 * Provides:
 *   readConfig()           — read config file, merge with DEFAULT_CONFIG (forward-compat)
 *   writeConfig(config)    — atomic write via .tmp rename
 *   shouldAutoInit()       — sugar: readConfig().auto_init_substantive_projects === true
 *   cmdGlobalConfig(...)   — CLI entry: df-tools global-config get|set
 *
 * File format (v1.2, locked per #28):
 *   { "auto_init_substantive_projects": false }
 *
 * Forward-compat contract:
 *   - Missing keys are filled from DEFAULT_CONFIG on read.
 *   - Unknown keys (future v1.3+ additions) are preserved on read.
 *   - Unknown keys written via `set` get a stderr warning but are stored anyway.
 *
 * Testability:
 *   - _setConfigPath(p)  — redirect config path (tests must NOT use real ~/.claude/devflow/)
 *   - _setRunFs(obj)     — inject mock fs functions (e.g., spy on renameSync)
 *   - _resetMocks()      — restore both path and fs to real implementations
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { output, error } = require('./helpers.cjs');

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVFLOW_HOME = path.join(os.homedir(), '.claude', 'devflow');
const GLOBAL_CONFIG_PATH = path.join(DEVFLOW_HOME, 'global-config.json');

/**
 * LOCKED: all v1.2 keys with their default values.
 * Add v1.3+ keys here in the binary that knows about them.
 * v1.2 binaries will see unknown keys from v1.3 configs as forward-compat noise.
 */
const DEFAULT_CONFIG = {
  auto_init_substantive_projects: false,
};

// ─── fs + path injection (for testability) ────────────────────────────────────

const realFs = {
  existsSync: (...a) => fs.existsSync(...a),
  mkdirSync: (...a) => fs.mkdirSync(...a),
  readFileSync: (...a) => fs.readFileSync(...a),
  writeFileSync: (...a) => fs.writeFileSync(...a),
  renameSync: (...a) => fs.renameSync(...a),
};

let _runFs = realFs;
let _runConfigPath = GLOBAL_CONFIG_PATH;

function _setRunFs(fn) { _runFs = (fn != null) ? fn : realFs; }
function _setConfigPath(p) { _runConfigPath = (p != null) ? p : GLOBAL_CONFIG_PATH; }
function _resetMocks() {
  _runFs = realFs;
  _runConfigPath = GLOBAL_CONFIG_PATH;
}

// ─── readConfig ───────────────────────────────────────────────────────────────

/**
 * Read the global config file and merge with DEFAULT_CONFIG.
 *
 * - File absent → returns DEFAULT_CONFIG copy
 * - File present → merges: { ...DEFAULT_CONFIG, ...parsed }
 *   Known missing keys filled from defaults; unknown keys preserved (forward-compat).
 * - Corrupt JSON / non-object root → stderr warning + returns DEFAULT_CONFIG copy
 */
function readConfig() {
  if (!_runFs.existsSync(_runConfigPath)) {
    return { ...DEFAULT_CONFIG };
  }

  let parsed;
  try {
    const raw = _runFs.readFileSync(_runConfigPath, 'utf-8');
    parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('config root must be a plain object');
    }
  } catch (e) {
    process.stderr.write(
      `[global-config] corrupt config at ${_runConfigPath}, using defaults: ${e.message}\n`
    );
    return { ...DEFAULT_CONFIG };
  }

  // DEFAULT_CONFIG comes first so user values override defaults,
  // AND unknown keys from parsed (v1.3+) are preserved.
  return { ...DEFAULT_CONFIG, ...parsed };
}

// ─── writeConfig ─────────────────────────────────────────────────────────────

/**
 * Write config atomically via .tmp rename.
 * Creates parent directory if missing (recursive: true — handles ~/.claude/devflow/ first-run).
 * Same-directory .tmp means no cross-filesystem rename concern.
 */
function writeConfig(config) {
  const dir = path.dirname(_runConfigPath);
  if (!_runFs.existsSync(dir)) {
    _runFs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = _runConfigPath + '.tmp';
  _runFs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  _runFs.renameSync(tmpPath, _runConfigPath);
}

// ─── shouldAutoInit ───────────────────────────────────────────────────────────

/**
 * Returns true only if auto_init_substantive_projects is EXACTLY boolean true.
 * Defensive: config corruption (e.g. string 'true') returns false.
 * Called by classify-session.js (17-03) without needing to know the file format.
 */
function shouldAutoInit() {
  return readConfig().auto_init_substantive_projects === true;
}

// ─── _coerceValue ─────────────────────────────────────────────────────────────

/**
 * Coerce a CLI string argument to the most appropriate JS type.
 *   'true'  → true   (boolean)
 *   'false' → false  (boolean)
 *   '42'    → 42     (integer)
 *   '3.14'  → 3.14   (float)
 *   else    → string (unchanged)
 */
function _coerceValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

// ─── cmdGlobalConfig ─────────────────────────────────────────────────────────

/**
 * CLI entry point for `df-tools global-config <op> [key] [value]`.
 *
 * get <key>           — print value (or null if key not present), JSON in --raw mode
 * set <key> <value>   — write value to config (coerces bool/number strings)
 *
 * Unknown keys in `set` emit a stderr warning but are written anyway (forward-compat).
 */
function cmdGlobalConfig(cwd, args, raw) {
  const op = args[0];

  if (op === 'get') {
    const key = args[1];
    if (!key) {
      error('Usage: df-tools global-config get <key>');
      return;
    }
    const config = readConfig();
    const value = (key in config) ? config[key] : null;
    output({ key, value }, raw, JSON.stringify(value));
    return;
  }

  if (op === 'set') {
    const key = args[1];
    const rawValue = args[2];
    if (!key || rawValue === undefined) {
      error('Usage: df-tools global-config set <key> <value>');
      return;
    }
    if (!(key in DEFAULT_CONFIG)) {
      process.stderr.write(
        `[global-config] warning: unknown key "${key}" (allowed: ${Object.keys(DEFAULT_CONFIG).join(', ')})\n`
      );
    }
    const value = _coerceValue(rawValue);
    const config = readConfig();
    config[key] = value;
    writeConfig(config);
    output({ key, value, written: true }, raw, JSON.stringify({ key, value, written: true }));
    return;
  }

  error(`Unknown global-config subcommand: "${op || '(none)'}". Usage: get|set <key> [<value>]`);
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  readConfig,
  writeConfig,
  shouldAutoInit,
  cmdGlobalConfig,
  GLOBAL_CONFIG_PATH,
  DEFAULT_CONFIG,
  _setConfigPath,
  _setRunFs,
  _resetMocks,
  _coerceValue,
};
