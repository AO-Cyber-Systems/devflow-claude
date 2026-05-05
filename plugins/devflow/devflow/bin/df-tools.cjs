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
 *   roadmap update-job-progress <N>   Update progress table row from disk (TRD/JOB vs SUMMARY counts)
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
 *   verify job-structure <file>       Check TRD.md/JOB.md structure + tasks
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
 *   template fill job --objective N       Create pre-filled TRD.md (or JOB.md)
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
 *   init security-audit                All context for security-audit workflow
 *   init progress                      All context for progress workflow
 */

'use strict';

// ─── Module Imports ───────────────────────────────────────────────────────────

const { error, parseIncludeFlag } = require('./lib/helpers.cjs');
const { cmdConfigEnsureSection, cmdConfigSet, cmdConfigGet } = require('./lib/config.cjs');
const {
  cmdStateLoad, cmdStateGet, cmdStatePatch, cmdStateUpdate, cmdStateAdvanceJob,
  cmdStateRecordMetric, cmdStateUpdateProgress, cmdStateAddDecision, cmdStateAddBlocker,
  cmdStateResolveBlocker, cmdStateRecordSession, cmdStateSnapshot,
} = require('./lib/state.cjs');
const {
  cmdFrontmatterGet, cmdFrontmatterSet, cmdFrontmatterMerge, cmdFrontmatterValidate,
} = require('./lib/frontmatter.cjs');
const {
  cmdFindObjective, cmdObjectiveNextDecimal, cmdObjectivesList,
  cmdObjectiveAdd, cmdObjectiveInsert, cmdObjectiveRemove, cmdObjectiveComplete,
} = require('./lib/objective.cjs');
const {
  cmdRoadmapGetObjective, cmdRoadmapAnalyze, cmdRoadmapUpdateJobProgress,
  cmdMilestoneComplete, cmdProgressRender,
} = require('./lib/roadmap.cjs');
const { cmdTemplateSelect, cmdTemplateFill } = require('./lib/templates.cjs');
const {
  cmdVerifySummary, cmdVerifyJobStructure, cmdVerifyObjectiveCompleteness,
  cmdVerifyReferences, cmdVerifyCommits, cmdVerifyArtifacts, cmdVerifyKeyLinks,
} = require('./lib/verify.cjs');
const { cmdValidateConsistency, cmdValidateHealth } = require('./lib/validate.cjs');
const {
  cmdResolveModel, cmdInitExecuteObjective, cmdInitPlanObjective, cmdInitNewProject,
  cmdInitNewMilestone, cmdInitQuick, cmdInitResume, cmdInitVerifyWork, cmdInitObjectiveOp,
  cmdInitTodos, cmdInitMilestoneOp, cmdInitMapCodebase, cmdInitSecurityAudit, cmdInitProgress,
} = require('./lib/init.cjs');
const intent = require('./lib/intent.cjs');
const migrate = require('./lib/migrate.cjs');
const {
  cmdWorkstreamsAnalyze, cmdWorkstreamsProvision, cmdWorkstreamsReconcile,
} = require('./lib/workstreams.cjs');
const {
  cmdGhStatus, cmdGhSyncObjectives, cmdGhComment, cmdGhCloseIssue, cmdGhSyncRelease,
  cmdGhResolve, cmdGhSyncObjective,
} = require('./lib/gh.cjs');
const {
  cmdChangelogUpdate, cmdChangelogCheck,
} = require('./lib/changelog.cjs');
const { cmdAwarenessRoute } = require('./lib/awareness-cli.cjs');
const { cmdOrgAwarenessRoute } = require('./lib/org-awareness-cli.cjs');
const { cmdDupDetectRoute } = require('./lib/dup-detect-cli.cjs');
const { cmdInitiativesRoute } = require('./lib/initiatives-cli.cjs');
const { cmdCheckTodosRoute } = require('./lib/check-todos-cli.cjs');
const { cmdSyncRoadmapRoute } = require('./lib/roadmap-reconcile-cli.cjs');
const {
  cmdGenerateSlug, cmdCurrentTimestamp, cmdListTodos, cmdVerifyPathExists,
  cmdHistoryDigest, cmdObjectiveJobIndex, cmdSummaryExtract, cmdWebsearch,
  cmdCommit, cmdTodoComplete, cmdScaffold, cmdRequirementsMarkComplete,
} = require('./lib/misc.cjs');
const {
  cmdHandoffCreate, cmdHandoffComplete, cmdHandoffList, cmdHandoffGet,
} = require('./lib/handoff.cjs');

// ─── CLI Router ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);

  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error('Usage: df-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-objective, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, awareness, init');
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

    case 'migrate': {
      const subcommand = args[1];
      if (subcommand === 'plan') {
        try {
          const result = migrate.plan({ projectRoot: cwd });
          process.stdout.write(JSON.stringify(result, null, 2));
          process.exit(0);
        } catch (e) {
          error(e.message);
        }
      } else if (subcommand === 'apply') {
        const kindIdx = args.indexOf('--kind');
        const defaultWorkIdx = args.indexOf('--default-work');
        const workChoicesIdx = args.indexOf('--work-choices');
        const dryRun = args.includes('--dry-run');
        let workChoices = {};
        if (workChoicesIdx !== -1 && args[workChoicesIdx + 1]) {
          try { workChoices = JSON.parse(args[workChoicesIdx + 1]); }
          catch { error('Invalid JSON for --work-choices'); }
        }
        try {
          const result = migrate.apply({
            projectRoot: cwd,
            kind: kindIdx !== -1 ? args[kindIdx + 1] : undefined,
            defaultWork: defaultWorkIdx !== -1 ? args[defaultWorkIdx + 1] : undefined,
            workChoices,
            dryRun,
          });
          process.stdout.write(JSON.stringify(result, null, 2));
          process.exit(0);
        } catch (e) {
          error(e.message);
        }
      } else {
        error('Unknown migrate subcommand. Available: plan, apply');
      }
      break;
    }

    case 'intent': {
      const subcommand = args[1];
      if (subcommand === 'resolve') {
        const objectiveIndex = args.indexOf('--objective');
        const trdIndex = args.indexOf('--trd');
        const options = {
          projectRoot: cwd,
          objectiveId: objectiveIndex !== -1 ? args[objectiveIndex + 1] : undefined,
          trdPath: trdIndex !== -1 ? args[trdIndex + 1] : undefined,
        };
        try {
          const result = intent.resolve(options);
          if (raw) {
            process.stdout.write(JSON.stringify(result));
          } else {
            process.stdout.write(JSON.stringify(result, null, 2));
          }
          process.exit(0);
        } catch (e) {
          error(e.message);
        }
      } else {
        error('Unknown intent subcommand. Available: resolve');
      }
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

    case 'handoff': {
      const subcommand = args[1];
      if (subcommand === 'create') {
        const cmd = args.slice(2).join(' ');
        cmdHandoffCreate(cwd, cmd, raw);
      } else if (subcommand === 'complete') {
        const id = args[2];
        const exitIdx = args.indexOf('--exit-code');
        const outFileIdx = args.indexOf('--output-file');
        const outIdx = args.indexOf('--output');
        const opts = {
          exitCode: exitIdx !== -1 ? parseInt(args[exitIdx + 1], 10) : undefined,
          outputFile: outFileIdx !== -1 ? args[outFileIdx + 1] : undefined,
          output: outIdx !== -1 ? args[outIdx + 1] : undefined,
        };
        cmdHandoffComplete(cwd, id, opts, raw);
      } else if (subcommand === 'list') {
        cmdHandoffList(cwd, raw);
      } else if (subcommand === 'get') {
        cmdHandoffGet(cwd, args[2], raw);
      } else {
        error('Unknown handoff subcommand. Available: create, complete, list, get');
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
        case 'security-audit':
          cmdInitSecurityAudit(cwd, raw);
          break;
        case 'progress':
          cmdInitProgress(cwd, includes, raw);
          break;
        default:
          error(`Unknown init workflow: ${workflow}\nAvailable: execute-objective, plan-objective, new-project, new-milestone, quick, resume, verify-work, objective-op, todos, milestone-op, map-codebase, security-audit, progress`);
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

    case 'changelog': {
      const subcommand = args[1];
      if (subcommand === 'update') {
        const versionIdx = args.indexOf('--version');
        const fromIdx = args.indexOf('--from');
        const toIdx = args.indexOf('--to');
        const dryRun = args.includes('--dry-run');
        cmdChangelogUpdate(cwd, {
          version: versionIdx !== -1 ? args[versionIdx + 1] : args[2],
          from: fromIdx !== -1 ? args[fromIdx + 1] : null,
          to: toIdx !== -1 ? args[toIdx + 1] : null,
          dryRun,
        }, raw);
      } else if (subcommand === 'check') {
        cmdChangelogCheck(cwd, args[2], raw);
      } else {
        error('Unknown changelog subcommand. Available: update, check');
      }
      break;
    }

    case 'gh': {
      const subcommand = args[1];
      if (subcommand === 'status') {
        cmdGhStatus(cwd, raw);
      } else if (subcommand === 'sync-objectives') {
        cmdGhSyncObjectives(cwd, raw);
      } else if (subcommand === 'comment') {
        // df-tools gh comment <issue|objective> <body|@file:path>
        cmdGhComment(cwd, args[2], args[3], raw);
      } else if (subcommand === 'close-issue') {
        // df-tools gh close-issue <issue|objective> [comment]
        cmdGhCloseIssue(cwd, args[2], args[3] || null, raw);
      } else if (subcommand === 'sync-release') {
        // df-tools gh sync-release <tag>
        cmdGhSyncRelease(cwd, args[2], raw);
      } else if (subcommand === 'resolve') {
        // df-tools gh resolve <objectiveId> [--raw]
        cmdGhResolve(cwd, args[2], raw);
      } else if (subcommand === 'sync') {
        // df-tools gh sync <objectiveId> — singular: sync one objective's state to GH
        // With no objectiveId, fall back to sync-objectives (plural, all objectives)
        if (args[2]) {
          cmdGhSyncObjective(cwd, args[2], raw);
        } else {
          cmdGhSyncObjectives(cwd, raw);
        }
      } else {
        error('Unknown gh subcommand. Available: status, sync, sync-objectives, resolve, comment, close-issue, sync-release');
      }
      break;
    }

    case 'awareness': {
      cmdAwarenessRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'org-awareness': {
      cmdOrgAwarenessRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'dup-detect': {
      cmdDupDetectRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'initiatives': {
      cmdInitiativesRoute(cwd, args.slice(1));
      break;
    }

    case 'check-todos': {
      cmdCheckTodosRoute(cwd, args.slice(1), raw);
      break;
    }

    case 'sync-roadmap': {
      cmdSyncRoadmapRoute(cwd, args.slice(1), raw);
      break;
    }

    default:
      error(`Unknown command: ${command}`);
  }
}

main();
