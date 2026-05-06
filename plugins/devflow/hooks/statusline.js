#!/usr/bin/env node
// Claude Code Statusline - DevFlow Edition
// Shows: model | current task | directory | context usage

const fs = require('fs');
const path = require('path');
const os = require('os');

// Read JSON from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // Context window display (shows USED percentage scaled to 80% limit)
    // Claude Code enforces an 80% context limit, so we scale to show 100% at that point
    let ctx = '';
    if (remaining != null) {
      const rem = Math.round(remaining);
      const rawUsed = Math.max(0, Math.min(100, 100 - rem));
      // Scale: 80% real usage = 100% displayed
      const used = Math.min(100, Math.round((rawUsed / 80) * 100));

      // Build progress bar (10 segments)
      const filled = Math.floor(used / 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

      // Color based on scaled usage (thresholds adjusted for new scale)
      if (used < 63) {        // ~50% real
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 81) { // ~65% real
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 95) { // ~76% real
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m💀 ${bar} ${used}%\x1b[0m`;
      }
    }

    // Current task from todos
    let task = '';
    const homeDir = os.homedir();
    const todosDir = path.join(homeDir, '.claude', 'todos');
    if (session && fs.existsSync(todosDir)) {
      try {
        const files = fs.readdirSync(todosDir)
          .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          try {
            const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
            const inProgress = todos.find(t => t.status === 'in_progress');
            if (inProgress) task = inProgress.activeForm || '';
          } catch (e) {}
        }
      } catch (e) {
        // Silently fail on file system errors - don't break statusline
      }
    }

    // DevFlow update available?
    let dfUpdate = '';
    const cacheFile = path.join(homeDir, '.claude', 'cache', 'df-update-check.json');
    if (fs.existsSync(cacheFile)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (cache.update_available) {
          dfUpdate = '\x1b[33m⬆ /df:update\x1b[0m │ ';
        }
      } catch (e) {}
    }

    // 20-04: Watcher status segment (opt-in via daemon.status_line config flag).
    // Reads project-local .planning/config.json, queries the daemon's PID file
    // through the synced watcher-state lib, sums per-project pending counts.
    // Renders ▶ watcher (green idle) or ⏸ N pending (yellow active) or hides
    // entirely. Wrapped in try/catch — statusline must NEVER crash on watcher
    // state errors (devflow not synced, malformed PID file, missing project
    // paths, etc.).
    let watcherStatus = '';
    try {
      const cwdLocal = data.workspace?.current_dir || process.cwd();
      const cwdConfig = path.join(cwdLocal, '.planning', 'config.json');
      if (fs.existsSync(cwdConfig)) {
        const cfg = JSON.parse(fs.readFileSync(cwdConfig, 'utf8'));
        if (cfg.daemon && cfg.daemon.status_line === true) {
          const stateLibPath = path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs');
          if (fs.existsSync(stateLibPath)) {
            const stateLib = require(stateLibPath);
            if (stateLib.isWatcherLive()) {
              const info = stateLib.readPidFile();
              const watching = (info && Array.isArray(info.watching)) ? info.watching : [];
              let pendingCount = 0;
              for (const projRoot of watching) {
                try {
                  const pendDir = path.join(projRoot, '.devflow-handoff', 'pending');
                  if (fs.existsSync(pendDir)) {
                    pendingCount += fs.readdirSync(pendDir).filter(f => f.endsWith('.json')).length;
                  }
                } catch { /* per-project errors swallowed; others still counted */ }
              }
              watcherStatus = pendingCount > 0
                ? `\x1b[33m⏸ ${pendingCount} pending\x1b[0m`
                : `\x1b[32m▶ watcher\x1b[0m`;
            }
          }
        }
      }
    } catch (e) {
      // statusline must NEVER crash on watcher state errors
    }

    // Output
    const dirname = path.basename(dir);
    const wsBlock = watcherStatus ? ` │ ${watcherStatus}` : '';
    if (task) {
      process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[1m${task}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${wsBlock}${ctx}`);
    } else {
      process.stdout.write(`${dfUpdate}\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${wsBlock}${ctx}`);
    }
  } catch (e) {
    // Silent fail - don't break statusline on parse errors
  }
});
