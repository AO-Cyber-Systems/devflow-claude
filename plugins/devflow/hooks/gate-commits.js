#!/usr/bin/env node

/**
 * DevFlow Commit Gate (PreToolUse, Bash)
 *
 * Blocks raw `git commit` invocations in DevFlow-initialized projects and
 * redirects Claude to use `df-tools.cjs commit` (which preserves objective
 * scope, task IDs, and updates STATE.md).
 *
 * Exceptions:
 *   - When the command is already invoking df-tools.cjs commit
 *   - When DEVFLOW_ALLOW_RAW_COMMIT=1 env is set (escape hatch for the user)
 *
 * Detection is invocation-aware (TRD 27-04), not a substring test: heredoc
 * bodies and quoted arguments are stripped first, so writing a file or grepping
 * for text that merely MENTIONS the phrase is not treated as running it.
 *
 * NOTE: a commit-message prefix allowlist ("chore(release):", "docs:", "wip:")
 * was documented here but never implemented. Comment corrected in TRD 27-04
 * rather than silently widening the gate; add it deliberately if wanted.
 *
 * Non-DevFlow repos: pass through unchanged.
 */

const fs = require('fs');
const path = require('path');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function findPlanningDir(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.planning'))) return path.join(dir, '.planning');
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Remove heredoc BODIES from a command string (TRD 27-04).
 *
 * `cat > f <<'EOF' ... EOF` bodies are file content, not commands. Leaving them
 * in meant any script, doc, or test fixture whose text merely mentioned the raw
 * commit phrase was refused — reproduced live while writing the 2026-08-18
 * audit, where an analysis script containing it as a regex literal was blocked.
 */
function stripHeredocs(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
    ' <<HEREDOC '
  );
}

/**
 * Blank out quoted string contents so a mention inside an argument (echo,
 * grep pattern, commit message body) is not read as an invocation.
 */
function stripQuoted(cmd) {
  return cmd
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/**
 * True when the command actually INVOKES git's commit subcommand.
 *
 * Matches `git commit` at a command position, tolerating git's global flags
 * (`-C <path>`, `-c k=v`, `--no-pager`, `--git-dir=`, `--work-tree=`, `-P`),
 * after heredoc bodies and quoted text have been removed.
 *
 * @param {string} cmd
 * @returns {boolean}
 */
function invokesGitCommit(cmd) {
  const cleaned = stripQuoted(stripHeredocs(String(cmd || '')));
  const GLOBAL_FLAG = String.raw`(?:-C\s+\S+|-c\s+\S+|--no-pager|--git-dir=\S+|--work-tree=\S+|-P)`;
  const re = new RegExp(
    String.raw`(?:^|[;&|(]|\s)git(?:\s+${GLOBAL_FLAG})*\s+commit(?:\s|$|;|&)`
  );
  return re.test(cleaned);
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
  if (process.env.DEVFLOW_ALLOW_RAW_COMMIT === '1') return;

  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (!cmd) return;

  // Only gate an actual git-commit INVOCATION (TRD 27-04).
  // Previously a substring test, which fired on any command merely containing
  // the phrase — including heredoc bodies writing a file that mentions it.
  if (!invokesGitCommit(cmd)) return;

  // Allow df-tools commit wrapper
  if (/df-tools\.cjs\s+commit\b/.test(cmd)) return;

  const planningDir = findPlanningDir(process.cwd());
  if (!planningDir) return; // Not a DevFlow project — pass through

  // 23-02: gate on ROADMAP.md or objectives/ — both are created only by new-project,
  // so either presence proves DevFlow initialization. STATE.md check removed: it was
  // absent on brand-new projects (post-init, pre-first-execution), bypassing the gate.
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const objectivesDirExists = fs.existsSync(path.join(planningDir, 'objectives'));
  if (!roadmapExists && !objectivesDirExists) return; // Planning dir exists but uninitialized

  deny([
    'DevFlow project detected. Raw `git commit` is blocked.',
    'Use `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` so the commit is scoped to the active task/plan and STATE.md stays consistent.',
    'Commit format: `{type}({objective}-{trd}): {task}` (see devflow/references/git-integration.md).',
    'Escape hatch: set DEVFLOW_ALLOW_RAW_COMMIT=1 if you really need to bypass (e.g. release/chore commits outside a plan).'
  ].join(' '));
}

if (require.main === module) main();

module.exports = {
  invokesGitCommit,
  stripHeredocs,
  stripQuoted,
};
