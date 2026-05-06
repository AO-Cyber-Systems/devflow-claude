#!/usr/bin/env node
'use strict';

/**
 * Test fixture shim for `launchctl`. Drops a JSONL marker line capturing
 * argv + cwd + pid to whatever path is in LAUNCHCTL_SHIM_MARKER_FILE.
 *
 * Exit code defaults to 0; override via LAUNCHCTL_SHIM_EXIT_CODE env var.
 * Set LAUNCHCTL_SHIM_EXIT_CODE_BY_SUBCOMMAND='unload:1' to make the shim
 * exit 1 only on `launchctl unload` (e.g. simulate "service not loaded").
 */

const fs = require('fs');

const argv = process.argv.slice(2);
const marker = process.env.LAUNCHCTL_SHIM_MARKER_FILE;
if (marker) {
  try {
    fs.appendFileSync(marker, JSON.stringify({
      argv,
      cwd: process.cwd(),
      pid: process.pid,
    }) + '\n');
  } catch {
    // best-effort
  }
}

let exitCode = parseInt(process.env.LAUNCHCTL_SHIM_EXIT_CODE || '0', 10);
const overridesRaw = process.env.LAUNCHCTL_SHIM_EXIT_CODE_BY_SUBCOMMAND || '';
if (overridesRaw && argv[0]) {
  for (const pair of overridesRaw.split(',')) {
    const [sub, code] = pair.split(':');
    if (sub === argv[0]) {
      const c = parseInt(code, 10);
      if (Number.isFinite(c)) exitCode = c;
    }
  }
}
process.exit(Number.isFinite(exitCode) ? exitCode : 0);
