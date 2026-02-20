<div align="center">

# DEVFLOW

**A meta-prompting, context engineering and spec-driven development system for Claude Code.**

**Solves context rot — the quality degradation that happens as Claude fills its context window.**

[![GitHub Package](https://img.shields.io/github/v/release/AO-Cyber-Systems/devflow-claude?style=for-the-badge&logo=github&logoColor=white&color=24292e)](https://github.com/AO-Cyber-Systems/devflow-claude/packages)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx @ao-cyber-systems/devflow-cc@latest
```

**Works on Mac, Windows, and Linux.**

<br>

[How It Works](#how-it-works) · [Commands](#commands) · [Why It Works](#why-it-works) · [User Guide](docs/USER-GUIDE.md)

</div>

---

## About

DevFlow is a fork of [GSD (Get Shit Done)](https://github.com/gsd-build/get-shit-done) v1.20.4, rebranded and maintained by **AO Cyber Systems**. Full credit to the original GSD project and its creator for the architecture and workflow design.

The complexity is in the system, not in your workflow. Behind the scenes: context engineering, XML prompt formatting, subagent orchestration, state management. What you see: a few commands that just work.

---

## Who This Is For

People who want to describe what they want and have it built correctly — without pretending they're running a 50-person engineering org.

---

## Getting Started

```bash
npx @ao-cyber-systems/devflow-cc@latest
```

The installer prompts you to choose:
1. **Location** — Global (all projects) or local (current project only)

Verify with `/df:help` in Claude Code.

### Staying Updated

DevFlow evolves fast. Update periodically:

```bash
npx @ao-cyber-systems/devflow-cc@latest
```

<details>
<summary><strong>Non-interactive Install (Docker, CI, Scripts)</strong></summary>

```bash
npx devflow-cc --global   # Install to ~/.claude/
npx devflow-cc --local    # Install to ./.claude/
```

Use `--global` (`-g`) or `--local` (`-l`) to skip the location prompt.

</details>

<details>
<summary><strong>Development Installation</strong></summary>

Clone the repository and run the installer locally:

```bash
git clone https://github.com/AO-Cyber-Systems/devflow-claude.git
cd devflow-claude
node bin/install.js --local
```

Installs to `./.claude/` for testing modifications before contributing.

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

---

## How It Works

> **Already have code?** Run `/df:map-codebase` first. It spawns parallel agents to analyze your stack, architecture, conventions, and concerns. Then `/df:new-project` knows your codebase — questions focus on what you're adding, and planning automatically loads your patterns.

### 1. Initialize Project

```
/df:new-project
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
/df:discuss-objective 1
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
/df:plan-objective 1
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
/df:execute-objective 1
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
/df:verify-work 1
```

**This is where you confirm it actually works.**

Automated verification checks that code exists and tests pass. But does the feature *work* the way you expected? This is your chance to use it.

The system:

1. **Extracts testable deliverables** — What you should be able to do now
2. **Walks you through one at a time** — "Can you log in with email?" Yes/no, or describe what's wrong
3. **Diagnoses failures automatically** — Spawns debug agents to find root causes
4. **Creates verified fix jobs** — Ready for immediate re-execution

If everything passes, you move on. If something's broken, you don't manually debug — you just run `/df:execute-objective` again with the fix jobs it created.

**Creates:** `{objective_num}-UAT.md`, fix jobs if issues found

---

### 6. Repeat → Complete → Next Milestone

```
/df:discuss-objective 2
/df:plan-objective 2
/df:execute-objective 2
/df:verify-work 2
...
/df:complete-milestone
/df:new-milestone
```

Loop **discuss → plan → execute → verify** until milestone complete.

Each objective gets your input (discuss), proper research (plan), clean execution (execute), and human verification (verify). Context stays fresh. Quality stays high.

When all objectives are done, `/df:complete-milestone` archives the milestone and tags the release.

Then `/df:new-milestone` starts the next version — same flow as `new-project` but for your existing codebase. You describe what you want to build next, the system researches the domain, you scope requirements, and it creates a fresh roadmap. Each milestone is a clean cycle: define → build → ship.

---

### Quick Mode

```
/df:quick
```

**For ad-hoc tasks that don't need full planning.**

Quick mode gives you DevFlow guarantees (atomic commits, state tracking) with a faster path:

- **Same agents** — Planner + executor, same quality
- **Skips optional steps** — No research, no job checker, no verifier
- **Separate tracking** — Lives in `.planning/quick/`, not objectives

Use for: bug fixes, small features, config changes, one-off tasks.

```
/df:quick
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
| `/df:new-project [--auto]` | Full initialization: questions → research → requirements → roadmap |
| `/df:discuss-objective [N] [--auto]` | Capture implementation decisions before planning |
| `/df:plan-objective [N] [--auto]` | Research + plan + verify for a objective |
| `/df:execute-objective <N>` | Execute all jobs in parallel waves, verify when complete |
| `/df:verify-work [N]` | Manual user acceptance testing |
| `/df:audit-milestone` | Verify milestone achieved its definition of done |
| `/df:complete-milestone` | Archive milestone, tag release |
| `/df:new-milestone [name]` | Start next version: questions → research → requirements → roadmap |

### Navigation

| Command | What it does |
|---------|--------------|
| `/df:progress` | Where am I? What's next? |
| `/df:help` | Show all commands and usage guide |
| `/df:update` | Update DevFlow with changelog preview |

### Brownfield

| Command | What it does |
|---------|--------------|
| `/df:map-codebase` | Analyze existing codebase before new-project |

### Objective Management

| Command | What it does |
|---------|--------------|
| `/df:add-objective` | Append objective to roadmap |
| `/df:insert-objective [N]` | Insert urgent work between objectives |
| `/df:remove-objective [N]` | Remove future objective, renumber |
| `/df:list-objective-assumptions [N]` | See Claude's intended approach before planning |
| `/df:plan-milestone-gaps` | Create objectives to close gaps from audit |

### Session

| Command | What it does |
|---------|--------------|
| `/df:pause-work` | Create handoff when stopping mid-objective |
| `/df:resume-work` | Restore from last session |

### Utilities

| Command | What it does |
|---------|--------------|
| `/df:settings` | Configure model profile and workflow agents |
| `/df:set-profile <profile>` | Switch model profile (quality/balanced/budget) |
| `/df:add-todo [desc]` | Capture idea for later |
| `/df:check-todos` | List pending todos |
| `/df:debug [desc]` | Systematic debugging with persistent state |
| `/df:quick [--full]` | Execute ad-hoc task with DevFlow guarantees (`--full` adds job-checking and verification) |
| `/df:health [--repair]` | Validate `.planning/` directory integrity, auto-repair with `--repair` |

---

## Configuration

DevFlow stores project settings in `.planning/config.json`. Configure during `/df:new-project` or update later with `/df:settings`. For the full config schema, workflow toggles, git branching options, and per-agent model breakdown, see the [User Guide](docs/USER-GUIDE.md#configuration-reference).

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
/df:set-profile budget
```

Or configure via `/df:settings`.

### Workflow Agents

These spawn additional agents during planning/execution. They improve quality but add tokens and time.

| Setting | Default | What it does |
|---------|---------|--------------|
| `workflow.research` | `true` | Researches domain before planning each objective |
| `workflow.job_check` | `true` | Verifies jobs achieve objective goals before execution |
| `workflow.verifier` | `true` | Confirms must-haves were delivered after execution |
| `workflow.auto_advance` | `false` | Auto-chain discuss → plan → execute without stopping |

Use `/df:settings` to toggle these, or override per-invocation:
- `/df:plan-objective --skip-research`
- `/df:plan-objective --skip-verify`

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
- Restart Claude Code to reload skills
- Verify files exist in `~/.claude/skills/df-*/SKILL.md` (global) or `./.claude/skills/df-*/SKILL.md` (local)

**Commands not working as expected?**
- Run `/df:help` to verify installation
- Re-run `npx devflow-cc` to reinstall

**Updating to the latest version?**
```bash
npx @ao-cyber-systems/devflow-cc@latest
```

**Using Docker or containerized environments?**

If file reads fail with tilde paths (`~/.claude/...`), set `CLAUDE_CONFIG_DIR` before installing:
```bash
CLAUDE_CONFIG_DIR=/home/youruser/.claude npx devflow-cc --global
```
This ensures absolute paths are used instead of `~` which may not expand correctly in containers.

### Uninstalling

To remove DevFlow completely:

```bash
# Global install
npx devflow-cc --global --uninstall

# Local install (current project)
npx devflow-cc --local --uninstall
```

This removes all DevFlow skills, agents, hooks, and settings while preserving your other configurations.

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
