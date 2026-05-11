'use strict';

/**
 * Monorepo layout validator.
 *
 * Reads root `CLAUDE.md` to discover the declared layout, then walks the
 * working tree and reports:
 *   - declared areas that don't exist on disk
 *   - undeclared top-level directories (likely missing from the table)
 *   - areas missing their `CLAUDE.md`
 *   - tracked binaries (>= maxBytes or executable-magic) outside allowed paths
 *
 * Pure library — no process.exit, no console.* — so we can unit-test it.
 * The CLI thin-wrapper lives in `cli.js`.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_PATHS = [
  'assets/**',
  '**/assets/**',
  '**/fixtures/**',
  '**/testdata/**',
  'docs/**/*.png',
  'docs/**/*.jpg',
  'docs/**/*.jpeg',
  'docs/**/*.gif',
  'docs/**/*.webp',
  'docs/**/*.pdf'
];
const DEFAULT_ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.mp3', '.mp4', '.mov', '.wav', '.ogg',
  '.ttf', '.otf', '.woff', '.woff2', '.eot'
]);
// Top-level directories that are always considered legitimate even when
// not in the Layout table.
const ALWAYS_IGNORE_TOPLEVEL = new Set([
  '.git', '.github', '.devflow', '.planning', '.claude', '.claude-plugin',
  '.worktrees', '.vscode', '.idea', 'node_modules', 'vendor', 'docs', 'scripts'
]);

// ---- CLAUDE.md layout parsing ---------------------------------------

/**
 * Parse a CLAUDE.md and return the set of declared monorepo areas.
 *
 * Recognised forms:
 *   1. A markdown table whose header has a "Path" / "Directory" / "Area"
 *      column; rows pull the path from that column.
 *   2. A `## Layout` (or `## Monorepo Layout` / `## Repository Layout`)
 *      section followed by either a table or a bullet list with paths
 *      either fenced in `code` or bare like "- go/ — Go services".
 *
 * Returns an array of normalised relative paths (no trailing slash).
 */
function parseDeclaredAreas(claudeMd) {
  if (!claudeMd) return [];
  const lines = claudeMd.split(/\r?\n/);
  const out = new Set();

  // Find any "Layout" heading and the slice that follows it.
  const layoutHeading = /^#{1,6}\s+(?:Monorepo\s+|Repository\s+|Repo\s+)?Layout\b/i;
  let layoutStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (layoutHeading.test(lines[i])) { layoutStart = i; break; }
  }
  // If no Layout section, fall back to scanning every table.
  const scanFrom = layoutStart === -1 ? 0 : layoutStart;
  let scanTo = lines.length;
  if (layoutStart !== -1) {
    for (let i = layoutStart + 1; i < lines.length; i++) {
      if (/^#{1,6}\s+/.test(lines[i])) { scanTo = i; break; }
    }
  }

  // Pass 1: tables. A row is `| a | b | c |`.
  for (let i = scanFrom; i < scanTo; i++) {
    const row = lines[i];
    if (!/^\s*\|.+\|\s*$/.test(row)) continue;
    // Identify header (line before separator like `|---|---|`).
    if (!/^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(lines[i + 1] || '')) {
      continue;
    }
    const headerCols = row.split('|').slice(1, -1).map((s) => s.trim().toLowerCase());
    const pathIdx = headerCols.findIndex((h) =>
      /^(path|directory|dir|area|folder)$/.test(h));
    if (pathIdx < 0) continue;
    // Walk rows until blank or next non-table line.
    for (let j = i + 2; j < scanTo; j++) {
      const r = lines[j];
      if (!/^\s*\|.+\|\s*$/.test(r)) break;
      const cells = r.split('|').slice(1, -1).map((s) => s.trim());
      let cell = cells[pathIdx] || '';
      // Unwrap backticks
      cell = cell.replace(/^`(.+)`$/, '$1').trim();
      // Skip empty / placeholder / heading-cell rows
      if (!cell || cell === '-' || cell === '—') continue;
      // Strip trailing slash
      cell = cell.replace(/\/+$/, '');
      // Skip anything with shell glob chars
      if (/[*?]/.test(cell)) continue;
      out.add(cell);
    }
    i = scanTo; // tables-in-Layout: one is enough
    break;
  }

  // Pass 2: bullet list `- go/ — Go services` inside Layout section.
  if (out.size === 0 && layoutStart !== -1) {
    const bullet = /^\s*[-*]\s+`?([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)\/?`?(?:\s|—|--|$)/;
    for (let i = layoutStart + 1; i < scanTo; i++) {
      const m = lines[i].match(bullet);
      if (m) out.add(m[1].replace(/\/+$/, ''));
    }
  }

  return Array.from(out);
}

// ---- glob helper ----------------------------------------------------

function globToRegex(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else { re += '[^/]*'; }
    } else if (c === '?') { re += '[^/]'; }
    else if ('.+^$(){}|[]\\'.includes(c)) { re += '\\' + c; }
    else { re += c; }
  }
  return new RegExp(re + '$');
}

function matchesAny(p, patterns) {
  return patterns.some((g) => globToRegex(g).test(p));
}

// ---- magic-byte sniff ----------------------------------------------

function looksExecutable(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return 'ELF';
  const m = buf.readUInt32BE(0);
  if (m === 0xfeedface || m === 0xcefaedfe || m === 0xfeedfacf ||
      m === 0xcffaedfe || m === 0xcafebabe || m === 0xbebafeca) return 'Mach-O';
  if (buf[0] === 0x4d && buf[1] === 0x5a) return 'PE';
  if (buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d) return 'WASM';
  return null;
}

// ---- walking the tree -----------------------------------------------

function* walk(root, opts) {
  const skipDirs = new Set([
    '.git', 'node_modules', '.devflow', '.planning', '.worktrees',
    '.vscode', '.idea', '.next', 'dist', 'build', 'out', 'target',
    '.dart_tool', '.gradle', '.flutter-plugins-dependencies'
  ]);
  const maxDepth = (opts && opts.maxDepth) != null ? opts.maxDepth : 6;
  function* recurse(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) {
        // allow .github/.devflow but skip the heavy ones
        if (skipDirs.has(ent.name)) continue;
      }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirs.has(ent.name)) continue;
        yield { type: 'dir', full };
        yield* recurse(full, depth + 1);
      } else if (ent.isFile()) {
        yield { type: 'file', full };
      }
    }
  }
  yield* recurse(root, 0);
}

function topLevelDirs(root) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !ALWAYS_IGNORE_TOPLEVEL.has(e.name))
    .map((e) => e.name);
}

// ---- main audit -----------------------------------------------------

/**
 * Run all checks against a working tree and return a structured report.
 *
 * Inputs:
 *   root        — absolute path to the monorepo root
 *   options:
 *     maxBytes        — size threshold for binary detection
 *     allowedPaths    — glob list, default DEFAULT_ALLOWED_PATHS
 *     allowedExts     — extension allow-list (Set<string lowercased>)
 *     skipBinaryScan  — bool, default false (used by status-check fast path)
 *
 * Returns:
 *   {
 *     layoutDeclared,
 *     layoutMissing,
 *     layoutUndeclared,
 *     missingAreaClaudeMd,
 *     binaries: [{ path, reason, sizeBytes }],
 *     hasClaudeMd,
 *     summary: '...'
 *   }
 */
function audit(root, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const allowedPaths = options.allowedPaths || DEFAULT_ALLOWED_PATHS;
  const allowedExts = options.allowedExts || DEFAULT_ALLOWED_EXTENSIONS;

  const claudeMdPath = path.join(root, 'CLAUDE.md');
  const hasClaudeMd = fs.existsSync(claudeMdPath);
  const layoutDeclared = hasClaudeMd
    ? parseDeclaredAreas(fs.readFileSync(claudeMdPath, 'utf8'))
    : [];

  // Compare declared to disk.
  const onDiskTop = new Set(topLevelDirs(root));
  const declaredSet = new Set(layoutDeclared);
  const layoutMissing = layoutDeclared
    .filter((p) => !fs.existsSync(path.join(root, p)));
  const layoutUndeclared = [...onDiskTop]
    .filter((d) => !declaredSet.has(d) && !layoutDeclared.some((decl) => decl.startsWith(d + '/')))
    .sort();

  // Check per-area CLAUDE.md.
  const missingAreaClaudeMd = [];
  for (const area of layoutDeclared) {
    const dir = path.join(root, area);
    if (!fs.existsSync(dir)) continue;
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(path.join(dir, 'CLAUDE.md'))) {
      missingAreaClaudeMd.push(area);
    }
  }

  // Scan tree for binaries (working-tree, not index — quicker, and we want
  // to catch untracked ones too).
  const binaries = [];
  if (!options.skipBinaryScan) {
    for (const ent of walk(root, { maxDepth: 6 })) {
      if (ent.type !== 'file') continue;
      const rel = path.relative(root, ent.full).split(path.sep).join('/');
      if (matchesAny(rel, allowedPaths)) continue;
      const ext = path.extname(rel).toLowerCase();
      if (allowedExts.has(ext)) continue;

      let stat;
      try { stat = fs.statSync(ent.full); } catch { continue; }
      if (!stat.isFile()) continue;

      if (stat.size > maxBytes) {
        binaries.push({
          path: rel,
          sizeBytes: stat.size,
          reason: `exceeds size limit (${fmtSize(stat.size)} > ${fmtSize(maxBytes)})`
        });
        continue;
      }
      // Magic-byte sniff (only for files that could plausibly be binary)
      let fd;
      try {
        fd = fs.openSync(ent.full, 'r');
        const buf = Buffer.alloc(16);
        fs.readSync(fd, buf, 0, 16, 0);
        const kind = looksExecutable(buf);
        if (kind) {
          binaries.push({
            path: rel,
            sizeBytes: stat.size,
            reason: `native ${kind} executable/object`
          });
        }
      } catch { /* unreadable */ }
      finally { if (fd) try { fs.closeSync(fd); } catch { /* */ } }
    }
  }

  const ok =
    hasClaudeMd &&
    layoutDeclared.length > 0 &&
    layoutMissing.length === 0 &&
    layoutUndeclared.length === 0 &&
    missingAreaClaudeMd.length === 0 &&
    binaries.length === 0;

  return {
    hasClaudeMd,
    layoutDeclared,
    layoutMissing,
    layoutUndeclared,
    missingAreaClaudeMd,
    binaries,
    ok
  };
}

function fmtSize(b) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${b} B`;
}

function renderReport(report, opts = {}) {
  const lines = [];
  const indent = opts.indent || '';
  lines.push(`${indent}# Monorepo Doctor`);
  lines.push('');
  if (!report.hasClaudeMd) {
    lines.push(`${indent}**FAIL** — root CLAUDE.md is missing.`);
    lines.push(`${indent}Run \`/devflow:new-monorepo\` (or copy from monorepo-scaffold template) to generate one.`);
    return lines.join('\n');
  }
  if (report.layoutDeclared.length === 0) {
    lines.push(`${indent}**WARN** — CLAUDE.md exists but no Layout table was detected.`);
    lines.push(`${indent}Add a section starting with \`## Layout\` (or \`## Monorepo Layout\`) followed by a markdown table whose header has a "Path" column listing each top-level area.`);
    lines.push('');
  } else {
    lines.push(`${indent}**Declared areas (${report.layoutDeclared.length}):** ${report.layoutDeclared.join(', ')}`);
    lines.push('');
  }
  if (report.layoutMissing.length) {
    lines.push(`${indent}## Declared areas missing on disk`);
    for (const a of report.layoutMissing) lines.push(`${indent}- ${a}`);
    lines.push('');
  }
  if (report.layoutUndeclared.length) {
    lines.push(`${indent}## Top-level dirs not declared in CLAUDE.md`);
    for (const d of report.layoutUndeclared) lines.push(`${indent}- ${d}/`);
    lines.push(`${indent}_Add these to the Layout table or move them under an existing area._`);
    lines.push('');
  }
  if (report.missingAreaClaudeMd.length) {
    lines.push(`${indent}## Areas without CLAUDE.md`);
    for (const a of report.missingAreaClaudeMd) lines.push(`${indent}- ${a}/CLAUDE.md`);
    lines.push(`${indent}_Each area needs its own CLAUDE.md so Claude Code knows the local conventions (lang, build cmds, test cmds)._`);
    lines.push('');
  }
  if (report.binaries.length) {
    lines.push(`${indent}## Tracked binaries`);
    for (const b of report.binaries) {
      lines.push(`${indent}- ${b.path} (${fmtSize(b.sizeBytes)}) — ${b.reason}`);
    }
    lines.push(`${indent}_Delete from tree, add to .gitignore, and ship as release artifacts instead._`);
    lines.push('');
  }
  if (report.ok) {
    lines.push(`${indent}**PASS** — layout matches CLAUDE.md, every area has its own CLAUDE.md, no tracked binaries.`);
  } else {
    lines.push(`${indent}**FAIL** — fix the above to bring the monorepo into compliance.`);
  }
  return lines.join('\n');
}

module.exports = {
  audit,
  parseDeclaredAreas,
  renderReport,
  globToRegex,
  matchesAny,
  looksExecutable,
  fmtSize,
  DEFAULT_MAX_BYTES,
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_ALLOWED_EXTENSIONS,
  ALWAYS_IGNORE_TOPLEVEL
};
