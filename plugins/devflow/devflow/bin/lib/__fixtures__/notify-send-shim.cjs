#!/usr/bin/env node
'use strict';

/**
 * Test fixture shim for `notify-send`. Drops a JSONL marker line capturing
 * argv + cwd + pid to whatever path is in NOTIFY_SEND_SHIM_MARKER_FILE.
 *
 * Exit code defaults to 0; override via NOTIFY_SEND_SHIM_EXIT_CODE env var.
 */

const fs = require('fs');

const marker = process.env.NOTIFY_SEND_SHIM_MARKER_FILE;
if (marker) {
  try {
    fs.appendFileSync(marker, JSON.stringify({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      pid: process.pid,
    }) + '\n');
  } catch {
    // best-effort
  }
}

const exitCode = parseInt(process.env.NOTIFY_SEND_SHIM_EXIT_CODE || '0', 10);
process.exit(Number.isFinite(exitCode) ? exitCode : 0);
