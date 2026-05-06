#!/usr/bin/env node
'use strict';

/**
 * Test fixture shim for `systemctl`. Drops a JSONL marker line capturing
 * argv + cwd + pid to whatever path is in SYSTEMCTL_SHIM_MARKER_FILE.
 *
 * Exit code defaults to 0; override via SYSTEMCTL_SHIM_EXIT_CODE env var.
 */

const fs = require('fs');

const argv = process.argv.slice(2);
const marker = process.env.SYSTEMCTL_SHIM_MARKER_FILE;
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

const exitCode = parseInt(process.env.SYSTEMCTL_SHIM_EXIT_CODE || '0', 10);
process.exit(Number.isFinite(exitCode) ? exitCode : 0);
