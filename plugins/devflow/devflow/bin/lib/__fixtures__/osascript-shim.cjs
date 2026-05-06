#!/usr/bin/env node
'use strict';

/**
 * Test fixture shim for `osascript`. Drops a JSONL marker line capturing
 * argv + cwd + pid + selected env vars to whatever path is in
 * OSASCRIPT_SHIM_MARKER_FILE. Tests prepend its dir to PATH so that
 * `osascript` invocations from notifier.cjs resolve here instead of the real
 * tool.
 *
 * Exit code defaults to 0; override via OSASCRIPT_SHIM_EXIT_CODE env var.
 */

const fs = require('fs');

const marker = process.env.OSASCRIPT_SHIM_MARKER_FILE;
if (marker) {
  try {
    fs.appendFileSync(marker, JSON.stringify({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      pid: process.pid,
      env_subset: {
        NOTIFY_TITLE: process.env.NOTIFY_TITLE || null,
        NOTIFY_BODY: process.env.NOTIFY_BODY || null,
      },
    }) + '\n');
  } catch {
    // best-effort
  }
}

const exitCode = parseInt(process.env.OSASCRIPT_SHIM_EXIT_CODE || '0', 10);
process.exit(Number.isFinite(exitCode) ? exitCode : 0);
