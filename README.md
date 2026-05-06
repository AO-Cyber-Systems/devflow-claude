<div align="center">

# DEVFLOW

**A meta-prompting, context engineering and spec-driven development system for Claude Code.**

**Solves context rot — the quality degradation that happens as Claude fills its context window.**

[![GitHub Package](https://img.shields.io/github/v/release/AO-Cyber-Systems/devflow-claude?style=for-the-badge&logo=github&logoColor=white&color=24292e)](https://github.com/AO-Cyber-Systems/devflow-claude/packages)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```
/plugin marketplace add AO-Cyber-Systems/devflow-claude
/plugin install devflow@aocyber
```

**Works on Mac, Windows, and Linux. Installs via Claude Code's `/plugin` command or the Claude Desktop plugin UI.**

<br>

[How It Works](#how-it-works) · [Commands](#commands) · [Why It Works](#why-it-works) · [User Guide](docs/USER-GUIDE.md)

</div>

---

## About

DevFlow is a fork of [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) v1.20.4, rebranded and maintained by **AO Cyber Systems**. Full credit to the original GSD project and its creator for the architecture and workflow design.

The complexity is in the system, not in your workflow. Behind the scenes: context engineering, XML prompt formatting, subagent orchestration, state management. What you see: a few commands that just work.

### What's new in 1.28 / 1.29

- **Skill enforcement hooks** — `route-intent` injects skill suggestions on every prompt; `gate-commits` blocks raw `git commit` and forces atomic per-task commits via `df-tools`; `gate-edits` warns when editing code outside an executor while an objective is in progress. Hard gates with documented escape hatches (`DEVFLOW_ALLOW_RAW_COMMIT=1`, `DEVFLOW_STRICT_EDITS=1`).
- **Backend-aware functional verification** — verifier Step 8 now selects between Playwright MCP (web) and Maestro MCP (Flutter) based on stack. Web path adds three reliability fixes (curl readiness probe, `browser_wait_for` landmark, seeded `storageState`). Flutter flows live as YAML at `.planning/objectives/<obj>/verification/`.
- **Confidence-tagged findings** — `codebase-mapper` and `security-auditor` now require `Confidence: VERIFIED | SUSPECTED` on every concern; downstream planners only act on VERIFIED.
- **GitHub integration** (opt-in) — `df-tools gh sync-objectives` mirrors the roadmap to GitHub issues + a milestone, `gh comment` posts verification gaps, `gh sync-release` generates rich release notes from SUMMARY files. New `/devflow:gh-sync` skill for manual fire. One-way push; planning files stay authoritative.
- **CHANGELOG enforcement** — `df-tools changelog update --version vX.Y.Z` auto-generates Keep-a-Changelog entries from git log, grouped by conventional-commit type. The `changelog-on-tag` hook blocks `git tag -a vX.Y.Z` until CHANGELOG has an entry for that version.

See [CHANGELOG.md](./CHANGELOG.md) for full history.

---

## Who This Is For

People who want to describe what they want and have it built correctly — without pretending they're running a 50-person engineering org.

---

## Getting Started

In Claude Code:

```
/plugin marketplace add AO-Cyber-Systems/devflow-claude
/plugin install devflow@aocyber
```

Or install via the Claude Desktop plugin UI: open the plugins panel, add the `AO-Cyber-Systems/devflow-claude` marketplace, then install the `devflow` plugin.

The plugin auto-registers its skills, agents, hooks, and statusline. Verify with `/devflow:help` in Claude Code.

### Staying Updated

```
/plugin update devflow@aocyber
```

Or use the Claude Desktop UI to check for and apply updates.

<details>
<summary><strong>Migrating from a previous npm install</strong></summary>

If you previously installed DevFlow via `npx @ao-cyber-systems/devflow-cc`, the legacy hook registrations and files in `~/.claude/hooks/` and `~/.claude/settings.json` will conflict with the plugin-managed installation. Clean up before installing the plugin:

```bash
# Remove legacy DevFlow hook files
rm -f ~/.claude/hooks/df-*.js ~/.claude/hooks/check-update.js \
      ~/.claude/hooks/statusline.js ~/.claude/hooks/verify-completion.js \
      ~/.claude/hooks/verify-commits.js ~/.claude/hooks/route-intent.js \
      ~/.claude/hooks/gate-commits.js ~/.claude/hooks/gate-edits.js \
      ~/.claude/hooks/changelog-on-tag.js
```

Then open `~/.claude/settings.json` and remove any `hooks` entries pointing at `~/.claude/hooks/df-*.js` or the unprefixed names above, plus the `statusLine` block if it references one of those paths. The plugin will re-register everything automatically on first session start.

The plugin keeps the runtime at `~/.claude/devflow/` (mirrored from the plugin source on each session start). You don't need to remove that directory — it gets refreshed.

</details>

<details>
<summary><strong>Development Installation</strong></summary>

Clone the repository and add it as a local marketplace:

```bash
git clone https://github.com/AO-Cyber-Systems/devflow-claude.git
```

In Claude Code:

```
/plugin marketplace add /absolute/path/to/devflow-claude
/plugin install devflow@aocyber
```

</details>

### Recommended: Skip Permissions Mode

DevFlow is designed for frictionless automation. Run Claude Code with:

```bash
claude --dangerously-skip-permissions
```

> [!TIP]
> This is how DevFlow is intended to be used — stopping to approve `date` and `git commit` 50 times defeats the purpose.

<details>
<summary><strong>Alternative: Granular Permissions</strong></summary>

If you prefer not to use that flag, add this to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(date:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(wc:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(sort:*)",
      "Bash(grep:*)",
      "Bash(tr:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status:*)",
      "Bash(git log:*)",
      "Bash(git diff:*)",
      "Bash(git tag:*)"
    ]
  }
}
```

</details>

### Recommended: CLAUDE.md Routing Hint

The plugin's `route-intent` hook only fires inside directories containing `.planning/`. For greenfield work or projects you haven't initialized yet, add a short routing hint to a CLAUDE.md so Claude reaches for DevFlow skills instead of editing files directly.

<details>
<summary><strong>Global hint — <code>~/.claude/CLAUDE.md</code></strong></summary>

Applies to every directory. Use this if you want DevFlow nudges everywhere, including projects that don't have `.planning/` yet.

```markdown
# DevFlow Routing

The DevFlow plugin (`devflow@aocyber`) is installed. When the user's request fits a DevFlow workflow, invoke the matching skill via the Skill tool instead of editing files directly.

- Building a feature end-to-end → `/devflow:build`
- Planning before building → `/devflow:plan-objective`
- Executing a planned objective → `/devflow:execute-objective`
- Verifying / UAT → `/devflow:verify-work`
- Debugging a bug → `/devflow:debug`
- Quick ad-hoc task with atomic commits → `/devflow:quick`
- New project setup → `/devflow:new-project`
- Resume / status / progress → `/devflow:resume-work`, `/devflow:progress`

Skills enforce atomic commits, state tracking, and verification. Bypassing them causes drift. Run `/devflow:help` to list all commands.
```

</details>

<details>
<summary><strong>Project hint — <code>./CLAUDE.md</code> (recommended)</strong></summary>

Add to a project that uses DevFlow. Stronger and more specific than the global hint — drop it in the repo root next to `.planning/`.

```markdown
# Project Conventions

This project uses DevFlow (`devflow@aocyber`). Planning state lives in `.planning/`.

**Always route through DevFlow skills** for non-trivial work — do not edit code directly when a skill applies:

- `/devflow:build` — feature end-to-end (plan → execute → verify)
- `/devflow:plan-objective <N>` / `/devflow:execute-objective <N>` / `/devflow:verify-work <N>` — staged workflow
- `/devflow:quick` — small / ad-hoc tasks (still gets atomic commits + state)
- `/devflow:debug` — bugs and errors
- `/devflow:resume-work` — pick up where the last session left off

Skills enforce atomic per-task commits, state tracking, and verification gates. Bypassing them breaks the audit trail and trips the `gate-commits` / `gate-edits` hooks. If a request is genuinely out-of-scope for any skill (e.g. a one-line typo fix), proceed directly — otherwise prefer `/devflow:quick`.
```

</details>

---

## How It Works

> **Already have code?** Run `/devflow:map-codebase` first. It spawns parallel agents to analyze your stack, architecture, conventions, and concerns. Then `/devflow:new-project` knows your codebase — questions focus on what you're adding, and planning automatically loads your patterns.

### 1. Initialize Project

```
/devflow:new-project
```

One command, one flow. The system:

1. **Questions** — Asks until it understands your idea completely (goals, constraints, tech preferences, edge cases)
2. **Research** — Spawns parallel agents to investigate the domain (optional but recommended)
3. **Requirements** — Extracts what's v1, v2, and out of scope
4. **Roadmap** — Creates objectives mapped to requirements

You approve the roadmap. Now you're ready to build.

**Creates:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `.planning/research/`

---

### 2. Discuss Objective

```
/devflow:discuss-objective 1
```

**This is where you shape the implementation.**

Your roadmap has a sentence or two per objective. That's not enough context to build something the way *you* imagine it. This step captures your preferences before anything gets researched or planned.

The system analyzes the objective and identifies gray areas based on what's being built:

- **Visual features** → Layout, density, interactions, empty states
- **APIs/CLIs** → Response format, flags, error handling, verbosity
- **Content systems** → Structure, tone, depth, flow
- **Organization tasks** → Grouping criteria, naming, duplicates, exceptions

For each area you select, it asks until you're satisfied. The output — `CONTEXT.md` — feeds directly into the next two steps:

1. **Researcher reads it** — Knows what patterns to investigate ("user wants card layout" → research card component libraries)
2. **Planner reads it** — Knows what decisions are locked ("infinite scroll decided" → plan includes scroll handling)

The deeper you go here, the more the system builds what you actually want. Skip it and you get reasonable defaults. Use it and you get *your* vision.

**Creates:** `{objective_num}-CONTEXT.md`

---

### 3. Plan Objective

```
/devflow:plan-objective 1
```

The system:

1. **Researches** — Investigates how to implement this objective, guided by your CONTEXT.md decisions
2. **Plans** — Creates 2-3 atomic task jobs with XML structure
3. **Verifies** — Checks jobs against requirements, loops until they pass

Each job is small enough to execute in a fresh context window. No degradation, no "I'll be more concise now."

**Creates:** `{objective_num}-RESEARCH.md`, `{objective_num}-{N}-JOB.md`

---

### 4. Execute Objective

```
/devflow:execute-objective 1
```

The system:

1. **Runs jobs in waves** — Parallel where possible, sequential when dependent
2. **Fresh context per job** — 200k tokens purely for implementation, zero accumulated garbage
3. **Commits per task** — Every task gets its own atomic commit
4. **Verifies against goals** — Checks the codebase delivers what the objective promised

Walk away, come back to completed work with clean git history.

**How Wave Execution Works:**

Plans are grouped into "waves" based on dependencies. Within each wave, jobs run in parallel. Waves run sequentially.

```
┌─────────────────────────────────────────────────────────────────────┐
│  OBJECTIVE EXECUTION                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  WAVE 1 (parallel)          WAVE 2 (parallel)          WAVE 3       │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Job 01 │ │ Job 02 │ →  │ Job 03 │ │ Job 04 │ →  │ Job 05 │ │
│  │         │ │         │    │         │ │         │    │         │ │
│  │ User    │ │ Product │    │ Orders  │ │ Cart    │    │ Checkout│ │
│  │ Model   │ │ Model   │    │ API     │ │ API     │    │ UI      │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑       │
│       └───────────┴──────────────┴───────────┘              │       │
│              Dependencies: Job 03 needs Job 01            │       │
│                          Job 04 needs Job 02              │       │
│                          Job 05 needs Jobs 03 + 04        │       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why waves matter:**
- Independent jobs → Same wave → Run in parallel
- Dependent jobs → Later wave → Wait for dependencies
- File conflicts → Sequential jobs or same plan

This is why "vertical slices" (Job 01: User feature end-to-end) parallelize better than "horizontal layers" (Job 01: All models, Job 02: All APIs).

**Creates:** `{objective_num}-{N}-SUMMARY.md`, `{objective_num}-VERIFICATION.md`

---

### 5. Verify Work

```
/devflow:verify-work 1
```

**This is where you confirm it actually works.**

Automated verification checks that code exists and tests pass. But does the feature *work* the way you expected? This is your chance to use it.

The system:

1. **Extracts testable deliverables** — What you should be able to do now
2. **Walks you through one at a time** — "Can you log in with email?" Yes/no, or describe what's wrong
3. **Diagnoses failures automatically** — Spawns debug agents to find root causes
4. **Creates verified fix jobs** — Ready for immediate re-execution

If everything passes, you move on. If something's broken, you don't manually debug — you just run `/devflow:execute-objective` again with the fix jobs it created.

**Creates:** `{objective_num}-UAT.md`, fix jobs if issues found

---

### 6. Repeat → Complete → Next Milestone

```
/devflow:discuss-objective 2
/devflow:plan-objective 2
/devflow:execute-objective 2
/devflow:verify-work 2
...
/devflow:complete-milestone
/devflow:new-milestone
```

Loop **discuss → plan → execute → verify** until milestone complete.

Each objective gets your input (discuss), proper research (plan), clean execution (execute), and human verification (verify). Context stays fresh. Quality stays high.

When all objectives are done, `/devflow:complete-milestone` archives the milestone and tags the release.

Then `/devflow:new-milestone` starts the next version — same flow as `new-project` but for your existing codebase. You describe what you want to build next, the system researches the domain, you scope requirements, and it creates a fresh roadmap. Each milestone is a clean cycle: define → build → ship.

---

### Quick Mode

```
/devflow:quick
```

**For ad-hoc tasks that don't need full planning.**

Quick mode gives you DevFlow guarantees (atomic commits, state tracking) with a faster path:

- **Same agents** — Planner + executor, same quality
- **Skips optional steps** — No research, no job checker, no verifier
- **Separate tracking** — Lives in `.planning/quick/`, not objectives

Use for: bug fixes, small features, config changes, one-off tasks.

```
/devflow:quick
> What do you want to do? "Add dark mode toggle to settings"
```

**Creates:** `.planning/quick/001-add-dark-mode-toggle/JOB.md`, `SUMMARY.md`

---

## Why It Works

### Context Engineering

Claude Code is incredibly powerful *if* you give it the context it needs. Most people don't.

DevFlow handles it for you:

| File | What it does |
|------|--------------|
| `PROJECT.md` | Project vision, always loaded |
| `research/` | Ecosystem knowledge (stack, features, architecture, pitfalls) |
| `REQUIREMENTS.md` | Scoped v1/v2 requirements with objective traceability |
| `ROADMAP.md` | Where you're going, what's done |
| `STATE.md` | Decisions, blockers, position — memory across sessions |
| `JOB.md` | Atomic task with XML structure, verification steps |
| `SUMMARY.md` | What happened, what changed, committed to history |
| `todos/` | Captured ideas and tasks for later work |

Size limits based on where Claude's quality degrades. Stay under, get consistent excellence.

### XML Prompt Formatting

Every job is structured XML optimized for Claude:

```xml
<task type="auto">
  <name>Create login endpoint</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    Use jose for JWT (not jsonwebtoken - CommonJS issues).
    Validate credentials against users table.
    Return httpOnly cookie on success.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 + Set-Cookie</verify>
  <done>Valid credentials return cookie, invalid return 401</done>
</task>
```

Precise instructions. No guessing. Verification built in.

### Multi-Agent Orchestration

Every stage uses the same pattern: a thin orchestrator spawns specialized agents, collects results, and routes to the next step.

| Stage | Orchestrator does | Agents do |
|-------|------------------|-----------|
| Research | Coordinates, presents findings | 4 parallel researchers investigate stack, features, architecture, pitfalls |
| Planning | Validates, manages iteration | Planner creates jobs, checker verifies, loop until pass |
| Execution | Groups into waves, tracks progress | Executors implement in parallel, each with fresh 200k context |
| Verification | Presents results, routes next | Verifier checks codebase against goals, debuggers diagnose failures |

The orchestrator never does heavy lifting. It spawns agents, waits, integrates results.

**The result:** You can run an entire objective — deep research, multiple jobs created and verified, thousands of lines of code written across parallel executors, automated verification against goals — and your main context window stays at 30-40%. The work happens in fresh subagent contexts. Your session stays fast and responsive.

### Atomic Git Commits

Each task gets its own commit immediately after completion:

```bash
abc123f docs(08-02): complete user registration job
def456g feat(08-02): add email confirmation flow
hij789k feat(08-02): implement password hashing
lmn012o feat(08-02): create registration endpoint
```

> [!NOTE]
> **Benefits:** Git bisect finds exact failing task. Each task independently revertable. Clear history for Claude in future sessions. Better observability in AI-automated workflow.

Every commit is surgical, traceable, and meaningful.

### Modular by Design

- Add objectives to current milestone
- Insert urgent work between objectives
- Complete milestones and start fresh
- Adjust jobs without rebuilding everything

You're never locked in. The system adapts.

---

## Commands

### Core Workflow

| Command | What it does |
|---------|--------------|
| `/devflow:new-project [--auto]` | Full initialization: questions → research → requirements → roadmap |
| `/devflow:discuss-objective [N] [--auto]` | Capture implementation decisions before planning |
| `/devflow:plan-objective [N] [--auto]` | Research + plan + verify for a objective |
| `/devflow:execute-objective <N>` | Execute all jobs in parallel waves, verify when complete |
| `/devflow:verify-work [N]` | Manual user acceptance testing |
| `/devflow:audit-milestone` | Verify milestone achieved its definition of done |
| `/devflow:complete-milestone` | Archive milestone, tag release |
| `/devflow:new-milestone [name]` | Start next version: questions → research → requirements → roadmap |

### Navigation

| Command | What it does |
|---------|--------------|
| `/devflow:progress` | Where am I? What's next? |
| `/devflow:help` | Show all commands and usage guide |
| `/devflow:update` | Update DevFlow with changelog preview |

### Brownfield

| Command | What it does |
|---------|--------------|
| `/devflow:map-codebase` | Analyze existing codebase before new-project |

### Roadmap & Milestone Management

| Command | What it does |
|---------|--------------|
| `/devflow:objective <add\|remove>` | Add or remove objectives in current milestone roadmap |
| `/devflow:milestone <new\|audit\|complete\|gaps>` | Manage milestones from start to archive |
| `/devflow:list-objective-assumptions [N]` | See Claude's intended approach before planning |

### Parallel Workstreams

| Command | What it does |
|---------|--------------|
| `/devflow:workstreams <setup\|status\|merge\|run>` | Parallel feature development via git worktrees |

### Status & Session

| Command | What it does |
|---------|--------------|
| `/devflow:status [check\|pause\|resume]` | Project status, health, save/resume work |

### Todo Management

| Command | What it does |
|---------|--------------|
| `/devflow:todo <add\|list>` | Capture ideas for later / morning standup view |

### Utilities

| Command | What it does |
|---------|--------------|
| `/devflow:settings` | Configure model profile and workflow agents |
| `/devflow:set-profile <profile>` | Switch model profile (quality/balanced/budget) |
| `/devflow:debug [desc]` | Systematic debugging with persistent state |
| `/devflow:quick [--full]` | Execute ad-hoc task with DevFlow guarantees (`--full` adds job-checking and verification) |

> **13 legacy skill names** (`/devflow:add-objective`, `/devflow:progress`, `/devflow:health`, `/devflow:pause-work`, `/devflow:resume-work`, `/devflow:add-todo`, `/devflow:check-todos`, and 6 milestone/objective variants) still work as deprecation redirects. Run `/devflow:help` for the full deprecation map.

---

## Configuration

DevFlow stores project settings in `.planning/config.json`. Configure during `/devflow:new-project` or update later with `/devflow:settings`. For the full config schema, workflow toggles, git branching options, and per-agent model breakdown, see the [User Guide](docs/USER-GUIDE.md#configuration-reference).

### Project Intent: `kind` and `work`

Two enumerated fields drive how DevFlow plans every objective:

- **`kind`** (PROJECT.md frontmatter, required) — what the project IS:
  - `api` · backend API/service consumed by clients
  - `app` · end-user application (web, mobile, desktop)
  - `library` · code consumed by other code via API
  - `ui-lib` · UI components consumed by other apps
  - `cli` · command-line tool consumed by humans in a terminal
  - `plugin` · extends a host system via plugin contract

- **`work`** (OBJECTIVE.md frontmatter, optional) — what the objective DOES:
  - `feature` · net-new behavior
  - `port` · re-implement existing behavior on a new substrate (source IS the spec)
  - `refactor` · restructure without changing user-facing behavior
  - `foundation` · scaffolding the rest of the project depends on
  - `bugfix` · fix specific known issues
  - `prototype` · exploratory throwaway code
  - `spike` · research; output is learning, not code

The planner combines them into a `(kind, work)` lookup that derives TDD posture, planning depth, model profile, and verification rigor automatically. Set `default_work` in PROJECT.md to inherit a default for every objective (e.g., a Rails→Go port project sets `default_work: port`); the planner is louder about inherited values so silent inheritance can't mask a wrong default.

**Override at four levels** (highest wins): TRD frontmatter > `OBJECTIVE.md overrides` block > `~/.claude/CLAUDE.md` or `./CLAUDE.md` user playbook directives > the defaults table. One-shot overrides via skill flags: `--work TYPE`, `--tdd POSTURE`, `--depth LEVEL`, `--model PROFILE` on `/devflow:plan-objective` and `/devflow:build`.

**Migrating an existing project**: `/devflow:health --migrate` walks you through setting `kind` and (optionally) per-objective `work` for projects created before this model. Always backs up before writing.

See `docs/PROPOSAL-kind-and-work.md` for the full design and `plugins/devflow/devflow/references/defaults-table.md` for the 42-cell defaults lookup.

### Core Settings

| Setting | Options | Default | What it controls |
|---------|---------|---------|------------------|
| `mode` | `yolo`, `interactive` | `interactive` | Auto-approve vs confirm at each step |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Planning thoroughness (objectives x jobs) |

### Model Profiles

Control which Claude model each agent uses. Balance quality vs token spend.

| Profile | Planning | Execution | Verification |
|---------|----------|-----------|--------------|
| `quality` | Opus | Opus | Sonnet |
| `balanced` (default) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |

Switch profiles:
```
/devflow:set-profile budget
```

Or configure via `/devflow:settings`.

### Workflow Agents

These spawn additional agents during planning/execution. They improve quality but add tokens and time.

| Setting | Default | What it does |
|---------|---------|--------------|
| `workflow.research` | `true` | Researches domain before planning each objective |
| `workflow.job_check` | `true` | Verifies jobs achieve objective goals before execution |
| `workflow.verifier` | `true` | Confirms must-haves were delivered after execution |
| `workflow.auto_advance` | `false` | Auto-chain discuss → plan → execute without stopping |

Use `/devflow:settings` to toggle these, or override per-invocation:
- `/devflow:plan-objective --skip-research`
- `/devflow:plan-objective --skip-verify`

### Execution

| Setting | Default | What it controls |
|---------|---------|------------------|
| `parallelization.enabled` | `true` | Run independent jobs simultaneously |
| `planning.commit_docs` | `true` | Track `.planning/` in git |

### Git Branching

Control how DevFlow handles branches during execution.

| Setting | Options | Default | What it does |
|---------|---------|---------|--------------|
| `git.branching_strategy` | `none`, `objective`, `milestone` | `none` | Branch creation strategy |
| `git.objective_branch_template` | string | `df/objective-{objective}-{slug}` | Template for objective branches |
| `git.milestone_branch_template` | string | `df/{milestone}-{slug}` | Template for milestone branches |

**Strategies:**
- **`none`** — Commits to current branch (default behavior)
- **`objective`** — Creates a branch per objective, merges at objective completion
- **`milestone`** — Creates one branch for entire milestone, merges at completion

At milestone completion, DevFlow offers squash merge (recommended) or merge with history.

---

## Security

### Protecting Sensitive Files

DevFlow's codebase mapping and analysis commands read files to understand your project. **Protect files containing secrets** by adding them to Claude Code's deny list:

1. Open Claude Code settings (`.claude/settings.json` or global)
2. Add sensitive file patterns to the deny list:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

This prevents Claude from reading these files entirely, regardless of what commands you run.

> [!IMPORTANT]
> DevFlow includes built-in protections against committing secrets, but defense-in-depth is best practice. Deny read access to sensitive files as a first line of defense.

---

## Troubleshooting

**Commands not found after install?**
- Restart Claude Code to reload the plugin
- Verify the plugin is enabled with `/plugin list`
- Run `/devflow:help` to confirm skills are loaded

**Hooks or statusline not firing?**
- Check `~/.claude/devflow/.plugin-version` exists (proves the SessionStart sync hook ran)
- If you previously installed via npm, remove stale entries from `~/.claude/settings.json` (see migration note in Getting Started)

**Updating to the latest version?**
```
/plugin update devflow@aocyber
```

### Uninstalling

In Claude Code:

```
/plugin uninstall devflow@aocyber
```

The plugin's skills, agents, hooks, and statusline are removed automatically. The mirrored runtime at `~/.claude/devflow/` is left in place — remove manually if you want to clean it up:

```bash
rm -rf ~/.claude/devflow
```

---

## Attribution

DevFlow is a fork of [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) v1.20.4 by [TÂCHES](https://github.com/glittercowboy). The original project's architecture, workflow design, and agent system form the foundation of DevFlow. Released under the MIT License.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Claude Code is powerful. DevFlow makes it reliable.**

</div>
