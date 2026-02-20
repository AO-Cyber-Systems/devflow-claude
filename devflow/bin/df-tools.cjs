#!/usr/bin/env node

/**
 * DevFlow Tools — CLI utility for DevFlow workflow operations
 *
 * Replaces repetitive inline bash patterns across ~50 DevFlow command/workflow/agent files.
 * Centralizes: config parsing, model resolution, objective lookup, git commits, summary verification.
 *
 * Usage: node df-tools.cjs <command> [args] [--raw]
 *
 * Atomic Commands:
 *   state load                         Load project config + state
 *   state update <field> <value>       Update a STATE.md field
 *   state get [section]                Get STATE.md content or section
 *   state patch --field val ...        Batch update STATE.md fields
 *   resolve-model <agent-type>         Get model for agent based on profile
 *   find-objective <objective>                 Find objective directory by number
 *   commit <message> [--files f1 f2]   Commit planning docs
 *   verify-summary <path>              Verify a SUMMARY.md file
 *   generate-slug <text>               Convert text to URL-safe slug
 *   current-timestamp [format]         Get timestamp (full|date|filename)
 *   list-todos [area]                  Count and enumerate pending todos
 *   verify-path-exists <path>          Check file/directory existence
 *   config-ensure-section              Initialize .planning/config.json
 *   history-digest                     Aggregate all SUMMARY.md data
 *   summary-extract <path> [--fields]  Extract structured data from SUMMARY.md
 *   state-snapshot                     Structured parse of STATE.md
 *   objective-job-index <objective>           Index plans with waves and status
 *   websearch <query>                  Search web via Brave API (if configured)
 *     [--limit N] [--freshness day|week|month]
 *
 * Objective Operations:
 *   objective next-decimal <objective>         Calculate next decimal objective number
 *   objective add <description>            Append new objective to roadmap + create dir
 *   objective insert <after> <description> Insert decimal objective after existing
 *   objective remove <objective> [--force]     Remove objective, renumber all subsequent
 *   objective complete <objective>             Mark objective done, update state + roadmap
 *
 * Roadmap Operations:
 *   roadmap get-objective <objective>          Extract objective section from ROADMAP.md
 *   roadmap analyze                    Full roadmap parse with disk status
 *   roadmap update-job-progress <N>   Update progress table row from disk (PLAN vs SUMMARY counts)
 *
 * Requirements Operations:
 *   requirements mark-complete <ids>   Mark requirement IDs as complete in REQUIREMENTS.md
 *                                      Accepts: REQ-01,REQ-02 or REQ-01 REQ-02 or [REQ-01, REQ-02]
 *
 * Milestone Operations:
 *   milestone complete <version>       Archive milestone, create MILESTONES.md
 *     [--name <name>]
 *     [--archive-objectives]               Move objective dirs to milestones/vX.Y-objectives/
 *
 * Workstreams:
 *   workstreams analyze                 Analyze ROADMAP.md deps for parallel workstreams
 *   workstreams provision <id> <path>   Copy .planning/ to worktree with filtering
 *   workstreams reconcile               Regenerate .planning/ state after merge
 *
 * Validation:
 *   validate consistency               Check objective numbering, disk/roadmap sync
 *   validate health [--repair]         Check .planning/ integrity, optionally repair
 *
 * Progress:
 *   progress [json|table|bar]          Render progress in various formats
 *
 * Todos:
 *   todo complete <filename>           Move todo from pending to completed
 *
 * Scaffolding:
 *   scaffold context --objective <N>       Create CONTEXT.md template
 *   scaffold uat --objective <N>           Create UAT.md template
 *   scaffold verification --objective <N>  Create VERIFICATION.md template
 *   scaffold objective-dir --objective <N>     Create objective directory
 *     --name <name>
 *
 * Frontmatter CRUD:
 *   frontmatter get <file> [--field k] Extract frontmatter as JSON
 *   frontmatter set <file> --field k   Update single frontmatter field
 *     --value jsonVal
 *   frontmatter merge <file>           Merge JSON into frontmatter
 *     --data '{json}'
 *   frontmatter validate <file>        Validate required fields
 *     --schema job|summary|verification
 *
 * Verification Suite:
 *   verify job-structure <file>       Check JOB.md structure + tasks
 *   verify objective-completeness <objective>  Check all jobs have summaries
 *   verify references <file>           Check @-refs + paths resolve
 *   verify commits <h1> [h2] ...      Batch verify commit hashes
 *   verify artifacts <job-file>       Check must_haves.artifacts
 *   verify key-links <job-file>       Check must_haves.key_links
 *
 * Template Fill:
 *   template fill summary --objective N    Create pre-filled SUMMARY.md
 *     [--job M] [--name "..."]
 *     [--fields '{json}']
 *   template fill job --objective N       Create pre-filled JOB.md
 *     [--job M] [--type execute|tdd]
 *     [--wave N] [--fields '{json}']
 *   template fill verification         Create pre-filled VERIFICATION.md
 *     --objective N [--fields '{json}']
 *
 * State Progression:
 *   state advance-job                 Increment job counter
 *   state record-metric --objective N      Record execution metrics
 *     --job M --duration Xmin
 *     [--tasks N] [--files N]
 *   state update-progress              Recalculate progress bar
 *   state add-decision --summary "..."  Add decision to STATE.md
 *     [--objective N] [--rationale "..."]
 *   state add-blocker --text "..."     Add blocker
 *   state resolve-blocker --text "..." Remove blocker
 *   state record-session               Update session continuity
 *     --stopped-at "..."
 *     [--resume-file path]
 *
 * Compound Commands (workflow-specific initialization):
 *   init execute-objective <objective>         All context for execute-objective workflow
 *   init plan-objective <objective>            All context for plan-objective workflow
 *   init new-project                   All context for new-project workflow
 *   init new-milestone                 All context for new-milestone workflow
 *   init quick <description>           All context for quick workflow
 *   init resume                        All context for resume-project workflow
 *   init verify-work <objective>           All context for verify-work workflow
 *   init objective-op <objective>              Generic objective operation context
 *   init todos [area]                  All context for todo workflows
 *   init milestone-op                  All context for milestone operations
 *   init map-codebase                  All context for map-codebase workflow
 *   init progress                      All context for progress workflow
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES = {
  'df-planner':              { quality: 'opus', balanced: 'opus',   budget: 'sonnet' },
  'df-roadmapper':           { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'df-executor':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'df-objective-researcher':     { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'df-project-researcher':   { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'df-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'df-debugger':             { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'df-codebase-mapper':      { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'df-verifier':             { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'df-job-checker':         { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'df-integration-checker':  { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function loadConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    objective_branch_template: 'df/objective-{objective}-{slug}',
    milestone_branch_template: 'df/{milestone}-{slug}',
    research: true,
    job_checker: true,
    verifier: true,
    parallelization: true,
    brave_search: false,
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    return {
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs: get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored: get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ?? defaults.search_gitignored,
      branching_strategy: get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ?? defaults.branching_strategy,
      objective_branch_template: get('objective_branch_template', { section: 'git', field: 'objective_branch_template' }) ?? defaults.objective_branch_template,
      milestone_branch_template: get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ?? defaults.milestone_branch_template,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      job_checker: get('job_checker', { section: 'workflow', field: 'job_check' }) ?? defaults.job_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      parallelization,
      brave_search: get('brave_search') ?? defaults.brave_search,
    };
  } catch {
    return defaults;
  }
}

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

function normalizeObjectiveName(objective) {
  const match = objective.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return objective;
  const num = match[1];
  const parts = num.split('.');
  const padded = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}

function extractFrontmatter(content) {
  const frontmatter = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return frontmatter;

  const yaml = match[1];
  const lines = yaml.split('\n');

  // Stack to track nested objects: [{obj, key, indent}]
  // obj = object to write to, key = current key collecting array items, indent = indentation level
  let stack = [{ obj: frontmatter, key: null, indent: -1 }];

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Calculate indentation (number of leading spaces)
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // Pop stack back to appropriate level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Check for key: value pattern
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[2];
      const value = keyMatch[3].trim();

      if (value === '' || value === '[') {
        // Key with no value or opening bracket — could be nested object or array
        // We'll determine based on next lines, for now create placeholder
        current.obj[key] = value === '[' ? [] : {};
        current.key = null;
        // Push new context for potential nested content
        stack.push({ obj: current.obj[key], key: null, indent });
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array: key: [a, b, c]
        current.obj[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        current.key = null;
      } else {
        // Simple key: value
        current.obj[key] = value.replace(/^["']|["']$/g, '');
        current.key = null;
      }
    } else if (line.trim().startsWith('- ')) {
      // Array item
      const itemValue = line.trim().slice(2).replace(/^["']|["']$/g, '');

      // If current context is an empty object, convert to array
      if (typeof current.obj === 'object' && !Array.isArray(current.obj) && Object.keys(current.obj).length === 0) {
        // Find the key in parent that points to this object and convert it
        const parent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parent) {
          for (const k of Object.keys(parent.obj)) {
            if (parent.obj[k] === current.obj) {
              parent.obj[k] = [itemValue];
              current.obj = parent.obj[k];
              break;
            }
          }
        }
      } else if (Array.isArray(current.obj)) {
        current.obj.push(itemValue);
      }
    }
  }

  return frontmatter;
}

function reconstructFrontmatter(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every(v => typeof v === 'string') && value.length <= 3 && value.join(', ').length < 60) {
        lines.push(`${key}: [${value.join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subkey, subval] of Object.entries(value)) {
        if (subval === null || subval === undefined) continue;
        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else if (subval.every(v => typeof v === 'string') && subval.length <= 3 && subval.join(', ').length < 60) {
            lines.push(`  ${subkey}: [${subval.join(', ')}]`);
          } else {
            lines.push(`  ${subkey}:`);
            for (const item of subval) {
              lines.push(`    - ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`);
            }
          }
        } else if (typeof subval === 'object') {
          lines.push(`  ${subkey}:`);
          for (const [subsubkey, subsubval] of Object.entries(subval)) {
            if (subsubval === null || subsubval === undefined) continue;
            if (Array.isArray(subsubval)) {
              if (subsubval.length === 0) {
                lines.push(`    ${subsubkey}: []`);
              } else {
                lines.push(`    ${subsubkey}:`);
                for (const item of subsubval) {
                  lines.push(`      - ${item}`);
                }
              }
            } else {
              lines.push(`    ${subsubkey}: ${subsubval}`);
            }
          }
        } else {
          const sv = String(subval);
          lines.push(`  ${subkey}: ${sv.includes(':') || sv.includes('#') ? `"${sv}"` : sv}`);
        }
      }
    } else {
      const sv = String(value);
      if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) {
        lines.push(`${key}: "${sv}"`);
      } else {
        lines.push(`${key}: ${sv}`);
      }
    }
  }
  return lines.join('\n');
}

function spliceFrontmatter(content, newObj) {
  const yamlStr = reconstructFrontmatter(newObj);
  const match = content.match(/^---\n[\s\S]+?\n---/);
  if (match) {
    return `---\n${yamlStr}\n---` + content.slice(match[0].length);
  }
  return `---\n${yamlStr}\n---\n\n` + content;
}

function parseMustHavesBlock(content, blockName) {
  // Extract a specific block from must_haves in raw frontmatter YAML
  // Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}]
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!fmMatch) return [];

  const yaml = fmMatch[1];
  // Find the block (e.g., "truths:", "artifacts:", "key_links:")
  const blockPattern = new RegExp(`^\\s{4}${blockName}:\\s*$`, 'm');
  const blockStart = yaml.search(blockPattern);
  if (blockStart === -1) return [];

  const afterBlock = yaml.slice(blockStart);
  const blockLines = afterBlock.split('\n').slice(1); // skip the header line

  const items = [];
  let current = null;

  for (const line of blockLines) {
    // Stop at same or lower indent level (non-continuation)
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= 4 && line.trim() !== '') break; // back to must_haves level or higher

    if (line.match(/^\s{6}-\s+/)) {
      // New list item at 6-space indent
      if (current) items.push(current);
      current = {};
      // Check if it's a simple string item
      const simpleMatch = line.match(/^\s{6}-\s+"?([^"]+)"?\s*$/);
      if (simpleMatch && !line.includes(':')) {
        current = simpleMatch[1];
      } else {
        // Key-value on same line as dash: "- path: value"
        const kvMatch = line.match(/^\s{6}-\s+(\w+):\s*"?([^"]*)"?\s*$/);
        if (kvMatch) {
          current = {};
          current[kvMatch[1]] = kvMatch[2];
        }
      }
    } else if (current && typeof current === 'object') {
      // Continuation key-value at 8+ space indent
      const kvMatch = line.match(/^\s{8,}(\w+):\s*"?([^"]*)"?\s*$/);
      if (kvMatch) {
        const val = kvMatch[2];
        // Try to parse as number
        current[kvMatch[1]] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
      }
      // Array items under a key
      const arrMatch = line.match(/^\s{10,}-\s+"?([^"]+)"?\s*$/);
      if (arrMatch) {
        // Find the last key added and convert to array
        const keys = Object.keys(current);
        const lastKey = keys[keys.length - 1];
        if (lastKey && !Array.isArray(current[lastKey])) {
          current[lastKey] = current[lastKey] ? [current[lastKey]] : [];
        }
        if (lastKey) current[lastKey].push(arrMatch[1]);
      }
    }
  }
  if (current) items.push(current);

  return items;
}

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

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = { count, todos };
  output(result, raw, count.toString());
}

function cmdVerifyPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for verification');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

function cmdConfigEnsureSection(cwd, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const planningDir = path.join(cwd, '.planning');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.devflow', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Load user-level defaults from ~/.devflow/defaults.json if available
  const globalDefaultsPath = path.join(homedir, '.devflow', 'defaults.json');
  let userDefaults = {};
  try {
    if (fs.existsSync(globalDefaultsPath)) {
      userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, 'utf-8'));
    }
  } catch (err) {
    // Ignore malformed global defaults, fall back to hardcoded
  }

  // Create default config (user-level defaults override hardcoded defaults)
  const hardcoded = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    objective_branch_template: 'df/objective-{objective}-{slug}',
    milestone_branch_template: 'df/{milestone}-{slug}',
    workflow: {
      research: true,
      job_check: true,
      verifier: true,
    },
    parallelization: true,
    brave_search: hasBraveSearch,
  };
  const defaults = {
    ...hardcoded,
    ...userDefaults,
    workflow: { ...hardcoded.workflow, ...(userDefaults.workflow || {}) },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

function cmdConfigSet(cwd, keyPath, value, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  // Load existing config or start with empty object
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    error('Failed to read config.json: ' + err.message);
  }

  // Set nested value using dot notation (e.g., "workflow.research")
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = parsedValue;

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { updated: true, key: keyPath, value: parsedValue };
    output(result, raw, `${keyPath}=${parsedValue}`);
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

function cmdConfigGet(cwd, keyPath, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-get <key.path>');
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      error('No config.json found at ' + configPath);
    }
  } catch (err) {
    if (err.message.startsWith('No config.json')) throw err;
    error('Failed to read config.json: ' + err.message);
  }

  // Traverse dot-notation path (e.g., "workflow.auto_advance")
  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      error(`Key not found: ${keyPath}`);
    }
    current = current[key];
  }

  if (current === undefined) {
    error(`Key not found: ${keyPath}`);
  }

  output(current, raw, String(current));
}

function cmdHistoryDigest(cwd, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const digest = { objectives: {}, decisions: [], tech_stack: new Set() };

  // Collect all objective directories: archived + current
  const allObjectiveDirs = [];

  // Add archived objectives first (oldest milestones first)
  const archived = getArchivedObjectiveDirs(cwd);
  for (const a of archived) {
    allObjectiveDirs.push({ name: a.name, fullPath: a.fullPath, milestone: a.milestone });
  }

  // Add current objectives
  if (fs.existsSync(objectivesDir)) {
    try {
      const currentDirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      for (const dir of currentDirs) {
        allObjectiveDirs.push({ name: dir, fullPath: path.join(objectivesDir, dir), milestone: null });
      }
    } catch {}
  }

  if (allObjectiveDirs.length === 0) {
    digest.tech_stack = [];
    output(digest, raw);
    return;
  }

  try {
    for (const { name: dir, fullPath: dirPath } of allObjectiveDirs) {
      const summaries = fs.readdirSync(dirPath).filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content);
          
          const objectiveNum = fm.objective || dir.split('-')[0];
          
          if (!digest.objectives[objectiveNum]) {
            digest.objectives[objectiveNum] = {
              name: fm.name || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set(),
              affects: new Set(),
              patterns: new Set(),
            };
          }

          // Merge provides
          if (fm['dependency-graph'] && fm['dependency-graph'].provides) {
            fm['dependency-graph'].provides.forEach(p => digest.objectives[objectiveNum].provides.add(p));
          } else if (fm.provides) {
            fm.provides.forEach(p => digest.objectives[objectiveNum].provides.add(p));
          }

          // Merge affects
          if (fm['dependency-graph'] && fm['dependency-graph'].affects) {
            fm['dependency-graph'].affects.forEach(a => digest.objectives[objectiveNum].affects.add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            fm['patterns-established'].forEach(p => digest.objectives[objectiveNum].patterns.add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            fm['key-decisions'].forEach(d => {
              digest.decisions.push({ objective: objectiveNum, decision: d });
            });
          }

          // Merge tech stack
          if (fm['tech-stack'] && fm['tech-stack'].added) {
            fm['tech-stack'].added.forEach(t => digest.tech_stack.add(typeof t === 'string' ? t : t.name));
          }

        } catch (e) {
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.objectives).forEach(p => {
      digest.objectives[p].provides = [...digest.objectives[p].provides];
      digest.objectives[p].affects = [...digest.objectives[p].affects];
      digest.objectives[p].patterns = [...digest.objectives[p].patterns];
    });
    digest.tech_stack = [...digest.tech_stack];

    output(digest, raw);
  } catch (e) {
    error('Failed to generate history digest: ' + e.message);
  }
}

function cmdObjectivesList(cwd, options, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const { type, objective, includeArchived } = options;

  // If no objectives directory, return empty
  if (!fs.existsSync(objectivesDir)) {
    if (type) {
      output({ files: [], count: 0 }, raw, '');
    } else {
      output({ directories: [], count: 0 }, raw, '');
    }
    return;
  }

  try {
    // Get all objective directories
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    let dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Include archived objectives if requested
    if (includeArchived) {
      const archived = getArchivedObjectiveDirs(cwd);
      for (const a of archived) {
        dirs.push(`${a.name} [${a.milestone}]`);
      }
    }

    // Sort numerically (handles decimals: 01, 02, 02.1, 02.2, 03)
    dirs.sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    // If filtering by objective number
    if (objective) {
      const normalized = normalizeObjectiveName(objective);
      const match = dirs.find(d => d.startsWith(normalized));
      if (!match) {
        output({ files: [], count: 0, objective_dir: null, error: 'Objective not found' }, raw, '');
        return;
      }
      dirs = [match];
    }

    // If listing files of a specific type
    if (type) {
      const files = [];
      for (const dir of dirs) {
        const dirPath = path.join(objectivesDir, dir);
        const dirFiles = fs.readdirSync(dirPath);

        let filtered;
        if (type === 'jobs') {
          filtered = dirFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
        } else if (type === 'summaries') {
          filtered = dirFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        } else {
          filtered = dirFiles;
        }

        files.push(...filtered.sort());
      }

      const result = {
        files,
        count: files.length,
        objective_dir: objective ? dirs[0].replace(/^\d+(?:\.\d+)?-?/, '') : null,
      };
      output(result, raw, files.join('\n'));
      return;
    }

    // Default: list directories
    output({ directories: dirs, count: dirs.length }, raw, dirs.join('\n'));
  } catch (e) {
    error('Failed to list objectives: ' + e.message);
  }
}

function cmdRoadmapGetObjective(cwd, objectiveNum, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    output({ found: false, error: 'ROADMAP.md not found' }, raw, '');
    return;
  }

  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');

    // Escape special regex chars in objective number, handle decimal
    const escapedObjective = objectiveNum.replace(/\./g, '\\.');

    // Match "## Objective X:", "### Objective X:", or "#### Objective X:" with optional name
    const objectivePattern = new RegExp(
      `#{2,4}\\s*Objective\\s+${escapedObjective}:\\s*([^\\n]+)`,
      'i'
    );
    const headerMatch = content.match(objectivePattern);

    if (!headerMatch) {
      // Fallback: check if objective exists in summary list but missing detail section
      const checklistPattern = new RegExp(
        `-\\s*\\[[ x]\\]\\s*\\*\\*Objective\\s+${escapedObjective}:\\s*([^*]+)\\*\\*`,
        'i'
      );
      const checklistMatch = content.match(checklistPattern);

      if (checklistMatch) {
        // Objective exists in summary but missing detail section - malformed ROADMAP
        output({
          found: false,
          objective_number: objectiveNum,
          objective_name: checklistMatch[1].trim(),
          error: 'malformed_roadmap',
          message: `Objective ${objectiveNum} exists in summary list but missing "### Objective ${objectiveNum}:" detail section. ROADMAP.md needs both formats.`
        }, raw, '');
        return;
      }

      output({ found: false, objective_number: objectiveNum }, raw, '');
      return;
    }

    const objectiveName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;

    // Find the end of this section (next ## or ### objective header, or end of file)
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeaderMatch
      ? headerIndex + nextHeaderMatch.index
      : content.length;

    const section = content.slice(headerIndex, sectionEnd).trim();

    // Extract goal if present
    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    // Extract success criteria as structured array
    const criteriaMatch = section.match(/\*\*Success Criteria\*\*[^\n]*:\s*\n((?:\s*\d+\.\s*[^\n]+\n?)+)/i);
    const success_criteria = criteriaMatch
      ? criteriaMatch[1].trim().split('\n').map(line => line.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
      : [];

    output(
      {
        found: true,
        objective_number: objectiveNum,
        objective_name: objectiveName,
        goal,
        success_criteria,
        section,
      },
      raw,
      section
    );
  } catch (e) {
    error('Failed to read ROADMAP.md: ' + e.message);
  }
}

function cmdObjectiveNextDecimal(cwd, baseObjective, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(baseObjective);

  // Check if objectives directory exists
  if (!fs.existsSync(objectivesDir)) {
    output(
      {
        found: false,
        base_objective: normalized,
        next: `${normalized}.1`,
        existing: [],
      },
      raw,
      `${normalized}.1`
    );
    return;
  }

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    // Check if base objective exists
    const baseExists = dirs.some(d => d.startsWith(normalized + '-') || d === normalized);

    // Find existing decimal objectives for this base
    const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
    const existingDecimals = [];

    for (const dir of dirs) {
      const match = dir.match(decimalPattern);
      if (match) {
        existingDecimals.push(`${normalized}.${match[1]}`);
      }
    }

    // Sort numerically
    existingDecimals.sort((a, b) => {
      const aNum = parseFloat(a);
      const bNum = parseFloat(b);
      return aNum - bNum;
    });

    // Calculate next decimal
    let nextDecimal;
    if (existingDecimals.length === 0) {
      nextDecimal = `${normalized}.1`;
    } else {
      const lastDecimal = existingDecimals[existingDecimals.length - 1];
      const lastNum = parseInt(lastDecimal.split('.')[1], 10);
      nextDecimal = `${normalized}.${lastNum + 1}`;
    }

    output(
      {
        found: baseExists,
        base_objective: normalized,
        next: nextDecimal,
        existing: existingDecimals,
      },
      raw,
      nextDecimal
    );
  } catch (e) {
    error('Failed to calculate next decimal objective: ' + e.message);
  }
}

function cmdStateLoad(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = path.join(cwd, '.planning');

  let stateRaw = '';
  try {
    stateRaw = fs.readFileSync(path.join(planningDir, 'STATE.md'), 'utf-8');
  } catch {}

  const configExists = fs.existsSync(path.join(planningDir, 'config.json'));
  const roadmapExists = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const stateExists = stateRaw.length > 0;

  const result = {
    config,
    state_raw: stateRaw,
    state_exists: stateExists,
    roadmap_exists: roadmapExists,
    config_exists: configExists,
  };

  // For --raw, output a condensed key=value format
  if (raw) {
    const c = config;
    const lines = [
      `model_profile=${c.model_profile}`,
      `commit_docs=${c.commit_docs}`,
      `branching_strategy=${c.branching_strategy}`,
      `objective_branch_template=${c.objective_branch_template}`,
      `milestone_branch_template=${c.milestone_branch_template}`,
      `parallelization=${c.parallelization}`,
      `research=${c.research}`,
      `job_checker=${c.job_checker}`,
      `verifier=${c.verifier}`,
      `config_exists=${configExists}`,
      `roadmap_exists=${roadmapExists}`,
      `state_exists=${stateExists}`,
    ];
    process.stdout.write(lines.join('\n'));
    process.exit(0);
  }

  output(result);
}

function cmdStateGet(cwd, section, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    
    if (!section) {
      output({ content }, raw, content);
      return;
    }

    // Try to find markdown section or field
    const fieldEscaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Check for **field:** value
    const fieldPattern = new RegExp(`\\*\\*${fieldEscaped}:\\*\\*\\s*(.*)`, 'i');
    const fieldMatch = content.match(fieldPattern);
    if (fieldMatch) {
      output({ [section]: fieldMatch[1].trim() }, raw, fieldMatch[1].trim());
      return;
    }

    // Check for ## Section
    const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const sectionMatch = content.match(sectionPattern);
    if (sectionMatch) {
      output({ [section]: sectionMatch[1].trim() }, raw, sectionMatch[1].trim());
      return;
    }

    output({ error: `Section or field "${section}" not found` }, raw, '');
  } catch {
    error('STATE.md not found');
  }
}

function cmdStatePatch(cwd, patches, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const results = { updated: [], failed: [] };

    for (const [field, value] of Object.entries(patches)) {
      const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
      
      if (pattern.test(content)) {
        content = content.replace(pattern, `$1${value}`);
        results.updated.push(field);
      } else {
        results.failed.push(field);
      }
    }

    if (results.updated.length > 0) {
      fs.writeFileSync(statePath, content, 'utf-8');
    }

    output(results, raw, results.updated.length > 0 ? 'true' : 'false');
  } catch {
    error('STATE.md not found');
  }
}

function cmdStateUpdate(cwd, field, value) {
  if (!field || value === undefined) {
    error('field and value required for state update');
  }

  const statePath = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content = fs.readFileSync(statePath, 'utf-8');
    const fieldEscaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${value}`);
      fs.writeFileSync(statePath, content, 'utf-8');
      output({ updated: true });
    } else {
      output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
    }
  } catch {
    output({ updated: false, reason: 'STATE.md not found' });
  }
}

// ─── State Progression Engine ────────────────────────────────────────────────

function stateExtractField(content, fieldName) {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function stateReplaceField(content, fieldName, newValue) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, 'i');
  if (pattern.test(content)) {
    return content.replace(pattern, `$1${newValue}`);
  }
  return null;
}

function cmdStateAdvanceJob(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const currentJob = parseInt(stateExtractField(content, 'Current Job'), 10);
  const totalJobs = parseInt(stateExtractField(content, 'Total Jobs in Objective'), 10);
  const today = new Date().toISOString().split('T')[0];

  if (isNaN(currentJob) || isNaN(totalJobs)) {
    output({ error: 'Cannot parse Current Job or Total Jobs in Objective from STATE.md' }, raw);
    return;
  }

  if (currentJob >= totalJobs) {
    content = stateReplaceField(content, 'Status', 'Objective complete — ready for verification') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ advanced: false, reason: 'last_job', current_job: currentJob, total_jobs: totalJobs, status: 'ready_for_verification' }, raw, 'false');
  } else {
    const newJob = currentJob + 1;
    content = stateReplaceField(content, 'Current Job', String(newJob)) || content;
    content = stateReplaceField(content, 'Status', 'Ready to execute') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ advanced: true, previous_job: currentJob, current_job: newJob, total_jobs: totalJobs }, raw, 'true');
  }
}

function cmdStateRecordMetric(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const { objective, job, duration, tasks, files } = options;

  if (!objective || !job || !duration) {
    output({ error: 'objective, job, and duration required' }, raw);
    return;
  }

  // Find Performance Metrics section and its table
  const metricsPattern = /(##\s*Performance Metrics[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n)([\s\S]*?)(?=\n##|\n$|$)/i;
  const metricsMatch = content.match(metricsPattern);

  if (metricsMatch) {
    const tableHeader = metricsMatch[1];
    let tableBody = metricsMatch[2].trimEnd();
    const newRow = `| Objective ${objective} P${job} | ${duration} | ${tasks || '-'} tasks | ${files || '-'} files |`;

    if (tableBody.trim() === '' || tableBody.includes('None yet')) {
      tableBody = newRow;
    } else {
      tableBody = tableBody + '\n' + newRow;
    }

    content = content.replace(metricsPattern, `${tableHeader}${tableBody}\n`);
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ recorded: true, objective, job, duration }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'Performance Metrics section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateUpdateProgress(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');

  // Count summaries across all objectives
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  let totalJobs = 0;
  let totalSummaries = 0;

  if (fs.existsSync(objectivesDir)) {
    const objectiveDirs = fs.readdirSync(objectivesDir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of objectiveDirs) {
      const files = fs.readdirSync(path.join(objectivesDir, dir));
      totalJobs += files.filter(f => f.match(/-JOB\.md$/i)).length;
      totalSummaries += files.filter(f => f.match(/-SUMMARY\.md$/i)).length;
    }
  }

  const percent = totalJobs > 0 ? Math.round(totalSummaries / totalJobs * 100) : 0;
  const barWidth = 10;
  const filled = Math.round(percent / 100 * barWidth);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const progressStr = `[${bar}] ${percent}%`;

  const progressPattern = /(\*\*Progress:\*\*\s*).*/i;
  if (progressPattern.test(content)) {
    content = content.replace(progressPattern, `$1${progressStr}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ updated: true, percent, completed: totalSummaries, total: totalJobs, bar: progressStr }, raw, progressStr);
  } else {
    output({ updated: false, reason: 'Progress field not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateAddDecision(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  const { objective, summary, rationale } = options;
  if (!summary) { output({ error: 'summary required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const entry = `- [Objective ${objective || '?'}]: ${summary}${rationale ? ` — ${rationale}` : ''}`;

  // Find Decisions section (various heading patterns)
  const sectionPattern = /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    let sectionBody = match[2];
    // Remove placeholders
    sectionBody = sectionBody.replace(/None yet\.?\s*\n?/gi, '').replace(/No decisions yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, `${match[1]}${sectionBody}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ added: true, decision: entry }, raw, 'true');
  } else {
    output({ added: false, reason: 'Decisions section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateAddBlocker(cwd, text, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }
  if (!text) { output({ error: 'text required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const entry = `- ${text}`;

  const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    let sectionBody = match[2];
    sectionBody = sectionBody.replace(/None\.?\s*\n?/gi, '').replace(/None yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, `${match[1]}${sectionBody}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ added: true, blocker: text }, raw, 'true');
  } else {
    output({ added: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateResolveBlocker(cwd, text, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }
  if (!text) { output({ error: 'text required' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');

  const sectionPattern = /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match = content.match(sectionPattern);

  if (match) {
    const sectionBody = match[2];
    const lines = sectionBody.split('\n');
    const filtered = lines.filter(line => {
      if (!line.startsWith('- ')) return true;
      return !line.toLowerCase().includes(text.toLowerCase());
    });

    let newBody = filtered.join('\n');
    // If section is now empty, add placeholder
    if (!newBody.trim() || !newBody.includes('- ')) {
      newBody = 'None\n';
    }

    content = content.replace(sectionPattern, `${match[1]}${newBody}`);
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ resolved: true, blocker: text }, raw, 'true');
  } else {
    output({ resolved: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

function cmdStateRecordSession(cwd, options, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) { output({ error: 'STATE.md not found' }, raw); return; }

  let content = fs.readFileSync(statePath, 'utf-8');
  const now = new Date().toISOString();
  const updated = [];

  // Update Last session / Last Date
  let result = stateReplaceField(content, 'Last session', now);
  if (result) { content = result; updated.push('Last session'); }
  result = stateReplaceField(content, 'Last Date', now);
  if (result) { content = result; updated.push('Last Date'); }

  // Update Stopped at
  if (options.stopped_at) {
    result = stateReplaceField(content, 'Stopped At', options.stopped_at);
    if (!result) result = stateReplaceField(content, 'Stopped at', options.stopped_at);
    if (result) { content = result; updated.push('Stopped At'); }
  }

  // Update Resume file
  const resumeFile = options.resume_file || 'None';
  result = stateReplaceField(content, 'Resume File', resumeFile);
  if (!result) result = stateReplaceField(content, 'Resume file', resumeFile);
  if (result) { content = result; updated.push('Resume File'); }

  if (updated.length > 0) {
    fs.writeFileSync(statePath, content, 'utf-8');
    output({ recorded: true, updated }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'No session fields found in STATE.md' }, raw, 'false');
  }
}

function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';

  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) {
    const result = { model: 'sonnet', profile, unknown_agent: true };
    output(result, raw, 'sonnet');
    return;
  }

  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  const model = resolved === 'opus' ? 'inherit' : resolved;
  const result = { model, profile };
  output(result, raw, model);
}

function cmdFindObjective(cwd, objective, raw) {
  if (!objective) {
    error('objective identifier required');
  }

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  const notFound = { found: false, directory: null, objective_number: null, objective_name: null, plans: [], summaries: [] };

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const objectiveNumber = dirMatch ? dirMatch[1] : normalized;
    const objectiveName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const objectiveDir = path.join(objectivesDir, match);
    const objectiveFiles = fs.readdirSync(objectiveDir);
    const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').sort();
    const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();

    const result = {
      found: true,
      directory: path.join('.planning', 'objectives', match),
      objective_number: objectiveNumber,
      objective_name: objectiveName,
      plans,
      summaries,
    };

    output(result, raw, result.directory);
  } catch {
    output(notFound, raw, '');
  }
}

function cmdCommit(cwd, message, files, raw, amend) {
  if (!message && !amend) {
    error('commit message required');
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  if (!config.commit_docs) {
    const result = { committed: false, hash: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, '.planning')) {
    const result = { committed: false, hash: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Stage files
  const filesToStage = files && files.length > 0 ? files : ['.planning/'];
  for (const file of filesToStage) {
    execGit(cwd, ['add', file]);
  }

  // Commit
  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
      const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = { committed: false, hash: null, reason: 'nothing_to_commit', error: commitResult.stderr };
    output(result, raw, 'nothing');
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  const result = { committed: true, hash, reason: 'committed' };
  output(result, raw, hash || 'committed');
}

function cmdVerifySummary(cwd, summaryPath, checkFileCount, raw) {
  if (!summaryPath) {
    error('summary-path required');
  }

  const fullPath = path.join(cwd, summaryPath);
  const checkCount = checkFileCount || 2;

  // Check 1: Summary exists
  if (!fs.existsSync(fullPath)) {
    const result = {
      passed: false,
      checks: {
        summary_exists: false,
        files_created: { checked: 0, found: 0, missing: [] },
        commits_exist: false,
        self_check: 'not_found',
      },
      errors: ['SUMMARY.md not found'],
    };
    output(result, raw, 'failed');
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const errors = [];

  // Check 2: Spot-check files mentioned in summary
  const mentionedFiles = new Set();
  const patterns = [
    /`([^`]+\.[a-zA-Z]+)`/g,
    /(?:Created|Modified|Added|Updated|Edited):\s*`?([^\s`]+\.[a-zA-Z]+)`?/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const filePath = m[1];
      if (filePath && !filePath.startsWith('http') && filePath.includes('/')) {
        mentionedFiles.add(filePath);
      }
    }
  }

  const filesToCheck = Array.from(mentionedFiles).slice(0, checkCount);
  const missing = [];
  for (const file of filesToCheck) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missing.push(file);
    }
  }

  // Check 3: Commits exist
  const commitHashPattern = /\b[0-9a-f]{7,40}\b/g;
  const hashes = content.match(commitHashPattern) || [];
  let commitsExist = false;
  if (hashes.length > 0) {
    for (const hash of hashes.slice(0, 3)) {
      const result = execGit(cwd, ['cat-file', '-t', hash]);
      if (result.exitCode === 0 && result.stdout === 'commit') {
        commitsExist = true;
        break;
      }
    }
  }

  // Check 4: Self-check section
  let selfCheck = 'not_found';
  const selfCheckPattern = /##\s*(?:Self[- ]?Check|Verification|Quality Check)/i;
  if (selfCheckPattern.test(content)) {
    const passPattern = /(?:all\s+)?(?:pass|✓|✅|complete|succeeded)/i;
    const failPattern = /(?:fail|✗|❌|incomplete|blocked)/i;
    const checkSection = content.slice(content.search(selfCheckPattern));
    if (failPattern.test(checkSection)) {
      selfCheck = 'failed';
    } else if (passPattern.test(checkSection)) {
      selfCheck = 'passed';
    }
  }

  if (missing.length > 0) errors.push('Missing files: ' + missing.join(', '));
  if (!commitsExist && hashes.length > 0) errors.push('Referenced commit hashes not found in git history');
  if (selfCheck === 'failed') errors.push('Self-check section indicates failure');

  const checks = {
    summary_exists: true,
    files_created: { checked: filesToCheck.length, found: filesToCheck.length - missing.length, missing },
    commits_exist: commitsExist,
    self_check: selfCheck,
  };

  const passed = missing.length === 0 && selfCheck !== 'failed';
  const result = { passed, checks, errors };
  output(result, raw, passed ? 'passed' : 'failed');
}

function cmdTemplateSelect(cwd, jobPath, raw) {
  if (!jobPath) {
    error('job-path required');
  }

  try {
    const fullPath = path.join(cwd, jobPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Simple heuristics
    const taskMatch = content.match(/###\s*Task\s*\d+/g) || [];
    const taskCount = taskMatch.length;
    
    const decisionMatch = content.match(/decision/gi) || [];
    const hasDecisions = decisionMatch.length > 0;
    
    // Count file mentions
    const fileMentions = new Set();
    const filePattern = /`([^`]+\.[a-zA-Z]+)`/g;
    let m;
    while ((m = filePattern.exec(content)) !== null) {
      if (m[1].includes('/') && !m[1].startsWith('http')) {
        fileMentions.add(m[1]);
      }
    }
    const fileCount = fileMentions.size;

    let template = 'templates/summary-standard.md';
    let type = 'standard';

    if (taskCount <= 2 && fileCount <= 3 && !hasDecisions) {
      template = 'templates/summary-minimal.md';
      type = 'minimal';
    } else if (hasDecisions || fileCount > 6 || taskCount > 5) {
      template = 'templates/summary-complex.md';
      type = 'complex';
    }

    const result = { template, type, taskCount, fileCount, hasDecisions };
    output(result, raw, template);
  } catch (e) {
    // Fallback to standard
    output({ template: 'templates/summary-standard.md', type: 'standard', error: e.message }, raw, 'templates/summary-standard.md');
  }
}

function cmdTemplateFill(cwd, templateType, options, raw) {
  if (!templateType) { error('template type required: summary, job, or verification'); }
  if (!options.objective) { error('--objective required'); }

  const objectiveInfo = findObjectiveInternal(cwd, options.objective);
  if (!objectiveInfo || !objectiveInfo.found) { output({ error: 'Objective not found', objective: options.objective }, raw); return; }

  const padded = normalizeObjectiveName(options.objective);
  const today = new Date().toISOString().split('T')[0];
  const objectiveName = options.name || objectiveInfo.objective_name || 'Unnamed';
  const objectiveSlug = objectiveInfo.objective_slug || generateSlugInternal(objectiveName);
  const objectiveId = `${padded}-${objectiveSlug}`;
  const jobNum = (options.job || '01').padStart(2, '0');
  const fields = options.fields || {};

  let frontmatter, body, fileName;

  switch (templateType) {
    case 'summary': {
      frontmatter = {
        objective: objectiveId,
        job: jobNum,
        subsystem: '[primary category]',
        tags: [],
        provides: [],
        affects: [],
        'tech-stack': { added: [], patterns: [] },
        'key-files': { created: [], modified: [] },
        'key-decisions': [],
        'patterns-established': [],
        duration: '[X]min',
        completed: today,
        ...fields,
      };
      body = [
        `# Objective ${options.objective}: ${objectiveName} Summary`,
        '',
        '**[Substantive one-liner describing outcome]**',
        '',
        '## Performance',
        '- **Duration:** [time]',
        '- **Tasks:** [count completed]',
        '- **Files modified:** [count]',
        '',
        '## Accomplishments',
        '- [Key outcome 1]',
        '- [Key outcome 2]',
        '',
        '## Task Commits',
        '1. **Task 1: [task name]** - `hash`',
        '',
        '## Files Created/Modified',
        '- `path/to/file.ts` - What it does',
        '',
        '## Decisions & Deviations',
        '[Key decisions or "None - followed plan as specified"]',
        '',
        '## Next Objective Readiness',
        '[What\'s ready for next objective]',
      ].join('\n');
      fileName = `${padded}-${jobNum}-SUMMARY.md`;
      break;
    }
    case 'job': {
      const jobType = options.type || 'execute';
      const wave = parseInt(options.wave) || 1;
      frontmatter = {
        objective: objectiveId,
        job: jobNum,
        type: jobType,
        wave,
        depends_on: [],
        files_modified: [],
        autonomous: true,
        user_setup: [],
        must_haves: { truths: [], artifacts: [], key_links: [] },
        ...fields,
      };
      body = [
        `# Objective ${options.objective} Job ${jobNum}: [Title]`,
        '',
        '## Objective',
        '- **What:** [What this job builds]',
        '- **Why:** [Why it matters for the objective goal]',
        '- **Output:** [Concrete deliverable]',
        '',
        '## Context',
        '@.planning/PROJECT.md',
        '@.planning/ROADMAP.md',
        '@.planning/STATE.md',
        '',
        '## Tasks',
        '',
        '<task type="code">',
        '  <name>[Task name]</name>',
        '  <files>[file paths]</files>',
        '  <action>[What to do]</action>',
        '  <verify>[How to verify]</verify>',
        '  <done>[Definition of done]</done>',
        '</task>',
        '',
        '## Verification',
        '[How to verify this job achieved its objective]',
        '',
        '## Success Criteria',
        '- [ ] [Criterion 1]',
        '- [ ] [Criterion 2]',
      ].join('\n');
      fileName = `${padded}-${jobNum}-JOB.md`;
      break;
    }
    case 'verification': {
      frontmatter = {
        objective: objectiveId,
        verified: new Date().toISOString(),
        status: 'pending',
        score: '0/0 must-haves verified',
        ...fields,
      };
      body = [
        `# Objective ${options.objective}: ${objectiveName} — Verification`,
        '',
        '## Observable Truths',
        '| # | Truth | Status | Evidence |',
        '|---|-------|--------|----------|',
        '| 1 | [Truth] | pending | |',
        '',
        '## Required Artifacts',
        '| Artifact | Expected | Status | Details |',
        '|----------|----------|--------|---------|',
        '| [path] | [what] | pending | |',
        '',
        '## Key Link Verification',
        '| From | To | Via | Status | Details |',
        '|------|----|----|--------|---------|',
        '| [source] | [target] | [connection] | pending | |',
        '',
        '## Requirements Coverage',
        '| Requirement | Status | Blocking Issue |',
        '|-------------|--------|----------------|',
        '| [req] | pending | |',
        '',
        '## Result',
        '[Pending verification]',
      ].join('\n');
      fileName = `${padded}-VERIFICATION.md`;
      break;
    }
    default:
      error(`Unknown template type: ${templateType}. Available: summary, job, verification`);
      return;
  }

  const fullContent = `---\n${reconstructFrontmatter(frontmatter)}\n---\n\n${body}\n`;
  const outPath = path.join(cwd, objectiveInfo.directory, fileName);

  if (fs.existsSync(outPath)) {
    output({ error: 'File already exists', path: path.relative(cwd, outPath) }, raw);
    return;
  }

  fs.writeFileSync(outPath, fullContent, 'utf-8');
  const relPath = path.relative(cwd, outPath);
  output({ created: true, path: relPath, template: templateType }, raw, relPath);
}

function cmdObjectiveJobIndex(cwd, objective, raw) {
  if (!objective) {
    error('objective required for objective-job-index');
  }

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  // Find objective directory
  let objectiveDir = null;
  let objectiveDirName = null;
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const match = dirs.find(d => d.startsWith(normalized));
    if (match) {
      objectiveDir = path.join(objectivesDir, match);
      objectiveDirName = match;
    }
  } catch {
    // objectives dir doesn't exist
  }

  if (!objectiveDir) {
    output({ objective: normalized, error: 'Objective not found', plans: [], waves: {}, incomplete: [], has_checkpoints: false }, raw);
    return;
  }

  // Get all files in objective directory
  const objectiveFiles = fs.readdirSync(objectiveDir);
  const jobFiles = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').sort();
  const summaryFiles = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

  // Build set of job IDs with summaries
  const completedJobIds = new Set(
    summaryFiles.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
  );

  const plans = [];
  const waves = {};
  const incomplete = [];
  let hasCheckpoints = false;

  for (const jobFile of jobFiles) {
    const jobId = jobFile.replace('-JOB.md', '').replace('JOB.md', '');
    const jobPath = path.join(objectiveDir, jobFile);
    const content = fs.readFileSync(jobPath, 'utf-8');
    const fm = extractFrontmatter(content);

    // Count tasks (## Task N patterns)
    const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
    const taskCount = taskMatches.length;

    // Parse wave as integer
    const wave = parseInt(fm.wave, 10) || 1;

    // Parse autonomous (default true if not specified)
    let autonomous = true;
    if (fm.autonomous !== undefined) {
      autonomous = fm.autonomous === 'true' || fm.autonomous === true;
    }

    if (!autonomous) {
      hasCheckpoints = true;
    }

    // Parse files-modified
    let filesModified = [];
    if (fm['files-modified']) {
      filesModified = Array.isArray(fm['files-modified']) ? fm['files-modified'] : [fm['files-modified']];
    }

    const hasSummary = completedJobIds.has(jobId);
    if (!hasSummary) {
      incomplete.push(jobId);
    }

    const job = {
      id: jobId,
      wave,
      autonomous,
      objective: fm.objective || null,
      files_modified: filesModified,
      task_count: taskCount,
      has_summary: hasSummary,
    };

    plans.push(job);

    // Group by wave
    const waveKey = String(wave);
    if (!waves[waveKey]) {
      waves[waveKey] = [];
    }
    waves[waveKey].push(jobId);
  }

  const result = {
    objective: normalized,
    plans,
    waves,
    incomplete,
    has_checkpoints: hasCheckpoints,
  };

  output(result, raw);
}

function cmdStateSnapshot(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');

  if (!fs.existsSync(statePath)) {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  const content = fs.readFileSync(statePath, 'utf-8');

  // Helper to extract **Field:** value patterns
  const extractField = (fieldName) => {
    const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  };

  // Extract basic fields
  const currentObjective = extractField('Current Objective');
  const currentObjectiveName = extractField('Current Objective Name');
  const totalObjectivesRaw = extractField('Total Objectives');
  const currentJob = extractField('Current Job');
  const totalJobsRaw = extractField('Total Jobs in Objective');
  const status = extractField('Status');
  const progressRaw = extractField('Progress');
  const lastActivity = extractField('Last Activity');
  const lastActivityDesc = extractField('Last Activity Description');
  const pausedAt = extractField('Paused At');

  // Parse numeric fields
  const totalObjectives = totalObjectivesRaw ? parseInt(totalObjectivesRaw, 10) : null;
  const totalJobsInObjective = totalJobsRaw ? parseInt(totalJobsRaw, 10) : null;
  const progressPercent = progressRaw ? parseInt(progressRaw.replace('%', ''), 10) : null;

  // Extract decisions table
  const decisions = [];
  const decisionsMatch = content.match(/##\s*Decisions Made[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n([\s\S]*?)(?=\n##|\n$|$)/i);
  if (decisionsMatch) {
    const tableBody = decisionsMatch[1];
    const rows = tableBody.trim().split('\n').filter(r => r.includes('|'));
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        decisions.push({
          objective: cells[0],
          summary: cells[1],
          rationale: cells[2],
        });
      }
    }
  }

  // Extract blockers list
  const blockers = [];
  const blockersMatch = content.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersMatch) {
    const blockersSection = blockersMatch[1];
    const items = blockersSection.match(/^-\s+(.+)$/gm) || [];
    for (const item of items) {
      blockers.push(item.replace(/^-\s+/, '').trim());
    }
  }

  // Extract session info
  const session = {
    last_date: null,
    stopped_at: null,
    resume_file: null,
  };

  const sessionMatch = content.match(/##\s*Session\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (sessionMatch) {
    const sessionSection = sessionMatch[1];
    const lastDateMatch = sessionSection.match(/\*\*Last Date:\*\*\s*(.+)/i);
    const stoppedAtMatch = sessionSection.match(/\*\*Stopped At:\*\*\s*(.+)/i);
    const resumeFileMatch = sessionSection.match(/\*\*Resume File:\*\*\s*(.+)/i);

    if (lastDateMatch) session.last_date = lastDateMatch[1].trim();
    if (stoppedAtMatch) session.stopped_at = stoppedAtMatch[1].trim();
    if (resumeFileMatch) session.resume_file = resumeFileMatch[1].trim();
  }

  const result = {
    current_objective: currentObjective,
    current_objective_name: currentObjectiveName,
    total_objectives: totalObjectives,
    current_job: currentJob,
    total_jobs_in_objective: totalJobsInObjective,
    status,
    progress_percent: progressPercent,
    last_activity: lastActivity,
    last_activity_desc: lastActivityDesc,
    decisions,
    blockers,
    paused_at: pausedAt,
    session,
  };

  output(result, raw);
}

function cmdSummaryExtract(cwd, summaryPath, fields, raw) {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return decisionsList.map(d => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  // Build full result
  const fullResult = {
    path: summaryPath,
    one_liner: fm['one-liner'] || null,
    key_files: fm['key-files'] || [],
    tech_added: (fm['tech-stack'] && fm['tech-stack'].added) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw);
    return;
  }

  output(fullResult, raw);
}

// ─── Web Search (Brave API) ──────────────────────────────────────────────────

async function cmdWebsearch(query, options, raw) {
  const apiKey = process.env.BRAVE_API_KEY;

  if (!apiKey) {
    // No key = silent skip, agent falls back to built-in WebSearch
    output({ available: false, reason: 'BRAVE_API_KEY not set' }, raw, '');
    return;
  }

  if (!query) {
    output({ available: false, error: 'Query required' }, raw, '');
    return;
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options.limit || 10),
    country: 'us',
    search_lang: 'en',
    text_decorations: 'false'
  });

  if (options.freshness) {
    params.set('freshness', options.freshness);
  }

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      }
    );

    if (!response.ok) {
      output({ available: false, error: `API error: ${response.status}` }, raw, '');
      return;
    }

    const data = await response.json();

    const results = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age || null
    }));

    output({
      available: true,
      query,
      count: results.length,
      results
    }, raw, results.map(r => `${r.title}\n${r.url}\n${r.description}`).join('\n\n'));
  } catch (err) {
    output({ available: false, error: err.message }, raw, '');
  }
}

// ─── Frontmatter CRUD ────────────────────────────────────────────────────────

function cmdFrontmatterGet(cwd, filePath, field, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }
  const fm = extractFrontmatter(content);
  if (field) {
    const value = fm[field];
    if (value === undefined) { output({ error: 'Field not found', field }, raw); return; }
    output({ [field]: value }, raw, JSON.stringify(value));
  } else {
    output(fm, raw);
  }
}

function cmdFrontmatterSet(cwd, filePath, field, value, raw) {
  if (!filePath || !field || value === undefined) { error('file, field, and value required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: filePath }, raw); return; }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let parsedValue;
  try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }
  fm[field] = parsedValue;
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ updated: true, field, value: parsedValue }, raw, 'true');
}

function cmdFrontmatterMerge(cwd, filePath, data, raw) {
  if (!filePath || !data) { error('file and data required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) { output({ error: 'File not found', path: filePath }, raw); return; }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let mergeData;
  try { mergeData = JSON.parse(data); } catch { error('Invalid JSON for --data'); return; }
  Object.assign(fm, mergeData);
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ merged: true, fields: Object.keys(mergeData) }, raw, 'true');
}

const FRONTMATTER_SCHEMAS = {
  plan: { required: ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'] },
  summary: { required: ['objective', 'job', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['objective', 'verified', 'status', 'score'] },
};

function cmdFrontmatterValidate(cwd, filePath, schemaName, raw) {
  if (!filePath || !schemaName) { error('file and schema required'); }
  const schema = FRONTMATTER_SCHEMAS[schemaName];
  if (!schema) { error(`Unknown schema: ${schemaName}. Available: ${Object.keys(FRONTMATTER_SCHEMAS).join(', ')}`); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }
  const fm = extractFrontmatter(content);
  const missing = schema.required.filter(f => fm[f] === undefined);
  const present = schema.required.filter(f => fm[f] !== undefined);
  output({ valid: missing.length === 0, missing, present, schema: schemaName }, raw, missing.length === 0 ? 'valid' : 'invalid');
}

// ─── Verification Suite ──────────────────────────────────────────────────────

function cmdVerifyJobStructure(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const fm = extractFrontmatter(content);
  const errors = [];
  const warnings = [];

  // Check required frontmatter fields
  const required = ['objective', 'job', 'type', 'wave', 'depends_on', 'files_modified', 'autonomous', 'must_haves'];
  for (const field of required) {
    if (fm[field] === undefined) errors.push(`Missing required frontmatter field: ${field}`);
  }

  // Parse and check task elements
  const taskPattern = /<task[^>]*>([\s\S]*?)<\/task>/g;
  const tasks = [];
  let taskMatch;
  while ((taskMatch = taskPattern.exec(content)) !== null) {
    const taskContent = taskMatch[1];
    const nameMatch = taskContent.match(/<name>([\s\S]*?)<\/name>/);
    const taskName = nameMatch ? nameMatch[1].trim() : 'unnamed';
    const hasFiles = /<files>/.test(taskContent);
    const hasAction = /<action>/.test(taskContent);
    const hasVerify = /<verify>/.test(taskContent);
    const hasDone = /<done>/.test(taskContent);

    if (!nameMatch) errors.push('Task missing <name> element');
    if (!hasAction) errors.push(`Task '${taskName}' missing <action>`);
    if (!hasVerify) warnings.push(`Task '${taskName}' missing <verify>`);
    if (!hasDone) warnings.push(`Task '${taskName}' missing <done>`);
    if (!hasFiles) warnings.push(`Task '${taskName}' missing <files>`);

    tasks.push({ name: taskName, hasFiles, hasAction, hasVerify, hasDone });
  }

  if (tasks.length === 0) warnings.push('No <task> elements found');

  // Wave/depends_on consistency
  if (fm.wave && parseInt(fm.wave) > 1 && (!fm.depends_on || (Array.isArray(fm.depends_on) && fm.depends_on.length === 0))) {
    warnings.push('Wave > 1 but depends_on is empty');
  }

  // Autonomous/checkpoint consistency
  const hasCheckpoints = /<task\s+type=["']?checkpoint/.test(content);
  if (hasCheckpoints && fm.autonomous !== 'false' && fm.autonomous !== false) {
    errors.push('Has checkpoint tasks but autonomous is not false');
  }

  output({
    valid: errors.length === 0,
    errors,
    warnings,
    task_count: tasks.length,
    tasks,
    frontmatter_fields: Object.keys(fm),
  }, raw, errors.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyObjectiveCompleteness(cwd, objective, raw) {
  if (!objective) { error('objective required'); }
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  if (!objectiveInfo || !objectiveInfo.found) {
    output({ error: 'Objective not found', objective }, raw);
    return;
  }

  const errors = [];
  const warnings = [];
  const objectiveDir = path.join(cwd, objectiveInfo.directory);

  // List plans and summaries
  let files;
  try { files = fs.readdirSync(objectiveDir); } catch { output({ error: 'Cannot read objective directory' }, raw); return; }

  const plans = files.filter(f => f.match(/-JOB\.md$/i));
  const summaries = files.filter(f => f.match(/-SUMMARY\.md$/i));

  // Extract plan IDs (everything before -JOB.md)
  const jobIds = new Set(plans.map(p => p.replace(/-JOB\.md$/i, '')));
  const summaryIds = new Set(summaries.map(s => s.replace(/-SUMMARY\.md$/i, '')));

  // Plans without summaries
  const incompleteJobs = [...jobIds].filter(id => !summaryIds.has(id));
  if (incompleteJobs.length > 0) {
    errors.push(`Plans without summaries: ${incompleteJobs.join(', ')}`);
  }

  // Summaries without plans (orphans)
  const orphanSummaries = [...summaryIds].filter(id => !jobIds.has(id));
  if (orphanSummaries.length > 0) {
    warnings.push(`Summaries without plans: ${orphanSummaries.join(', ')}`);
  }

  output({
    complete: errors.length === 0,
    objective: objectiveInfo.objective_number,
    job_count: plans.length,
    summary_count: summaries.length,
    incomplete_jobs: incompleteJobs,
    orphan_summaries: orphanSummaries,
    errors,
    warnings,
  }, raw, errors.length === 0 ? 'complete' : 'incomplete');
}

function cmdVerifyReferences(cwd, filePath, raw) {
  if (!filePath) { error('file path required'); }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: filePath }, raw); return; }

  const found = [];
  const missing = [];

  // Find @-references: @path/to/file (must contain / to be a file path)
  const atRefs = content.match(/@([^\s\n,)]+\/[^\s\n,)]+)/g) || [];
  for (const ref of atRefs) {
    const cleanRef = ref.slice(1); // remove @
    const resolved = cleanRef.startsWith('~/')
      ? path.join(process.env.HOME || '', cleanRef.slice(2))
      : path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  // Find backtick file paths that look like real paths (contain / and have extension)
  const backtickRefs = content.match(/`([^`]+\/[^`]+\.[a-zA-Z]{1,10})`/g) || [];
  for (const ref of backtickRefs) {
    const cleanRef = ref.slice(1, -1); // remove backticks
    if (cleanRef.startsWith('http') || cleanRef.includes('${') || cleanRef.includes('{{')) continue;
    if (found.includes(cleanRef) || missing.includes(cleanRef)) continue; // dedup
    const resolved = path.join(cwd, cleanRef);
    if (fs.existsSync(resolved)) {
      found.push(cleanRef);
    } else {
      missing.push(cleanRef);
    }
  }

  output({
    valid: missing.length === 0,
    found: found.length,
    missing,
    total: found.length + missing.length,
  }, raw, missing.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyCommits(cwd, hashes, raw) {
  if (!hashes || hashes.length === 0) { error('At least one commit hash required'); }

  const valid = [];
  const invalid = [];
  for (const hash of hashes) {
    const result = execGit(cwd, ['cat-file', '-t', hash]);
    if (result.exitCode === 0 && result.stdout.trim() === 'commit') {
      valid.push(hash);
    } else {
      invalid.push(hash);
    }
  }

  output({
    all_valid: invalid.length === 0,
    valid,
    invalid,
    total: hashes.length,
  }, raw, invalid.length === 0 ? 'valid' : 'invalid');
}

function cmdVerifyArtifacts(cwd, jobFilePath, raw) {
  if (!jobFilePath) { error('job file path required'); }
  const fullPath = path.isAbsolute(jobFilePath) ? jobFilePath : path.join(cwd, jobFilePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: jobFilePath }, raw); return; }

  const artifacts = parseMustHavesBlock(content, 'artifacts');
  if (artifacts.length === 0) {
    output({ error: 'No must_haves.artifacts found in frontmatter', path: jobFilePath }, raw);
    return;
  }

  const results = [];
  for (const artifact of artifacts) {
    if (typeof artifact === 'string') continue; // skip simple string items
    const artPath = artifact.path;
    if (!artPath) continue;

    const artFullPath = path.join(cwd, artPath);
    const exists = fs.existsSync(artFullPath);
    const check = { path: artPath, exists, issues: [], passed: false };

    if (exists) {
      const fileContent = safeReadFile(artFullPath) || '';
      const lineCount = fileContent.split('\n').length;

      if (artifact.min_lines && lineCount < artifact.min_lines) {
        check.issues.push(`Only ${lineCount} lines, need ${artifact.min_lines}`);
      }
      if (artifact.contains && !fileContent.includes(artifact.contains)) {
        check.issues.push(`Missing pattern: ${artifact.contains}`);
      }
      if (artifact.exports) {
        const exports = Array.isArray(artifact.exports) ? artifact.exports : [artifact.exports];
        for (const exp of exports) {
          if (!fileContent.includes(exp)) check.issues.push(`Missing export: ${exp}`);
        }
      }
      check.passed = check.issues.length === 0;
    } else {
      check.issues.push('File not found');
    }

    results.push(check);
  }

  const passed = results.filter(r => r.passed).length;
  output({
    all_passed: passed === results.length,
    passed,
    total: results.length,
    artifacts: results,
  }, raw, passed === results.length ? 'valid' : 'invalid');
}

function cmdVerifyKeyLinks(cwd, jobFilePath, raw) {
  if (!jobFilePath) { error('job file path required'); }
  const fullPath = path.isAbsolute(jobFilePath) ? jobFilePath : path.join(cwd, jobFilePath);
  const content = safeReadFile(fullPath);
  if (!content) { output({ error: 'File not found', path: jobFilePath }, raw); return; }

  const keyLinks = parseMustHavesBlock(content, 'key_links');
  if (keyLinks.length === 0) {
    output({ error: 'No must_haves.key_links found in frontmatter', path: jobFilePath }, raw);
    return;
  }

  const results = [];
  for (const link of keyLinks) {
    if (typeof link === 'string') continue;
    const check = { from: link.from, to: link.to, via: link.via || '', verified: false, detail: '' };

    const sourceContent = safeReadFile(path.join(cwd, link.from || ''));
    if (!sourceContent) {
      check.detail = 'Source file not found';
    } else if (link.pattern) {
      try {
        const regex = new RegExp(link.pattern);
        if (regex.test(sourceContent)) {
          check.verified = true;
          check.detail = 'Pattern found in source';
        } else {
          const targetContent = safeReadFile(path.join(cwd, link.to || ''));
          if (targetContent && regex.test(targetContent)) {
            check.verified = true;
            check.detail = 'Pattern found in target';
          } else {
            check.detail = `Pattern "${link.pattern}" not found in source or target`;
          }
        }
      } catch {
        check.detail = `Invalid regex pattern: ${link.pattern}`;
      }
    } else {
      // No pattern: just check source references target
      if (sourceContent.includes(link.to || '')) {
        check.verified = true;
        check.detail = 'Target referenced in source';
      } else {
        check.detail = 'Target not referenced in source';
      }
    }

    results.push(check);
  }

  const verified = results.filter(r => r.verified).length;
  output({
    all_verified: verified === results.length,
    verified,
    total: results.length,
    links: results,
  }, raw, verified === results.length ? 'valid' : 'invalid');
}

// ─── Roadmap Analysis ─────────────────────────────────────────────────────────

function cmdRoadmapAnalyze(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    output({ error: 'ROADMAP.md not found', milestones: [], objectives: [], current_objective: null }, raw);
    return;
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');

  // Extract all objective headings: ## Objective N: Name or ### Objective N: Name
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const objectives = [];
  let match;

  while ((match = objectivePattern.exec(content)) !== null) {
    const objectiveNum = match[1];
    const objectiveName = match[2].replace(/\(INSERTED\)/i, '').trim();

    // Extract goal from the section
    const sectionStart = match.index;
    const restOfContent = content.slice(sectionStart);
    const nextHeader = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeader ? sectionStart + nextHeader.index : content.length;
    const section = content.slice(sectionStart, sectionEnd);

    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    const dependsMatch = section.match(/\*\*Depends on:\*\*\s*([^\n]+)/i);
    const depends_on = dependsMatch ? dependsMatch[1].trim() : null;

    // Check completion on disk
    const normalized = normalizeObjectiveName(objectiveNum);
    let diskStatus = 'no_directory';
    let jobCount = 0;
    let summaryCount = 0;
    let hasContext = false;
    let hasResearch = false;

    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);

      if (dirMatch) {
        const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dirMatch));
        jobCount = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').length;
        summaryCount = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
        hasContext = objectiveFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
        hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

        if (summaryCount >= jobCount && jobCount > 0) diskStatus = 'complete';
        else if (summaryCount > 0) diskStatus = 'partial';
        else if (jobCount > 0) diskStatus = 'planned';
        else if (hasResearch) diskStatus = 'researched';
        else if (hasContext) diskStatus = 'discussed';
        else diskStatus = 'empty';
      }
    } catch {}

    // Check ROADMAP checkbox status
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Objective\\s+${objectiveNum.replace('.', '\\.')}`, 'i');
    const checkboxMatch = content.match(checkboxPattern);
    const roadmapComplete = checkboxMatch ? checkboxMatch[1] === 'x' : false;

    objectives.push({
      number: objectiveNum,
      name: objectiveName,
      goal,
      depends_on,
      job_count: jobCount,
      summary_count: summaryCount,
      has_context: hasContext,
      has_research: hasResearch,
      disk_status: diskStatus,
      roadmap_complete: roadmapComplete,
    });
  }

  // Extract milestone info
  const milestones = [];
  const milestonePattern = /##\s*(.*v(\d+\.\d+)[^(\n]*)/gi;
  let mMatch;
  while ((mMatch = milestonePattern.exec(content)) !== null) {
    milestones.push({
      heading: mMatch[1].trim(),
      version: 'v' + mMatch[2],
    });
  }

  // Find current and next objective
  const currentObjective = objectives.find(p => p.disk_status === 'planned' || p.disk_status === 'partial') || null;
  const nextObjective = objectives.find(p => p.disk_status === 'empty' || p.disk_status === 'no_directory' || p.disk_status === 'discussed' || p.disk_status === 'researched') || null;

  // Aggregated stats
  const totalJobs = objectives.reduce((sum, p) => sum + p.job_count, 0);
  const totalSummaries = objectives.reduce((sum, p) => sum + p.summary_count, 0);
  const completedPhases = objectives.filter(p => p.disk_status === 'complete').length;

  // Detect objectives in summary list without detail sections (malformed ROADMAP)
  const checklistPattern = /-\s*\[[ x]\]\s*\*\*Objective\s+(\d+(?:\.\d+)?)/gi;
  const checklistObjectives = new Set();
  let checklistMatch;
  while ((checklistMatch = checklistPattern.exec(content)) !== null) {
    checklistObjectives.add(checklistMatch[1]);
  }
  const detailObjectives = new Set(objectives.map(p => p.number));
  const missingDetails = [...checklistObjectives].filter(p => !detailObjectives.has(p));

  const result = {
    milestones,
    objectives,
    objective_count: objectives.length,
    completed_objectives: completedPhases,
    total_jobs: totalJobs,
    total_summaries: totalSummaries,
    progress_percent: totalJobs > 0 ? Math.round((totalSummaries / totalJobs) * 100) : 0,
    current_objective: currentObjective ? currentObjective.number : null,
    next_phase: nextObjective ? nextObjective.number : null,
    missing_phase_details: missingDetails.length > 0 ? missingDetails : null,
  };

  output(result, raw);
}

// ─── Objective Add ────────────────────────────────────────────────────────────────

function cmdObjectiveAdd(cwd, description, raw) {
  if (!description) {
    error('description required for objective add');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const slug = generateSlugInternal(description);

  // Find highest integer objective number
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+)(?:\.\d+)?:/gi;
  let maxObjective = 0;
  let m;
  while ((m = objectivePattern.exec(content)) !== null) {
    const num = parseInt(m[1], 10);
    if (num > maxObjective) maxObjective = num;
  }

  const newObjectiveNum = maxObjective + 1;
  const paddedNum = String(newObjectiveNum).padStart(2, '0');
  const dirName = `${paddedNum}-${slug}`;
  const dirPath = path.join(cwd, '.planning', 'objectives', dirName);

  // Create directory with .gitkeep so git tracks empty folders
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  // Build objective entry
  const objectiveEntry = `\n### Objective ${newObjectiveNum}: ${description}\n\n**Goal:** [To be planned]\n**Depends on:** Objective ${maxObjective}\n**Jobs:** 0 jobs\n\nJobs:\n- [ ] TBD (run /df:plan-objective ${newObjectiveNum} to break down)\n`;

  // Find insertion point: before last "---" or at end
  let updatedContent;
  const lastSeparator = content.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent = content.slice(0, lastSeparator) + objectiveEntry + content.slice(lastSeparator);
  } else {
    updatedContent = content + objectiveEntry;
  }

  fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');

  const result = {
    objective_number: newObjectiveNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: `.planning/objectives/${dirName}`,
  };

  output(result, raw, paddedNum);
}

// ─── Objective Insert (Decimal) ──────────────────────────────────────────────────

function cmdObjectiveInsert(cwd, afterObjective, description, raw) {
  if (!afterObjective || !description) {
    error('after-objective and description required for objective insert');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const slug = generateSlugInternal(description);

  // Normalize input then strip leading zeros for flexible matching
  const normalizedAfter = normalizeObjectiveName(afterObjective);
  const unpadded = normalizedAfter.replace(/^0+/, '');
  const afterObjectiveEscaped = unpadded.replace(/\./g, '\\.');
  const targetPattern = new RegExp(`#{2,4}\\s*Objective\\s+0*${afterObjectiveEscaped}:`, 'i');
  if (!targetPattern.test(content)) {
    error(`Objective ${afterObjective} not found in ROADMAP.md`);
  }

  // Calculate next decimal using existing logic
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalizedBase = normalizeObjectiveName(afterObjective);
  let existingDecimals = [];

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    const decimalPattern = new RegExp(`^${normalizedBase}\\.(\\d+)`);
    for (const dir of dirs) {
      const dm = dir.match(decimalPattern);
      if (dm) existingDecimals.push(parseInt(dm[1], 10));
    }
  } catch {}

  const nextDecimal = existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
  const decimalObjective = `${normalizedBase}.${nextDecimal}`;
  const dirName = `${decimalObjective}-${slug}`;
  const dirPath = path.join(cwd, '.planning', 'objectives', dirName);

  // Create directory with .gitkeep so git tracks empty folders
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');

  // Build objective entry
  const objectiveEntry = `\n### Objective ${decimalObjective}: ${description} (INSERTED)\n\n**Goal:** [Urgent work - to be planned]\n**Depends on:** Objective ${afterObjective}\n**Jobs:** 0 jobs\n\nJobs:\n- [ ] TBD (run /df:plan-objective ${decimalObjective} to break down)\n`;

  // Insert after the target objective section
  const headerPattern = new RegExp(`(#{2,4}\\s*Objective\\s+0*${afterObjectiveEscaped}:[^\\n]*\\n)`, 'i');
  const headerMatch = content.match(headerPattern);
  if (!headerMatch) {
    error(`Could not find Objective ${afterObjective} header`);
  }

  const headerIdx = content.indexOf(headerMatch[0]);
  const afterHeader = content.slice(headerIdx + headerMatch[0].length);
  const nextObjectiveMatch = afterHeader.match(/\n#{2,4}\s+Objective\s+\d/i);

  let insertIdx;
  if (nextObjectiveMatch) {
    insertIdx = headerIdx + headerMatch[0].length + nextObjectiveMatch.index;
  } else {
    insertIdx = content.length;
  }

  const updatedContent = content.slice(0, insertIdx) + objectiveEntry + content.slice(insertIdx);
  fs.writeFileSync(roadmapPath, updatedContent, 'utf-8');

  const result = {
    objective_number: decimalObjective,
    after_objective: afterObjective,
    name: description,
    slug,
    directory: `.planning/objectives/${dirName}`,
  };

  output(result, raw, decimalObjective);
}

// ─── Objective Remove ─────────────────────────────────────────────────────────────

function cmdObjectiveRemove(cwd, targetObjective, options, raw) {
  if (!targetObjective) {
    error('objective number required for objective remove');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const force = options.force || false;

  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  // Normalize the target
  const normalized = normalizeObjectiveName(targetObjective);
  const isDecimal = targetObjective.includes('.');

  // Find and validate target directory
  let targetDir = null;
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    targetDir = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);
  } catch {}

  // Check for executed work (SUMMARY.md files)
  if (targetDir && !force) {
    const targetPath = path.join(objectivesDir, targetDir);
    const files = fs.readdirSync(targetPath);
    const summaries = files.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
    if (summaries.length > 0) {
      error(`Objective ${targetObjective} has ${summaries.length} executed job(s). Use --force to remove anyway.`);
    }
  }

  // Delete target directory
  if (targetDir) {
    fs.rmSync(path.join(objectivesDir, targetDir), { recursive: true, force: true });
  }

  // Renumber subsequent objectives
  const renamedDirs = [];
  const renamedFiles = [];

  if (isDecimal) {
    // Decimal removal: renumber sibling decimals (e.g., removing 06.2 → 06.3 becomes 06.2)
    const baseParts = normalized.split('.');
    const baseInt = baseParts[0];
    const removedDecimal = parseInt(baseParts[1], 10);

    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      // Find sibling decimals with higher numbers
      const decPattern = new RegExp(`^${baseInt}\\.(\\d+)-(.+)$`);
      const toRename = [];
      for (const dir of dirs) {
        const dm = dir.match(decPattern);
        if (dm && parseInt(dm[1], 10) > removedDecimal) {
          toRename.push({ dir, oldDecimal: parseInt(dm[1], 10), slug: dm[2] });
        }
      }

      // Sort descending to avoid conflicts
      toRename.sort((a, b) => b.oldDecimal - a.oldDecimal);

      for (const item of toRename) {
        const newDecimal = item.oldDecimal - 1;
        const oldObjectiveId = `${baseInt}.${item.oldDecimal}`;
        const newObjectiveId = `${baseInt}.${newDecimal}`;
        const newDirName = `${baseInt}.${newDecimal}-${item.slug}`;

        // Rename directory
        fs.renameSync(path.join(objectivesDir, item.dir), path.join(objectivesDir, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        // Rename files inside
        const dirFiles = fs.readdirSync(path.join(objectivesDir, newDirName));
        for (const f of dirFiles) {
          // Files may have objective prefix like "06.2-01-JOB.md"
          if (f.includes(oldObjectiveId)) {
            const newFileName = f.replace(oldObjectiveId, newObjectiveId);
            fs.renameSync(
              path.join(objectivesDir, newDirName, f),
              path.join(objectivesDir, newDirName, newFileName)
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch {}

  } else {
    // Integer removal: renumber all subsequent integer objectives
    const removedInt = parseInt(normalized, 10);

    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      // Collect directories that need renumbering (integer objectives > removed, and their decimals)
      const toRename = [];
      for (const dir of dirs) {
        const dm = dir.match(/^(\d+)(?:\.(\d+))?-(.+)$/);
        if (!dm) continue;
        const dirInt = parseInt(dm[1], 10);
        if (dirInt > removedInt) {
          toRename.push({
            dir,
            oldInt: dirInt,
            decimal: dm[2] ? parseInt(dm[2], 10) : null,
            slug: dm[3],
          });
        }
      }

      // Sort descending to avoid conflicts
      toRename.sort((a, b) => {
        if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
        return (b.decimal || 0) - (a.decimal || 0);
      });

      for (const item of toRename) {
        const newInt = item.oldInt - 1;
        const newPadded = String(newInt).padStart(2, '0');
        const oldPadded = String(item.oldInt).padStart(2, '0');
        const decimalSuffix = item.decimal !== null ? `.${item.decimal}` : '';
        const oldPrefix = `${oldPadded}${decimalSuffix}`;
        const newPrefix = `${newPadded}${decimalSuffix}`;
        const newDirName = `${newPrefix}-${item.slug}`;

        // Rename directory
        fs.renameSync(path.join(objectivesDir, item.dir), path.join(objectivesDir, newDirName));
        renamedDirs.push({ from: item.dir, to: newDirName });

        // Rename files inside
        const dirFiles = fs.readdirSync(path.join(objectivesDir, newDirName));
        for (const f of dirFiles) {
          if (f.startsWith(oldPrefix)) {
            const newFileName = newPrefix + f.slice(oldPrefix.length);
            fs.renameSync(
              path.join(objectivesDir, newDirName, f),
              path.join(objectivesDir, newDirName, newFileName)
            );
            renamedFiles.push({ from: f, to: newFileName });
          }
        }
      }
    } catch {}
  }

  // Update ROADMAP.md
  let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Remove the target objective section
  const targetEscaped = targetObjective.replace(/\./g, '\\.');
  const sectionPattern = new RegExp(
    `\\n?#{2,4}\\s*Objective\\s+${targetEscaped}\\s*:[\\s\\S]*?(?=\\n#{2,4}\\s+Objective\\s+\\d|$)`,
    'i'
  );
  roadmapContent = roadmapContent.replace(sectionPattern, '');

  // Remove from objective list (checkbox)
  const checkboxPattern = new RegExp(`\\n?-\\s*\\[[ x]\\]\\s*.*Objective\\s+${targetEscaped}[:\\s][^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(checkboxPattern, '');

  // Remove from progress table
  const tableRowPattern = new RegExp(`\\n?\\|\\s*${targetEscaped}\\.?\\s[^|]*\\|[^\\n]*`, 'gi');
  roadmapContent = roadmapContent.replace(tableRowPattern, '');

  // Renumber references in ROADMAP for subsequent objectives
  if (!isDecimal) {
    const removedInt = parseInt(normalized, 10);

    // Collect all integer objectives > removedInt
    const maxObjective = 99; // reasonable upper bound
    for (let oldNum = maxObjective; oldNum > removedInt; oldNum--) {
      const newNum = oldNum - 1;
      const oldStr = String(oldNum);
      const newStr = String(newNum);
      const oldPad = oldStr.padStart(2, '0');
      const newPad = newStr.padStart(2, '0');

      // Objective headings: ## Objective 18: or ### Objective 18: → ## Objective 17: or ### Objective 17:
      roadmapContent = roadmapContent.replace(
        new RegExp(`(#{2,4}\\s*Objective\\s+)${oldStr}(\\s*:)`, 'gi'),
        `$1${newStr}$2`
      );

      // Checkbox items: - [ ] **Objective 18:** → - [ ] **Objective 17:**
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Objective\\s+)${oldStr}([:\\s])`, 'g'),
        `$1${newStr}$2`
      );

      // Job references: 18-01 → 17-01
      roadmapContent = roadmapContent.replace(
        new RegExp(`${oldPad}-(\\d{2})`, 'g'),
        `${newPad}-$1`
      );

      // Table rows: | 18. → | 17.
      roadmapContent = roadmapContent.replace(
        new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'),
        `$1${newStr}. `
      );

      // Depends on references
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Depends on:\\*\\*\\s*Objective\\s+)${oldStr}\\b`, 'gi'),
        `$1${newStr}`
      );
    }
  }

  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

  // Update STATE.md objective count
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    // Update "Total Objectives" field
    const totalPattern = /(\*\*Total Objectives:\*\*\s*)(\d+)/;
    const totalMatch = stateContent.match(totalPattern);
    if (totalMatch) {
      const oldTotal = parseInt(totalMatch[2], 10);
      stateContent = stateContent.replace(totalPattern, `$1${oldTotal - 1}`);
    }
    // Update "Objective: X of Y" pattern
    const ofPattern = /(\bof\s+)(\d+)(\s*(?:\(|objectives?))/i;
    const ofMatch = stateContent.match(ofPattern);
    if (ofMatch) {
      const oldTotal = parseInt(ofMatch[2], 10);
      stateContent = stateContent.replace(ofPattern, `$1${oldTotal - 1}$3`);
    }
    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  const result = {
    removed: targetObjective,
    directory_deleted: targetDir || null,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    roadmap_updated: true,
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

// ─── Roadmap Update Job Progress ────────────────────────────────────────────

function cmdRoadmapUpdateJobProgress(cwd, objectiveNum, raw) {
  if (!objectiveNum) {
    error('objective number required for roadmap update-job-progress');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  const objectiveInfo = findObjectiveInternal(cwd, objectiveNum);
  if (!objectiveInfo) {
    error(`Objective ${objectiveNum} not found`);
  }

  const jobCount = objectiveInfo.plans.length;
  const summaryCount = objectiveInfo.summaries.length;

  if (jobCount === 0) {
    output({ updated: false, reason: 'No plans found', job_count: 0, summary_count: 0 }, raw, 'no plans');
    return;
  }

  const isComplete = summaryCount >= jobCount;
  const status = isComplete ? 'Complete' : summaryCount > 0 ? 'In Progress' : 'Planned';
  const today = new Date().toISOString().split('T')[0];

  if (!fs.existsSync(roadmapPath)) {
    output({ updated: false, reason: 'ROADMAP.md not found', job_count: jobCount, summary_count: summaryCount }, raw, 'no roadmap');
    return;
  }

  let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
  const objectiveEscaped = objectiveNum.replace('.', '\\.');

  // Progress table row: update Plans column (summaries/plans) and Status column
  const tablePattern = new RegExp(
    `(\\|\\s*${objectiveEscaped}\\.?\\s[^|]*\\|)[^|]*(\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
    'i'
  );
  const dateField = isComplete ? ` ${today} ` : '  ';
  roadmapContent = roadmapContent.replace(
    tablePattern,
    `$1 ${summaryCount}/${jobCount} $2 ${status.padEnd(11)}$3${dateField}$4`
  );

  // Update job count in objective detail section
  const jobCountPattern = new RegExp(
    `(#{2,4}\\s*Objective\\s+${objectiveEscaped}[\\s\\S]*?\\*\\*Jobs:\\*\\*\\s*)[^\\n]+`,
    'i'
  );
  const jobCountText = isComplete
    ? `${summaryCount}/${jobCount} jobs complete`
    : `${summaryCount}/${jobCount} jobs executed`;
  roadmapContent = roadmapContent.replace(jobCountPattern, `$1${jobCountText}`);

  // If complete: check checkbox
  if (isComplete) {
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Objective\\s+${objectiveEscaped}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);
  }

  fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

  output({
    updated: true,
    objective: objectiveNum,
    job_count: jobCount,
    summary_count: summaryCount,
    status,
    complete: isComplete,
  }, raw, `${summaryCount}/${jobCount} ${status}`);
}

// ─── Requirements Mark Complete ───────────────────────────────────────────────

function cmdRequirementsMarkComplete(cwd, reqIdsRaw, raw) {
  if (!reqIdsRaw || reqIdsRaw.length === 0) {
    error('requirement IDs required. Usage: requirements mark-complete REQ-01,REQ-02 or REQ-01 REQ-02');
  }

  // Accept comma-separated, space-separated, or bracket-wrapped: [REQ-01, REQ-02]
  const reqIds = reqIdsRaw
    .join(' ')
    .replace(/[\[\]]/g, '')
    .split(/[,\s]+/)
    .map(r => r.trim())
    .filter(Boolean);

  if (reqIds.length === 0) {
    error('no valid requirement IDs found');
  }

  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  if (!fs.existsSync(reqPath)) {
    output({ updated: false, reason: 'REQUIREMENTS.md not found', ids: reqIds }, raw, 'no requirements file');
    return;
  }

  let reqContent = fs.readFileSync(reqPath, 'utf-8');
  const updated = [];
  const notFound = [];

  for (const reqId of reqIds) {
    let found = false;

    // Update checkbox: - [ ] **REQ-ID** → - [x] **REQ-ID**
    const checkboxPattern = new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqId}\\*\\*)`, 'gi');
    if (checkboxPattern.test(reqContent)) {
      reqContent = reqContent.replace(checkboxPattern, '$1x$2');
      found = true;
    }

    // Update traceability table: | REQ-ID | Objective N | Pending | → | REQ-ID | Objective N | Complete |
    const tablePattern = new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi');
    if (tablePattern.test(reqContent)) {
      // Re-read since test() advances lastIndex for global regex
      reqContent = reqContent.replace(
        new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
        '$1 Complete $2'
      );
      found = true;
    }

    if (found) {
      updated.push(reqId);
    } else {
      notFound.push(reqId);
    }
  }

  if (updated.length > 0) {
    fs.writeFileSync(reqPath, reqContent, 'utf-8');
  }

  output({
    updated: updated.length > 0,
    marked_complete: updated,
    not_found: notFound,
    total: reqIds.length,
  }, raw, `${updated.length}/${reqIds.length} requirements marked complete`);
}

// ─── Objective Complete (Transition) ──────────────────────────────────────────────

function cmdObjectiveComplete(cwd, objectiveNum, raw) {
  if (!objectiveNum) {
    error('objective number required for objective complete');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objectiveNum);
  const today = new Date().toISOString().split('T')[0];

  // Verify objective info
  const objectiveInfo = findObjectiveInternal(cwd, objectiveNum);
  if (!objectiveInfo) {
    error(`Objective ${objectiveNum} not found`);
  }

  const jobCount = objectiveInfo.plans.length;
  const summaryCount = objectiveInfo.summaries.length;

  // Update ROADMAP.md: mark objective complete
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    // Checkbox: - [ ] Objective N: → - [x] Objective N: (...completed DATE)
    const checkboxPattern = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Objective\\s+${objectiveNum.replace('.', '\\.')}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update Status to Complete, add date
    const objectiveEscaped = objectiveNum.replace('.', '\\.');
    const tablePattern = new RegExp(
      `(\\|\\s*${objectiveEscaped}\\.?\\s[^|]*\\|[^|]*\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      tablePattern,
      `$1 Complete    $2 ${today} $3`
    );

    // Update job count in objective section
    const jobCountPattern = new RegExp(
      `(#{2,4}\\s*Objective\\s+${objectiveEscaped}[\\s\\S]*?\\*\\*Jobs:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      jobCountPattern,
      `$1${summaryCount}/${jobCount} jobs complete`
    );

    fs.writeFileSync(roadmapPath, roadmapContent, 'utf-8');

    // Update REQUIREMENTS.md traceability for this objective's requirements
    const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
    if (fs.existsSync(reqPath)) {
      // Extract Requirements line from roadmap for this objective
      const reqMatch = roadmapContent.match(
        new RegExp(`Objective\\s+${objectiveNum.replace('.', '\\.')}[\\s\\S]*?\\*\\*Requirements:\\*\\*\\s*([^\\n]+)`, 'i')
      );

      if (reqMatch) {
        const reqIds = reqMatch[1].replace(/[\[\]]/g, '').split(/[,\s]+/).map(r => r.trim()).filter(Boolean);
        let reqContent = fs.readFileSync(reqPath, 'utf-8');

        for (const reqId of reqIds) {
          // Update checkbox: - [ ] **REQ-ID** → - [x] **REQ-ID**
          reqContent = reqContent.replace(
            new RegExp(`(-\\s*\\[)[ ](\\]\\s*\\*\\*${reqId}\\*\\*)`, 'gi'),
            '$1x$2'
          );
          // Update traceability table: | REQ-ID | Objective N | Pending | → | REQ-ID | Objective N | Complete |
          reqContent = reqContent.replace(
            new RegExp(`(\\|\\s*${reqId}\\s*\\|[^|]+\\|)\\s*Pending\\s*(\\|)`, 'gi'),
            '$1 Complete $2'
          );
        }

        fs.writeFileSync(reqPath, reqContent, 'utf-8');
      }
    }
  }

  // Find next objective
  let nextObjectiveNum = null;
  let nextObjectiveName = null;
  let isLastObjective = true;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const currentFloat = parseFloat(objectiveNum);

    // Find the next objective directory after current
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (dm) {
        const dirFloat = parseFloat(dm[1]);
        if (dirFloat > currentFloat) {
          nextObjectiveNum = dm[1];
          nextObjectiveName = dm[2] || null;
          isLastObjective = false;
          break;
        }
      }
    }
  } catch {}

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');

    // Update Current Objective
    stateContent = stateContent.replace(
      /(\*\*Current Objective:\*\*\s*).*/,
      `$1${nextObjectiveNum || objectiveNum}`
    );

    // Update Current Objective Name
    if (nextObjectiveName) {
      stateContent = stateContent.replace(
        /(\*\*Current Objective Name:\*\*\s*).*/,
        `$1${nextObjectiveName.replace(/-/g, ' ')}`
      );
    }

    // Update Status
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${isLastObjective ? 'Milestone complete' : 'Ready to plan'}`
    );

    // Update Current Job
    stateContent = stateContent.replace(
      /(\*\*Current Job:\*\*\s*).*/,
      `$1Not started`
    );

    // Update Last Activity
    stateContent = stateContent.replace(
      /(\*\*Last Activity:\*\*\s*).*/,
      `$1${today}`
    );

    // Update Last Activity Description
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1Objective ${objectiveNum} complete${nextObjectiveNum ? `, transitioned to Objective ${nextObjectiveNum}` : ''}`
    );

    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  const result = {
    completed_objective: objectiveNum,
    objective_name: objectiveInfo.objective_name,
    plans_executed: `${summaryCount}/${jobCount}`,
    next_phase: nextObjectiveNum,
    next_objective_name: nextObjectiveName,
    is_last_objective: isLastObjective,
    date: today,
    roadmap_updated: fs.existsSync(roadmapPath),
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

// ─── Milestone Complete ───────────────────────────────────────────────────────

function cmdMilestoneComplete(cwd, version, options, raw) {
  if (!version) {
    error('version required for milestone complete (e.g., v1.0)');
  }

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const reqPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const milestonesPath = path.join(cwd, '.planning', 'MILESTONES.md');
  const archiveDir = path.join(cwd, '.planning', 'milestones');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const today = new Date().toISOString().split('T')[0];
  const milestoneName = options.name || version;

  // Ensure archive directory exists
  fs.mkdirSync(archiveDir, { recursive: true });

  // Gather stats from objectives
  let objectiveCount = 0;
  let totalJobs = 0;
  let totalTasks = 0;
  const accomplishments = [];

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      objectiveCount++;
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      totalJobs += plans.length;

      // Extract one-liners from summaries
      for (const s of summaries) {
        try {
          const content = fs.readFileSync(path.join(objectivesDir, dir, s), 'utf-8');
          const fm = extractFrontmatter(content);
          if (fm['one-liner']) {
            accomplishments.push(fm['one-liner']);
          }
          // Count tasks
          const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
          totalTasks += taskMatches.length;
        } catch {}
      }
    }
  } catch {}

  // Archive ROADMAP.md
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    fs.writeFileSync(path.join(archiveDir, `${version}-ROADMAP.md`), roadmapContent, 'utf-8');
  }

  // Archive REQUIREMENTS.md
  if (fs.existsSync(reqPath)) {
    const reqContent = fs.readFileSync(reqPath, 'utf-8');
    const archiveHeader = `# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current requirements, see \`.planning/REQUIREMENTS.md\`.\n\n---\n\n`;
    fs.writeFileSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`), archiveHeader + reqContent, 'utf-8');
  }

  // Archive audit file if exists
  const auditFile = path.join(cwd, '.planning', `${version}-MILESTONE-AUDIT.md`);
  if (fs.existsSync(auditFile)) {
    fs.renameSync(auditFile, path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`));
  }

  // Create/append MILESTONES.md entry
  const accomplishmentsList = accomplishments.map(a => `- ${a}`).join('\n');
  const milestoneEntry = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Objectives completed:** ${objectiveCount} objectives, ${totalJobs} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (fs.existsSync(milestonesPath)) {
    const existing = fs.readFileSync(milestonesPath, 'utf-8');
    fs.writeFileSync(milestonesPath, existing + '\n' + milestoneEntry, 'utf-8');
  } else {
    fs.writeFileSync(milestonesPath, `# Milestones\n\n${milestoneEntry}`, 'utf-8');
  }

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent = fs.readFileSync(statePath, 'utf-8');
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${version} milestone complete`
    );
    stateContent = stateContent.replace(
      /(\*\*Last Activity:\*\*\s*).*/,
      `$1${today}`
    );
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1${version} milestone completed and archived`
    );
    fs.writeFileSync(statePath, stateContent, 'utf-8');
  }

  // Archive objective directories if requested
  let phasesArchived = false;
  if (options.archiveObjectives) {
    try {
      const phaseArchiveDir = path.join(archiveDir, `${version}-objectives`);
      fs.mkdirSync(phaseArchiveDir, { recursive: true });

      const phaseEntries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const objectiveDirNames = phaseEntries.filter(e => e.isDirectory()).map(e => e.name);
      for (const dir of objectiveDirNames) {
        fs.renameSync(path.join(objectivesDir, dir), path.join(phaseArchiveDir, dir));
      }
      phasesArchived = objectiveDirNames.length > 0;
    } catch {}
  }

  const result = {
    version,
    name: milestoneName,
    date: today,
    objectives: objectiveCount,
    plans: totalJobs,
    tasks: totalTasks,
    accomplishments,
    archived: {
      roadmap: fs.existsSync(path.join(archiveDir, `${version}-ROADMAP.md`)),
      requirements: fs.existsSync(path.join(archiveDir, `${version}-REQUIREMENTS.md`)),
      audit: fs.existsSync(path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)),
      objectives: phasesArchived,
    },
    milestones_updated: true,
    state_updated: fs.existsSync(statePath),
  };

  output(result, raw);
}

// ─── Validate Consistency ─────────────────────────────────────────────────────

function cmdValidateConsistency(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const errors = [];
  const warnings = [];

  // Check for ROADMAP
  if (!fs.existsSync(roadmapPath)) {
    errors.push('ROADMAP.md not found');
    output({ passed: false, errors, warnings }, raw, 'failed');
    return;
  }

  const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

  // Extract objectives from ROADMAP
  const roadmapObjectives = new Set();
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m;
  while ((m = objectivePattern.exec(roadmapContent)) !== null) {
    roadmapObjectives.add(m[1]);
  }

  // Get objectives on disk
  const diskObjectives = new Set();
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)/);
      if (dm) diskObjectives.add(dm[1]);
    }
  } catch {}

  // Check: objectives in ROADMAP but not on disk
  for (const p of roadmapObjectives) {
    if (!diskObjectives.has(p) && !diskObjectives.has(normalizeObjectiveName(p))) {
      warnings.push(`Objective ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: objectives on disk but not in ROADMAP
  for (const p of diskObjectives) {
    const unpadded = String(parseInt(p, 10));
    if (!roadmapObjectives.has(p) && !roadmapObjectives.has(unpadded)) {
      warnings.push(`Objective ${p} exists on disk but not in ROADMAP.md`);
    }
  }

  // Check: sequential objective numbers (integers only)
  const integerObjectives = [...diskObjectives]
    .filter(p => !p.includes('.'))
    .map(p => parseInt(p, 10))
    .sort((a, b) => a - b);

  for (let i = 1; i < integerObjectives.length; i++) {
    if (integerObjectives[i] !== integerObjectives[i - 1] + 1) {
      warnings.push(`Gap in objective numbering: ${integerObjectives[i - 1]} → ${integerObjectives[i]}`);
    }
  }

  // Check: job numbering within objectives
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md')).sort();

      // Extract job numbers
      const jobNums = plans.map(p => {
        const pm = p.match(/-(\d{2})-JOB\.md$/);
        return pm ? parseInt(pm[1], 10) : null;
      }).filter(n => n !== null);

      for (let i = 1; i < jobNums.length; i++) {
        if (jobNums[i] !== jobNums[i - 1] + 1) {
          warnings.push(`Gap in job numbering in ${dir}: job ${jobNums[i - 1]} → ${jobNums[i]}`);
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md'));
      const jobIds = new Set(plans.map(p => p.replace('-JOB.md', '')));
      const summaryIds = new Set(summaries.map(s => s.replace('-SUMMARY.md', '')));

      // Summary without matching job is suspicious
      for (const sid of summaryIds) {
        if (!jobIds.has(sid)) {
          warnings.push(`Summary ${sid}-SUMMARY.md in ${dir} has no matching JOB.md`);
        }
      }
    }
  } catch {}

  // Check: frontmatter in plans has required fields
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const dir of dirs) {
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md'));

      for (const jobFile of plans) {
        const content = fs.readFileSync(path.join(objectivesDir, dir, jobFile), 'utf-8');
        const fm = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${job}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {}

  const passed = errors.length === 0;
  output({ passed, errors, warnings, warning_count: warnings.length }, raw, passed ? 'passed' : 'failed');
}

// ─── Validate Health ──────────────────────────────────────────────────────────

function cmdValidateHealth(cwd, options, raw) {
  const planningDir = path.join(cwd, '.planning');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const statePath = path.join(planningDir, 'STATE.md');
  const configPath = path.join(planningDir, 'config.json');
  const objectivesDir = path.join(planningDir, 'objectives');

  const errors = [];
  const warnings = [];
  const info = [];
  const repairs = [];

  // Helper to add issue
  const addIssue = (severity, code, message, fix, repairable = false) => {
    const issue = { code, message, fix, repairable };
    if (severity === 'error') errors.push(issue);
    else if (severity === 'warning') warnings.push(issue);
    else info.push(issue);
  };

  // ─── Check 1: .planning/ exists ───────────────────────────────────────────
  if (!fs.existsSync(planningDir)) {
    addIssue('error', 'E001', '.planning/ directory not found', 'Run /df:new-project to initialize');
    output({
      status: 'broken',
      errors,
      warnings,
      info,
      repairable_count: 0,
    }, raw);
    return;
  }

  // ─── Check 2: PROJECT.md exists and has required sections ─────────────────
  if (!fs.existsSync(projectPath)) {
    addIssue('error', 'E002', 'PROJECT.md not found', 'Run /df:new-project to create');
  } else {
    const content = fs.readFileSync(projectPath, 'utf-8');
    const requiredSections = ['## What This Is', '## Core Value', '## Requirements'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        addIssue('warning', 'W001', `PROJECT.md missing section: ${section}`, 'Add section manually');
      }
    }
  }

  // ─── Check 3: ROADMAP.md exists ───────────────────────────────────────────
  if (!fs.existsSync(roadmapPath)) {
    addIssue('error', 'E003', 'ROADMAP.md not found', 'Run /df:new-milestone to create roadmap');
  }

  // ─── Check 4: STATE.md exists and references valid objectives ─────────────────
  if (!fs.existsSync(statePath)) {
    addIssue('error', 'E004', 'STATE.md not found', 'Run /df:health --repair to regenerate', true);
    repairs.push('regenerateState');
  } else {
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    // Extract objective references from STATE.md
    const phaseRefs = [...stateContent.matchAll(/[Pp]hase\s+(\d+(?:\.\d+)?)/g)].map(m => m[1]);
    // Get disk objectives
    const diskObjectives = new Set();
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const m = e.name.match(/^(\d+(?:\.\d+)?)/);
          if (m) diskObjectives.add(m[1]);
        }
      }
    } catch {}
    // Check for invalid references
    for (const ref of phaseRefs) {
      const normalizedRef = String(parseInt(ref, 10)).padStart(2, '0');
      if (!diskObjectives.has(ref) && !diskObjectives.has(normalizedRef) && !diskObjectives.has(String(parseInt(ref, 10)))) {
        // Only warn if objectives dir has any content (not just an empty project)
        if (diskObjectives.size > 0) {
          addIssue('warning', 'W002', `STATE.md references objective ${ref}, but only objectives ${[...diskObjectives].sort().join(', ')} exist`, 'Run /df:health --repair to regenerate STATE.md', true);
          if (!repairs.includes('regenerateState')) repairs.push('regenerateState');
        }
      }
    }
  }

  // ─── Check 5: config.json valid JSON + valid schema ───────────────────────
  if (!fs.existsSync(configPath)) {
    addIssue('warning', 'W003', 'config.json not found', 'Run /df:health --repair to create with defaults', true);
    repairs.push('createConfig');
  } else {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Validate known fields
      const validProfiles = ['quality', 'balanced', 'budget'];
      if (parsed.model_profile && !validProfiles.includes(parsed.model_profile)) {
        addIssue('warning', 'W004', `config.json: invalid model_profile "${parsed.model_profile}"`, `Valid values: ${validProfiles.join(', ')}`);
      }
    } catch (err) {
      addIssue('error', 'E005', `config.json: JSON parse error - ${err.message}`, 'Run /df:health --repair to reset to defaults', true);
      repairs.push('resetConfig');
    }
  }

  // ─── Check 6: Objective directory naming (NN-name format) ─────────────────────
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.name.match(/^\d{2}(?:\.\d+)?-[\w-]+$/)) {
        addIssue('warning', 'W005', `Objective directory "${e.name}" doesn't follow NN-name format`, 'Rename to match pattern (e.g., 01-setup)');
      }
    }
  } catch {}

  // ─── Check 7: Orphaned jobs (JOB without SUMMARY) ─────────────────────────
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, e.name));
      const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const summaryBases = new Set(summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', '')));

      for (const jobFile of plans) {
        const jobBase = jobFile.replace('-JOB.md', '').replace('JOB.md', '');
        if (!summaryBases.has(jobBase)) {
          addIssue('info', 'I001', `${e.name}/${job} has no SUMMARY.md`, 'May be in progress');
        }
      }
    }
  } catch {}

  // ─── Check 8: Run existing consistency checks ─────────────────────────────
  // Inline subset of cmdValidateConsistency
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    const roadmapObjectives = new Set();
    const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:/gi;
    let m;
    while ((m = objectivePattern.exec(roadmapContent)) !== null) {
      roadmapObjectives.add(m[1]);
    }

    const diskObjectives = new Set();
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const dm = e.name.match(/^(\d+(?:\.\d+)?)/);
          if (dm) diskObjectives.add(dm[1]);
        }
      }
    } catch {}

    // Objectives in ROADMAP but not on disk
    for (const p of roadmapObjectives) {
      const padded = String(parseInt(p, 10)).padStart(2, '0');
      if (!diskObjectives.has(p) && !diskObjectives.has(padded)) {
        addIssue('warning', 'W006', `Objective ${p} in ROADMAP.md but no directory on disk`, 'Create objective directory or remove from roadmap');
      }
    }

    // Objectives on disk but not in ROADMAP
    for (const p of diskObjectives) {
      const unpadded = String(parseInt(p, 10));
      if (!roadmapObjectives.has(p) && !roadmapObjectives.has(unpadded)) {
        addIssue('warning', 'W007', `Objective ${p} exists on disk but not in ROADMAP.md`, 'Add to roadmap or remove directory');
      }
    }
  }

  // ─── Perform repairs if requested ─────────────────────────────────────────
  const repairActions = [];
  if (options.repair && repairs.length > 0) {
    for (const repair of repairs) {
      try {
        switch (repair) {
          case 'createConfig':
          case 'resetConfig': {
            const defaults = {
              model_profile: 'balanced',
              commit_docs: true,
              search_gitignored: false,
              branching_strategy: 'none',
              research: true,
              job_checker: true,
              verifier: true,
              parallelization: true,
            };
            fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'config.json' });
            break;
          }
          case 'regenerateState': {
            // Generate minimal STATE.md from ROADMAP.md structure
            const milestone = getMilestoneInfo(cwd);
            let stateContent = `# Session State\n\n`;
            stateContent += `## Project Reference\n\n`;
            stateContent += `See: .planning/PROJECT.md\n\n`;
            stateContent += `## Position\n\n`;
            stateContent += `**Milestone:** ${milestone.version} ${milestone.name}\n`;
            stateContent += `**Current objective:** (determining...)\n`;
            stateContent += `**Status:** Resuming\n\n`;
            stateContent += `## Session Log\n\n`;
            stateContent += `- ${new Date().toISOString().split('T')[0]}: STATE.md regenerated by /df:health --repair\n`;
            fs.writeFileSync(statePath, stateContent, 'utf-8');
            repairActions.push({ action: repair, success: true, path: 'STATE.md' });
            break;
          }
        }
      } catch (err) {
        repairActions.push({ action: repair, success: false, error: err.message });
      }
    }
  }

  // ─── Determine overall status ─────────────────────────────────────────────
  let status;
  if (errors.length > 0) {
    status = 'broken';
  } else if (warnings.length > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const repairableCount = errors.filter(e => e.repairable).length +
                         warnings.filter(w => w.repairable).length;

  output({
    status,
    errors,
    warnings,
    info,
    repairable_count: repairableCount,
    repairs_performed: repairActions.length > 0 ? repairActions : undefined,
  }, raw);
}

// ─── Progress Render ──────────────────────────────────────────────────────────

function cmdProgressRender(cwd, format, raw) {
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const milestone = getMilestoneInfo(cwd);

  const objectives = [];
  let totalJobs = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => {
      const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
      return aNum - bNum;
    });

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const objectiveNum = dm ? dm[1] : dir;
      const objectiveName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
      const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').length;
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;

      totalJobs += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      objectives.push({ number: objectiveNum, name: objectiveName, plans, summaries, status });
    }
  } catch {}

  const percent = totalJobs > 0 ? Math.round((totalSummaries / totalJobs) * 100) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalJobs} plans (${percent}%)\n\n`;
    out += `| Objective | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of objectives) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalJobs} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalJobs }, raw, text);
  } else {
    // JSON format
    output({
      milestone_version: milestone.version,
      milestone_name: milestone.name,
      objectives,
      total_jobs: totalJobs,
      total_summaries: totalSummaries,
      percent,
    }, raw);
  }
}

// ─── Todo Complete ────────────────────────────────────────────────────────────

function cmdTodoComplete(cwd, filename, raw) {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

function cmdScaffold(cwd, type, options, raw) {
  const { objective, name } = options;
  const padded = objective ? normalizeObjectiveName(objective) : '00';
  const today = new Date().toISOString().split('T')[0];

  // Find objective directory
  const objectiveInfo = objective ? findObjectiveInternal(cwd, objective) : null;
  const objectiveDir = objectiveInfo ? path.join(cwd, objectiveInfo.directory) : null;

  if (objective && !objectiveDir && type !== 'objective-dir') {
    error(`Objective ${objective} directory not found`);
  }

  let filePath, content;

  switch (type) {
    case 'context': {
      filePath = path.join(objectiveDir, `${padded}-CONTEXT.md`);
      content = `---\nobjective: "${padded}"\nname: "${name || objectiveInfo?.objective_name || 'Unnamed'}"\ncreated: ${today}\n---\n\n# Objective ${objective}: ${name || objectiveInfo?.objective_name || 'Unnamed'} — Context\n\n## Decisions\n\n_Decisions will be captured during /df:discuss-objective ${objective}_\n\n## Discretion Areas\n\n_Areas where the executor can use judgment_\n\n## Deferred Ideas\n\n_Ideas to consider later_\n`;
      break;
    }
    case 'uat': {
      filePath = path.join(objectiveDir, `${padded}-UAT.md`);
      content = `---\nobjective: "${padded}"\nname: "${name || objectiveInfo?.objective_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Objective ${objective}: ${name || objectiveInfo?.objective_name || 'Unnamed'} — User Acceptance Testing\n\n## Test Results\n\n| # | Test | Status | Notes |\n|---|------|--------|-------|\n\n## Summary\n\n_Pending UAT_\n`;
      break;
    }
    case 'verification': {
      filePath = path.join(objectiveDir, `${padded}-VERIFICATION.md`);
      content = `---\nobjective: "${padded}"\nname: "${name || objectiveInfo?.objective_name || 'Unnamed'}"\ncreated: ${today}\nstatus: pending\n---\n\n# Objective ${objective}: ${name || objectiveInfo?.objective_name || 'Unnamed'} — Verification\n\n## Goal-Backward Verification\n\n**Objective Goal:** [From ROADMAP.md]\n\n## Checks\n\n| # | Requirement | Status | Evidence |\n|---|------------|--------|----------|\n\n## Result\n\n_Pending verification_\n`;
      break;
    }
    case 'objective-dir': {
      if (!objective || !name) {
        error('objective and name required for objective-dir scaffold');
      }
      const slug = generateSlugInternal(name);
      const dirName = `${padded}-${slug}`;
      const phasesParent = path.join(cwd, '.planning', 'objectives');
      fs.mkdirSync(phasesParent, { recursive: true });
      const dirPath = path.join(phasesParent, dirName);
      fs.mkdirSync(dirPath, { recursive: true });
      output({ created: true, directory: `.planning/objectives/${dirName}`, path: dirPath }, raw, dirPath);
      return;
    }
    default:
      error(`Unknown scaffold type: ${type}. Available: context, uat, verification, objective-dir`);
  }

  if (fs.existsSync(filePath)) {
    output({ created: false, reason: 'already_exists', path: filePath }, raw, 'exists');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  const relPath = path.relative(cwd, filePath);
  output({ created: true, path: relPath }, raw, relPath);
}

// ─── Compound Commands ────────────────────────────────────────────────────────

function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);

  // Check per-agent override first
  const override = config.model_overrides?.[agentType];
  if (override) {
    return override === 'opus' ? 'inherit' : override;
  }

  // Fall back to profile lookup
  const profile = config.model_profile || 'balanced';
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) return 'sonnet';
  const resolved = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  return resolved === 'opus' ? 'inherit' : resolved;
}

function getArchivedObjectiveDirs(cwd) {
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  const results = [];

  if (!fs.existsSync(milestonesDir)) return results;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    // Find v*-objectives directories, sort newest first
    const objectiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-objectives$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of objectiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-objectives$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const entries = fs.readdirSync(archivePath, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

      for (const dir of dirs) {
        results.push({
          name: dir,
          milestone: version,
          basePath: path.join('.planning', 'milestones', archiveName),
          fullPath: path.join(archivePath, dir),
        });
      }
    }
  } catch {}

  return results;
}

function searchObjectiveInDir(baseDir, relBase, normalized) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    const match = dirs.find(d => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const objectiveNumber = dirMatch ? dirMatch[1] : normalized;
    const objectiveName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const objectiveDir = path.join(baseDir, match);
    const objectiveFiles = fs.readdirSync(objectiveDir);

    const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').sort();
    const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
    const hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = objectiveFiles.some(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = objectiveFiles.some(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');

    const completedJobIds = new Set(
      summaries.map(s => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompleteJobs = plans.filter(p => {
      const jobId = p.replace('-JOB.md', '').replace('JOB.md', '');
      return !completedJobIds.has(jobId);
    });

    return {
      found: true,
      directory: path.join(relBase, match),
      objective_number: objectiveNumber,
      objective_name: objectiveName,
      objective_slug: objectiveName ? objectiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
      plans,
      summaries,
      incomplete_jobs: incompleteJobs,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
    };
  } catch {
    return null;
  }
}

function findObjectiveInternal(cwd, objective) {
  if (!objective) return null;

  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const normalized = normalizeObjectiveName(objective);

  // Search current objectives first
  const current = searchObjectiveInDir(objectivesDir, path.join('.planning', 'objectives'), normalized);
  if (current) return current;

  // Search archived milestone objectives (newest first)
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesDir)) return null;

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    const archiveDirs = milestoneEntries
      .filter(e => e.isDirectory() && /^v[\d.]+-objectives$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    for (const archiveName of archiveDirs) {
      const version = archiveName.match(/^(v[\d.]+)-objectives$/)[1];
      const archivePath = path.join(milestonesDir, archiveName);
      const relBase = path.join('.planning', 'milestones', archiveName);
      const result = searchObjectiveInDir(archivePath, relBase, normalized);
      if (result) {
        result.archived = version;
        return result;
      }
    }
  } catch {}

  return null;
}

function getRoadmapObjectiveInternal(cwd, objectiveNum) {
  if (!objectiveNum) return null;
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const escapedObjective = objectiveNum.toString().replace(/\./g, '\\.');
    const objectivePattern = new RegExp(`#{2,4}\\s*Objective\\s+${escapedObjective}:\\s*([^\\n]+)`, 'i');
    const headerMatch = content.match(objectivePattern);
    if (!headerMatch) return null;

    const objectiveName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;
    const restOfContent = content.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : content.length;
    const section = content.slice(headerIndex, sectionEnd).trim();

    const goalMatch = section.match(/\*\*Goal:\*\*\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    return {
      found: true,
      objective_number: objectiveNum.toString(),
      objective_name: objectiveName,
      goal,
      section,
    };
  } catch {
    return null;
  }
}

function pathExistsInternal(cwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function generateSlugInternal(text) {
  if (!text) return null;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getMilestoneInfo(cwd) {
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    const versionMatch = roadmap.match(/v(\d+\.\d+)/);
    const nameMatch = roadmap.match(/## .*v\d+\.\d+[:\s]+([^\n(]+)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: nameMatch ? nameMatch[1].trim() : 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}

function cmdInitExecuteObjective(cwd, objective, includes, raw) {
  if (!objective) {
    error('objective required for init execute-objective');
  }

  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    // Models
    executor_model: resolveModelInternal(cwd, 'df-executor'),
    verifier_model: resolveModelInternal(cwd, 'df-verifier'),

    // Config flags
    commit_docs: config.commit_docs,
    parallelization: config.parallelization,
    branching_strategy: config.branching_strategy,
    objective_branch_template: config.objective_branch_template,
    milestone_branch_template: config.milestone_branch_template,
    verifier_enabled: config.verifier,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,
    objective_slug: objectiveInfo?.objective_slug || null,

    // Plan inventory
    plans: objectiveInfo?.plans || [],
    summaries: objectiveInfo?.summaries || [],
    incomplete_jobs: objectiveInfo?.incomplete_jobs || [],
    job_count: objectiveInfo?.plans?.length || 0,
    incomplete_count: objectiveInfo?.incomplete_jobs?.length || 0,

    // Branch name (pre-computed)
    branch_name: config.branching_strategy === 'objective' && objectiveInfo
      ? config.objective_branch_template
          .replace('{objective}', objectiveInfo.objective_number)
          .replace('{slug}', objectiveInfo.objective_slug || 'objective')
      : config.branching_strategy === 'milestone'
        ? config.milestone_branch_template
            .replace('{milestone}', milestone.version)
            .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone')
        : null,

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // File existence
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    config_exists: pathExistsInternal(cwd, '.planning/config.json'),
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }

  output(result, raw);
}

function cmdInitPlanObjective(cwd, objective, includes, raw) {
  if (!objective) {
    error('objective required for init plan-objective');
  }

  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);

  const result = {
    // Models
    researcher_model: resolveModelInternal(cwd, 'df-objective-researcher'),
    planner_model: resolveModelInternal(cwd, 'df-planner'),
    checker_model: resolveModelInternal(cwd, 'df-job-checker'),

    // Workflow flags
    research_enabled: config.research,
    job_checker_enabled: config.job_checker,
    commit_docs: config.commit_docs,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,
    objective_slug: objectiveInfo?.objective_slug || null,
    padded_objective: objectiveInfo?.objective_number?.padStart(2, '0') || null,

    // Existing artifacts
    has_research: objectiveInfo?.has_research || false,
    has_context: objectiveInfo?.has_context || false,
    has_plans: (objectiveInfo?.plans?.length || 0) > 0,
    job_count: objectiveInfo?.plans?.length || 0,

    // Environment
    planning_exists: pathExistsInternal(cwd, '.planning'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('requirements')) {
    result.requirements_content = safeReadFile(path.join(cwd, '.planning', 'REQUIREMENTS.md'));
  }
  if (includes.has('context') && objectiveInfo?.directory) {
    // Find *-CONTEXT.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const contextFile = files.find(f => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_content = safeReadFile(path.join(objectiveDirFull, contextFile));
      }
    } catch {}
  }
  if (includes.has('research') && objectiveInfo?.directory) {
    // Find *-RESEARCH.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const researchFile = files.find(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) {
        result.research_content = safeReadFile(path.join(objectiveDirFull, researchFile));
      }
    } catch {}
  }
  if (includes.has('verification') && objectiveInfo?.directory) {
    // Find *-VERIFICATION.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const verificationFile = files.find(f => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
      if (verificationFile) {
        result.verification_content = safeReadFile(path.join(objectiveDirFull, verificationFile));
      }
    } catch {}
  }
  if (includes.has('uat') && objectiveInfo?.directory) {
    // Find *-UAT.md in objective directory
    const objectiveDirFull = path.join(cwd, objectiveInfo.directory);
    try {
      const files = fs.readdirSync(objectiveDirFull);
      const uatFile = files.find(f => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) {
        result.uat_content = safeReadFile(path.join(objectiveDirFull, uatFile));
      }
    } catch {}
  }

  output(result, raw);
}

function cmdInitNewProject(cwd, raw) {
  const config = loadConfig(cwd);

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.devflow', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Detect existing code
  let hasCode = false;
  let hasPackageFile = false;
  try {
    const files = execSync('find . -maxdepth 3 \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.swift" -o -name "*.java" \\) 2>/dev/null | grep -v node_modules | grep -v .git | head -5', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    hasCode = files.trim().length > 0;
  } catch {}

  hasPackageFile = pathExistsInternal(cwd, 'package.json') ||
                   pathExistsInternal(cwd, 'requirements.txt') ||
                   pathExistsInternal(cwd, 'Cargo.toml') ||
                   pathExistsInternal(cwd, 'go.mod') ||
                   pathExistsInternal(cwd, 'Package.swift');

  const result = {
    // Models
    researcher_model: resolveModelInternal(cwd, 'df-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'df-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'df-roadmapper'),

    // Config
    commit_docs: config.commit_docs,

    // Existing state
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    has_codebase_map: pathExistsInternal(cwd, '.planning/codebase'),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Brownfield detection
    has_existing_code: hasCode,
    has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map: (hasCode || hasPackageFile) && !pathExistsInternal(cwd, '.planning/codebase'),

    // Git state
    has_git: pathExistsInternal(cwd, '.git'),

    // Enhanced search
    brave_search_available: hasBraveSearch,
  };

  output(result, raw);
}

function cmdInitNewMilestone(cwd, raw) {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    // Models
    researcher_model: resolveModelInternal(cwd, 'df-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'df-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'df-roadmapper'),

    // Config
    commit_docs: config.commit_docs,
    research_enabled: config.research,

    // Current milestone
    current_milestone: milestone.version,
    current_milestone_name: milestone.name,

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
  };

  output(result, raw);
}

function cmdInitQuick(cwd, description, raw) {
  const config = loadConfig(cwd);
  const now = new Date();
  const slug = description ? generateSlugInternal(description)?.substring(0, 40) : null;

  // Find next quick task number
  const quickDir = path.join(cwd, '.planning', 'quick');
  let nextNum = 1;
  try {
    const existing = fs.readdirSync(quickDir)
      .filter(f => /^\d+-/.test(f))
      .map(f => parseInt(f.split('-')[0], 10))
      .filter(n => !isNaN(n));
    if (existing.length > 0) {
      nextNum = Math.max(...existing) + 1;
    }
  } catch {}

  const result = {
    // Models
    planner_model: resolveModelInternal(cwd, 'df-planner'),
    executor_model: resolveModelInternal(cwd, 'df-executor'),
    checker_model: resolveModelInternal(cwd, 'df-job-checker'),
    verifier_model: resolveModelInternal(cwd, 'df-verifier'),

    // Config
    commit_docs: config.commit_docs,

    // Quick task info
    next_num: nextNum,
    slug: slug,
    description: description || null,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Paths
    quick_dir: '.planning/quick',
    task_dir: slug ? `.planning/quick/${nextNum}-${slug}` : null,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),
  };

  output(result, raw);
}

function cmdInitResume(cwd, raw) {
  const config = loadConfig(cwd);

  // Check for interrupted agent
  let interruptedAgentId = null;
  try {
    interruptedAgentId = fs.readFileSync(path.join(cwd, '.planning', 'current-agent-id.txt'), 'utf-8').trim();
  } catch {}

  const result = {
    // File existence
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Agent state
    has_interrupted_agent: !!interruptedAgentId,
    interrupted_agent_id: interruptedAgentId,

    // Config
    commit_docs: config.commit_docs,
  };

  output(result, raw);
}

function cmdInitVerifyWork(cwd, objective, raw) {
  if (!objective) {
    error('objective required for init verify-work');
  }

  const config = loadConfig(cwd);
  const objectiveInfo = findObjectiveInternal(cwd, objective);

  const result = {
    // Models
    planner_model: resolveModelInternal(cwd, 'df-planner'),
    checker_model: resolveModelInternal(cwd, 'df-job-checker'),

    // Config
    commit_docs: config.commit_docs,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,

    // Existing artifacts
    has_verification: objectiveInfo?.has_verification || false,
  };

  output(result, raw);
}

function cmdInitObjectiveOp(cwd, objective, raw) {
  const config = loadConfig(cwd);
  let objectiveInfo = findObjectiveInternal(cwd, objective);

  // Fallback to ROADMAP.md if no directory exists (e.g., \*\*Jobs:\*\* TBD)
  if (!objectiveInfo) {
    const roadmapObjective = getRoadmapObjectiveInternal(cwd, objective);
    if (roadmapObjective?.found) {
      const objectiveName = roadmapObjective.objective_name;
      objectiveInfo = {
        found: true,
        directory: null,
        objective_number: roadmapObjective.objective_number,
        objective_name: objectiveName,
        objective_slug: objectiveName ? objectiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null,
        plans: [],
        summaries: [],
        incomplete_jobs: [],
        has_research: false,
        has_context: false,
        has_verification: false,
      };
    }
  }

  const result = {
    // Config
    commit_docs: config.commit_docs,
    brave_search: config.brave_search,

    // Objective info
    objective_found: !!objectiveInfo,
    objective_dir: objectiveInfo?.directory || null,
    objective_number: objectiveInfo?.objective_number || null,
    objective_name: objectiveInfo?.objective_name || null,
    objective_slug: objectiveInfo?.objective_slug || null,
    padded_objective: objectiveInfo?.objective_number?.padStart(2, '0') || null,

    // Existing artifacts
    has_research: objectiveInfo?.has_research || false,
    has_context: objectiveInfo?.has_context || false,
    has_plans: (objectiveInfo?.plans?.length || 0) > 0,
    has_verification: objectiveInfo?.has_verification || false,
    job_count: objectiveInfo?.plans?.length || 0,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),
  };

  output(result, raw);
}

function cmdInitTodos(cwd, area, raw) {
  const config = loadConfig(cwd);
  const now = new Date();

  // List todos (reuse existing logic)
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = {
    // Config
    commit_docs: config.commit_docs,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Todo inventory
    todo_count: count,
    todos,
    area_filter: area || null,

    // Paths
    pending_dir: '.planning/todos/pending',
    completed_dir: '.planning/todos/completed',

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    todos_dir_exists: pathExistsInternal(cwd, '.planning/todos'),
    pending_dir_exists: pathExistsInternal(cwd, '.planning/todos/pending'),
  };

  output(result, raw);
}

function cmdInitMilestoneOp(cwd, raw) {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Count objectives
  let objectiveCount = 0;
  let completedPhases = 0;
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    objectiveCount = dirs.length;

    // Count objectives with summaries (completed)
    for (const dir of dirs) {
      try {
        const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dir));
        const hasSummary = objectiveFiles.some(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        if (hasSummary) completedPhases++;
      } catch {}
    }
  } catch {}

  // Check archive
  const archiveDir = path.join(cwd, '.planning', 'archive');
  let archivedMilestones = [];
  try {
    archivedMilestones = fs.readdirSync(archiveDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {}

  const result = {
    // Config
    commit_docs: config.commit_docs,

    // Current milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // Objective counts
    objective_count: objectiveCount,
    completed_objectives: completedPhases,
    all_phases_complete: objectiveCount > 0 && objectiveCount === completedPhases,

    // Archive
    archived_milestones: archivedMilestones,
    archive_count: archivedMilestones.length,

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    archive_exists: pathExistsInternal(cwd, '.planning/archive'),
    objectives_dir_exists: pathExistsInternal(cwd, '.planning/objectives'),
  };

  output(result, raw);
}

function cmdInitMapCodebase(cwd, raw) {
  const config = loadConfig(cwd);

  // Check for existing codebase maps
  const codebaseDir = path.join(cwd, '.planning', 'codebase');
  let existingMaps = [];
  try {
    existingMaps = fs.readdirSync(codebaseDir).filter(f => f.endsWith('.md'));
  } catch {}

  const result = {
    // Models
    mapper_model: resolveModelInternal(cwd, 'df-codebase-mapper'),

    // Config
    commit_docs: config.commit_docs,
    search_gitignored: config.search_gitignored,
    parallelization: config.parallelization,

    // Paths
    codebase_dir: '.planning/codebase',

    // Existing maps
    existing_maps: existingMaps,
    has_maps: existingMaps.length > 0,

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    codebase_dir_exists: pathExistsInternal(cwd, '.planning/codebase'),
  };

  output(result, raw);
}

function cmdInitProgress(cwd, includes, raw) {
  const config = loadConfig(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Analyze objectives
  const objectivesDir = path.join(cwd, '.planning', 'objectives');
  const objectives = [];
  let currentObjective = null;
  let nextObjective = null;

  try {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();

    for (const dir of dirs) {
      const match = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const objectiveNumber = match ? match[1] : dir;
      const objectiveName = match && match[2] ? match[2] : null;

      const objectivePath = path.join(objectivesDir, dir);
      const objectiveFiles = fs.readdirSync(objectivePath);

      const plans = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md');
      const summaries = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const hasResearch = objectiveFiles.some(f => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

      const status = summaries.length >= plans.length && plans.length > 0 ? 'complete' :
                     plans.length > 0 ? 'in_progress' :
                     hasResearch ? 'researched' : 'pending';

      const objectiveInfo = {
        number: objectiveNumber,
        name: objectiveName,
        directory: path.join('.planning', 'objectives', dir),
        status,
        job_count: plans.length,
        summary_count: summaries.length,
        has_research: hasResearch,
      };

      objectives.push(objectiveInfo);

      // Find current (first incomplete with plans) and next (first pending)
      if (!currentObjective && (status === 'in_progress' || status === 'researched')) {
        currentObjective = objectiveInfo;
      }
      if (!nextObjective && status === 'pending') {
        nextObjective = objectiveInfo;
      }
    }
  } catch {}

  // Check for paused work
  let pausedAt = null;
  try {
    const state = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    const pauseMatch = state.match(/\*\*Paused At:\*\*\s*(.+)/);
    if (pauseMatch) pausedAt = pauseMatch[1].trim();
  } catch {}

  const result = {
    // Models
    executor_model: resolveModelInternal(cwd, 'df-executor'),
    planner_model: resolveModelInternal(cwd, 'df-planner'),

    // Config
    commit_docs: config.commit_docs,

    // Milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // Objective overview
    objectives,
    objective_count: objectives.length,
    completed_count: objectives.filter(p => p.status === 'complete').length,
    in_progress_count: objectives.filter(p => p.status === 'in_progress').length,

    // Current state
    current_objective: currentObjective,
    next_phase: nextObjective,
    paused_at: pausedAt,
    has_work_in_progress: !!currentObjective,

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('project')) {
    result.project_content = safeReadFile(path.join(cwd, '.planning', 'PROJECT.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }

  output(result, raw);
}

// ─── Workstreams ──────────────────────────────────────────────────────────────

function cmdWorkstreamsAnalyze(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    error('ROADMAP.md not found');
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');

  // Parse all objectives with their dependencies
  const objectivePattern = /#{2,4}\s*Objective\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const objectives = [];
  let match;

  while ((match = objectivePattern.exec(content)) !== null) {
    const objectiveNum = match[1];
    const objectiveName = match[2].replace(/\(INSERTED\)/i, '').trim();

    const sectionStart = match.index;
    const restOfContent = content.slice(sectionStart);
    const nextHeader = restOfContent.match(/\n#{2,4}\s+Objective\s+\d/i);
    const sectionEnd = nextHeader ? sectionStart + nextHeader.index : content.length;
    const section = content.slice(sectionStart, sectionEnd);

    // Match both **Depends on:** and **Depends on**:
    const dependsMatch = section.match(/\*\*Depends on(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const dependsRaw = dependsMatch ? dependsMatch[1].trim() : '';
    // Match both **Goal:** and **Goal**:
    const goalMatch = section.match(/\*\*Goal(?::\*\*|\*\*:)\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : '';

    // Parse depends_on into list of objective numbers
    const depPhases = [];
    if (dependsRaw && !/nothing|none|n\/a/i.test(dependsRaw)) {
      const depMatches = dependsRaw.match(/Objective\s+(\d+(?:\.\d+)?)/gi) || [];
      for (const dm of depMatches) {
        const numMatch = dm.match(/(\d+(?:\.\d+)?)/);
        if (numMatch) depPhases.push(numMatch[1]);
      }
    }

    // Check completion status from ROADMAP checkbox
    const checkboxPattern = new RegExp(`-\\s*\\[(x| )\\]\\s*.*Objective\\s+${objectiveNum.replace('.', '\\.')}`, 'i');
    const checkboxMatch = content.match(checkboxPattern);
    const isComplete = checkboxMatch ? checkboxMatch[1] === 'x' : false;

    // Check disk status
    const objectivesDir = path.join(cwd, '.planning', 'objectives');
    const normalized = normalizeObjectiveName(objectiveNum);
    let diskComplete = false;
    try {
      const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
      const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dirMatch));
        const jobCount = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').length;
        const summaryCount = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
        diskComplete = summaryCount >= jobCount && jobCount > 0;
      }
    } catch {}

    objectives.push({
      number: objectiveNum,
      name: objectiveName,
      goal,
      depends_on: depPhases,
      complete: isComplete || diskComplete,
    });
  }

  // Build adjacency list and find workstream candidates
  // An objective is eligible for a workstream if all its dependencies are complete
  const completedSet = new Set(objectives.filter(p => p.complete).map(p => p.number));

  // Find objectives whose deps are all complete but are themselves not complete
  const eligible = objectives.filter(p =>
    !p.complete && p.depends_on.every(d => completedSet.has(d))
  );

  // Group independent eligible objectives (objectives that don't depend on each other)
  // Two eligible objectives are independent if neither appears in the other's dependency chain
  const eligibleNums = new Set(eligible.map(p => p.number));

  const workstreamGroups = eligible.map(p => {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      id: `ws-${slug}`,
      name: p.name,
      objectives: [p.number],
      depends_on_completed: p.depends_on,
      goal: p.goal,
    };
  });

  // Find join points: incomplete objectives that depend on multiple incomplete objectives
  const joinPhases = objectives
    .filter(p => !p.complete && p.depends_on.some(d => eligibleNums.has(d)))
    .filter(p => !eligibleNums.has(p.number))
    .map(p => ({
      objective: p.number,
      name: p.name,
      waits_for: p.depends_on.filter(d => !completedSet.has(d)),
    }));

  const parallelismPossible = workstreamGroups.length >= 2;

  output({
    workstream_groups: workstreamGroups,
    join_phases: joinPhases,
    parallelism_possible: parallelismPossible,
    max_concurrent: workstreamGroups.length,
    completed_objectives: [...completedSet],
    total_objectives: objectives.length,
  }, raw);
}

function cmdWorkstreamsProvision(cwd, wsId, worktreePath, raw) {
  if (!wsId || !worktreePath) {
    error('Usage: workstreams provision <ws-id> <worktree-path>');
  }

  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) {
    error('.planning/ directory not found');
  }

  // Read workstreams.json to get this workstream's details
  const wsJsonPath = path.join(planningDir, 'workstreams.json');
  if (!fs.existsSync(wsJsonPath)) {
    error('.planning/workstreams.json not found. Run workstreams setup first.');
  }

  const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf-8'));
  const ws = wsData.workstreams.find(w => w.id === wsId);
  if (!ws) {
    error(`Workstream "${wsId}" not found in workstreams.json`);
  }

  const targetPlanning = path.join(worktreePath, '.planning');
  fs.mkdirSync(targetPlanning, { recursive: true });

  // Copy shared files
  const sharedFiles = ['PROJECT.md', 'REQUIREMENTS.md', 'ROADMAP.md', 'config.json'];
  for (const file of sharedFiles) {
    const src = path.join(planningDir, file);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(targetPlanning, file));
    }
  }

  // Copy shared directories
  const sharedDirs = ['research', 'codebase'];
  for (const dir of sharedDirs) {
    const src = path.join(planningDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(targetPlanning, dir), { recursive: true });
    }
  }

  // Copy only this workstream's objective directories
  const objectivesDir = path.join(planningDir, 'objectives');
  const targetObjectivesDir = path.join(targetPlanning, 'objectives');
  fs.mkdirSync(targetObjectivesDir, { recursive: true });

  if (fs.existsSync(objectivesDir)) {
    const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
    const objectiveDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    for (const objectiveNum of ws.objectives) {
      const normalized = normalizeObjectiveName(String(objectiveNum));
      const dirMatch = objectiveDirs.find(d => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        fs.cpSync(
          path.join(objectivesDir, dirMatch),
          path.join(targetObjectivesDir, dirMatch),
          { recursive: true }
        );
      } else {
        // Create empty directory for the objective
        const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        fs.mkdirSync(path.join(targetObjectivesDir, `${normalized}-${slug}`), { recursive: true });
      }
    }

    // Also copy completed objective directories (for reference context)
    for (const dep of (ws.depends_on_completed || [])) {
      const normalized = normalizeObjectiveName(String(dep));
      const dirMatch = objectiveDirs.find(d => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        fs.cpSync(
          path.join(objectivesDir, dirMatch),
          path.join(targetObjectivesDir, dirMatch),
          { recursive: true }
        );
      }
    }
  }

  // Generate filtered STATE.md
  const statePath = path.join(planningDir, 'STATE.md');
  const stateContent = safeReadFile(statePath) || '';
  const objectiveNames = ws.objectives.map(p => `Objective ${p}`).join(', ');

  const filteredState = `# Project State

## Workstream Context

**Workstream:** ${ws.name} (${ws.id})
**Scope:** ${objectiveNames}
**Main worktree:** ${path.relative(worktreePath, cwd) || '..'}

> This is a workstream worktree. Run normal DevFlow commands here.
> When done, return to the main worktree and run \`/df:workstreams merge\`.

## Project Reference

See: .planning/PROJECT.md
**Current focus:** ${ws.name}

## Current Position

Objective: ${ws.objectives[0]} of ${ws.objectives[ws.objectives.length - 1]}
Job: Not started
Status: Ready to plan
Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

(inherited from main worktree)

### Blockers/Concerns

(none)

## Session Continuity

Last session: ${new Date().toISOString().split('T')[0]}
Stopped at: Workstream provisioned, ready to plan
Resume file: None
`;

  fs.writeFileSync(path.join(targetPlanning, 'STATE.md'), filteredState);

  // Write workstream-marker.json
  const marker = {
    id: ws.id,
    name: ws.name,
    objectives: ws.objectives,
    main_worktree: path.relative(worktreePath, cwd) || '..',
  };
  fs.writeFileSync(
    path.join(targetPlanning, 'workstream-marker.json'),
    JSON.stringify(marker, null, 2) + '\n'
  );

  output({
    success: true,
    workstream: ws.id,
    worktree_path: worktreePath,
    files_copied: sharedFiles.filter(f => fs.existsSync(path.join(planningDir, f))),
    dirs_copied: sharedDirs.filter(d => fs.existsSync(path.join(planningDir, d))),
    phases_provisioned: ws.objectives,
    marker_written: true,
  }, raw);
}

function cmdWorkstreamsReconcile(cwd, raw) {
  const planningDir = path.join(cwd, '.planning');
  const wsJsonPath = path.join(planningDir, 'workstreams.json');

  if (!fs.existsSync(wsJsonPath)) {
    error('.planning/workstreams.json not found');
  }

  const wsData = JSON.parse(fs.readFileSync(wsJsonPath, 'utf-8'));
  const objectivesDir = path.join(planningDir, 'objectives');
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  const reqsPath = path.join(planningDir, 'REQUIREMENTS.md');

  const reconciledPhases = [];
  const allDecisions = [];
  const allBlockers = [];

  // For each completed workstream, update progress from disk
  for (const ws of wsData.workstreams) {
    if (ws.status !== 'merged' && ws.status !== 'complete') continue;

    for (const objectiveNum of ws.objectives) {
      const normalized = normalizeObjectiveName(String(objectiveNum));
      try {
        const entries = fs.readdirSync(objectivesDir, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        const dirMatch = dirs.find(d => d.startsWith(normalized + '-') || d === normalized);

        if (dirMatch) {
          const objectiveFiles = fs.readdirSync(path.join(objectivesDir, dirMatch));
          const jobCount = objectiveFiles.filter(f => f.endsWith('-JOB.md') || f === 'JOB.md').length;
          const summaryCount = objectiveFiles.filter(f => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
          reconciledPhases.push({
            objective: objectiveNum,
            plans: jobCount,
            summaries: summaryCount,
            complete: summaryCount >= jobCount && jobCount > 0,
          });
        }
      } catch {}
    }

    // Collect accumulated context from workstream STATE.md if worktree still exists
    if (ws.worktree_path) {
      const wsStatePath = path.join(ws.worktree_path, '.planning', 'STATE.md');
      const wsState = safeReadFile(wsStatePath);
      if (wsState) {
        // Extract decisions
        const decisionsMatch = wsState.match(/### Decisions\n([\s\S]*?)(?=\n###|\n## |$)/);
        if (decisionsMatch) {
          const lines = decisionsMatch[1].trim().split('\n').filter(l => l.startsWith('- '));
          allDecisions.push(...lines.map(l => `[${ws.name}] ${l.slice(2)}`));
        }
        // Extract blockers
        const blockersMatch = wsState.match(/### Blockers\/Concerns\n([\s\S]*?)(?=\n###|\n## |$)/);
        if (blockersMatch) {
          const lines = blockersMatch[1].trim().split('\n').filter(l => l.startsWith('- '));
          allBlockers.push(...lines.map(l => l.slice(2)));
        }
      }
    }
  }

  // Update ROADMAP.md progress from disk for each reconciled objective
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    for (const rp of reconciledPhases) {
      if (rp.complete) {
        // Mark objective checkbox as complete
        const checkboxPattern = new RegExp(
          `(- \\[)( )(\\]\\s*\\*\\*Objective\\s+${String(rp.objective).replace('.', '\\.')})`
        );
        roadmapContent = roadmapContent.replace(checkboxPattern, '$1x$3');

        // Update progress table row
        const tablePattern = new RegExp(
          `(\\|\\s*${String(rp.objective).replace('.', '\\.')}\\.[^|]+\\|\\s*)\\d+\\/\\d+(\\s*\\|\\s*)\\w[^|]*(\\s*\\|)`,
        );
        const today = new Date().toISOString().split('T')[0];
        roadmapContent = roadmapContent.replace(
          tablePattern,
          `$1${rp.summaries}/${rp.plans}$2Complete | ${today} |`
        );
      }
    }

    fs.writeFileSync(roadmapPath, roadmapContent);
  }

  // Union REQUIREMENTS.md checkbox completions
  // (handled during git merge — checkboxes from each branch are already merged)

  // Determine next objective (join objective)
  const nextObjective = wsData.join_phases && wsData.join_phases.length > 0
    ? wsData.join_phases[0]
    : null;

  // Regenerate STATE.md for join objective
  const statePath = path.join(planningDir, 'STATE.md');
  const projectPath = path.join(planningDir, 'PROJECT.md');
  const projectContent = safeReadFile(projectPath) || '';
  const coreValueMatch = projectContent.match(/\*\*Core value:\*\*\s*([^\n]+)/i) ||
                         projectContent.match(/## What This Is\s*\n+([^\n]+)/);
  const coreValue = coreValueMatch ? coreValueMatch[1].trim() : 'See PROJECT.md';

  // Read current roadmap to find join objective name
  const roadmapContent = safeReadFile(roadmapPath) || '';
  let joinPhaseName = 'Next objective';
  if (nextObjective) {
    const joinMatch = roadmapContent.match(
      new RegExp(`#{2,4}\\s*Objective\\s+${String(nextObjective).replace('.', '\\.')}\\s*:\\s*([^\\n]+)`, 'i')
    );
    if (joinMatch) {
      joinPhaseName = joinMatch[1].replace(/\(INSERTED\)/i, '').trim();
    }
  }

  // Count total completed
  const allPhasesDone = reconciledPhases.filter(rp => rp.complete).length;
  const totalJobs = reconciledPhases.reduce((s, rp) => s + rp.plans, 0);
  const totalSummaries = reconciledPhases.reduce((s, rp) => s + rp.summaries, 0);

  const today = new Date().toISOString().split('T')[0];
  const stateContent = `# Project State

## Project Reference

See: .planning/PROJECT.md (updated ${today})
**Core value:** ${coreValue}
**Current focus:** ${joinPhaseName}

## Current Position

Objective: ${nextObjective || 'N/A'}
Job: Not started
Status: Ready to plan
Progress: [${reconciledPhases.length > 0 ? '█'.repeat(Math.min(10, allPhasesDone)) + '░'.repeat(Math.max(0, 10 - allPhasesDone)) : '░░░░░░░░░░'}] ${totalJobs > 0 ? Math.round((totalSummaries / totalJobs) * 100) : 0}%

## Performance Metrics

**Velocity:**
- Workstreams merged: ${wsData.workstreams.filter(w => w.status === 'merged' || w.status === 'complete').length}
- Objectives completed via workstreams: ${allPhasesDone}

## Accumulated Context

### Decisions

${allDecisions.length > 0 ? allDecisions.map(d => `- ${d}`).join('\n') : '(none)'}

### Blockers/Concerns

${allBlockers.length > 0 ? allBlockers.map(b => `- ${b}`).join('\n') : '(none)'}

## Session Continuity

Last session: ${today}
Stopped at: Workstreams merged, ready to plan ${nextObjective ? `Objective ${nextObjective}: ${joinPhaseName}` : 'next objective'}
Resume file: None
`;

  fs.writeFileSync(statePath, stateContent);

  // Update workstreams.json
  wsData.status = 'merged';
  for (const ws of wsData.workstreams) {
    if (ws.status === 'complete' || ws.status === 'merged') {
      if (!wsData.completed_workstreams) wsData.completed_workstreams = [];
      wsData.completed_workstreams.push({
        ...ws,
        merged_at: new Date().toISOString(),
      });
    }
  }
  wsData.workstreams = wsData.workstreams.filter(
    w => w.status !== 'complete' && w.status !== 'merged'
  );
  fs.writeFileSync(wsJsonPath, JSON.stringify(wsData, null, 2) + '\n');

  output({
    success: true,
    reconciled_phases: reconciledPhases,
    decisions_merged: allDecisions.length,
    blockers_merged: allBlockers.length,
    next_phase: nextObjective,
    next_objective_name: joinPhaseName,
    state_regenerated: true,
    roadmap_updated: true,
  }, raw);
}

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error('Usage: df-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-objective, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, init');
  }

  switch (command) {
    case 'state': {
      const subcommand = args[1];
      if (subcommand === 'update') {
        cmdStateUpdate(cwd, args[2], args[3]);
      } else if (subcommand === 'get') {
        cmdStateGet(cwd, args[2], raw);
      } else if (subcommand === 'patch') {
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const key = args[i].replace(/^--/, '');
          const value = args[i + 1];
          if (key && value !== undefined) {
            patches[key] = value;
          }
        }
        cmdStatePatch(cwd, patches, raw);
      } else if (subcommand === 'advance-job') {
        cmdStateAdvanceJob(cwd, raw);
      } else if (subcommand === 'record-metric') {
        const objectiveIdx = args.indexOf('--objective');
        const jobIdx = args.indexOf('--job');
        const durationIdx = args.indexOf('--duration');
        const tasksIdx = args.indexOf('--tasks');
        const filesIdx = args.indexOf('--files');
        cmdStateRecordMetric(cwd, {
          objective: objectiveIdx !== -1 ? args[objectiveIdx + 1] : null,
          job: jobIdx !== -1 ? args[jobIdx + 1] : null,
          duration: durationIdx !== -1 ? args[durationIdx + 1] : null,
          tasks: tasksIdx !== -1 ? args[tasksIdx + 1] : null,
          files: filesIdx !== -1 ? args[filesIdx + 1] : null,
        }, raw);
      } else if (subcommand === 'update-progress') {
        cmdStateUpdateProgress(cwd, raw);
      } else if (subcommand === 'add-decision') {
        const objectiveIdx = args.indexOf('--objective');
        const summaryIdx = args.indexOf('--summary');
        const rationaleIdx = args.indexOf('--rationale');
        cmdStateAddDecision(cwd, {
          objective: objectiveIdx !== -1 ? args[objectiveIdx + 1] : null,
          summary: summaryIdx !== -1 ? args[summaryIdx + 1] : null,
          rationale: rationaleIdx !== -1 ? args[rationaleIdx + 1] : '',
        }, raw);
      } else if (subcommand === 'add-blocker') {
        const textIdx = args.indexOf('--text');
        cmdStateAddBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
      } else if (subcommand === 'resolve-blocker') {
        const textIdx = args.indexOf('--text');
        cmdStateResolveBlocker(cwd, textIdx !== -1 ? args[textIdx + 1] : null, raw);
      } else if (subcommand === 'record-session') {
        const stoppedIdx = args.indexOf('--stopped-at');
        const resumeIdx = args.indexOf('--resume-file');
        cmdStateRecordSession(cwd, {
          stopped_at: stoppedIdx !== -1 ? args[stoppedIdx + 1] : null,
          resume_file: resumeIdx !== -1 ? args[resumeIdx + 1] : 'None',
        }, raw);
      } else {
        cmdStateLoad(cwd, raw);
      }
      break;
    }

    case 'resolve-model': {
      cmdResolveModel(cwd, args[1], raw);
      break;
    }

    case 'find-objective': {
      cmdFindObjective(cwd, args[1], raw);
      break;
    }

    case 'commit': {
      const amend = args.includes('--amend');
      const message = args[1];
      // Parse --files flag (collect args after --files, stopping at other flags)
      const filesIndex = args.indexOf('--files');
      const files = filesIndex !== -1 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
      cmdCommit(cwd, message, files, raw, amend);
      break;
    }

    case 'verify-summary': {
      const summaryPath = args[1];
      const countIndex = args.indexOf('--check-count');
      const checkCount = countIndex !== -1 ? parseInt(args[countIndex + 1], 10) : 2;
      cmdVerifySummary(cwd, summaryPath, checkCount, raw);
      break;
    }

    case 'template': {
      const subcommand = args[1];
      if (subcommand === 'select') {
        cmdTemplateSelect(cwd, args[2], raw);
      } else if (subcommand === 'fill') {
        const templateType = args[2];
        const objectiveIdx = args.indexOf('--objective');
        const jobIdx = args.indexOf('--job');
        const nameIdx = args.indexOf('--name');
        const typeIdx = args.indexOf('--type');
        const waveIdx = args.indexOf('--wave');
        const fieldsIdx = args.indexOf('--fields');
        cmdTemplateFill(cwd, templateType, {
          objective: objectiveIdx !== -1 ? args[objectiveIdx + 1] : null,
          job: jobIdx !== -1 ? args[jobIdx + 1] : null,
          name: nameIdx !== -1 ? args[nameIdx + 1] : null,
          type: typeIdx !== -1 ? args[typeIdx + 1] : 'execute',
          wave: waveIdx !== -1 ? args[waveIdx + 1] : '1',
          fields: fieldsIdx !== -1 ? JSON.parse(args[fieldsIdx + 1]) : {},
        }, raw);
      } else {
        error('Unknown template subcommand. Available: select, fill');
      }
      break;
    }

    case 'frontmatter': {
      const subcommand = args[1];
      const file = args[2];
      if (subcommand === 'get') {
        const fieldIdx = args.indexOf('--field');
        cmdFrontmatterGet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, raw);
      } else if (subcommand === 'set') {
        const fieldIdx = args.indexOf('--field');
        const valueIdx = args.indexOf('--value');
        cmdFrontmatterSet(cwd, file, fieldIdx !== -1 ? args[fieldIdx + 1] : null, valueIdx !== -1 ? args[valueIdx + 1] : undefined, raw);
      } else if (subcommand === 'merge') {
        const dataIdx = args.indexOf('--data');
        cmdFrontmatterMerge(cwd, file, dataIdx !== -1 ? args[dataIdx + 1] : null, raw);
      } else if (subcommand === 'validate') {
        const schemaIdx = args.indexOf('--schema');
        cmdFrontmatterValidate(cwd, file, schemaIdx !== -1 ? args[schemaIdx + 1] : null, raw);
      } else {
        error('Unknown frontmatter subcommand. Available: get, set, merge, validate');
      }
      break;
    }

    case 'verify': {
      const subcommand = args[1];
      if (subcommand === 'job-structure') {
        cmdVerifyJobStructure(cwd, args[2], raw);
      } else if (subcommand === 'objective-completeness') {
        cmdVerifyObjectiveCompleteness(cwd, args[2], raw);
      } else if (subcommand === 'references') {
        cmdVerifyReferences(cwd, args[2], raw);
      } else if (subcommand === 'commits') {
        cmdVerifyCommits(cwd, args.slice(2), raw);
      } else if (subcommand === 'artifacts') {
        cmdVerifyArtifacts(cwd, args[2], raw);
      } else if (subcommand === 'key-links') {
        cmdVerifyKeyLinks(cwd, args[2], raw);
      } else {
        error('Unknown verify subcommand. Available: job-structure, objective-completeness, references, commits, artifacts, key-links');
      }
      break;
    }

    case 'generate-slug': {
      cmdGenerateSlug(args[1], raw);
      break;
    }

    case 'current-timestamp': {
      cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    }

    case 'list-todos': {
      cmdListTodos(cwd, args[1], raw);
      break;
    }

    case 'verify-path-exists': {
      cmdVerifyPathExists(cwd, args[1], raw);
      break;
    }

    case 'config-ensure-section': {
      cmdConfigEnsureSection(cwd, raw);
      break;
    }

    case 'config-set': {
      cmdConfigSet(cwd, args[1], args[2], raw);
      break;
    }

    case 'config-get': {
      cmdConfigGet(cwd, args[1], raw);
      break;
    }

    case 'history-digest': {
      cmdHistoryDigest(cwd, raw);
      break;
    }

    case 'objectives': {
      const subcommand = args[1];
      if (subcommand === 'list') {
        const typeIndex = args.indexOf('--type');
        const objectiveIndex = args.indexOf('--objective');
        const options = {
          type: typeIndex !== -1 ? args[typeIndex + 1] : null,
          objective: objectiveIndex !== -1 ? args[objectiveIndex + 1] : null,
          includeArchived: args.includes('--include-archived'),
        };
        cmdObjectivesList(cwd, options, raw);
      } else {
        error('Unknown objectives subcommand. Available: list');
      }
      break;
    }

    case 'roadmap': {
      const subcommand = args[1];
      if (subcommand === 'get-objective') {
        cmdRoadmapGetObjective(cwd, args[2], raw);
      } else if (subcommand === 'analyze') {
        cmdRoadmapAnalyze(cwd, raw);
      } else if (subcommand === 'update-job-progress') {
        cmdRoadmapUpdateJobProgress(cwd, args[2], raw);
      } else {
        error('Unknown roadmap subcommand. Available: get-objective, analyze, update-job-progress');
      }
      break;
    }

    case 'requirements': {
      const subcommand = args[1];
      if (subcommand === 'mark-complete') {
        cmdRequirementsMarkComplete(cwd, args.slice(2), raw);
      } else {
        error('Unknown requirements subcommand. Available: mark-complete');
      }
      break;
    }

    case 'objective': {
      const subcommand = args[1];
      if (subcommand === 'next-decimal') {
        cmdObjectiveNextDecimal(cwd, args[2], raw);
      } else if (subcommand === 'add') {
        cmdObjectiveAdd(cwd, args.slice(2).join(' '), raw);
      } else if (subcommand === 'insert') {
        cmdObjectiveInsert(cwd, args[2], args.slice(3).join(' '), raw);
      } else if (subcommand === 'remove') {
        const forceFlag = args.includes('--force');
        cmdObjectiveRemove(cwd, args[2], { force: forceFlag }, raw);
      } else if (subcommand === 'complete') {
        cmdObjectiveComplete(cwd, args[2], raw);
      } else {
        error('Unknown objective subcommand. Available: next-decimal, add, insert, remove, complete');
      }
      break;
    }

    case 'milestone': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        const nameIndex = args.indexOf('--name');
        const archiveObjectives = args.includes('--archive-objectives');
        // Collect --name value (everything after --name until next flag or end)
        let milestoneName = null;
        if (nameIndex !== -1) {
          const nameArgs = [];
          for (let i = nameIndex + 1; i < args.length; i++) {
            if (args[i].startsWith('--')) break;
            nameArgs.push(args[i]);
          }
          milestoneName = nameArgs.join(' ') || null;
        }
        cmdMilestoneComplete(cwd, args[2], { name: milestoneName, archiveObjectives }, raw);
      } else {
        error('Unknown milestone subcommand. Available: complete');
      }
      break;
    }

    case 'validate': {
      const subcommand = args[1];
      if (subcommand === 'consistency') {
        cmdValidateConsistency(cwd, raw);
      } else if (subcommand === 'health') {
        const repairFlag = args.includes('--repair');
        cmdValidateHealth(cwd, { repair: repairFlag }, raw);
      } else {
        error('Unknown validate subcommand. Available: consistency, health');
      }
      break;
    }

    case 'progress': {
      const subcommand = args[1] || 'json';
      cmdProgressRender(cwd, subcommand, raw);
      break;
    }

    case 'todo': {
      const subcommand = args[1];
      if (subcommand === 'complete') {
        cmdTodoComplete(cwd, args[2], raw);
      } else {
        error('Unknown todo subcommand. Available: complete');
      }
      break;
    }

    case 'scaffold': {
      const scaffoldType = args[1];
      const objectiveIndex = args.indexOf('--objective');
      const nameIndex = args.indexOf('--name');
      const scaffoldOptions = {
        objective: objectiveIndex !== -1 ? args[objectiveIndex + 1] : null,
        name: nameIndex !== -1 ? args.slice(nameIndex + 1).join(' ') : null,
      };
      cmdScaffold(cwd, scaffoldType, scaffoldOptions, raw);
      break;
    }

    case 'init': {
      const workflow = args[1];
      const includes = parseIncludeFlag(args);
      switch (workflow) {
        case 'execute-objective':
          cmdInitExecuteObjective(cwd, args[2], includes, raw);
          break;
        case 'plan-objective':
          cmdInitPlanObjective(cwd, args[2], includes, raw);
          break;
        case 'new-project':
          cmdInitNewProject(cwd, raw);
          break;
        case 'new-milestone':
          cmdInitNewMilestone(cwd, raw);
          break;
        case 'quick':
          cmdInitQuick(cwd, args.slice(2).join(' '), raw);
          break;
        case 'resume':
          cmdInitResume(cwd, raw);
          break;
        case 'verify-work':
          cmdInitVerifyWork(cwd, args[2], raw);
          break;
        case 'objective-op':
          cmdInitObjectiveOp(cwd, args[2], raw);
          break;
        case 'todos':
          cmdInitTodos(cwd, args[2], raw);
          break;
        case 'milestone-op':
          cmdInitMilestoneOp(cwd, raw);
          break;
        case 'map-codebase':
          cmdInitMapCodebase(cwd, raw);
          break;
        case 'progress':
          cmdInitProgress(cwd, includes, raw);
          break;
        default:
          error(`Unknown init workflow: ${workflow}\nAvailable: execute-objective, plan-objective, new-project, new-milestone, quick, resume, verify-work, objective-op, todos, milestone-op, map-codebase, progress`);
      }
      break;
    }

    case 'objective-job-index': {
      cmdObjectiveJobIndex(cwd, args[1], raw);
      break;
    }

    case 'state-snapshot': {
      cmdStateSnapshot(cwd, raw);
      break;
    }

    case 'summary-extract': {
      const summaryPath = args[1];
      const fieldsIndex = args.indexOf('--fields');
      const fields = fieldsIndex !== -1 ? args[fieldsIndex + 1].split(',') : null;
      cmdSummaryExtract(cwd, summaryPath, fields, raw);
      break;
    }

    case 'websearch': {
      const query = args[1];
      const limitIdx = args.indexOf('--limit');
      const freshnessIdx = args.indexOf('--freshness');
      await cmdWebsearch(query, {
        limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10,
        freshness: freshnessIdx !== -1 ? args[freshnessIdx + 1] : null,
      }, raw);
      break;
    }

    case 'workstreams': {
      const subcommand = args[1];
      if (subcommand === 'analyze') {
        cmdWorkstreamsAnalyze(cwd, raw);
      } else if (subcommand === 'provision') {
        cmdWorkstreamsProvision(cwd, args[2], args[3], raw);
      } else if (subcommand === 'reconcile') {
        cmdWorkstreamsReconcile(cwd, raw);
      } else {
        error('Unknown workstreams subcommand. Available: analyze, provision, reconcile');
      }
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();
