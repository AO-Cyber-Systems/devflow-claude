'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { audit, parseDeclaredAreas, renderReport, looksExecutable } =
  require('./doctor.js');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'));
}

function write(repo, rel, contents) {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

// --- parseDeclaredAreas ---

test('parseDeclaredAreas: table with Path column', () => {
  const md = `
# Project

## Layout

| Path | Purpose |
|------|---------|
| \`go/\` | Go services |
| \`flutter/\` | Mobile app |
| \`admin/\` | Admin web UI |
| \`proto/\` | gRPC schemas |
`;
  const areas = parseDeclaredAreas(md);
  assert.deepStrictEqual(areas.sort(), ['admin', 'flutter', 'go', 'proto']);
});

test('parseDeclaredAreas: bullet list under Layout', () => {
  const md = `
## Monorepo Layout

- \`go/\` — Go services
- \`flutter/\` — Flutter mobile
- \`proto/\` — gRPC schemas
`;
  const areas = parseDeclaredAreas(md);
  assert.deepStrictEqual(areas.sort(), ['flutter', 'go', 'proto']);
});

test('parseDeclaredAreas: nested paths', () => {
  const md = `
## Layout

| Directory | Notes |
|-----------|-------|
| go/cmd/server | entrypoint |
| flutter/lib   | dart code |
`;
  const areas = parseDeclaredAreas(md);
  assert.deepStrictEqual(areas.sort(), ['flutter/lib', 'go/cmd/server']);
});

test('parseDeclaredAreas: no layout section returns empty', () => {
  assert.deepStrictEqual(parseDeclaredAreas('# Just a header\n'), []);
});

test('parseDeclaredAreas: glob entries skipped', () => {
  const md = `
## Layout

| Path | x |
|------|---|
| \`go/\` | a |
| \`*/CLAUDE.md\` | b |
`;
  const areas = parseDeclaredAreas(md);
  assert.deepStrictEqual(areas, ['go']);
});

// --- audit ---

test('audit: missing CLAUDE.md → FAIL', () => {
  const repo = tmpRepo();
  const r = audit(repo);
  assert.strictEqual(r.hasClaudeMd, false);
  assert.strictEqual(r.ok, false);
});

test('audit: full happy path passes', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `
## Layout

| Path | x |
|------|---|
| \`go/\` | s |
| \`flutter/\` | s |
`);
  write(repo, 'go/CLAUDE.md', '# go area\n');
  write(repo, 'flutter/CLAUDE.md', '# flutter\n');
  write(repo, 'go/main.go', 'package main\n');
  const r = audit(repo);
  assert.strictEqual(r.hasClaudeMd, true);
  assert.deepStrictEqual(r.layoutDeclared.sort(), ['flutter', 'go']);
  assert.deepStrictEqual(r.layoutMissing, []);
  assert.deepStrictEqual(r.missingAreaClaudeMd, []);
  assert.deepStrictEqual(r.layoutUndeclared, []);
  assert.deepStrictEqual(r.binaries, []);
  assert.strictEqual(r.ok, true);
});

test('audit: declared area missing on disk is flagged', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `
## Layout

| Path | x |
|------|---|
| \`go/\` | s |
| \`flutter/\` | s |
`);
  write(repo, 'go/CLAUDE.md', '# go\n');
  const r = audit(repo);
  assert.deepStrictEqual(r.layoutMissing, ['flutter']);
  assert.strictEqual(r.ok, false);
});

test('audit: undeclared top-level dir is flagged', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `
## Layout

| Path | x |
|------|---|
| \`go/\` | s |
`);
  write(repo, 'go/CLAUDE.md', '# go\n');
  // pos/ exists but isn't declared
  write(repo, 'pos/main.dart', 'void main(){}\n');
  const r = audit(repo);
  assert.ok(r.layoutUndeclared.includes('pos'));
  assert.strictEqual(r.ok, false);
});

test('audit: area without CLAUDE.md is flagged', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `
## Layout

| Path | x |
|------|---|
| \`go/\` | s |
`);
  write(repo, 'go/main.go', 'package main\n');
  const r = audit(repo);
  assert.deepStrictEqual(r.missingAreaClaudeMd, ['go']);
  assert.strictEqual(r.ok, false);
});

test('audit: tracked Mach-O binary is flagged', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `## Layout\n\n| Path | x |\n|---|---|\n| go/ | s |\n`);
  write(repo, 'go/CLAUDE.md', 'x');
  // Mach-O fat magic
  const machO = Buffer.concat([
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
    Buffer.alloc(2048)
  ]);
  write(repo, 'go/server', machO);
  const r = audit(repo);
  assert.ok(r.binaries.find((b) => b.path === 'go/server'));
  assert.strictEqual(r.ok, false);
});

test('audit: large binary > maxBytes flagged', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `## Layout\n\n| Path | x |\n|---|---|\n| go/ | s |\n`);
  write(repo, 'go/CLAUDE.md', 'x');
  write(repo, 'go/big.dat', Buffer.alloc(6 * 1024 * 1024));
  const r = audit(repo);
  assert.ok(r.binaries.find((b) => b.path === 'go/big.dat'));
});

test('audit: PNG in assets/ does NOT trigger binary flag', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `## Layout\n\n| Path | x |\n|---|---|\n| go/ | s |\n`);
  write(repo, 'go/CLAUDE.md', 'x');
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.alloc(2048)
  ]);
  write(repo, 'assets/logo.png', png);
  // assets/ is not in Layout — that becomes an "undeclared" warning, not a binary one
  const r = audit(repo);
  assert.deepStrictEqual(r.binaries, []);
});

test('audit: skipBinaryScan suppresses scan', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `## Layout\n\n| Path | x |\n|---|---|\n| go/ | s |\n`);
  write(repo, 'go/CLAUDE.md', 'x');
  write(repo, 'go/big.dat', Buffer.alloc(6 * 1024 * 1024));
  const r = audit(repo, { skipBinaryScan: true });
  assert.deepStrictEqual(r.binaries, []);
});

// --- renderReport ---

test('renderReport: PASS includes pass marker', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `## Layout\n\n| Path | x |\n|---|---|\n| go/ | s |\n`);
  write(repo, 'go/CLAUDE.md', 'x');
  const r = audit(repo);
  const out = renderReport(r);
  assert.match(out, /\*\*PASS\*\*/);
});

test('renderReport: FAIL lists every issue category', () => {
  const repo = tmpRepo();
  write(repo, 'CLAUDE.md', `## Layout\n\n| Path | x |\n|---|---|\n| go/ | s |\n| flutter/ | s |\n`);
  // go missing, flutter exists but no CLAUDE.md, extras/ undeclared, binary present
  write(repo, 'flutter/main.dart', 'x');
  write(repo, 'extras/leftover.txt', 'x');
  write(repo, 'flutter/server', Buffer.concat([
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(256)
  ]));
  const r = audit(repo);
  const out = renderReport(r);
  assert.match(out, /Declared areas missing on disk/);
  assert.match(out, /Top-level dirs not declared/);
  assert.match(out, /Areas without CLAUDE.md/);
  assert.match(out, /Tracked binaries/);
  assert.match(out, /\*\*FAIL\*\*/);
});

// --- looksExecutable smoke ---
test('looksExecutable smoke', () => {
  assert.strictEqual(looksExecutable(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), 'ELF');
  assert.strictEqual(looksExecutable(Buffer.from('hello')), null);
});
