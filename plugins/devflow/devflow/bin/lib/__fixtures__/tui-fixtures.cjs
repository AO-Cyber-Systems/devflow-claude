'use strict';

// Hand-built fixture builders for TUI renderer tests.
// Per TDD Playbook habit 4: factory functions, not LLM-generated test data.
// All strings are hand-written or constructed from bounded deterministic expressions.
// Each builder returns a NEW object on each call — no shared mutable state.

// ─── buildPanelOpts ───────────────────────────────────────────────────────────

/**
 * Build the opts sub-object passed to render().
 * Shape is locked by TRD 08-01 and matches render()'s documented input.
 *
 * @param {object} opts
 * @param {number}  [opts.rows]          - terminal rows (default: 24)
 * @param {number}  [opts.cols]          - terminal cols (default: 80)
 * @param {boolean} [opts.no_color]      - strip FG color codes when true (default: false)
 * @param {string}  [opts.current_repo]  - current repo slug (default: 'AO-Cyber-Systems/devflow-claude')
 * @returns {object}
 */
function buildPanelOpts({
  rows = 24,
  cols = 80,
  no_color = false,
  current_repo = 'AO-Cyber-Systems/devflow-claude',
} = {}) {
  return { rows, cols, no_color, current_repo };
}

// ─── buildAwarenessSimple ─────────────────────────────────────────────────────

/**
 * Build a small peer-awareness result (2 branches) with deterministic timestamps.
 * Used by happy-path snapshot tests (default-80x24, default-60x24).
 *
 * @returns {object}
 */
function buildAwarenessSimple() {
  return {
    branches: [
      {
        branch: 'feature/v1.1-obj-7',
        objective: 'Roadmap reconciliation',
        trd: '07-02',
        github_issue: '16',
        last_commit: {
          sha: 'abc1234',
          timestamp: '2026-05-03T14:22:00Z',
          subject: 'feat: reconcile drift',
        },
        developer: 'mark',
      },
      {
        branch: 'feature/v1.1-obj-8-tui',
        objective: 'Program-aware TUI viewer',
        trd: '08-01',
        github_issue: '17',
        last_commit: {
          sha: 'def5678',
          timestamp: '2026-05-04T08:31:00Z',
          subject: 'test: snapshot RED for renderer',
        },
        developer: 'mark',
      },
    ],
    fetched_at: '2026-05-04T10:00:00Z',
    warnings: [],
    current_branch: 'feature/v1.1-obj-8-tui',
  };
}

// ─── buildAwarenessEmpty ──────────────────────────────────────────────────────

/**
 * Build an empty peer-awareness result (0 branches).
 * Used by resilience snapshot tests (empty-peer, all-empty).
 *
 * @returns {object}
 */
function buildAwarenessEmpty() {
  return {
    branches: [],
    fetched_at: '2026-05-04T10:00:00Z',
    warnings: [],
    current_branch: null,
  };
}

// ─── buildInitiativesSimple ───────────────────────────────────────────────────

/**
 * Build a 2-initiative array with deterministic data.
 * Used by happy-path snapshot tests.
 *
 * @returns {Array}
 */
function buildInitiativesSimple() {
  return [
    {
      slug: 'devflow-internal-alpha-q2-2026',
      github_issue: '30',
      key_repos: ['AO-Cyber-Systems/devflow', 'AO-Cyber-Systems/devflow-claude'],
      why: 'Ship a workable internal alpha by end of Q2 2026 so AO-Cyber-Systems devs can dogfood DevFlow.',
      questions: ['Should the alpha include the Hub Flutter app?', 'Do we gate on PTY support or ship without?'],
      sub_issues: ['#9', '#10'],
      updated_at: '2026-05-04T09:15:00Z',
    },
    {
      slug: 'cross-repo-coordination-substrate',
      github_issue: '31',
      key_repos: ['AO-Cyber-Systems/devflow-claude'],
      why: 'GitHub Issues + Projects v2 + sub-issues becomes the org coordination substrate.',
      questions: [],
      sub_issues: [],
      updated_at: '2026-05-03T18:00:00Z',
    },
  ];
}

// ─── buildInitiativesEmpty ────────────────────────────────────────────────────

/**
 * Build an empty initiatives array.
 * Used by resilience snapshot tests (empty-initiatives, all-empty).
 *
 * @returns {Array}
 */
function buildInitiativesEmpty() {
  return [];
}

// ─── buildOrgChainSimple ──────────────────────────────────────────────────────

/**
 * Build a 2-product orgChain with Q2-2026 items.
 * Used by happy-path snapshot tests.
 * Shape: { [product]: { [quarter]: [{ title, github_issue, status, sub_issues_source }] } }
 *
 * @returns {object}
 */
function buildOrgChainSimple() {
  return {
    'devflow-claude': {
      'Q2 2026': [
        {
          title: 'v1.1 Coordination Layer',
          github_issue: '9',
          status: 'In Progress',
          sub_issues_source: 'tracked_issues',
        },
        {
          title: 'Refine kind/work defaults',
          github_issue: '20',
          status: 'Done',
          sub_issues_source: 'task_list',
        },
      ],
    },
    'devflow': {
      'Q2 2026': [
        {
          title: 'Internal Alpha',
          github_issue: '30',
          status: 'In Progress',
          sub_issues_source: 'tracked_issues',
        },
      ],
    },
  };
}

// ─── buildOrgChainEmpty ───────────────────────────────────────────────────────

/**
 * Build an empty orgChain.
 * Used by resilience snapshot tests (empty-org, all-empty).
 *
 * @returns {object}
 */
function buildOrgChainEmpty() {
  return {};
}

// ─── buildTuiAggregate ────────────────────────────────────────────────────────

/**
 * Build a complete TUI aggregate object (the shape passed to render()).
 * Composes buildAwarenessSimple(), buildInitiativesSimple(), buildOrgChainSimple(), buildPanelOpts().
 *
 * @param {object} opts
 * @param {number}  [opts.rows]             - terminal rows (default: 24)
 * @param {number}  [opts.cols]             - terminal cols (default: 80)
 * @param {boolean} [opts.no_color]         - strip FG colors when true (default: false)
 * @param {number}  [opts.many_branches]    - pad awareness with N synthetic branches (default: 0)
 * @param {number}  [opts.many_initiatives] - pad initiatives with N synthetic entries (default: 0)
 * @returns {object} { awareness, initiatives, orgChain, todos, opts }
 */
function buildTuiAggregate({
  rows = 24,
  cols = 80,
  no_color = false,
  many_branches = 0,
  many_initiatives = 0,
} = {}) {
  const awareness = buildAwarenessSimple();

  if (many_branches > 0) {
    // Pad with deterministic synthetic branches — same shape as buildAwarenessSimple entries.
    for (let i = 0; i < many_branches; i++) {
      awareness.branches.push({
        branch: `feature/synthetic-${i}`,
        objective: `Synthetic objective ${i}`,
        trd: `99-${String(i).padStart(2, '0')}`,
        github_issue: String(100 + i),
        last_commit: {
          sha: 'aaaa' + String(i).padStart(4, '0'),
          timestamp: '2026-05-02T10:00:00Z',
          subject: `chore: synthetic commit ${i}`,
        },
        developer: 'mark',
      });
    }
  }

  let initiatives = buildInitiativesSimple();

  if (many_initiatives > 0) {
    for (let i = 0; i < many_initiatives; i++) {
      initiatives.push({
        slug: `synthetic-initiative-${i}`,
        github_issue: String(200 + i),
        key_repos: ['AO-Cyber-Systems/devflow-claude'],
        why: `Synthetic why ${i}`,
        questions: [],
        sub_issues: [],
        updated_at: '2026-05-01T10:00:00Z',
      });
    }
  }

  return {
    awareness,
    initiatives,
    orgChain: buildOrgChainSimple(),
    todos: null,
    opts: buildPanelOpts({ rows, cols, no_color }),
  };
}

// ─── buildAdversarialAggregate ────────────────────────────────────────────────

/**
 * Build an aggregate with adversarial inputs:
 *   - Emoji in branch name + multibyte characters in objective
 *   - Very long strings (200+ chars in branch name + objective + commit)
 *   - Embedded ANSI escape sequence in orgChain title (should be sanitized by renderer)
 *   - Long initiative Why text (2003 chars total: emoji + 'C'.repeat(2000))
 *
 * Used by unicode-text snapshot test.
 *
 * NOTE on the embedded ANSI entry: the string contains literal backslash+x1b, NOT real ESC bytes.
 * The renderer receives real ESC bytes (0x1b) in the title field, which it must sanitize.
 * This tests that user-supplied escape codes cannot inject ANSI sequences into the output.
 *
 * @returns {object}
 */
function buildAdversarialAggregate() {
  return {
    awareness: {
      branches: [
        {
          branch: 'feature/🚀-emoji-name',
          objective: '日本語 objective',
          trd: '01-01',
          github_issue: '1',
          last_commit: {
            sha: 'utf8utf',
            timestamp: '2026-05-04T00:00:00Z',
            subject: 'feat: 日本語 commit message with emoji 🎉',
          },
          developer: 'mark',
        },
        {
          branch: 'feature/very-long-branch-name-that-overflows-80-cols-in-most-terminals',
          objective: 'A'.repeat(200),
          trd: '02-02',
          github_issue: '2',
          last_commit: {
            sha: 'longlng',
            timestamp: '2026-05-04T00:00:00Z',
            subject: 'B'.repeat(200),
          },
          developer: 'mark',
        },
      ],
      fetched_at: '2026-05-04T10:00:00Z',
      warnings: [],
      current_branch: 'feature/🚀-emoji-name',
    },
    initiatives: [
      {
        slug: 'unicode-slug-日本',
        github_issue: '99',
        key_repos: [],
        why: '🚀 ' + 'C'.repeat(2000),
        questions: [],
        sub_issues: [],
        updated_at: '2026-05-04T00:00:00Z',
      },
    ],
    orgChain: {
      'unicode-product-⭐': {
        'Q2 2026': [
          {
            title: 'Embedded ANSI \x1bfake color attack',
            github_issue: '500',
            status: 'Open',
            sub_issues_source: 'none',
          },
        ],
      },
    },
    todos: null,
    opts: buildPanelOpts({ rows: 24, cols: 80, no_color: false }),
  };
}

// ─── exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildPanelOpts,
  buildAwarenessSimple,
  buildAwarenessEmpty,
  buildInitiativesSimple,
  buildInitiativesEmpty,
  buildOrgChainSimple,
  buildOrgChainEmpty,
  buildTuiAggregate,
  buildAdversarialAggregate,
};
