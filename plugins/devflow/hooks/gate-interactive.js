#!/usr/bin/env node

/**
 * DevFlow Interactive Command Gate (PreToolUse, Bash)
 *
 * Detects Bash invocations that require a TTY (token paste, browser auth,
 * password prompt) and denies the tool call with instructions for Claude to
 * route the command through the user's shell via the `!` prefix.
 *
 * Why: when Claude tries to run something like `doctl auth init`, the harness
 * has no TTY and the command either hangs or fails. The user has to manually
 * type `! doctl auth init`, which breaks flow. This hook lets Claude detect
 * the situation up-front and orchestrate the `!` handoff cleanly.
 *
 * On match the hook also writes a pending handoff record to
 * `.devflow-handoff/pending/<id>.json` so a future side-channel watcher (V2)
 * can pick it up and run it without user paste.
 *
 * Escape hatch: DEVFLOW_SKIP_INTERACTIVE_GATE=1
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Patterns for commands that require a TTY. Each `match` regex requires
// `${CMD_POS}` at the front so we only fire when the interactive command sits
// in real command position (start of line or after a shell separator), not
// when it appears inside an `echo` string or a quoted arg.
//
// CMD_POS matches: start of string, OR a separator (; && || | & ( newline)
// optionally followed by whitespace.
const CMD_POS = /(?:^|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;

const INTERACTIVE_PATTERNS = [
  {
    match: new RegExp(`${CMD_POS}doctl\\s+auth\\s+init\\b`),
    skipIf: /--access-token[\s=]/,
    reason: 'doctl auth init prompts for an access token'
  },
  {
    match: new RegExp(`${CMD_POS}gcloud\\s+auth\\s+login\\b`),
    skipIf: /--cred-file[\s=]/,
    reason: 'gcloud auth login opens a browser flow'
  },
  {
    match: new RegExp(`${CMD_POS}gh\\s+auth\\s+login\\b`),
    skipIf: /--with-token\b/,
    reason: 'gh auth login is interactive without --with-token'
  },
  {
    match: new RegExp(`${CMD_POS}aws\\s+configure\\b(?!\\s+(get|list|set|import|export|sso))`),
    reason: 'aws configure prompts for credentials'
  },
  {
    match: new RegExp(`${CMD_POS}op\\s+signin\\b`),
    reason: '1Password signin prompts for the master password'
  },
  {
    match: new RegExp(`${CMD_POS}npm\\s+login\\b`),
    reason: 'npm login prompts for username/password/OTP'
  },
  {
    match: new RegExp(`${CMD_POS}vault\\s+login\\b`),
    skipIf: /-method=token\b/,
    reason: 'vault login is interactive without -method=token'
  },
  {
    match: new RegExp(`${CMD_POS}passwd\\b(?!\\s*=)`),
    reason: 'passwd prompts for the current and new password'
  },
  {
    match: new RegExp(`${CMD_POS}ssh-keygen\\b(?!.*\\s-N\\s)`),
    reason: 'ssh-keygen prompts for a passphrase without -N'
  }
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

function writePendingRecord(cmd, cwd, reason) {
  const id = 'h-' + crypto.randomBytes(4).toString('hex');
  const dir = path.join(cwd, '.devflow-handoff', 'pending');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      id,
      cmd,
      cwd,
      reason,
      created_at: new Date().toISOString(),
      status: 'pending'
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

function main() {
  if (process.env.DEVFLOW_SKIP_INTERACTIVE_GATE === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  const hit = detectInteractive(cmd);
  if (!hit) return;

  const id = writePendingRecord(cmd, process.cwd(), hit.reason);

  deny([
    `This command requires a TTY (${hit.reason}).`,
    'The Claude Code harness cannot run interactive commands directly.',
    `Tell the user verbatim to paste this in the prompt: \`! ${cmd}\``,
    'The `!` prefix runs the command in their shell so the output returns inline.',
    'Do NOT retry the Bash tool. Wait for the user\'s next message containing the output, then continue.',
    `(handoff id: ${id} — pending record written to .devflow-handoff/pending/${id}.json)`,
    'Escape hatch: set DEVFLOW_SKIP_INTERACTIVE_GATE=1 if this is a false positive.'
  ].join(' '));
}

main();
