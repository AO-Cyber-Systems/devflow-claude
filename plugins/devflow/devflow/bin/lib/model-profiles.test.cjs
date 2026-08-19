'use strict';

/**
 * model-profiles.test.cjs — TRD 28-02
 *
 * Asserts the model profile table actually BINDS. The 2026-08-18 audit found it
 * did not: profile keys carried a `df-` prefix, the three skills that call
 * `df-tools resolve-model` passed un-prefixed names, and the miss fell through
 * to a hard-coded 'sonnet' — silently, for every agent, regardless of profile.
 * Nothing failed loudly, so the whole table looked like it was working.
 *
 * These tests are the mechanical guard against that class of drift:
 *   - agent files and profile entries stay in one-to-one correspondence
 *   - both key spellings resolve identically
 *   - every tier names a real model id
 *   - resolution is auditable (tier + concrete id, not just an alias)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
const PROFILES_PATH = path.join(__dirname, '..', '..', 'references', 'model-profiles.json');
const AGENTS_DIR = path.join(__dirname, '..', '..', '..', 'agents');
const DF_TOOLS = path.join(__dirname, '..', 'df-tools.cjs');

const profiles = JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
const agentFiles = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
const agentNames = agentFiles.map(f => f.replace(/\.md$/, '')).sort();
const profileKeys = Object.keys(profiles.agents).sort();

function resolveModel(agentKey) {
  const r = spawnSync(process.execPath, [DF_TOOLS, 'resolve-model', agentKey], {
    cwd: REPO, encoding: 'utf8',
  });
  try { return JSON.parse(r.stdout); } catch { return { _raw: r.stdout, _err: r.stderr }; }
}

describe('TRD 28-02 — the model profile table binds', () => {
  test('every agent on disk has a profile entry', () => {
    const missing = agentNames.filter(a => !profileKeys.includes(a));
    assert.deepEqual(missing, [], `agents with no profile entry: ${missing.join(', ')}`);
  });

  test('every profile entry corresponds to an agent on disk (no orphans)', () => {
    const orphans = profileKeys.filter(k => !agentNames.includes(k));
    assert.deepEqual(orphans, [], `profile entries with no agent file: ${orphans.join(', ')}`);
  });

  test('profile keys are canonical — no df- prefix in the table', () => {
    const prefixed = profileKeys.filter(k => k.startsWith('df-'));
    assert.deepEqual(prefixed, [], `df- prefixed keys must be canonicalised: ${prefixed.join(', ')}`);
  });

  test('every tier referenced by an agent exists in models{}', () => {
    const tiers = new Set();
    for (const entry of Object.values(profiles.agents)) {
      for (const tier of Object.values(entry)) tiers.add(tier);
    }
    const unknown = [...tiers].filter(t => !profiles.models[t]);
    assert.deepEqual(unknown, [], `tiers with no model id: ${unknown.join(', ')}`);
  });

  test('model ids carry no deprecated date suffix', () => {
    for (const [tier, id] of Object.entries(profiles.models)) {
      assert.ok(
        !/-\d{8}$/.test(id),
        `models.${tier} = "${id}" has a date suffix; use the undated id`
      );
    }
  });

  test('every agent declares all three profile tiers', () => {
    for (const [agent, entry] of Object.entries(profiles.agents)) {
      for (const profile of ['quality', 'balanced', 'budget']) {
        assert.ok(entry[profile], `agents.${agent} is missing the "${profile}" tier`);
      }
    }
  });
});

describe('TRD 28-02 — resolve-model resolution is correct and auditable', () => {
  test('both key spellings resolve identically', () => {
    for (const agent of agentNames) {
      const bare = resolveModel(agent);
      const prefixed = resolveModel(`df-${agent}`);
      assert.equal(bare.model, prefixed.model, `${agent}: bare=${bare.model} df-=${prefixed.model}`);
      assert.equal(bare.tier, prefixed.tier, `${agent}: tier mismatch between spellings`);
    }
  });

  test('no known agent falls through to the unknown-agent default', () => {
    const fellThrough = agentNames.filter(a => resolveModel(a).unknown_agent === true);
    assert.deepEqual(fellThrough, [],
      `these resolved via the silent 'sonnet' fallback: ${fellThrough.join(', ')}`);
  });

  test('resolution reports tier and concrete model id, not just the alias', () => {
    const r = resolveModel('planner');
    assert.equal(r.agent, 'planner');
    assert.ok(r.tier, 'expected a tier in the result');
    assert.ok(r.model_id, 'expected a concrete model_id in the result');
    assert.equal(r.model_id, profiles.models[r.tier]);
  });

  test('opus tier maps to the inherit alias (agent keeps the session model)', () => {
    const r = resolveModel('planner'); // opus at the balanced profile
    assert.equal(r.tier, 'opus');
    assert.equal(r.model, 'inherit');
  });

  test('an unknown agent is flagged, not silently defaulted', () => {
    const r = resolveModel('definitely-not-an-agent');
    assert.equal(r.unknown_agent, true);
    assert.equal(r.model, 'sonnet');
    assert.equal(r.requested, 'definitely-not-an-agent');
  });
});

describe('TRD 28-02 — agent frontmatter is consistent with the tier table', () => {
  // Haiku 4.5 REJECTS the `effort` parameter (it is supported from Opus 4.5 /
  // Sonnet 5 upward). An agent that can resolve to the haiku tier must not
  // declare effort in frontmatter, or that run 400s.
  test('no agent that can resolve to haiku declares an effort in frontmatter', () => {
    const offenders = [];
    for (const agent of agentNames) {
      const entry = profiles.agents[agent] || {};
      const canBeHaiku = Object.values(entry).includes('haiku');
      if (!canBeHaiku) continue;
      const fm = fs.readFileSync(path.join(AGENTS_DIR, `${agent}.md`), 'utf8').split('---')[1] || '';
      if (/^effort:/m.test(fm)) offenders.push(agent);
    }
    assert.deepEqual(offenders, [],
      `these can resolve to haiku but declare effort (Haiku 4.5 rejects it): ${offenders.join(', ')}`);
  });

  test('any declared effort is a valid level', () => {
    const VALID = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
    for (const agent of agentNames) {
      const fm = fs.readFileSync(path.join(AGENTS_DIR, `${agent}.md`), 'utf8').split('---')[1] || '';
      const m = /^effort:\s*(\S+)/m.exec(fm);
      if (!m) continue;
      assert.ok(VALID.has(m[1]), `${agent}: effort "${m[1]}" is not a valid level`);
    }
  });
});
