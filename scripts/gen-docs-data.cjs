#!/usr/bin/env node
/**
 * Generates site/data/devflow.json from the plugin source.
 *
 * Everything in the docs' reference tables (commands, agents, hooks, model
 * profiles, config schema) is derived here rather than hand-copied, so the
 * published site cannot drift from the plugin it documents. Run it in CI
 * before `hugo` and the build fails loudly if the shapes change.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'devflow');
const RUNTIME = path.join(PLUGIN, 'devflow');

const read = (p) => fs.readFileSync(p, 'utf8');
const readJSON = (p) => JSON.parse(read(p));

/** Pull the YAML frontmatter block out of a markdown file. */
function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : '';
}

/**
 * Minimal YAML reader for the shapes the plugin actually uses: scalars,
 * block scalars (`|`), and `- item` lists. Not a general YAML parser.
 */
function parseFrontmatter(yaml) {
  const out = {};
  const lines = yaml.split(/\r?\n/);
  let key = null;
  let mode = null; // 'block' | 'list'
  let buf = [];

  const flush = () => {
    if (!key) return;
    if (mode === 'block') out[key] = buf.join('\n').trim();
    else if (mode === 'list') out[key] = buf.slice();
    key = null; mode = null; buf = [];
  };

  for (const line of lines) {
    if (mode === 'block' && /^\s{2,}\S/.test(line)) { buf.push(line.trim()); continue; }
    if (mode === 'list' && /^\s*-\s+/.test(line)) { buf.push(line.replace(/^\s*-\s+/, '').trim()); continue; }
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    flush();
    const [, k, rawV] = m;
    const v = rawV.trim();
    if (v === '|' || v === '>') { key = k; mode = 'block'; buf = []; continue; }
    if (v === '') { key = k; mode = 'list'; buf = []; continue; }
    out[k] = v.replace(/^["']|["']$/g, '');
  }
  flush();
  return out;
}

/** Split a skill description into its summary, usage note, and trigger phrases. */
function splitDescription(desc = '') {
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);
  const triggerLine = lines.find((l) => /^Triggers on:/i.test(l));
  const triggers = triggerLine
    ? (triggerLine.replace(/^Triggers on:\s*/i, '').match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''))
    : [];
  const body = lines.filter((l) => l !== triggerLine);
  return { summary: body[0] || '', notes: body.slice(1), triggers };
}

/** Normalise `allowed-tools` — the plugin writes it as both a list and a CSV string. */
function toolList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

// ── skills ────────────────────────────────────────────────────────────────
const skillsDir = path.join(PLUGIN, 'skills');
const skills = fs.readdirSync(skillsDir)
  .filter((d) => fs.existsSync(path.join(skillsDir, d, 'SKILL.md')))
  .sort()
  .map((dir) => {
    const fm = parseFrontmatter(frontmatter(read(path.join(skillsDir, dir, 'SKILL.md'))));
    const { summary, notes, triggers } = splitDescription(fm.description);
    return {
      name: fm.name || dir,
      slug: dir,
      command: `/devflow:${fm.name || dir}`,
      summary,
      notes,
      triggers,
      args: fm['argument-hint'] || '',
      tools: toolList(fm['allowed-tools']),
      agent: fm.agent || null,
      // disable-model-invocation means the user must type it; Claude cannot fire it.
      userOnly: String(fm['disable-model-invocation']) === 'true',
    };
  });

// ── agents ────────────────────────────────────────────────────────────────
const profiles = readJSON(path.join(RUNTIME, 'references', 'model-profiles.json'));
const agentsDir = path.join(PLUGIN, 'agents');
const agents = fs.readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => {
    const fm = parseFrontmatter(frontmatter(read(path.join(agentsDir, f))));
    const name = fm.name || f.replace(/\.md$/, '');
    return {
      name,
      description: (fm.description || '').replace(/\s+/g, ' ').trim(),
      tools: toolList(fm.tools),
      effort: fm.effort || null,
      color: fm.color || null,
      maxTurns: fm.maxTurns ? Number(fm.maxTurns) : null,
      isolation: fm.isolation || null,
      memory: fm.memory || null,
      models: profiles.agents[name] || null,
    };
  });

// ── hooks ─────────────────────────────────────────────────────────────────
// Event registration is read from hooks.json; anything on disk but absent from
// it is reported as unregistered rather than silently documented as active.
const hooksJson = readJSON(path.join(PLUGIN, 'hooks', 'hooks.json'));
const registered = {};
for (const [event, groups] of Object.entries(hooksJson.hooks)) {
  for (const group of groups) {
    for (const h of group.hooks) {
      const file = path.basename(h.command.trim().split(/\s+/).pop());
      (registered[file] ||= []).push({ event, matcher: group.matcher || null });
    }
  }
}

const HOOK_DOCS = {
  'sync-runtime.js': ['Runtime sync', 'Mirrors the plugin-bundled runtime to `~/.claude/devflow/` whenever the bundled version differs from the cached `.plugin-version`. Skills reference `@~/.claude/devflow/...` paths, which do not interpolate `${CLAUDE_PLUGIN_ROOT}` — this hook is what makes those references resolve.', null],
  'awareness-cache-populate.js': ['Session context', 'Warms the cross-repo awareness cache in a detached child process. Never blocks session start, even when a scan takes 30s or more.', null],
  'classify-session.js': ['Session context', 'Classifies the project as `ambient`, `init-offer`, or `skip` and injects the routing decision table you see at session start.', 'DEVFLOW_SKIP_CLASSIFY=1'],
  'route-intent.js': ['Enforcement', 'Matches the prompt against build/plan/verify/debug intent and injects a directive to route through the matching skill instead of editing code directly. Regexes require imperative form, so plain questions do not trip it.', null],
  'route-results.js': ['Session context', 'Injects completed handoff-watcher results into the next turn, so a queued interactive command resumes without you pasting anything.', null],
  'gate-commits.js': ['Enforcement', 'Blocks raw `git commit` and redirects to `df-tools commit`, which preserves objective scope and task IDs and updates STATE.md. Detection is invocation-aware: heredoc bodies and quoted arguments are stripped first, so prose that merely mentions the command is not gated.', 'DEVFLOW_ALLOW_RAW_COMMIT=1'],
  'gate-edits.js': ['Enforcement', 'Strict DENY by default in ambient mode. Allows edits when a live `.planning/.skill-active` marker exists (resolved from both the local and the main checkout, so worktree-isolated agents are not denied by a marker they cannot see), when the prompt carries an override phrase, or when the env escape is set. Targets outside the project root are never gated. Severity is per-project via `gates.editGate`.', 'DEVFLOW_SKIP_EDIT_GATE=1'],
  'gate-interactive.js': ['Enforcement', 'Intercepts TTY-requiring commands and routes them to the handoff watcher rather than letting them hang on a prompt no one can answer.', null],
  'guard-no-progress.js': ['Enforcement', 'Detects the same tool being called with identical arguments repeatedly: warns at 3, escalates to `ask` at 5, and resets whenever the agent varies its approach. Step limits cannot catch a stuck loop — they only fire once the whole budget is spent.', 'DEVFLOW_SKIP_PROGRESS_GUARD=1'],
  'changelog-on-tag.js': ['Enforcement', 'Blocks `git tag -a vX.Y.Z` unless CHANGELOG.md has a `## [X.Y.Z]` heading and the three release manifests carry matching versions.', 'DEVFLOW_SKIP_CHANGELOG_GATE=1'],
  'verify-completion.js': ['Observability', 'Checks that the most recent SUMMARY.md carries task evidence and no failure markers. Warns only — never blocks.', null],
  'verify-commits.js': ['Observability', 'Warns when a subagent finishes without producing commits — a silent-failure detector for the executor.', null],
  'statusline.js': ['Observability', 'Renders model, current task, directory, and context usage in the Claude Code status line.', null],
  'inject-org-context.js': ['Session context', 'Injects an objective’s full org context — parent issue, repo roadmap, sibling repo activity — at planning time.', null],
  'inject-handoff-results.js': ['Session context', 'Surfaces completed handoff-watcher results back into the session.', null],
};

const hooks = fs.readdirSync(path.join(PLUGIN, 'hooks'))
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
  .sort()
  .map((file) => {
    const [group, purpose, escape] = HOOK_DOCS[file] || ['Other', '', null];
    const reg = registered[file] || [];
    return {
      file,
      name: file.replace(/\.js$/, ''),
      group,
      purpose,
      escape,
      events: reg.map((r) => (r.matcher ? `${r.event} (${r.matcher})` : r.event)),
      registered: reg.length > 0,
      // statusline is wired through plugin.json rather than hooks.json.
      note: reg.length === 0 && file === 'statusline.js' ? 'Registered via plugin.json statusLine' : null,
    };
  });

// ── df-tools command surface ──────────────────────────────────────────────
const dfToolsSrc = read(path.join(RUNTIME, 'bin', 'df-tools.cjs'));
const topLevel = [...dfToolsSrc.matchAll(/^\s{4}case '([a-z0-9-]+)': \{$/gm)].map((m) => m[1]);
const subFor = (cmd) => {
  const start = dfToolsSrc.indexOf(`    case '${cmd}': {`);
  if (start === -1) return [];
  const next = topLevel
    .map((c) => dfToolsSrc.indexOf(`    case '${c}': {`))
    .filter((i) => i > start)
    .sort((a, b) => a - b)[0] || dfToolsSrc.length;
  const block = dfToolsSrc.slice(start, next);
  const subs = new Set();
  for (const m of block.matchAll(/sub(?:command)? === '([a-z0-9-]+)'/g)) subs.add(m[1]);
  for (const m of block.matchAll(/^\s{8}case '([a-z0-9-]+)':/gm)) subs.add(m[1]);
  return [...subs];
};
const dfTools = topLevel.sort().map((cmd) => ({ command: cmd, subcommands: subFor(cmd) }));

// ── workflows, references, templates ──────────────────────────────────────
const workflows = fs.readdirSync(path.join(RUNTIME, 'workflows'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => {
    const fm = parseFrontmatter(frontmatter(read(path.join(RUNTIME, 'workflows', f))));
    return { name: f.replace(/\.md$/, ''), status: fm.status || 'unknown' };
  });

const references = fs.readdirSync(path.join(RUNTIME, 'references'))
  .filter((f) => f.endsWith('.md')).sort().map((f) => f.replace(/\.md$/, ''));

const templates = fs.readdirSync(path.join(RUNTIME, 'templates')).sort();

// ── intent model: (kind, work) defaults table ─────────────────────────────
const defaultsMd = read(path.join(RUNTIME, 'references', 'defaults-table.md'));
const yamlBlock = defaultsMd.match(/```yaml\r?\n([\s\S]*?)```/);
const kinds = [];
const works = new Set();
if (yamlBlock) {
  for (const line of yamlBlock[1].split(/\r?\n/)) {
    const k = line.match(/^  ([a-z-]+):\s*$/);
    if (k && k[1] !== 'defaults') kinds.push(k[1]);
    const w = line.match(/^    ([a-z-]+):\s*$/);
    if (w) works.add(w[1]);
  }
}

// ── assemble ──────────────────────────────────────────────────────────────
const pkg = readJSON(path.join(ROOT, 'package.json'));
const manifest = readJSON(path.join(PLUGIN, '.claude-plugin', 'plugin.json'));

const data = {
  generatedAt: new Date().toISOString(),
  version: manifest.version,
  packageVersion: pkg.version,
  repo: 'AO-Cyber-Systems/devflow-claude',
  marketplace: 'devflow@aocyber',
  counts: {
    skills: skills.length,
    agents: agents.length,
    hooks: hooks.length,
    workflows: workflows.length,
    references: references.length,
    templates: templates.length,
    dfToolsCommands: dfTools.length,
  },
  skills,
  agents,
  hooks,
  dfTools,
  workflows,
  references,
  templates,
  models: profiles.models,
  profiles: ['quality', 'balanced', 'budget'],
  intent: { kinds, works: [...works] },
  config: readJSON(path.join(RUNTIME, 'templates', 'config.json')),
};

const outDir = path.join(ROOT, 'site', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'devflow.json'), JSON.stringify(data, null, 2) + '\n');

console.log(
  `site/data/devflow.json  v${data.version}  ` +
  Object.entries(data.counts).map(([k, v]) => `${k}=${v}`).join(' ')
);
