'use strict';

/**
 * global-config-fixtures.cjs — Hand-built factory + named SCENARIOS for global-config tests.
 *
 * Provides:
 *   mkTmpConfigPath() — returns a fresh tmpdir path safe for _setConfigPath injection
 *   SCENARIOS        — locked from 17-RESEARCH.md: { default, enabled, unknown, corrupt, partial }
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Create a fresh temporary directory and return a config-file path inside it.
 * The file is NOT created — just the path is returned.
 * Tests use this with _setConfigPath(path) to redirect reads/writes.
 * Pass `options.create = true` + `options.content = '...'` to pre-populate.
 */
function mkTmpConfigPath(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'global-config-'));
  const configPath = path.join(dir, 'global-config.json');
  if (options.create && options.content !== undefined) {
    fs.writeFileSync(configPath, options.content, 'utf-8');
  }
  return { dir, configPath };
}

/**
 * SCENARIOS — named config file states. These are HAND-BUILT per TDD playbook habit 4.
 * Each scenario provides the raw JSON string (or corrupt string) plus expected behaviour.
 */
const SCENARIOS = {
  /**
   * default: file absent → should return { auto_init_substantive_projects: false }
   */
  default: {
    description: 'file does not exist',
    content: null, // no file to create
    expected: { auto_init_substantive_projects: false },
  },

  /**
   * enabled: user opted in to auto-init
   */
  enabled: {
    description: 'auto_init_substantive_projects set to true',
    content: JSON.stringify({ auto_init_substantive_projects: true }, null, 2),
    expected: { auto_init_substantive_projects: true },
  },

  /**
   * disabled: user explicitly set to false (no change from default but key is written)
   */
  disabled: {
    description: 'auto_init_substantive_projects explicitly set to false',
    content: JSON.stringify({ auto_init_substantive_projects: false }, null, 2),
    expected: { auto_init_substantive_projects: false },
  },

  /**
   * partial: file exists but has empty object — missing keys should fill from DEFAULT_CONFIG
   */
  partial: {
    description: 'config file exists but is empty object (missing all known keys)',
    content: JSON.stringify({}, null, 2),
    expected: { auto_init_substantive_projects: false },
  },

  /**
   * unknown: contains extra keys from a hypothetical v1.3 binary
   * Forward-compat: unknown keys are preserved on read
   */
  unknown: {
    description: 'config has extra unknown keys (forward-compat scenario)',
    content: JSON.stringify({ auto_init_substantive_projects: true, future_v13_key: 'foo' }, null, 2),
    expected: { auto_init_substantive_projects: true, future_v13_key: 'foo' },
  },

  /**
   * corrupt: invalid JSON that the user accidentally introduced
   * Expected: falls back to DEFAULT_CONFIG + writes warning to stderr
   */
  corrupt: {
    description: 'config file contains invalid JSON',
    content: 'this is not JSON{{{',
    expected: { auto_init_substantive_projects: false }, // defaults
  },

  /**
   * corrupt_non_object: valid JSON but wrong root type (array)
   * Expected: falls back to DEFAULT_CONFIG + writes warning to stderr
   */
  corrupt_non_object: {
    description: 'config file contains valid JSON but non-object root (array)',
    content: JSON.stringify([1, 2, 3]),
    expected: { auto_init_substantive_projects: false },
  },

  /**
   * string_bool: auto_init_substantive_projects is a string 'true', not a real bool
   * shouldAutoInit() must return false (strict === true check)
   */
  string_bool: {
    description: 'auto_init_substantive_projects is string "true" (corrupt config)',
    content: JSON.stringify({ auto_init_substantive_projects: 'true' }, null, 2),
    expected: { auto_init_substantive_projects: 'true' }, // preserved as-is from JSON
    shouldAutoInitExpected: false, // strict bool check
  },
};

module.exports = { mkTmpConfigPath, SCENARIOS };
