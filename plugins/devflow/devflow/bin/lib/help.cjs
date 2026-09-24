'use strict';

/**
 * help.cjs — `--help` / `-h` for every df-tools subcommand (issue #87).
 *
 * Why this exists: before it, `df-tools commit --help` took `--help` as the
 * commit MESSAGE, found no `--files`, staged `.planning/` and committed
 * whatever was dirty. The universal "tell me before you do anything" gesture
 * was the one input that guaranteed a write — and it succeeded silently,
 * printing a hash.
 *
 * The fix is structural rather than per-subcommand: the dispatcher answers
 * `--help`/`-h` BEFORE the switch, so no subcommand can ever see a help flag
 * as data. Every top-level command therefore needs an entry here, and
 * `help.test.cjs` fails if a `case` in df-tools.cjs has none.
 *
 * `mutates: true` marks a command that writes to disk or to git. It is shown in
 * the listing so a reader can tell, before running anything, which questions
 * are safe to ask.
 */

// name → { usage, summary, mutates?, details? }
const COMMANDS = {
  'state': {
    usage: 'df-tools state [load|get [section]|update <field> <value>|patch --<field> <val>...|advance-job|record-metric|update-progress|add-decision|add-blocker|resolve-blocker|record-session] [--raw]',
    summary: 'Read or update .planning/STATE.md.',
    mutates: true,
  },
  'resolve-model': {
    usage: 'df-tools resolve-model <agent-type> [--raw]',
    summary: 'Resolve the model for an agent from the configured profile.',
  },
  'find-objective': {
    usage: 'df-tools find-objective <objective> [--raw]',
    summary: 'Find an objective directory by number.',
  },
  'commit': {
    usage: 'df-tools commit <message> [--files <path>...] [--amend] [--raw]',
    summary: 'Commit planning docs (honours commit_docs + .gitignore).',
    mutates: true,
    details: [
      '  <message>   The commit subject. A message starting with "--" is REFUSED:',
      '              it is far likelier a mistyped flag than an intended subject.',
      '  --files     Paths to stage and commit. STRONGLY RECOMMENDED: the commit is',
      '              limited to these pathspecs, so a concurrent executor\'s staged',
      '              changes are not swept in.',
      '              Omitted, the command falls back to staging and committing',
      '              .planning/ only — never the rest of the working tree.',
      '  --amend     Amend the previous commit (--no-edit); <message> is not required.',
      '',
      'Examples:',
      '  df-tools commit "docs(12-03): complete TRD" --files .planning/STATE.md',
      '  df-tools commit "chore: sync mapping" --files .planning/.gh-mapping.json',
    ],
  },
  'verify-summary': {
    usage: 'df-tools verify-summary <path> [--check-count N] [--raw]',
    summary: 'Verify a SUMMARY.md file.',
  },
  'template': {
    usage: 'df-tools template <select|fill> ... [--raw]',
    summary: 'Select or fill a DevFlow document template.',
    mutates: true,
  },
  'frontmatter': {
    usage: 'df-tools frontmatter <get|set|merge|validate> <file> [--field k] [--value v] [--data json] [--schema job|summary|verification] [--raw]',
    summary: 'Read, write or validate a file\'s YAML frontmatter.',
    mutates: true,
  },
  'verify': {
    usage: 'df-tools verify <job-structure|objective-completeness|references|commits|artifacts|key-links|trd-pre|api-contract|flutter-ui-bootstrap|flutter-state-coverage|flutter-ui-eval> <arg> [--raw]',
    summary: 'Verification suite — structure, references, commits, artifacts, UI states.',
  },
  'flutter-ui': {
    usage: 'df-tools flutter-ui <setup|eval|bootstrap|design-review> [args] [--raw]',
    summary: 'Flutter UI evaluation setup and runs.',
    mutates: true,
  },
  'ui': {
    usage: 'df-tools ui <metrics|spec|sheet|lock> [args] [--raw]',
    summary: 'Surface Spec validation, review sheet, look-lock and UI metrics.',
    mutates: true,
  },
  'detect': {
    usage: 'df-tools detect <novel-domain|brownfield-map|flutter-ui-scope> [arg] [--raw]',
    summary: 'Detectors used by the planner (research boundary, brownfield, Flutter UI scope).',
  },
  'generate': {
    usage: 'df-tools generate uat <objective> [--raw]',
    summary: 'Generate a 1-page UAT checklist from TRDs and Maestro flows.',
    mutates: true,
  },
  'generate-slug': {
    usage: 'df-tools generate-slug <text> [--raw]',
    summary: 'Convert text to a URL-safe slug.',
  },
  'current-timestamp': {
    usage: 'df-tools current-timestamp [full|date|filename] [--raw]',
    summary: 'Print a timestamp in the requested format.',
  },
  'list-todos': {
    usage: 'df-tools list-todos [area] [--raw]',
    summary: 'Count and enumerate pending todos.',
  },
  'verify-path-exists': {
    usage: 'df-tools verify-path-exists <path> [--raw]',
    summary: 'Check that a file or directory exists.',
  },
  'config-ensure-section': {
    usage: 'df-tools config-ensure-section [--raw]',
    summary: 'Initialize .planning/config.json.',
    mutates: true,
  },
  'config-set': {
    usage: 'df-tools config-set <key> <value> [--raw]',
    summary: 'Set a key in .planning/config.json.',
    mutates: true,
  },
  'config-get': {
    usage: 'df-tools config-get <key> [--raw]',
    summary: 'Read a key from .planning/config.json.',
  },
  'history-digest': {
    usage: 'df-tools history-digest [--raw]',
    summary: 'Aggregate every SUMMARY.md into one digest.',
  },
  'migrate': {
    usage: 'df-tools migrate <plan|apply> [--kind k] [--default-work w] [--work-choices json] [--dry-run]',
    summary: 'Plan or apply a .planning/ layout migration.',
    mutates: true,
  },
  'intent': {
    usage: 'df-tools intent resolve [--objective N] [--trd path] [--raw]',
    summary: 'Resolve the intent/defaults cell for an objective or TRD.',
  },
  'objectives': {
    usage: 'df-tools objectives list [--type t] [--objective N] [--include-archived] [--raw]',
    summary: 'List objectives with their on-disk status.',
  },
  'roadmap': {
    usage: 'df-tools roadmap <get-objective <N>|analyze|update-job-progress <N>> [--raw]',
    summary: 'Read or update ROADMAP.md.',
    mutates: true,
  },
  'requirements': {
    usage: 'df-tools requirements mark-complete <REQ-01[,REQ-02...]> [--raw]',
    summary: 'Mark requirement IDs complete in REQUIREMENTS.md.',
    mutates: true,
  },
  'objective': {
    usage: 'df-tools objective <next-decimal <N>|add <description>|insert <after> <description>|remove <N> [--confirm]|complete <N>> [--raw]',
    summary: 'Add, insert, remove or complete a roadmap objective.',
    mutates: true,
  },
  'milestone': {
    usage: 'df-tools milestone complete <version> [--name <name>] [--archive-objectives] [--raw]',
    summary: 'Archive a milestone and write MILESTONES.md.',
    mutates: true,
  },
  'validate': {
    usage: 'df-tools validate <consistency|health [--repair]> [--raw]',
    summary: 'Check .planning/ integrity and objective numbering.',
    mutates: true,
  },
  'progress': {
    usage: 'df-tools progress [json|table|bar] [--raw]',
    summary: 'Render roadmap progress.',
  },
  'todo': {
    usage: 'df-tools todo complete <filename> [--raw]',
    summary: 'Move a todo from pending to completed.',
    mutates: true,
  },
  'handoff': {
    usage: 'df-tools handoff <create <command...> [--inputs-json json]|complete <id> [--exit-code N] [--output s] [--output-file f]|list|get <id>> [--raw]',
    summary: 'Hand a TTY-required command off to the user\'s shell.',
    mutates: true,
  },
  'scaffold': {
    usage: 'df-tools scaffold <context|uat|verification|objective-dir> --objective <N> [--name <name>] [--raw]',
    summary: 'Create a DevFlow document or objective directory from a template.',
    mutates: true,
  },
  'init': {
    usage: 'df-tools init <execute-objective|plan-objective|new-project|new-milestone|quick|resume|verify-work|objective-op|todos|milestone-op|map-codebase|security-audit|progress> [args] [--include a,b] [--raw]',
    summary: 'Load the context bundle a workflow or agent needs at start.',
  },
  'objective-job-index': {
    usage: 'df-tools objective-job-index <objective> [--raw]',
    summary: 'Index an objective\'s plans with waves and status.',
  },
  'state-snapshot': {
    usage: 'df-tools state-snapshot [--raw]',
    summary: 'Structured parse of STATE.md.',
  },
  'summary-extract': {
    usage: 'df-tools summary-extract <path> [--fields a,b] [--raw]',
    summary: 'Extract structured data from a SUMMARY.md.',
  },
  'websearch': {
    usage: 'df-tools websearch <query> [--limit N] [--freshness day|week|month] [--raw]',
    summary: 'Search the web via the Brave API, when configured.',
  },
  'workstreams': {
    usage: 'df-tools workstreams <analyze|provision <id> <path>|reconcile> [--raw]',
    summary: 'Analyze, provision or reconcile parallel workstreams.',
    mutates: true,
  },
  'changelog': {
    usage: 'df-tools changelog <update [--version v] [--from ref] [--to ref] [--dry-run]|check <path>> [--raw]',
    summary: 'Generate or check CHANGELOG entries.',
    mutates: true,
  },
  'defaults-table': {
    usage: 'df-tools defaults-table init [args] [--raw]',
    summary: 'Write the project defaults table.',
    mutates: true,
  },
  'gh': {
    usage: 'df-tools gh <status|sync [objective]|pull <objective> [--apply]|sync-objectives|resolve <objective>|comment <issue> <body>|close-issue <issue> [comment]|sync-release <tag>> [--raw]',
    summary: 'Sync DevFlow planning state to and from GitHub.',
    mutates: true,
  },
  'awareness': {
    usage: 'df-tools awareness [args] [--raw]',
    summary: 'Peer view — who else is working in this repo.',
  },
  'org-awareness': {
    usage: 'df-tools org-awareness [args] [--raw]',
    summary: 'Org-wide progress across repos.',
  },
  'planning': {
    usage: 'df-tools planning sibling-trd-scan <objective> [--raw]',
    summary: 'Scan sibling repos for TRDs matching an objective.',
  },
  'project-hygiene': {
    usage: 'df-tools project-hygiene <check|move [args]|archive [args]> [--raw]',
    summary: 'Check or repair project file hygiene.',
    mutates: true,
  },
  'benchmark': {
    usage: 'df-tools benchmark [args] [--raw]',
    summary: 'DevFlow benchmark harness.',
  },
  'dup-detect': {
    usage: 'df-tools dup-detect [args] [--raw]',
    summary: 'Detect duplicate objectives or TRDs.',
  },
  'decision-queue': {
    usage: 'df-tools decision-queue [args] [--raw]',
    summary: 'List and resolve parked decisions.',
    mutates: true,
  },
  'initiatives': {
    usage: 'df-tools initiatives [sync|list|show <id>]',
    summary: 'Sync and read strategic initiative context.',
    mutates: true,
  },
  'check-todos': {
    usage: 'df-tools check-todos [args] [--raw]',
    summary: 'Morning standup across local, GitHub and peer todos.',
  },
  'tui': {
    usage: 'df-tools tui [args] [--raw]',
    summary: 'Program-aware read-only terminal UI.',
  },
  'sync-roadmap': {
    usage: 'df-tools sync-roadmap [--dry-run] [--interactive] [--raw]',
    summary: 'Reconcile ROADMAP.md checkboxes against on-disk SUMMARY.md presence.',
    mutates: true,
  },
  'skill-route': {
    usage: 'df-tools skill-route <request...> | --list [--raw]',
    summary: 'Route a natural-language request to a DevFlow skill.',
  },
  'deprecation': {
    usage: 'df-tools deprecation log <old-name>',
    summary: 'Record use of a deprecated command name.',
    mutates: true,
  },
  'survey': {
    usage: 'df-tools survey decimal-objectives [--root <path>] [--raw]',
    summary: 'Survey decimal-objective usage across projects.',
  },
  'trd-tdd': {
    usage: 'df-tools trd-tdd inspect <trd-path> [--raw]',
    summary: 'Inspect a TRD\'s TDD structure.',
  },
  'project-state': {
    usage: 'df-tools project-state [<cwd>] [--raw]',
    summary: 'Report whether a directory is a DevFlow project.',
  },
  'project-decline': {
    usage: 'df-tools project-decline [<cwd>] [--duration-days N] [--raw]',
    summary: 'Record that DevFlow adoption was declined here.',
    mutates: true,
  },
  'project-accept': {
    usage: 'df-tools project-accept [<cwd>] [--raw]',
    summary: 'Clear a recorded decline.',
    mutates: true,
  },
  'skill-active': {
    usage: 'df-tools skill-active <--start <name>|--end|--status> [--raw]',
    summary: 'Mark a skill active or ended (.planning/.skill-active).',
    mutates: true,
  },
  'micro': {
    usage: 'df-tools micro <start <description>|commit [--files <path>...]|abort> [--raw]',
    summary: 'The micro workflow: start, commit, abort.',
    mutates: true,
  },
  'exec-context': {
    usage: 'df-tools exec-context <check|worktree> --repo <path> [--base <ref>] [--id <slug>] [--path <dir>] [--raw]',
    summary: 'Prove a spawn is in the intended repo on an explicit base; provision a worktree from that base.',
    mutates: true,
    details: [
      '  check     Exit 1 unless the current directory belongs to --repo (a linked',
      '            worktree of it counts) and, with --base, HEAD contains that commit.',
      '            Run this FIRST in any dispatched executor: a wrong-repo spawn then',
      '            stops loudly instead of writing where nobody is looking.',
      '            --repo must be ABSOLUTE: a relative path resolves against the',
      '            spawn\'s own cwd, so the guard would compare a repo with itself',
      '            and could never fail.',
      '            In the payload, `checkout` is the tree you are standing in and is',
      '            where work goes; `repo_root` names the REPOSITORY, which for a',
      '            linked worktree is the SHARED main checkout.',
      '  worktree  Provision isolation explicitly, in --repo, from --base (default: the',
      '            tip YOU are standing on — never the default branch, and never the',
      '            main checkout\'s HEAD when you dispatch from a worktree). Prints the path,',
      '            branch, and the merge-back and removal commands. `merge_back`',
      '            targets the checkout YOU are standing in (`merge_into`), not the',
      '            main checkout\'s current branch.',
      '',
      'Issue #86: forced `isolation: worktree` resolved the repo from the controller',
      'session and the base from the default branch. Both are stated here instead.',
    ],
  },
  'global-config': {
    usage: 'df-tools global-config <get <key>|set <key> <value>> [--raw]',
    summary: 'Read or write the user-level DevFlow config.',
    mutates: true,
  },
};

const HELP_FLAGS = new Set(['--help', '-h']);

/**
 * Commands that already print their OWN, richer help — domain text the generic
 * table cannot carry (which judge modes are binding, which scopes a scaffold
 * writes to). The dispatcher delegates to them instead of overriding.
 *
 * Delegating is only safe because each of these prints and returns BEFORE doing
 * any work; `help-delegation.test.cjs` holds them to that, so adding a name here
 * cannot quietly reopen issue #87.
 *
 * `true` = the whole command owns its help. A Set = only those subcommands do.
 */
const OWN_HELP = {
  'awareness': true,
  'org-awareness': true,
  'dup-detect': true,
  'defaults-table': new Set(['init']),
  'flutter-ui': new Set(['bootstrap', 'design-review', 'eval']),
  'verify': new Set(['flutter-ui-eval']),
  'gh': new Set(['resolve']),
};

function ownsHelp(args) {
  const owner = OWN_HELP[args[0]];
  if (owner === undefined) return false;
  if (owner === true) return true;
  return owner.has(args[1]);
}

function hasHelpFlag(args) {
  return args.some(a => HELP_FLAGS.has(a));
}

/**
 * Subcommands whose remaining argv is a FREE-FORM TAIL — text df-tools carries
 * rather than reads. `handoff create <command...>` joins its tail into a
 * command line handed to the user's shell, so a `--help` in it belongs to THAT
 * command, not to df-tools.
 *
 * Issue #100 finding 6: the global scan was flat, so
 * `df-tools handoff create gh auth login --help` printed df-tools' handoff
 * usage, exited 0, and queued NOTHING — the handoff silently never happened.
 * Mapped `command -> subcommands`; the tail starts after the subcommand.
 */
const FREEFORM_TAIL = {
  'handoff': new Set(['create']),
};

/**
 * The index at which the dispatcher's scan for a help flag must STOP: the
 * start of a free-form tail, or a literal `--`, whichever comes first.
 *
 * The tail's FIRST token is still scanned: `handoff create --help` forwards no
 * command at all (a shell line cannot begin with `--help`), so there it really
 * is a question. From the second token on — `handoff create gh auth login
 * --help` — the flag is addressed to the command being carried. A literal `--`
 * ends the flag region unconditionally, tail or no tail.
 */
function helpScanLimit(args) {
  let limit = args.length;
  const tail = FREEFORM_TAIL[args[0]];
  if (tail && tail.has(args[1])) limit = Math.min(limit, 3);
  const dashdash = args.indexOf('--');
  if (dashdash !== -1) limit = Math.min(limit, dashdash);
  return limit;
}

/**
 * Is a help flag addressed to df-tools ITSELF? Unlike `hasHelpFlag` (which a
 * subcommand uses on its own argv, where every token is its own), this stops
 * at anything df-tools is only carrying.
 */
function hasTopLevelHelpFlag(args) {
  return args.slice(0, helpScanLimit(args)).some(a => HELP_FLAGS.has(a));
}

function topLevelUsage() {
  const names = Object.keys(COMMANDS).sort();
  const width = names.reduce((w, n) => Math.max(w, n.length), 0);
  const lines = [
    'Usage: df-tools <command> [args] [--raw]',
    '',
    'Run `df-tools <command> --help` for a command\'s own usage.',
    '(*) marks a command that writes to disk or to git.',
    '',
    'Commands:',
  ];
  for (const name of names) {
    const c = COMMANDS[name];
    const mark = c.mutates ? ' *' : '  ';
    lines.push(`  ${name.padEnd(width)}${mark}  ${c.summary}`);
  }
  return lines.join('\n') + '\n';
}

function commandUsage(name) {
  const c = COMMANDS[name];
  if (!c) return null;
  const lines = [`Usage: ${c.usage}`, '', c.summary];
  if (c.mutates) lines.push('', 'This command WRITES (disk and/or git).');
  if (c.details) lines.push('', ...c.details);
  return lines.join('\n') + '\n';
}

/**
 * Print help for `name` (or the top-level listing) and exit 0.
 * Never returns.
 */
function printHelp(name) {
  const text = (name && commandUsage(name)) || topLevelUsage();
  process.stdout.write(text);
  process.exit(0);
}

module.exports = {
  COMMANDS, HELP_FLAGS, OWN_HELP, FREEFORM_TAIL,
  ownsHelp, hasHelpFlag, hasTopLevelHelpFlag, helpScanLimit,
  topLevelUsage, commandUsage, printHelp,
};
