#!/usr/bin/env node

/**
 * DevFlow Interactive Command Gate (PreToolUse, Bash)
 *
 * Two modes, switched on whether the devflow-watch daemon is running:
 *
 *   Daemon LIVE (Approach B):
 *     Detects an interactive or shell-flow command, writes a pending handoff
 *     record, denies the Bash tool with reason "queued for daemon — continue
 *     with other work." The daemon picks up the record, runs it in the user's
 *     interactive shell, writes a done record, and the route-results.js hook
 *     injects the result into Claude's next turn. Claude never instructs
 *     the user to paste anything.
 *
 *   Daemon ABSENT (Approach A — fallback):
 *     Same detection + pending record, but the deny reason instructs Claude
 *     to surface `! cmd` for the user to paste. Original behaviour preserved
 *     so the hook is useful even without the watcher running.
 *
 * Detection covers two command categories at command position (after start
 * of line, ;, &&, ||, |, &, (, or newline):
 *   1. TTY-interactive: doctl auth init, gh auth login, gcloud auth login,
 *      aws configure, aws sso login, op signin, npm login, vault login,
 *      passwd, ssh-keygen
 *   2. Shell-flow (need user's interactive shell env, aliases, sourced rc):
 *      nvm use/install, pyenv shell/install, conda activate, direnv exec/allow,
 *      mise use/install/run, asdf shell/install, rbenv shell
 *
 * Escape hatch: DEVFLOW_SKIP_INTERACTIVE_GATE=1
 * Test override: DEVFLOW_HANDOFF_PID_FILE=<path>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Patterns for commands that require a TTY. Each `match` regex requires
// `${CMD_POS}` at the front so we only fire when the interactive command sits
// in real command position (start of line or after a shell separator), not
// when it appears inside an `echo` string or a quoted arg.
//
// CMD_POS matches: start of string (with optional leading whitespace),
// OR a separator (; && || | & ( newline) optionally followed by whitespace.
const CMD_POS = /(?:^\s*|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;

const INTERACTIVE_PATTERNS = [
  // ── TTY-interactive (need a real TTY, the original Approach A scope) ──
  {
    match: new RegExp(`${CMD_POS}doctl\\s+auth\\s+init\\b`),
    skipIf: /--access-token[\s=]/,
    reason: 'doctl auth init prompts for an access token',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}gcloud\\s+auth\\s+login\\b`),
    skipIf: /--cred-file[\s=]/,
    reason: 'gcloud auth login opens a browser flow',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}gh\\s+auth\\s+login\\b`),
    skipIf: /--with-token\b/,
    reason: 'gh auth login is interactive without --with-token',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}aws\\s+configure\\b(?!\\s+(get|list|set|import|export|sso))`),
    reason: 'aws configure prompts for credentials',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}aws\\s+sso\\s+login\\b`),
    reason: 'aws sso login opens a browser flow',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}op\\s+signin\\b`),
    reason: '1Password signin prompts for the master password',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}npm\\s+login\\b`),
    reason: 'npm login prompts for username/password/OTP',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}vault\\s+login\\b`),
    skipIf: /-method=token\b/,
    reason: 'vault login is interactive without -method=token',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}passwd\\b(?!\\s*=)`),
    reason: 'passwd prompts for the current and new password',
    category: 'tty',
  },
  {
    match: new RegExp(`${CMD_POS}ssh-keygen\\b(?!.*\\s-N\\s)`),
    reason: 'ssh-keygen prompts for a passphrase without -N',
    category: 'tty',
  },

  // ── Shell-flow (need the user's interactive shell env: aliases, mise/nvm/conda activations, sourced rc files) ──
  {
    match: new RegExp(`${CMD_POS}nvm\\s+use\\b`),
    reason: 'nvm is a shell function — needs user shell',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}nvm\\s+install\\b`),
    reason: 'nvm is a shell function — needs user shell',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}pyenv\\s+shell\\b`),
    reason: 'pyenv shell modifies the active shell session',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}pyenv\\s+install\\b`),
    reason: 'pyenv install needs full shell env',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}conda\\s+activate\\b`),
    reason: 'conda activate is a shell function',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}direnv\\s+exec\\b`),
    reason: 'direnv exec needs the user shell to source the env',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}direnv\\s+allow\\b`),
    reason: 'direnv allow trusts a directory in the user shell',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}mise\\s+use\\b`),
    reason: 'mise use modifies the active shell session',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}mise\\s+install\\b`),
    reason: 'mise install needs the shimmed shell env',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}mise\\s+run\\b`),
    reason: 'mise run dispatches via the shimmed shell',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}asdf\\s+shell\\b`),
    reason: 'asdf shell modifies the active shell session',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}asdf\\s+install\\b`),
    reason: 'asdf install needs the shimmed shell env',
    category: 'shell-flow',
  },
  {
    match: new RegExp(`${CMD_POS}rbenv\\s+shell\\b`),
    reason: 'rbenv shell modifies the active shell session',
    category: 'shell-flow',
  },
];

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function detectInteractive(cmd) {
  for (const p of INTERACTIVE_PATTERNS) {
    if (!p.match.test(cmd)) continue;
    if (p.skipIf && p.skipIf.test(cmd)) continue;
    return p;
  }
  return null;
}

function pidFilePath() {
  if (process.env.DEVFLOW_HANDOFF_PID_FILE) {
    return process.env.DEVFLOW_HANDOFF_PID_FILE;
  }
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.devflow', 'devflow-watch.pid');
}

function isWatcherLive() {
  const file = pidFilePath();
  if (!fs.existsSync(file)) return false;
  let info;
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  if (!info || typeof info.pid !== 'number') return false;
  try {
    process.kill(info.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readWatcherInfo() {
  const file = pidFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writePendingRecord(cmd, cwd, reason, opts = {}) {
  const id = 'h-' + crypto.randomBytes(4).toString('hex');
  const dir = path.join(cwd, '.devflow-handoff', 'pending');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      id,
      cmd,
      cwd,
      reason,
      source: 'hook',
      shell: opts.shell || null,
      timeout_ms: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 600000,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2));
    return id;
  } catch {
    return id;
  }
}

function deny(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function buildDenyReason({ id, cmd, hit, watcherLive, watcherInfo }) {
  if (watcherLive) {
    return [
      `This command needs the user's shell (${hit.reason}; category: ${hit.category}).`,
      `It has been queued to the devflow-watch daemon (pid ${watcherInfo && watcherInfo.pid}). Continue with other work — the daemon will run it and inject the result into your next turn automatically. Do NOT instruct the user to paste anything; do NOT retry the Bash tool.`,
      `(handoff id: ${id} — record at .devflow-handoff/pending/${id}.json)`,
      'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
    ].join(' ');
  }
  return [
    `This command requires the user's shell (${hit.reason}; category: ${hit.category}).`,
    'The Claude Code harness cannot run it directly, and the devflow-watch daemon is not running.',
    `Tell the user verbatim to paste this in the prompt: \`! ${cmd}\``,
    'The `!` prefix runs the command in their shell so the output returns inline.',
    'Do NOT retry the Bash tool. Wait for the user\'s next message containing the output, then continue.',
    `(handoff id: ${id} — record at .devflow-handoff/pending/${id}.json. ` +
      'Tip: run `devflow-watch start` in another terminal to skip the paste step in future.)',
    'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.',
  ].join(' ');
}

function main() {
  if (process.env.DEVFLOW_SKIP_INTERACTIVE_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  const hit = detectInteractive(cmd);
  if (!hit) return;

  const watcherInfo = readWatcherInfo();
  const watcherLive = isWatcherLive();
  const id = writePendingRecord(cmd, process.cwd(), hit.reason, {
    shell: watcherInfo && watcherInfo.shell,
  });

  deny(buildDenyReason({ id, cmd, hit, watcherLive, watcherInfo }));
}

if (require.main === module) {
  main();
}

module.exports = {
  detectInteractive,
  INTERACTIVE_PATTERNS,
  CMD_POS,
  isWatcherLive,
  readWatcherInfo,
  pidFilePath,
  buildDenyReason,
};
