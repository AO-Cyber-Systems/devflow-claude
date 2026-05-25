'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { output } = require('./helpers.cjs');

function sha256File(filePath, cwd = process.cwd()) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function detectDrift(contract, cwd = process.cwd()) {
  const drift = [];
  for (const entry of contract || []) {
    const current = sha256File(entry.path, cwd);
    if (current === null) {
      drift.push({ path: entry.path, expected: entry.sha, actual: null, status: 'MISSING' });
    } else if (current !== entry.sha) {
      drift.push({ path: entry.path, expected: entry.sha, actual: current, status: 'DRIFTED' });
    }
  }
  return { drift, ok: drift.length === 0 };
}

// extractFrontmatter (frontmatter.cjs) flattens "- key: value" array items to
// strings, so api_contract entries lose the `sha:` line. Parse raw FM directly.
function parseApiContractBlock(rawContent) {
  const fmMatch = rawContent.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const lines = fmMatch[1].split('\n');
  const entries = [];
  let inBlock = false;
  let current = null;
  for (const line of lines) {
    if (/^api_contract:\s*$/.test(line)) { inBlock = true; continue; }
    if (!inBlock) continue;
    if (/^\S/.test(line)) {
      if (current) { entries.push(current); current = null; }
      inBlock = false;
      continue;
    }
    const itemStart = line.match(/^\s+-\s+path:\s*(.+)$/);
    if (itemStart) {
      if (current) entries.push(current);
      current = { path: itemStart[1].trim() };
      continue;
    }
    const shaLine = line.match(/^\s+sha:\s*(.+)$/);
    if (shaLine && current) { current.sha = shaLine[1].trim(); continue; }
  }
  if (current) entries.push(current);
  return entries.filter(e => e.path && e.sha);
}

function cmdVerifyApiContract(cwd, trdPath, raw) {
  if (!trdPath) {
    output({ error: 'TRD path required', ok: false, drift: [] }, raw);
    return;
  }
  const absTrd = path.isAbsolute(trdPath) ? trdPath : path.join(cwd, trdPath);
  if (!fs.existsSync(absTrd)) {
    output({ error: 'TRD not found', trd_path: trdPath, ok: false, drift: [] }, raw);
    return;
  }
  const content = fs.readFileSync(absTrd, 'utf-8');
  const contract = parseApiContractBlock(content);
  const result = detectDrift(contract, cwd);
  output({ ...result, trd_path: absTrd }, raw);
}

module.exports = { sha256File, detectDrift, parseApiContractBlock, cmdVerifyApiContract };
