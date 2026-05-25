'use strict';

// parseMustHavesArtifacts(rawContent) — raw-FM scanner for must_haves.artifacts.
// The permissive extractFrontmatter in frontmatter.cjs flattens nested
// block-array items to strings (e.g. ["path: lib/foo.dart"]), losing all
// sub-fields. Downstream consumers needing structured {path, states, tests}
// objects must parse the raw FM directly. Mirrors parseApiContractBlock in
// api-contract.cjs.
//
// Returns Array<{path, provides?, contains?, contains_also?[], states?[],
//                tests?: {widget?, integration?, maestro?}}>
function parseMustHavesArtifacts(rawContent) {
  const fmMatch = rawContent.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const lines = fmMatch[1].split('\n');

  let inMustHaves = false;
  let inArtifacts = false;
  let inTests = false;
  let artifactBaseIndent = -1;
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (/^must_haves:\s*$/.test(line)) {
      inMustHaves = true; inArtifacts = false; inTests = false;
      continue;
    }
    if (!inMustHaves) continue;

    // Top-level key (no leading space) ends must_haves
    if (/^\S/.test(line)) {
      if (current) entries.push(current);
      return entries.filter(e => e.path);
    }

    // Sub-key of must_haves
    if (/^\s{2}artifacts:\s*$/.test(line)) {
      inArtifacts = true; inTests = false;
      if (current) { entries.push(current); current = null; }
      continue;
    }
    if (/^\s{2}\S/.test(line)) {
      // Different must_haves sub-key (truths, key_links, etc.) — exit artifacts mode
      if (current) { entries.push(current); current = null; }
      inArtifacts = false; inTests = false;
      continue;
    }
    if (!inArtifacts) continue;

    // Artifact list item: "    - path: X"
    const itemStart = line.match(/^(\s+)-\s+path:\s*(.+)$/);
    if (itemStart) {
      if (current) entries.push(current);
      current = { path: itemStart[2].trim() };
      artifactBaseIndent = itemStart[1].length;
      inTests = false;
      continue;
    }
    if (!current) continue;

    // tests: nested block
    if (/^\s+tests:\s*$/.test(line)) {
      inTests = true;
      current.tests = current.tests || {};
      continue;
    }

    if (inTests) {
      const testEntry = line.match(/^\s+(widget|integration|maestro):\s*(.+)$/);
      if (testEntry) {
        current.tests[testEntry[1]] = testEntry[2].trim();
        continue;
      }
      // Non-test field at a lower indent breaks out of tests block
      if (/^\s+\S+:\s*(.*)$/.test(line) && !/^\s+(widget|integration|maestro):/.test(line)) {
        inTests = false;
      }
    }

    // Simple artifact sub-fields
    const subField = line.match(/^\s+(provides|contains|contains_also|states):\s*(.*)$/);
    if (subField) {
      const key = subField[1];
      const rawVal = subField[2].trim();
      if (key === 'states' || key === 'contains_also') {
        const inlineArr = rawVal.match(/^\[(.*)\]$/);
        if (inlineArr) {
          current[key] = inlineArr[1].split(',').map(s => s.trim()).filter(Boolean);
        } else if (rawVal) {
          current[key] = [rawVal];
        } else {
          current[key] = [];
        }
      } else {
        current[key] = rawVal;
      }
    }
  }
  if (current) entries.push(current);
  return entries.filter(e => e.path);
}

module.exports = { parseMustHavesArtifacts };
