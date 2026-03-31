'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Model Profile Table ──────────────────────────────────────────────────────

const MODEL_PROFILES_PATH = path.join(__dirname, '../../references/model-profiles.json');
const _modelProfilesData = JSON.parse(fs.readFileSync(MODEL_PROFILES_PATH, 'utf-8'));
const MODEL_PROFILES = _modelProfilesData.agents;

// ─── Output / Error ──────────────────────────────────────────────────────────

function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    const json = JSON.stringify(result, null, 2);
    // Large payloads exceed Claude Code's Bash tool buffer (~50KB).
    // Write to tmpfile and output the path prefixed with @file: so callers can detect it.
    if (json.length > 50000) {
      const tmpPath = path.join(require('os').tmpdir(), `df-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf-8');
      process.stdout.write('@file:' + tmpPath);
    } else {
      process.stdout.write(json);
    }
  }
  process.exit(0);
}

function error(message) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}

// ─── Pure Utilities ───────────────────────────────────────────────────────────

function parseIncludeFlag(args) {
  const includeIndex = args.indexOf('--include');
  if (includeIndex === -1) return new Set();
  const includeValue = args[includeIndex + 1];
  if (!includeValue) return new Set();
  return new Set(includeValue.split(',').map(s => s.trim()));
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ─── TRD/JOB Dual-Pattern Helpers ────────────────────────────────────────────

function findPlanFiles(dirFiles) {
  const trdFiles = dirFiles.filter(f => f.endsWith('-TRD.md') || f === 'TRD.md');
  const jobFiles = dirFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
  return trdFiles.length > 0 ? trdFiles : jobFiles;
}

function stripPlanSuffix(filename) {
  return filename.replace(/-?TRD\.md$/, '').replace(/-?JOB\.md$/, '');
}

function isTaskDoc(filename) {
  return filename.endsWith('-TRD.md') || filename.endsWith('-JOB.md') ||
         filename === 'TRD.md' || filename === 'JOB.md';
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeObjectiveName(objective) {
  const match = objective.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return objective;
  const num = match[1];
  const parts = num.split('.');
  const padded = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}

function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Git Helpers ──────────────────────────────────────────────────────────────

function isGitIgnored(cwd, targetPath) {
  try {
    execSync('git check-ignore -q -- ' + targetPath.replace(/[^a-zA-Z0-9._\-/]/g, ''), {
      cwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function execGit(cwd, args) {
  try {
    const escaped = args.map(a => {
      if (/^[a-zA-Z0-9._\-/=:@]+$/.test(a)) return a;
      return "'" + a.replace(/'/g, "'\\''") + "'";
    });
    const stdout = execSync('git ' + escaped.join(' '), {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function pathExistsInternal(cwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MODEL_PROFILES_PATH,
  MODEL_PROFILES,
  output,
  error,
  parseIncludeFlag,
  safeReadFile,
  findPlanFiles,
  stripPlanSuffix,
  isTaskDoc,
  normalizeObjectiveName,
  generateSlugInternal,
  isGitIgnored,
  execGit,
  pathExistsInternal,
};
