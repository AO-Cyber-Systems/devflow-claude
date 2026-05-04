'use strict';

/**
 * Watcher allowlist — what the devflow-watch daemon will execute.
 *
 * Default = the curated interactive + shell-flow patterns. Users may extend
 * via ~/.devflow/devflow-watch-allow.json (override:
 * $DEVFLOW_WATCH_ALLOW_FILE). The daemon NEVER runs anything outside the
 * combined allowlist; the deny-list is a belt-and-braces sanity check.
 *
 * NOTE: regex semantics here mirror gate-interactive.js (CMD_POS prefix so
 * we only match at command position). The same skipIf-style guards apply
 * (e.g. `gh auth login --with-token` is rejected because it doesn't need
 * the handoff dance — it's already non-interactive).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_CMD_LEN = 4096;

// CMD_POS: same shape as gate-interactive.js so the allowlist agrees with
// what the hook detects.
const CMD_POS = /(?:^\s*|[;&|\n(]\s*|&&\s*|\|\|\s*)/.source;

function rx(body) {
  return new RegExp(`${CMD_POS}${body}`);
}

// Curated allowlist. Each entry:
//   - label: human-readable
//   - match: regex that must match the command
//   - skipIf?: regex; if matches, the entry does NOT apply (daemon should NOT
//              run it because there's nothing to handoff). The validator
//              treats this as "rejected — non-interactive form".
const DEFAULT_PATTERNS = [
  // Interactive auth
  { label: 'doctl auth init', match: rx('doctl\\s+auth\\s+init\\b'), skipIf: /--access-token[\s=]/ },
  { label: 'gcloud auth login', match: rx('gcloud\\s+auth\\s+login\\b'), skipIf: /--cred-file[\s=]/ },
  { label: 'gh auth login', match: rx('gh\\s+auth\\s+login\\b'), skipIf: /--with-token\b/ },
  { label: 'aws configure', match: rx('aws\\s+configure\\b(?!\\s+(get|list|set|import|export|sso))') },
  { label: 'aws sso login', match: rx('aws\\s+sso\\s+login\\b') },
  { label: 'op signin', match: rx('op\\s+signin\\b') },
  { label: 'npm login', match: rx('npm\\s+login\\b') },
  { label: 'vault login', match: rx('vault\\s+login\\b'), skipIf: /-method=token\b/ },
  { label: 'passwd', match: rx('passwd\\b(?!\\s*=)') },
  { label: 'ssh-keygen', match: rx('ssh-keygen\\b(?!.*\\s-N\\s)') },

  // Shell-flow (need user's interactive shell env)
  { label: 'nvm use', match: rx('nvm\\s+use\\b') },
  { label: 'nvm install', match: rx('nvm\\s+install\\b') },
  { label: 'pyenv shell', match: rx('pyenv\\s+shell\\b') },
  { label: 'pyenv install', match: rx('pyenv\\s+install\\b') },
  { label: 'conda activate', match: rx('conda\\s+activate\\b') },
  { label: 'direnv exec', match: rx('direnv\\s+exec\\b') },
  { label: 'direnv allow', match: rx('direnv\\s+allow\\b') },
  { label: 'mise use', match: rx('mise\\s+use\\b') },
  { label: 'mise install', match: rx('mise\\s+install\\b') },
  { label: 'mise run', match: rx('mise\\s+run\\b') },
  { label: 'asdf shell', match: rx('asdf\\s+shell\\b') },
  { label: 'asdf install', match: rx('asdf\\s+install\\b') },
  { label: 'rbenv shell', match: rx('rbenv\\s+shell\\b') },
];

// Deny list — these are sanity-checked even if a user adds them to a custom
// allowlist. The combined allowlist is the primary defence; this is a final
// guard against obvious foot-guns.
const DENY_PATTERNS = [
  { label: 'sudo', match: rx('sudo\\b') },
  { label: 'su -', match: rx('su\\s+-') },
  { label: 'rm -rf /', match: /\brm\s+-rf\s+\/(?!\w)/ },
  { label: 'fork bomb', match: /:\(\)\s*\{\s*:/ },
  { label: 'curl|bash', match: /\bcurl\b[^|]*\|\s*bash\b/ },
  { label: 'curl|sh', match: /\bcurl\b[^|]*\|\s*sh\b/ },
  { label: 'wget|bash', match: /\bwget\b[^|]*\|\s*bash\b/ },
  { label: 'wget|sh', match: /\bwget\b[^|]*\|\s*sh\b/ },
];

function defaultAllowlist() {
  // Return a shallow copy so callers can extend without mutating the module.
  return DEFAULT_PATTERNS.slice();
}

function denyHit(cmd) {
  for (const d of DENY_PATTERNS) {
    if (d.match.test(cmd)) return d;
  }
  return null;
}

/**
 * Validate a command against an allowlist.
 *
 * @returns {{ ok: true, matched: string } | { ok: false, reason: string }}
 */
function validateCommand(cmd, allowlist) {
  if (!cmd || !cmd.trim()) {
    return { ok: false, reason: 'empty command' };
  }
  if (cmd.length > MAX_CMD_LEN) {
    return { ok: false, reason: `command too long (length ${cmd.length} > ${MAX_CMD_LEN})` };
  }
  const denied = denyHit(cmd);
  if (denied) {
    return { ok: false, reason: `denied by guard: ${denied.label}` };
  }
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return { ok: false, reason: 'allowlist empty' };
  }
  // Check curated patterns first — they may have skipIf semantics.
  for (const p of allowlist) {
    const m = p.match instanceof RegExp ? p.match : new RegExp(p.match);
    if (!m.test(cmd)) continue;
    if (p.skipIf && p.skipIf.test(cmd)) {
      return { ok: false, reason: `non-interactive form not needed for handoff (matched skipIf for "${p.label}")` };
    }
    return { ok: true, matched: p.label };
  }
  return { ok: false, reason: 'command does not match the daemon allowlist' };
}

function userAllowFilePath() {
  if (process.env.DEVFLOW_WATCH_ALLOW_FILE) {
    return process.env.DEVFLOW_WATCH_ALLOW_FILE;
  }
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.devflow', 'devflow-watch-allow.json');
}

/**
 * Load the combined allowlist (default + user).
 *
 * @returns {{ allowlist, userPatterns, degraded }}
 */
function loadAllowlist() {
  const allowlist = defaultAllowlist();
  const userFile = userAllowFilePath();
  if (!fs.existsSync(userFile)) {
    return { allowlist, userPatterns: 0, degraded: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(userFile, 'utf8'));
  } catch {
    return { allowlist, userPatterns: 0, degraded: true };
  }
  const commands = (parsed && Array.isArray(parsed.commands)) ? parsed.commands : [];
  let added = 0;
  for (const entry of commands) {
    if (!entry || typeof entry.pattern !== 'string') continue;
    let re;
    try { re = new RegExp(entry.pattern); } catch { continue; }
    allowlist.push({
      label: entry.label || entry.pattern,
      match: re,
      skipIf: entry.skipIf ? new RegExp(entry.skipIf) : null,
    });
    added += 1;
  }
  return { allowlist, userPatterns: added, degraded: false };
}

module.exports = {
  defaultAllowlist,
  loadAllowlist,
  validateCommand,
  CMD_POS,
  MAX_CMD_LEN,
  DENY_PATTERNS,
};
