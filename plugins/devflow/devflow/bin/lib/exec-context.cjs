'use strict';

/**
 * exec-context.cjs — make a spawn's repository and base EXPLICIT (issue #86).
 *
 * `devflow:executor` used to carry `isolation: worktree` in its frontmatter and
 * let the harness resolve that isolation. The harness resolved both halves
 * implicitly, and both were wrong in a multi-repo programme:
 *
 *   REPO: taken from the controller session's own repo. Dispatching an aodex
 *         objective from /Users/markemerson/Source/aodex-w1c put the first
 *         executor in devflow-claude. Every path it was given pointed into a
 *         repo it could not see — and nothing said so.
 *   BASE: the default branch. Wave 2 of a sequential objective therefore
 *         started from `main` and could not see wave 1's commits, so each wave
 *         re-did or contradicted the last.
 *
 * Nothing here can change the harness. What it can do is remove the need for
 * it: the orchestrator states the repo and the base, and these two commands
 * make the statement checkable.
 *
 *   exec-context check --repo <path> [--base <ref>]
 *     Proves the current directory is in the named repository (a linked
 *     worktree of it counts) and, with --base, that HEAD contains that commit.
 *     Exits 1 with a specific message otherwise. The executor runs this first;
 *     a wrong-repo spawn stops there instead of writing into the void.
 *
 *   exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>]
 *     Provisions isolation explicitly, in the NAMED repo, from an EXPLICIT base
 *     that defaults to that repo's current HEAD — never the default branch.
 *     This is the replacement for the frontmatter flag, for when waves run in
 *     parallel and need separate indexes.
 *
 * Repository identity is the git COMMON directory, not the checkout, so a
 * legitimate worktree of the target repo is recognised as the target repo while
 * a genuinely different repository is not.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { output, error } = require('./helpers.cjs');

// ── git plumbing ─────────────────────────────────────────────────────────────

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
  return {
    exitCode: r.status === null ? 1 : r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function realpath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/**
 * The identity of the REPOSITORY a directory belongs to — shared by the main
 * checkout and every linked worktree of it. `--git-common-dir` is `.git` for a
 * normal checkout and the main repo's `.git` for a linked worktree, which is
 * exactly the distinction that matters here.
 *
 * Returns null when `dir` is not inside a git repository.
 */
function repoIdentity(dir) {
  if (!fs.existsSync(dir)) return null;
  const top = git(dir, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0) return null;
  const common = git(dir, ['rev-parse', '--git-common-dir']);
  if (common.exitCode !== 0) return null;
  // `--git-common-dir` may be relative to cwd (".git"); resolve it against dir.
  const commonDir = realpath(path.resolve(dir, common.stdout));
  const gitDir = realpath(path.resolve(dir, git(dir, ['rev-parse', '--git-dir']).stdout));
  return {
    checkout: realpath(top.stdout),
    commonDir,
    // The main checkout is the parent of the common `.git` directory.
    mainRoot: path.basename(commonDir) === '.git' ? path.dirname(commonDir) : commonDir,
    isWorktree: gitDir !== commonDir,
  };
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  // A flag whose value is itself a flag was given no value at all.
  if (v === undefined || v.startsWith('--')) return undefined;
  return v;
}

// ── exec-context check ───────────────────────────────────────────────────────

function cmdExecContextCheck(cwd, args, raw) {
  const repoArg = flag(args, '--repo');
  if (repoArg === null || repoArg === undefined) {
    error('exec-context check requires --repo <path> — the repository this spawn is supposed to be working in.\nUsage: df-tools exec-context check --repo <path> [--base <ref>] [--raw]');
  }
  const expectedPath = path.resolve(cwd, repoArg);
  if (!fs.existsSync(expectedPath)) {
    error(`--repo does not exist: ${expectedPath}`);
  }
  const expected = repoIdentity(expectedPath);
  if (!expected) {
    error(`--repo is not a git repository: ${expectedPath}`);
  }

  const actual = repoIdentity(cwd);
  if (!actual) {
    error(`This spawn is not inside a git repository at all (cwd: ${cwd}).\nExpected to be in: ${expected.mainRoot}`);
  }

  if (actual.commonDir !== expected.commonDir) {
    // The #86 failure, made loud. Naming both sides matters: the symptom is
    // "every path is missing", which reads as a planning error until you see
    // which repository you are standing in.
    error(
      `WRONG REPOSITORY — this spawn is rooted in the wrong repo.\n` +
      `  expected repo : ${expected.mainRoot}\n` +
      `  actually in   : ${actual.mainRoot}  (cwd: ${cwd})\n` +
      `Nothing written here can land on the intended branch. Stop and re-dispatch ` +
      `with the working directory set inside ${expected.mainRoot}, or provision a ` +
      `worktree with: df-tools exec-context worktree --repo ${expected.mainRoot} --id <trd-id>`
    );
  }

  const headSha = git(cwd, ['rev-parse', 'HEAD']).stdout;
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;

  const baseArg = flag(args, '--base');
  if (baseArg === undefined) {
    error('--base was given without a value.\nUsage: df-tools exec-context check --repo <path> [--base <ref>] [--raw]');
  }

  let baseSha = null;
  let baseVisible = null;
  if (baseArg !== null) {
    const resolved = git(cwd, ['rev-parse', '--verify', `${baseArg}^{commit}`]);
    if (resolved.exitCode !== 0) {
      error(`--base does not resolve to a commit in this repository: ${baseArg}\n${resolved.stderr}`);
    }
    baseSha = resolved.stdout;
    baseVisible = git(cwd, ['merge-base', '--is-ancestor', baseSha, headSha]).exitCode === 0;
    if (!baseVisible) {
      // The starvation half of #86: branched from the default branch, so the
      // previous wave's output is simply absent.
      error(
        `BASE NOT VISIBLE — this spawn cannot see the base it was given.\n` +
        `  base : ${baseSha} (${baseArg})\n` +
        `  HEAD : ${headSha} (${branch})\n` +
        `HEAD does not contain that commit, so work that the base represents — a ` +
        `previous wave's output, say — is missing from this tree. Branch from the ` +
        `base explicitly rather than from the default branch:\n` +
        `  df-tools exec-context worktree --repo ${expected.mainRoot} --id <trd-id> --base ${baseArg}`
      );
    }
  }

  const result = {
    ok: true,
    repo_root: actual.mainRoot,
    checkout: actual.checkout,
    is_worktree: actual.isWorktree,
    branch,
    head_sha: headSha,
    base_ref: baseArg,
    base_sha: baseSha,
    base_visible: baseVisible,
  };
  output(result, raw, 'ok');
}

// ── exec-context worktree ────────────────────────────────────────────────────

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function cmdExecContextWorktree(cwd, args, raw) {
  const repoArg = flag(args, '--repo');
  if (repoArg === null || repoArg === undefined) {
    error('exec-context worktree requires --repo <path>.\nUsage: df-tools exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>] [--raw]');
  }
  const idArg = flag(args, '--id');
  if (idArg === null || idArg === undefined) {
    error('exec-context worktree requires --id <slug> — usually the TRD id, e.g. 571-02.\nUsage: df-tools exec-context worktree --repo <path> --id <slug> [--base <ref>] [--path <dir>] [--raw]');
  }
  const id = slugify(idArg);
  if (!id) error(`--id produced an empty slug: ${idArg}`);

  const repoPath = path.resolve(cwd, repoArg);
  if (!fs.existsSync(repoPath)) error(`--repo does not exist: ${repoPath}`);
  const repo = repoIdentity(repoPath);
  if (!repo) error(`--repo is not a git repository: ${repoPath}`);

  // The base is EXPLICIT. Defaulting to the repo's current HEAD — the tip the
  // orchestrator is standing on — is the one thing forced isolation got wrong:
  // it used the default branch, so a sequential wave started without the
  // previous wave's commits.
  const baseArg = flag(args, '--base');
  if (baseArg === undefined) error('--base was given without a value.');
  const baseRef = baseArg === null ? 'HEAD' : baseArg;
  const resolved = git(repo.mainRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  if (resolved.exitCode !== 0) {
    error(`--base does not resolve to a commit in ${repo.mainRoot}: ${baseRef}\n${resolved.stderr}`);
  }
  const baseSha = resolved.stdout;

  const pathArg = flag(args, '--path');
  if (pathArg === undefined) error('--path was given without a value.');
  const worktreePath = pathArg
    ? path.resolve(cwd, pathArg)
    // Outside the repository on purpose: a worktree nested inside the checkout
    // shows up as an untracked directory in every `git status` that follows.
    : path.join(path.dirname(repo.mainRoot), '.df-worktrees', path.basename(repo.mainRoot), id);
  const branch = `df/exec-${id}`;

  if (fs.existsSync(worktreePath)) {
    error(`Worktree path already exists: ${worktreePath}\nRemove it (git -C ${repo.mainRoot} worktree remove ${worktreePath}) or pass a different --id/--path.`);
  }
  if (git(repo.mainRoot, ['rev-parse', '--verify', `refs/heads/${branch}`]).exitCode === 0) {
    error(`Branch already exists: ${branch}\nA previous spawn for --id ${id} left it behind. Remove it, or pass a different --id.`);
  }

  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  const add = git(repo.mainRoot, ['worktree', 'add', '-b', branch, worktreePath, baseSha]);
  if (add.exitCode !== 0) {
    error(`git worktree add failed in ${repo.mainRoot}:\n${add.stderr || add.stdout}`);
  }

  const result = {
    ok: true,
    repo_root: repo.mainRoot,
    worktree_path: realpath(worktreePath),
    branch,
    base_ref: baseRef,
    base_sha: baseSha,
    merge_back: `git -C ${repo.mainRoot} merge --no-ff ${branch}`,
    remove: `git -C ${repo.mainRoot} worktree remove ${worktreePath}`,
  };
  output(result, raw, realpath(worktreePath));
}

// ── router ───────────────────────────────────────────────────────────────────

function cmdExecContextRoute(cwd, args, raw) {
  const sub = args[0];
  if (sub === 'check') {
    cmdExecContextCheck(cwd, args.slice(1), raw);
  } else if (sub === 'worktree') {
    cmdExecContextWorktree(cwd, args.slice(1), raw);
  } else {
    error(`Unknown exec-context subcommand${sub ? ': ' + sub : ''}. Available: check, worktree`);
  }
}

module.exports = { cmdExecContextRoute, cmdExecContextCheck, cmdExecContextWorktree, repoIdentity };
