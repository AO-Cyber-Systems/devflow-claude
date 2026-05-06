'use strict';

// Hand-built fixture builders for trd-tdd module tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.

// ─── F1: buildLegacyTddTrd ────────────────────────────────────────────────────

/**
 * Returns a TRD with TRD-level `type: tdd` and 2 plain tasks (no task-level tdd attr).
 * Tests back-compat: both tasks should resolve tdd_effective: true.
 */
function buildLegacyTddTrd() {
  return `---
objective: 99-test
trd: 99
type: tdd
wave: 1
depends_on: []
autonomous: true
---

<objective>
Legacy type:tdd TRD for testing back-compat resolution.
</objective>

<tasks>

<TASK-EX type="tdd">
  <name>Task 1: Red-green for feature A</name>
  <files>src/feature-a.cjs, src/feature-a.test.cjs</files>
  <action>Implement feature A with TDD.</action>
  <verify>node --test src/feature-a.test.cjs</verify>
  <done>Tests pass.</done>
</TASK-EX>

<TASK-EX type="tdd">
  <name>Task 2: Red-green for feature B</name>
  <files>src/feature-b.cjs, src/feature-b.test.cjs</files>
  <action>Implement feature B with TDD.</action>
  <verify>node --test src/feature-b.test.cjs</verify>
  <done>Tests pass.</done>
</TASK-EX>

</tasks>
`;
}

// ─── F2: buildTaskLevelTddTrd ─────────────────────────────────────────────────

/**
 * Returns a TRD with `type: standard` and mixed tasks:
 * - Task 1: tdd="true" (testable)
 * - Task 2: no tdd attr (non-testable)
 * Tests new task-level flag pattern.
 */
function buildTaskLevelTddTrd() {
  return `---
objective: 99-test
trd: 99
type: standard
wave: 1
depends_on: []
autonomous: true
---

<objective>
Mixed TRD: task-level tdd flag for testing new pattern.
</objective>

<tasks>

<TASK-EX type="auto" tdd="true">
  <name>Task 1 (testable): Add validateEmail function</name>
  <files>src/email.cjs, src/email.test.cjs</files>
  <action>Implement validateEmail with TDD.</action>
  <verify>node --test src/email.test.cjs</verify>
  <done>Tests pass.</done>
</TASK-EX>

<TASK-EX type="auto">
  <name>Task 2 (config): Update .env.example</name>
  <files>.env.example</files>
  <action>Add EMAIL_REGEX env var documentation.</action>
  <verify>cat .env.example | grep EMAIL_REGEX</verify>
  <done>Env var documented.</done>
</TASK-EX>

</tasks>
`;
}

// ─── F3: buildOverrideTddTrd ──────────────────────────────────────────────────

/**
 * Returns a TRD with `type: tdd` (TRD-level) but one task has explicit tdd="false".
 * Tests that explicit task override wins over TRD-level type.
 */
function buildOverrideTddTrd() {
  return `---
objective: 99-test
trd: 99
type: tdd
wave: 1
depends_on: []
autonomous: true
---

<objective>
TRD-level type:tdd with one task explicitly opting out of TDD.
</objective>

<tasks>

<TASK-EX type="tdd">
  <name>Task 1 (TDD): Implement parser</name>
  <files>src/parser.cjs, src/parser.test.cjs</files>
  <action>Implement parser with TDD cycle.</action>
  <verify>node --test src/parser.test.cjs</verify>
  <done>Tests pass.</done>
</TASK-EX>

<TASK-EX type="auto" tdd="false">
  <name>Task 2 (no TDD): Update config file</name>
  <files>config/settings.json</files>
  <action>Update config settings — no TDD needed, config-only.</action>
  <verify>cat config/settings.json | grep version</verify>
  <done>Config updated.</done>
</TASK-EX>

</tasks>
`;
}

// ─── F4: buildMalformedTrd ────────────────────────────────────────────────────

/**
 * Returns intentionally broken TRD content — a TASK-EX with no closing `>`.
 * Tests graceful skip for PA6: parser should return whatever was parsed so far.
 */
function buildMalformedTrd() {
  return `---
objective: 99-test
trd: 99
type: standard
wave: 1
depends_on: []
autonomous: true
---

<objective>
Malformed TRD for testing graceful degradation.
</objective>

<tasks>

<TASK-EX type="auto" tdd="true">
  <name>Task 1 (well-formed)</name>
  <files>src/good.cjs</files>
  <action>This task is well-formed.</action>
  <verify>echo ok</verify>
  <done>Done.</done>
</TASK-EX>

<TASK-EX type="auto" tdd="true" MISSING_CLOSING_BRACKET
  <name>Task 2 (malformed — no closing >)</name>
  <files>src/bad.cjs</files>
  <action>This task tag is broken.</action>
</tasks>
`;
}

// ─── F5: buildUnquotedAttrTrd ─────────────────────────────────────────────────

/**
 * Returns a TRD where tdd attribute is unquoted (tdd=true instead of tdd="true").
 * Tests PA3: relaxed attribute parsing.
 */
function buildUnquotedAttrTrd() {
  return `---
objective: 99-test
trd: 99
type: standard
wave: 1
depends_on: []
autonomous: true
---

<objective>
TRD with unquoted tdd attribute for relaxed parsing test.
</objective>

<tasks>

<TASK-EX type=auto tdd=true>
  <name>Task 1 (unquoted attrs)</name>
  <files>src/thing.cjs</files>
  <action>Task with unquoted attributes.</action>
  <verify>echo ok</verify>
  <done>Done.</done>
</TASK-EX>

</tasks>
`;
}

module.exports = {
  buildLegacyTddTrd,
  buildTaskLevelTddTrd,
  buildOverrideTddTrd,
  buildMalformedTrd,
  buildUnquotedAttrTrd,
};
