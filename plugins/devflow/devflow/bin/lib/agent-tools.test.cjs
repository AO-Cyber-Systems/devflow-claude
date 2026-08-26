'use strict';

/**
 * agent-tools.test.cjs — TRD 30-01
 *
 * Every tool an agent's instructions tell it to CALL must appear in that
 * agent's frontmatter `tools:` allowlist.
 *
 * The 2026-08-18 audit recorded 164 "No such tool available" results across 45
 * sessions — an agent being told to do something its allowlist forbids. The
 * failure is silent at authoring time and only shows up mid-run, so it needs a
 * mechanical guard rather than review.
 *
 * Scope is deliberately narrow: only an explicit `ToolName(` call in the body
 * counts. Prose like "read the file" is not evidence the Read tool is needed,
 * and treating it as such produced unusable noise.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', '..', 'agents');

// Tools whose call-form appears in DevFlow agent prompts.
const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Grep', 'Glob',
  'WebSearch', 'WebFetch', 'TaskCreate', 'TaskUpdate', 'AskUserQuestion',
];

function parseAgent(file) {
  const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8');
  const parts = raw.split('---');
  const fm = parts[1] || '';
  const body = parts.slice(2).join('---');
  const m = /^tools:\s*(.+)$/m.exec(fm);
  const declared = m ? m[1].split(',').map(s => s.trim()) : [];
  return { declared, body };
}

const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));

describe('TRD 30-01 — agent tool allowlists cover what the prompt calls', () => {
  for (const file of agentFiles) {
    test(`${file.replace(/\.md$/, '')}: every called tool is declared`, () => {
      const { declared, body } = parseAgent(file);
      // strip fenced code that is shell, not tool calls
      const called = KNOWN_TOOLS.filter(t => new RegExp(`\\b${t}\\(`).test(body));
      const missing = called.filter(t => !declared.includes(t));
      assert.deepEqual(
        missing, [],
        `${file} instructs ${missing.join(', ')} but does not declare ${missing.length > 1 ? 'them' : 'it'} in tools:`
      );
    });
  }

  test('every agent declares a non-empty tools list', () => {
    for (const file of agentFiles) {
      const { declared } = parseAgent(file);
      assert.ok(declared.length > 0, `${file} has no tools: line`);
    }
  });

  test('no agent declares a tool name with stray whitespace or an empty entry', () => {
    for (const file of agentFiles) {
      const { declared } = parseAgent(file);
      for (const d of declared) {
        assert.ok(d.length > 0, `${file}: empty entry in tools:`);
        assert.equal(d, d.trim(), `${file}: "${d}" has stray whitespace`);
      }
    }
  });
});
