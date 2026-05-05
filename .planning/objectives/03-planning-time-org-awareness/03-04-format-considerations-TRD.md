---
objective: 03-planning-time-org-awareness
trd: 03-04
title: formatConsiderations markdown renderer + considerations CLI
type: tdd
confidence: high
wave: 4
depends_on: [03-01, 03-02, 03-03]
files_modified:
  - plugins/devflow/devflow/bin/lib/org-awareness.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  - plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
autonomous: true
requirements: [SC-7]
verification_commands:
  - "npm test -- --grep 'formatConsiderations|render|considerations'"
  - "node -e 'const a=require(\"./plugins/devflow/devflow/bin/lib/org-awareness.cjs\"); if(typeof a.formatConsiderations!==\"function\") throw new Error(\"formatConsiderations not exported\"); console.log(\"OK\");'"
  - "node ./plugins/devflow/devflow/bin/df-tools.cjs org-awareness considerations 03 2>&1 | grep -E '### Sibling repos|### eden-libs|### Org Project'"

must_haves:
  truths:
    - "formatConsiderations(scans) takes `{ siblings, libs, org_overlap }` and returns Markdown string suitable for the body of `## Cross-Repo Considerations` (without the leading `## ` header — caller adds it)"
    - "Output has 3 fixed subsections in fixed order: ### Sibling repos, ### eden-libs candidates, ### Org Project overlap"
    - "Each subsection lists at most TOP_N (3) entries; each entry is a single line"
    - "Empty subsection renders as `_(no matches)_`"
    - "skipped org_overlap renders as `_(skipped: gh auth not available — run gh auth refresh -h github.com -s project,read:project,repo to enable)_`"
    - "Misfiling result rendered as italicized one-liner inside the org_overlap subsection: `_Misfiling check: ...message..._` (or `_Misfiling check: no mismatch detected._` when null)"
    - "`considerations` CLI subcommand orchestrates all three scanners (scanSiblings, scanLibs, scanOrgOverlap), calls formatConsiderations, and emits Markdown to stdout (or raw JSON of all 3 scan results when --raw)"
    - "Output is bounded — total Markdown length ≤ 2000 chars in typical case (tested via L1 happy path)"
    - "Renderer is pure — no side effects, no fs writes, no network calls"
    - "All new tests follow RED → GREEN: test commit precedes feat commit per TDD Playbook habit 3"
  artifacts:
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.cjs"
      provides: "formatConsiderations + helpers (`_renderSiblingsSection`, `_renderLibsSection`, `_renderOrgSection`)."
      exports: ["formatConsiderations"]
    - path: "plugins/devflow/devflow/bin/lib/org-awareness.test.cjs"
      provides: "Test groups RS (renderSiblings), RL (renderLibs), RO (renderOrg), F (formatConsiderations end-to-end), CLI4 (considerations)."
      contains: "formatConsiderations"
    - path: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs"
      provides: "cmdOrgAwarenessConsiderations implementation: orchestrates all three scanners, formats result, emits Markdown or --raw JSON."
      contains: "oa.formatConsiderations"
  key_links:
    - from: "plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs::cmdOrgAwarenessConsiderations"
      to: "plugins/devflow/devflow/bin/lib/org-awareness.cjs::scanSiblings + scanLibs + scanOrgOverlap + formatConsiderations"
      via: "Compose all four"
      pattern: "scanSiblings.*scanLibs.*scanOrgOverlap.*formatConsiderations"
---

<objective>
Add the `formatConsiderations(scans)` Markdown renderer to `lib/org-awareness.cjs` and wire the `df-tools org-awareness considerations <objective_id>` CLI subcommand. This TRD closes the loop: scanners produce structured data, this renderer produces the section body that `/df:research-objective` (TRD 03-05) writes into CONTEXT.md.

Pure formatter — no fs/network side effects. Section length bounded (~25 lines max). Three fixed subsections in fixed order. Empty / skipped subsections rendered with sentinel placeholder text.

Output:
1. `formatConsiderations(scans)` function in `lib/org-awareness.cjs` (region: formatConsiderations)
2. Helpers `_renderSiblingsSection`, `_renderLibsSection`, `_renderOrgSection`
3. Test cases per Test list (Groups RS + RL + RO + F + CLI4)
4. `cmdOrgAwarenessConsiderations` orchestrates scanners + renders Markdown
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── org-awareness.cjs                  ← MODIFY  (add formatConsiderations region)
├── org-awareness.test.cjs             ← MODIFY  (add Groups RS, RL, RO, F, CLI4)
└── org-awareness-cli.cjs              ← MODIFY  (replace considerations stub)
</file_tree>

<execution_context>
@/Users/markemerson/.claude/devflow/workflows/execute-trd.md
@/Users/markemerson/.claude/devflow/templates/summary.md
</execution_context>

<embedded_context>

<codebase_examples>

**Existing markdown renderer pattern** — `lib/awareness-cli.cjs::renderMarkdown` (obj 2 ship):

```js
function renderMarkdown(sections, flags) {
  const lines = [];
  if (sections.peer && !flags.org_only) {
    lines.push('## Peer Awareness', '');
    if (sections.peer.branches.length === 0) {
      lines.push('_No peer branches with state matched._', '');
    } else {
      for (const b of sections.peer.branches) {
        lines.push(`- **${b.branch}** — ${b.objective || '(no objective)'} ${b.trd ? `(TRD ${b.trd})` : ''}`);
      }
      lines.push('');
    }
  }
  // ... org section
  return lines.join('\n');
}
```

Mirror this style for obj 3:

```js
function _renderSiblingsSection(scans) {
  const lines = ['### Sibling repos'];
  const matches = (scans.siblings && scans.siblings.matches) || [];
  if (matches.length === 0) {
    lines.push('_(no matches)_');
    return lines.join('\n');
  }
  for (const m of matches) {
    const obj = m.best_objective ? `(objective ${m.best_objective})` : '';
    lines.push(`- \`${m.repo}\` ${obj} — score ${m.score.toFixed(2)} (${m.summary_count} recent summaries)`);
  }
  return lines.join('\n');
}
```

**Section spec from CONTEXT.md locked decision #3** (verbatim):

```markdown
## Cross-Repo Considerations

### Sibling repos
- `aodex-go` (objective 12, last summary 2026-04-30): controller-shape parity work — overlaps on `app/controllers/admin/keys_controller.rb`
- `aosentry` (objective 04, last summary 2026-04-25): Grok admin keys flow — same domain (admin auth)

### eden-libs candidates
- `@aocyber/state-md-parser` — already exports `parseStateMd`; consider extracting from awareness.cjs

### Org Project overlap
- `aodex#33 [Roadmap] Go Backend Migration` (Q2 2026) — sibling work touches Grok credential flow
- _Misfiling check: this objective's `parent_issue` lives in `devflow-claude` and the resolved `roadmap_issue` is `devflow-claude#9`. **No misfiling detected.**_
```

The CLI considerations command emits the section BODY (without `## Cross-Repo Considerations\n\n` header — that's the skill's job to wrap, since it knows whether the section already exists and needs append vs replace).

**Format details:**
- Subsection headers: `### Sibling repos`, `### eden-libs candidates`, `### Org Project overlap`
- One blank line between subsections
- Bullet entries use `-` (not `*`)
- Code-fence backticks for repo / symbol names
- Italicized sentinel text for empty/skipped
- Misfiling rendered as italicized last bullet of org section

</codebase_examples>

<anti_patterns>

- **DO NOT make the renderer read fs / call gh.** Take pre-computed `scans` object as input.
- **DO NOT hard-fail on missing fields.** Defensive fallbacks: missing `score` → render as `(score N/A)`, missing `summary_count` → omit suffix.
- **DO NOT exceed 3 entries per subsection.** Already enforced by scanners (TOP_N=3), but renderer should slice defensively too.
- **DO NOT include the `## Cross-Repo Considerations` header.** Caller adds it. Renderer outputs section BODY only (3 subsections + blank lines).
- **DO NOT reorder subsections.** Sibling → eden-libs → Org Project, fixed order.

</anti_patterns>

<error_recovery>

- **`scans.siblings.warnings` is non-empty** → no special handling in renderer (warnings surface elsewhere). Renderer just looks at `matches`.
- **`scans.libs.scanned === false`** → renderer treats as "no matches" → renders `_(no matches)_`. The "eden-libs not found" warning surfaces in the verbose JSON via `--raw`, not in the trimmed Markdown.
- **`scans.org_overlap.skipped === true`** → renderer outputs the `_(skipped: gh auth not available — run gh auth refresh ...)_` placeholder. Misfiling line OMITTED in this case (no chain to compare).

</error_recovery>

</embedded_context>

<context>
@.planning/objectives/03-planning-time-org-awareness/03-CONTEXT.md
@.planning/objectives/03-planning-time-org-awareness/03-RESEARCH.md
@plugins/devflow/devflow/bin/lib/org-awareness.cjs
@plugins/devflow/devflow/bin/lib/awareness-cli.cjs
</context>

<gotchas>

- **Score precision** — render to 2 decimal places (`score.toFixed(2)`) for sibling section. Org overlap uses integer score — render as integer.
- **Markdown link interpretation** — issue refs like `aodex#33` should NOT auto-link (they're rendered in plain text). Wrap in backticks to make them code-style and avoid renderer ambiguity.
- **`considerations` CLI orchestration order** — run scanSiblings first (no auth needed), then scanLibs (no auth needed), then scanOrgOverlap last (gh auth may fail). Each scanner is independent; failure in one doesn't block others.
- **Pass `sibling_repos` to scanOrgOverlap** — the `cmdOrgAwarenessConsiderations` MUST extract `sibling_repos` from `scanSiblings` result (`matches.map(m => /* compute github_repo from PROJECT.md */)`) for chain-match boost. SIMPLIFICATION FOR v1.1: pass an empty `sibling_repos: []` initially; the boost only fires when sibling repo refs match. If `siblings.matches[i].repo` happens to be a repo name (e.g. `aodex`), prepend with `AO-Cyber-Systems/` if `currentOrg` is known. Alternatively (cleaner for tests): scanSiblings result entries should also carry the inferred `github_repo: 'AO-Cyber-Systems/<name>'` field. Add this in 03-01 retroactively — SHIM HERE: read PROJECT.md for each sibling at the considerations level. Acceptable extra fs read once per plan invocation.

</gotchas>

## Test list

Per CLAUDE.md TDD Playbook habit 2.

### Group RS (renderSiblings)
- RS1: empty matches → `### Sibling repos\n_(no matches)_`
- RS2: 2 matches → 2 bullet lines, each with repo, objective, score, summary_count
- RS3: 5 matches passed in → renderer slices to 3 (defensive)
- RS4: match missing best_objective field → bullet renders without `(objective ...)` suffix
- RS5: score 0 still renders (renderer doesn't filter by score; that's scanner's job)

### Group RL (renderLibs)
- RL1: empty candidates → `### eden-libs candidates\n_(no matches)_`
- RL2: 3 candidates → 3 bullet lines with symbol + entrypoint
- RL3: candidate.tokens_matched=0 still renders (with parenthetical "(0 tokens matched)" or omit)
- RL4: scanned=false case → `_(no matches)_` (eden-libs not found is silent)

### Group RO (renderOrg)
- RO1: skipped:true → `_(skipped: gh auth not available — run gh auth refresh -h github.com -s project,read:project,repo to enable)_`; misfiling line OMITTED
- RO2: empty items, skipped:false, misfiling:null → `_(no matches)_\n\n_Misfiling check: no mismatch detected._`
- RO3: 2 items, misfiling:null → 2 bullets + misfiling-OK line
- RO4: items + misfiling object → 2 bullets + misfiling warning line
- RO5: chain_match items decorated (e.g. with bold or `[chain match]` annotation) — design choice: prefix `**(chain match)**` in bullet
- RO6: matched_keywords array empty → render bullet without "matched on: ..." suffix

### Group F (formatConsiderations end-to-end)
- F1: full happy path with all three sections populated + misfiling null → 3 subsections rendered in correct order with blank line separators
- F2: all sections empty → 3 subsections each with `_(no matches)_` sentinel
- F3: org skipped → siblings + libs render normally; org has skipped sentinel
- F4: misfiling object → renders in org section as last bullet (italicized)
- F5: total output length ≤ 2000 chars in F1 case (regression guard against accidental verbose mode)
- F6: deterministic output — same input → same output (call twice, deepStrictEqual)
- F7: no leading `## ` header in output (caller wraps)

### Group CLI4 (considerations CLI)
- CLI4-1: `df-tools org-awareness considerations 03` returns Markdown to stdout with three `### ` headers
- CLI4-2: `df-tools org-awareness considerations 03 --raw` returns JSON with `siblings`, `libs`, `org_overlap` keys
- CLI4-3: `df-tools org-awareness considerations` (no objective_id) prints usage + exit 1
- CLI4-4: under mocked GhAuthError on scanOrg, considerations CLI returns Markdown with the skipped sentinel in org section; exit 0 (NOT 1) — graceful

<tasks>

<task type="auto">
  <name>Task 1: RED — failing tests for formatConsiderations + sub-renderers + CLI4</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
  </files>
  <action>
**RED PHASE.**

Append test groups RS, RL, RO, F, CLI4 to org-awareness.test.cjs.

```js
// ─── TRD 03-04 tests ─────────────────────────────────────────────────────────

// Group RS — renderSiblings
test('RS1 — empty matches renders sentinel', () => {
  const out = oa._renderSiblingsSection({ siblings: { matches: [] } });
  assert.match(out, /### Sibling repos/);
  assert.match(out, /_\(no matches\)_/);
});

test('RS2 — 2 matches render 2 bullets', () => {
  const out = oa._renderSiblingsSection({
    siblings: {
      matches: [
        { repo: 'aodex', best_objective: '12', score: 0.5, summary_count: 3 },
        { repo: 'aosentry', best_objective: '04', score: 0.3, summary_count: 1 },
      ],
    },
  });
  assert.match(out, /aodex/);
  assert.match(out, /aosentry/);
  assert.match(out, /0\.50/);
});

test('RS3 — 5 matches sliced to 3', () => {
  const matches = [];
  for (let i = 0; i < 5; i++) matches.push({ repo: `repo-${i}`, score: 1 - i*0.1, summary_count: 1 });
  const out = oa._renderSiblingsSection({ siblings: { matches } });
  // count bullet lines
  const bullets = out.split('\n').filter(l => l.startsWith('- '));
  assert.strictEqual(bullets.length, 3);
});

// ... RS4, RS5

// Group RL
test('RL1 — empty candidates renders sentinel', () => {
  const out = oa._renderLibsSection({ libs: { candidates: [], scanned: true } });
  assert.match(out, /### eden-libs candidates/);
  assert.match(out, /_\(no matches\)_/);
});

test('RL2 — 3 candidates render 3 bullets', () => {
  const out = oa._renderLibsSection({
    libs: {
      candidates: [
        { symbol: 'parseStateMd', entrypoint: '/path/index.cjs', tokens_matched: 2, symbol_tokens: ['parse','state','md'] },
        { symbol: 'resolveChain', entrypoint: '/path/index.cjs', tokens_matched: 1, symbol_tokens: ['resolve','chain'] },
        { symbol: 'foo', entrypoint: '/path/index.cjs', tokens_matched: 0, symbol_tokens: ['foo'] },
      ],
    },
  });
  assert.match(out, /parseStateMd/);
  assert.match(out, /resolveChain/);
});

// ... RL3, RL4

// Group RO
test('RO1 — skipped renders auth sentinel; no misfiling line', () => {
  const out = oa._renderOrgSection({
    org_overlap: { items: [], warnings: [], skipped: true, misfiling: null },
  });
  assert.match(out, /### Org Project overlap/);
  assert.match(out, /skipped: gh auth/);
  assert.doesNotMatch(out, /Misfiling check/);
});

test('RO2 — empty items, skipped:false, misfiling:null', () => {
  const out = oa._renderOrgSection({
    org_overlap: { items: [], warnings: [], skipped: false, misfiling: null },
  });
  assert.match(out, /_\(no matches\)_/);
  assert.match(out, /Misfiling check: no mismatch detected/);
});

test('RO4 — items + misfiling object', () => {
  const out = oa._renderOrgSection({
    org_overlap: {
      items: [
        { issue_ref: 'AO-Cyber-Systems/aodex#33', title: '[Roadmap] Go Migration', score: 12, matched_keywords: ['go'], chain_match: true },
      ],
      warnings: [],
      skipped: false,
      misfiling: {
        current_repo: 'AO-Cyber-Systems/devflow-claude',
        resolved_repo: 'AO-Cyber-Systems/aodex',
        message: 'Possible misfile — consider whether this objective belongs in aodex.',
      },
    },
  });
  assert.match(out, /aodex#33/);
  assert.match(out, /Misfiling check.*Possible misfile/);
});

// ... RO3, RO5, RO6

// Group F
test('F1 — full happy path renders 3 subsections in order', () => {
  const md = oa.formatConsiderations({
    siblings: { matches: [{ repo: 'aodex', best_objective: '12', score: 0.5, summary_count: 2 }] },
    libs: { candidates: [{ symbol: 'parseStateMd', entrypoint: '/x', tokens_matched: 2, symbol_tokens: ['parse'] }] },
    org_overlap: {
      items: [{ issue_ref: 'AO-Cyber-Systems/aodex#33', title: '[Roadmap] Go', score: 12, matched_keywords: [], chain_match: true }],
      warnings: [], skipped: false, misfiling: null,
    },
  });
  // Order check: siblings first, then libs, then org
  const sibIdx = md.indexOf('### Sibling repos');
  const libIdx = md.indexOf('### eden-libs candidates');
  const orgIdx = md.indexOf('### Org Project overlap');
  assert.ok(sibIdx >= 0 && libIdx > sibIdx && orgIdx > libIdx);
  // No leading ## header
  assert.doesNotMatch(md, /^## Cross-Repo/);
});

test('F5 — output bounded ≤ 2000 chars', () => {
  // Build a max-size scans input (3 of each)
  const scans = {
    siblings: { matches: Array.from({length:3}, (_,i)=>({ repo:`repo-${i}`, best_objective:`${i}`, score:0.1*i, summary_count:i+1 })) },
    libs: { candidates: Array.from({length:3}, (_,i)=>({ symbol:`func${i}`, entrypoint:'/x', tokens_matched:i, symbol_tokens:[] })) },
    org_overlap: {
      items: Array.from({length:3}, (_,i)=>({ issue_ref:`AO-Cyber-Systems/repo-${i}#${i}`, title:`title ${i}`, score:i, matched_keywords:[], chain_match:false })),
      warnings: [], skipped: false, misfiling: null,
    },
  };
  const md = oa.formatConsiderations(scans);
  assert.ok(md.length < 2000, `output ${md.length} chars exceeds 2000 budget`);
});

// ... F2, F3, F4, F6, F7

// Group CLI4 — uses subprocess
test('CLI4-1 — considerations 03 returns Markdown to stdout', () => {
  const dfTools = path2.resolve(__dirname, '..', 'df-tools.cjs');
  const r = require('child_process').spawnSync('node', [dfTools, 'org-awareness', 'considerations', '03'], { encoding: 'utf-8' });
  // CLI may return exit 0 even on graceful skip; do not require status:0 strictly, but assert structure
  assert.match(r.stdout, /### Sibling repos/);
  assert.match(r.stdout, /### eden-libs candidates/);
  assert.match(r.stdout, /### Org Project overlap/);
});

// ... CLI4-2, CLI4-3, CLI4-4
```

**Commit RED:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.test.cjs
git commit -m "test(03-04): add failing tests for formatConsiderations + sub-renderers + considerations CLI

RED phase: formatConsiderations/_renderSiblingsSection/_renderLibsSection/_renderOrgSection
not yet implemented. Tests cover empty/full/skipped/misfiling cases per Test list."
```
  </action>
  <verify>
- New tests fail with "function not exported" / "TypeError" errors. Existing test count from 03-03 unchanged.
  </verify>
  <done>
test commit lands. RED tests fail expectedly.
  </done>
  <recovery>
If subprocess test CLI4-1 hangs: ensure df-tools considerations doesn't wait on stdin. The orchestrator already returns synchronously after writing to stdout.
  </recovery>
</task>

<task type="auto">
  <name>Task 2: GREEN — implement formatConsiderations + sub-renderers + considerations CLI</name>
  <files>
    plugins/devflow/devflow/bin/lib/org-awareness.cjs
    plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
  </files>
  <action>
**GREEN PHASE.**

**Part 1: Add formatConsiderations region to lib/org-awareness.cjs** (insert AFTER scanOrgOverlap region, BEFORE module.exports).

```js
// ─── TRD 03-04: formatConsiderations Markdown renderer ────────────────────────

function _renderSiblingsSection(scans) {
  const lines = ['### Sibling repos'];
  const matches = ((scans && scans.siblings && scans.siblings.matches) || []).slice(0, TOP_N);
  if (matches.length === 0) {
    lines.push('_(no matches)_');
    return lines.join('\n');
  }
  for (const m of matches) {
    const objPart = m.best_objective ? `(objective ${m.best_objective})` : '';
    const scoreStr = (typeof m.score === 'number') ? m.score.toFixed(2) : 'N/A';
    const summary = (typeof m.summary_count === 'number') ? `${m.summary_count} recent summaries` : '';
    const parts = [
      `\`${m.repo}\``,
      objPart,
      `— score ${scoreStr}`,
      summary ? `(${summary})` : '',
    ].filter(Boolean);
    lines.push(`- ${parts.join(' ')}`);
  }
  return lines.join('\n');
}

function _renderLibsSection(scans) {
  const lines = ['### eden-libs candidates'];
  const candidates = ((scans && scans.libs && scans.libs.candidates) || []).slice(0, TOP_N);
  if (candidates.length === 0) {
    lines.push('_(no matches)_');
    return lines.join('\n');
  }
  for (const c of candidates) {
    const tokens = (typeof c.tokens_matched === 'number' && c.tokens_matched > 0)
      ? ` (${c.tokens_matched} token match${c.tokens_matched > 1 ? 'es' : ''})`
      : '';
    lines.push(`- \`${c.symbol}\`${tokens} — exported from \`${c.entrypoint || 'unknown'}\``);
  }
  return lines.join('\n');
}

function _renderOrgSection(scans) {
  const lines = ['### Org Project overlap'];
  const oo = (scans && scans.org_overlap) || {};

  if (oo.skipped) {
    lines.push('_(skipped: gh auth not available — run `gh auth refresh -h github.com -s project,read:project,repo` to enable)_');
    return lines.join('\n');
  }

  const items = (oo.items || []).slice(0, TOP_N);
  if (items.length === 0) {
    lines.push('_(no matches)_');
  } else {
    for (const it of items) {
      const chainTag = it.chain_match ? ' **[chain match]**' : '';
      const kws = (Array.isArray(it.matched_keywords) && it.matched_keywords.length > 0)
        ? ` (matched: ${it.matched_keywords.join(', ')})`
        : '';
      lines.push(`- \`${it.issue_ref || '(no ref)'}\` — ${it.title}${chainTag} — score ${it.score}${kws}`);
    }
  }

  // Misfiling line (always rendered when not skipped)
  if (oo.misfiling) {
    lines.push('');
    lines.push(`_Misfiling check: ${oo.misfiling.message || `resolved ${oo.misfiling.resolved_repo} differs from current ${oo.misfiling.current_repo}`}_`);
  } else {
    lines.push('');
    lines.push('_Misfiling check: no mismatch detected._');
  }

  return lines.join('\n');
}

function formatConsiderations(scans) {
  const sections = [
    _renderSiblingsSection(scans),
    _renderLibsSection(scans),
    _renderOrgSection(scans),
  ];
  return sections.join('\n\n');
}
```

Update module.exports:
```js
module.exports = {
  // ... all existing
  formatConsiderations,        // NEW (TRD 03-04)
  _renderSiblingsSection,      // NEW
  _renderLibsSection,          // NEW
  _renderOrgSection,           // NEW
};
```

**Part 2: Replace stub in lib/org-awareness-cli.cjs:**

```js
function cmdOrgAwarenessConsiderations(cwd, args, raw) {
  const objective_id = args[0];
  if (!objective_id) {
    process.stderr.write('Usage: df-tools org-awareness considerations <objective_id> [--raw]\n');
    process.exit(1);
    return;
  }

  // Read PROJECT.md frontmatter for projectCtx
  const fs = require('fs');
  const path = require('path');
  const { extractFrontmatter } = require('./frontmatter.cjs');
  let projectCtx = {};
  let frontmatter = { github_issue: `#${objective_id}` };
  try {
    const content = fs.readFileSync(path.join(cwd, '.planning', 'PROJECT.md'), 'utf-8');
    const fm = extractFrontmatter(content).frontmatter || {};
    projectCtx = { github_repo: fm.github_repo || null, org_project: fm.org_project || null };
  } catch { /* PROJECT.md missing — projectCtx stays empty */ }

  // Read OBJECTIVE.md frontmatter (best-effort) for richer current_tokens + frontmatter for chain walk
  try {
    const objDir = path.join(cwd, '.planning', 'objectives');
    if (fs.existsSync(objDir)) {
      const sub = fs.readdirSync(objDir).find(n => n.startsWith(`${objective_id}-`) || n === objective_id);
      if (sub) {
        const objMd = path.join(objDir, sub, 'OBJECTIVE.md');
        if (fs.existsSync(objMd)) {
          const content = fs.readFileSync(objMd, 'utf-8');
          const fm = extractFrontmatter(content).frontmatter || {};
          if (fm.github_issue) frontmatter.github_issue = fm.github_issue;
          if (fm.parent_issue) frontmatter.parent_issue = fm.parent_issue;
          if (fm.org_initiative) frontmatter.org_initiative = fm.org_initiative;
          if (fm.org_project) frontmatter.org_project = fm.org_project;
        }
      }
    }
  } catch { /* OBJECTIVE.md absent — frontmatter stays minimal */ }

  // Compute current_tokens — same algorithm scanSiblings uses internally
  const current_tokens = oa._tokenize ? oa._tokenize(`${objective_id} ${frontmatter.github_issue || ''}`) : new Set();
  for (const t of oa._tokenize ? oa._tokenize(JSON.stringify(frontmatter)) : new Set()) current_tokens.add(t);

  // Run all three scanners (independently — failure in one doesn't block others)
  const scans = {};
  try { scans.siblings = oa.scanSiblings({ objective_id, cwd }); }
  catch (e) { scans.siblings = { matches: [], warnings: [`scanSiblings error: ${e.message}`], scanned_repos: 0 }; }

  try { scans.libs = oa.scanLibs({ current_tokens, cwd }); }
  catch (e) { scans.libs = { candidates: [], warnings: [`scanLibs error: ${e.message}`], scanned: false, path: null }; }

  // Derive sibling_repos for chain-match boost (org/<reponame> for each matched sibling)
  // Best-effort: read each sibling repo's PROJECT.md to get its github_repo if declared
  const sibling_repos = [];
  for (const m of (scans.siblings.matches || [])) {
    try {
      const sibPmd = fs.readFileSync(path.join(m.path, 'PROJECT.md'), 'utf-8');
      const sibFm = extractFrontmatter(sibPmd).frontmatter || {};
      if (sibFm.github_repo) sibling_repos.push(sibFm.github_repo);
    } catch { /* silently skip */ }
  }

  scans.org_overlap = oa.scanOrgOverlap({
    objective_id, current_tokens, sibling_repos, frontmatter, projectCtx,
  });

  if (raw) {
    output(scans, true);
    return;
  }
  process.stdout.write(oa.formatConsiderations(scans) + '\n');
}
```

**Run tests:**
```bash
npm test 2>&1 | grep -E 'RS|RL|RO|F\\d|CLI4'
```

**Commit GREEN:**
```bash
git add plugins/devflow/devflow/bin/lib/org-awareness.cjs plugins/devflow/devflow/bin/lib/org-awareness-cli.cjs
git commit -m "feat(03-04): formatConsiderations renderer + considerations CLI orchestration

GREEN phase: lib/org-awareness.cjs gains formatConsiderations + 3 sub-renderers
(siblings, libs, org_overlap). Pure formatter — no fs/network. Output bounded:
3 subsections, top-3 each, one-line entries, total ≤ 2000 chars.

CLI considerations command orchestrates all three scanners with independent
error handling (scanSiblings + scanLibs + scanOrgOverlap), reads sibling
PROJECT.md files for chain-match boost (sibling_repos), and emits Markdown
to stdout (or --raw JSON of all three scans).

Closes SC-7 (rendering side; skill-side wiring in TRD 03-05)."
```
  </action>
  <verify>
- Full `npm test` passes
- `node plugins/devflow/devflow/bin/df-tools.cjs org-awareness considerations 03 2>&1 | head -30` shows the 3 subsection headers in correct order
- `node plugins/devflow/devflow/bin/df-tools.cjs org-awareness considerations 03 --raw 2>&1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); assert all(k in d for k in ("siblings","libs","org_overlap")); print("OK")'`
- F5 length budget check passes (output ≤ 2000 chars)
- F7 no leading `## ` header check passes
- Module exports include formatConsiderations + 3 sub-renderers
  </verify>
  <done>
feat commit lands. RED tests are GREEN. CLI considerations command outputs Markdown OR JSON deterministically. Three subsection headers always present in fixed order. Misfiling line behaves correctly (omitted on skip; rendered with object/null when scanned).
  </done>
  <recovery>
If F5 length test fails: reduce verbosity in sub-renderers — drop the entrypoint full path in eden-libs section (use basename only), drop matched_keywords list (just count).
If subprocess CLI4 tests time out: ensure considerations command doesn't await any unresolved promise. The current implementation is fully synchronous.
  </recovery>
</task>

</tasks>

<validation_gates>
<lint>(none)</lint>
<test>npm test</test>
<build>(none)</build>
</validation_gates>

<verification>
1. `npm test` passes
2. `df-tools org-awareness considerations 03` emits Markdown with three subsection headers
3. `df-tools org-awareness considerations 03 --raw` emits parseable JSON with siblings, libs, org_overlap keys
4. Renderer is pure (no fs / network) — verify by inspection
5. Output bounded: ≤ 2000 chars in F5 max-size case
6. Misfiling rendering correct in MF/RO cases
7. Empty / skipped sections render with sentinel text
</verification>

<success_criteria>
- [ ] `lib/org-awareness.cjs` extended with formatConsiderations + 3 sub-renderers
- [ ] All Test list groups (RS, RL, RO, F, CLI4) implemented and passing
- [ ] `lib/org-awareness-cli.cjs` considerations handler replaces 03-01 stub; orchestrates all 3 scanners
- [ ] RED commit precedes GREEN commit
- [ ] SC-7 (rendering side) verifiable via F1+F2+F3 + CLI4-1
</success_criteria>

<output>
After completion, create `.planning/objectives/03-planning-time-org-awareness/03-04-format-considerations-SUMMARY.md`.
</output>
