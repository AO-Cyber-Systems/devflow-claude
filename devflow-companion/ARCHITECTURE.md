# DevFlow Hub — Architecture Design

**Status:** Design
**Date:** March 15, 2026
**Stack:** Flutter (macOS native) + Rails API (localhost:3100) + SQLite + ActionCable

---

## Product Vision

DevFlow Hub is the local-first control plane for AI-assisted development. It provides knowledge management, agent orchestration visibility, and environment coordination — first for a single developer, eventually for teams.

### Design Principles

1. **Design for Layer 4, build for Layer 1** — schema and API support multi-developer from day one
2. **Flutter owns the machine, Rails owns the state** — Flutter talks directly to local systems (Ollama, brew, git, filesystem). Rails stores history, coordinates teams, and processes events. Hub never sits in the critical path of local development.
3. **MCP is the integration point** — Claude Code sessions connect to Hub via MCP, not just hooks
4. **Events are the source of truth** — everything that happens flows through the event system
5. **Offline-first Flutter** — app works when Rails is down, caches aggressively
6. **Same Flutter, local or hosted** — Flutter always talks directly to local systems and posts summaries to Rails. The only difference between L1 and L4 is whether Rails is on localhost or a team server.

### Responsibility Split: Flutter vs Rails

The Hub should never be in the way of development. The test: **if Rails is restarting, what breaks?** Only team visibility and event processing pause — local development continues uninterrupted.

#### Flutter Owns (Direct to Local Systems)

| Domain | What Flutter Does | Why Direct |
|--------|------------------|------------|
| Local models | Talks to Ollama/MLX on :11434 — pull, start, stop, inference, GPU/VRAM monitoring | Latency-sensitive, works without Rails |
| Service lifecycle | Starts/stops brew services, puma-dev, Redis, Postgres via launchctl/brew | Rails can't manage its own restart |
| Git operations | Reads repo status, diffs, branch info, changeset detection | Purely local filesystem, frequent |
| File watching | Watches `.planning/` for roadmap/objective state changes | Native `dart:io` watcher, no network hop |
| Brew/Mise | Package install, upgrade, list when at desk | Shell commands, no reason to proxy |
| System resources | GPU/VRAM/RAM/disk monitoring | Direct hardware access |

#### Rails Owns (Shared State + Coordination)

| Domain | What Rails Does | Why Rails |
|--------|----------------|-----------|
| Event pipeline | Receives hooks, classifies, auto-responds | Central event processor, needs history |
| MCP server | Serves knowledge, decisions, context to Claude Code sessions | Shared knowledge base |
| Session state | Stores session metadata, work summaries, changesets, metrics | Persistence + team aggregation in L4 |
| AI usage metering | Records token counts, costs, limit tracking | Usage history from hook events, not proxied traffic |
| AI key management | Stores API keys, OAuth tokens, subscription details | Secrets stay server-side |
| Routing rules | Resolves task-type → model mapping | Configuration, not hot-path |
| Knowledge base | Indexes docs, serves search, stores decisions | Shared across sessions (and team in L4) |
| Task board | Kanban items, assignments, conflict detection | Team coordination in L3+ |
| Notifications | Delivery rules, iMessage/push dispatch | Server-side delivery |
| Audit trail | Immutable event + change history | Compliance, team visibility |

#### Remote Operations (Phone/Relay)

When the developer is away from their desk, Rails becomes the executor for operations that Flutter normally handles directly:

| Operation | At Desk (Flutter) | Remote (Rails) |
|-----------|-------------------|----------------|
| Start service | Flutter → launchctl | Phone → Rails → launchctl |
| Pull model | Flutter → Ollama API | Phone → Rails → Ollama API |
| Brew install | Flutter → shell | Phone → Rails → shell |
| Approve event | Flutter → Rails API | Phone → Rails API (same) |

Flutter detects remote mode and delegates to Rails. Rails exposes these as API endpoints regardless, but they're only used remotely in L1-3.

#### Local vs Hosted (L4) Matrix

When Rails moves to a team server, the split stays clean:

```
                        Local (L1-3)           Hosted (L4)
                        ────────────           ───────────
Service lifecycle       Flutter direct          N/A (server has no dev services)
Local models            Flutter → Ollama        Flutter → Ollama (still local)
Git operations          Flutter direct          Flutter direct (still local repos)
File watching           Flutter direct          Flutter direct (still local files)
Brew/Mise               Flutter direct          N/A

Event pipeline          Flutter → Rails         Flutter → Rails (same)
MCP server              Claude → Rails          Claude → Rails (same)
Session state           Flutter → Rails         Flutter → Rails (team-wide)
Knowledge base          Rails                   Rails (shared across team)
Usage metering          Rails                   Rails (team budgets)
Task board              Rails                   Rails (cross-developer)
Conflict detection      Rails                   Rails (cross-developer)
Audit trail             Rails                   Rails (compliance)
```

Flutter doesn't change behavior between modes — it always talks directly to local systems and posts summaries to Rails. The only difference is whether Rails is on `:3100` or `hub.yourcompany.dev`, and what it aggregates.

---

## Layer Roadmap

| Layer | Name | Scope | Key Capability |
|-------|------|-------|----------------|
| 1 | Agent Control Plane | Single developer, multiple sessions | Relay, event pipeline, dev tools, session monitoring |
| 2 | Knowledge & Context | MCP server for Claude sessions | Project knowledge, shared decisions, architecture context |
| 3 | Multi-Developer | Multiple developers' sessions | Conflict detection, shared kanban, team visibility |
| 4 | Hosted Hub | Team server deployment | Shared knowledge, cross-machine coordination |

---

## Data Model

### Core Domain: Identity & Tenancy

```
developers
  id              uuid PK
  name            string NOT NULL
  email           string
  machine_id      string          -- hardware identifier
  ssh_public_key  text            -- for hosted mode auth
  role            string DEFAULT 'developer'  -- developer, admin
  status          string DEFAULT 'active'
  preferences     jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  UNIQUE(email)
  UNIQUE(machine_id)

  Layer: 1 (single row, "me"), 3+ (multiple developers)
```

### Core Domain: Projects

```
projects
  id              integer PK
  name            string NOT NULL
  path            string NOT NULL  -- absolute filesystem path
  notes           text
  framework       string          -- rails, node, python, go, rust, etc.
  default_branch  string DEFAULT 'main'
  git_remote_url  string          -- origin URL
  github_repo     string          -- "owner/repo" (e.g. "AOCyber/trades") for CI integration
  active          boolean DEFAULT false  -- "current project" for this developer
  developer_id    uuid FK -> developers  -- who adopted this project
  metadata        jsonb DEFAULT {}
  last_scanned_at datetime
  created_at      datetime
  updated_at      datetime
  UNIQUE(path, developer_id)

  Layer: 1 (local projects), 3+ (shared project registry)
```

### Core Domain: Agent Sessions

```
agent_sessions
  id              uuid PK
  developer_id    uuid FK -> developers
  project_id      integer FK -> projects (nullable)
  session_key     string NOT NULL UNIQUE  -- hook-generated identifier
  claude_session_id string UNIQUE         -- Claude's internal session ID
  name            string NOT NULL         -- display name
  ide             string                  -- vscode, cursor, terminal, jetbrains
  branch          string
  cwd             string                  -- working directory
  agent           string DEFAULT 'claude-code'  -- claude-code, opencode, etc.
  status          string DEFAULT 'active' NOT NULL  -- active, idle, completed, abandoned
  autonomy_level  string DEFAULT 'assisted' NOT NULL -- supervised, assisted, autonomous
  remote_enabled  boolean DEFAULT false
  imessage_enabled boolean DEFAULT false
  session_color   string                  -- visual identity
  pending_count   integer DEFAULT 0
  last_activity_at datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(status)
  INDEX(developer_id, status)
  INDEX(project_id)

  Layer: 1 (rename from relay_sessions)
  Note: Replaces relay_sessions table. Same data, better name.
```

### Core Domain: Events

```
events
  id              uuid PK
  agent_session_id uuid FK -> agent_sessions
  developer_id    uuid FK -> developers (nullable, for Layer 3+ audit)
  event_type      string NOT NULL  -- action_request, question, status, session_start, session_end, knowledge_query, task_update, conflict_detected
  tool_name       string
  command         string
  classification  string          -- safe, scoped, review, destructive
  decision        string          -- pending, approved, rejected, modified, auto_approved
  decision_reason string
  decided_by      string          -- auto, developer_name, timeout
  decided_at      datetime
  action_data     jsonb DEFAULT {}
  response_data   jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(agent_session_id, decision)
  INDEX(event_type)
  INDEX(classification)
  INDEX(created_at)

  Layer: 1 (relay events), 2 (knowledge queries), 3 (conflict events)
```

### Core Domain: Work Summaries

```
work_summaries
  id              uuid PK
  agent_session_id uuid FK -> agent_sessions
  developer_id    uuid FK -> developers (nullable)
  content         text NOT NULL
  summary_type    string DEFAULT 'stop'  -- stop, checkpoint, milestone, manual
  read            boolean DEFAULT false
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(agent_session_id, read)
  INDEX(created_at)

  Layer: 1
```

### Decision Engine

```
auto_response_logs
  id              uuid PK
  event_id        uuid FK -> events
  agent_session_id uuid FK -> agent_sessions
  classification  string NOT NULL
  autonomy_level  string NOT NULL
  decision        string NOT NULL
  tool_name       string
  command         string
  created_at      datetime
  updated_at      datetime
  INDEX(agent_session_id, created_at)

  Layer: 1

prompt_runs
  id              uuid PK
  agent_session_id uuid FK -> agent_sessions
  developer_id    uuid FK -> developers
  prompt          text NOT NULL
  mode            string DEFAULT 'continue'  -- continue, fresh
  status          string DEFAULT 'queued'    -- queued, running, completed, failed
  pid             integer
  log_path        string
  result          text
  started_at      datetime
  completed_at    datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(status)
  INDEX(agent_session_id)

  Layer: 1

notification_sends
  id              uuid PK
  event_id        uuid FK -> events
  channel         string NOT NULL  -- imessage, web_push, slack, email
  status          string DEFAULT 'pending'  -- pending, sent, delivered, failed
  sent_at         datetime
  delivered_at    datetime
  error_message   text
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(event_id, channel)
  INDEX(status)

  Layer: 1
```

### Knowledge Layer (Layer 2+)

```
knowledge_sources
  id              uuid PK
  project_id      integer FK -> projects (nullable, null = global)
  developer_id    uuid FK -> developers (who added it)
  source_type     string NOT NULL  -- claude_md, adr, doc, web, code_pattern, decision
  title           string NOT NULL
  description     text
  origin_path     string          -- file path or URL
  content_hash    string          -- SHA256 for change detection
  tags            jsonb DEFAULT []
  priority        integer DEFAULT 5  -- 1-10, affects search ranking
  status          string DEFAULT 'active'  -- active, indexing, stale, error
  last_synced_at  datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(project_id)
  INDEX(source_type)
  INDEX(status)

  Layer: 2 (structured docs), future (RAG with vector store)

knowledge_chunks
  id              uuid PK
  knowledge_source_id uuid FK -> knowledge_sources
  content         text NOT NULL
  section_path    string          -- e.g. "## Architecture > ### Database"
  position        integer         -- order within source
  token_count     integer
  has_code        boolean DEFAULT false
  language        string          -- for code chunks
  embedding       blob            -- SQLite blob for local vector (nullable, Layer 2+)
  metadata        jsonb DEFAULT {}
  created_at      datetime
  INDEX(knowledge_source_id, position)
  INDEX(has_code)

  Layer: 2

decisions
  id              uuid PK
  project_id      integer FK -> projects
  developer_id    uuid FK -> developers
  agent_session_id uuid FK -> agent_sessions (nullable)
  title           string NOT NULL
  description     text NOT NULL
  rationale       text
  decision_type   string NOT NULL  -- architecture, library, pattern, convention, scope
  status          string DEFAULT 'active'  -- active, superseded, reverted
  superseded_by   uuid FK -> decisions (nullable)
  tags            jsonb DEFAULT []
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(project_id, status)
  INDEX(decision_type)

  Layer: 2
  Note: Captures "why" decisions that CLAUDE.md files can't — with provenance.
```

### Orchestration Layer (Layer 3+)

```
task_board_items
  id              uuid PK
  project_id      integer FK -> projects
  developer_id    uuid FK -> developers (nullable, unassigned)
  agent_session_id uuid FK -> agent_sessions (nullable)
  title           string NOT NULL
  description     text
  phase           string NOT NULL  -- analysis, implementation, validation, review
  status          string DEFAULT 'backlog'  -- backlog, ready, in_progress, review, done, failed
  priority        string DEFAULT 'medium'   -- critical, high, medium, low
  blocked_by      jsonb DEFAULT []          -- array of task_board_item UUIDs
  tags            jsonb DEFAULT []
  result          text
  claimed_at      datetime
  completed_at    datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(project_id, status)
  INDEX(developer_id)
  INDEX(agent_session_id)

  Layer: 3
  Note: Not the DevFlow planning system (TRDs/JOBs). This is real-time coordination
  for who is working on what RIGHT NOW.

conflicts
  id              uuid PK
  project_id      integer FK -> projects
  conflict_type   string NOT NULL  -- file_collision, port_contention, migration_race, branch_conflict
  description     text NOT NULL
  severity        string DEFAULT 'warning'  -- info, warning, critical
  status          string DEFAULT 'open'     -- open, resolved, ignored
  session_a_id    uuid FK -> agent_sessions
  session_b_id    uuid FK -> agent_sessions (nullable)
  affected_files  jsonb DEFAULT []
  resolution      text
  resolved_by     string
  resolved_at     datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(project_id, status)
  INDEX(severity)

  Layer: 3
  Note: Detected automatically when two sessions touch the same files/ports.
```

### Session Intelligence (Layer 1)

```
session_changesets
  id              uuid PK
  agent_session_id uuid FK -> agent_sessions
  project_id      integer FK -> projects
  changeset_type  string NOT NULL  -- commit, unstaged_change, migration, dependency_change
  ref             string           -- git SHA, file path, migration name
  file_path       string           -- affected file (for unstaged changes)
  summary         text             -- commit message or change description
  diff_stats      jsonb DEFAULT {} -- { files_changed: 5, insertions: 120, deletions: 30 }
  metadata        jsonb DEFAULT {}
  created_at      datetime
  INDEX(agent_session_id)
  INDEX(project_id, created_at)

  Layer: 1
  Note: Captured on session end via git diff (committed + uncommitted).
  Answers "what did this session actually change?" the next morning.

session_metrics
  id              uuid PK
  agent_session_id uuid FK -> agent_sessions
  duration_minutes integer
  events_total    integer
  events_auto_approved integer
  events_human_decided integer
  events_rejected integer
  commits_made    integer
  tests_run       integer
  tests_passed    integer
  tests_failed    integer
  files_modified  integer
  tokens_consumed integer
  cost_usd        decimal
  outcome         string           -- completed, abandoned, blocked, error
  outcome_summary text
  created_at      datetime
  INDEX(agent_session_id)

  Layer: 1
  Note: Aggregated on session end. Powers effectiveness dashboards:
  "78% completion rate, avg $2.40/session, most failures: test failures."
```

### Environments (Layer 1)

```
environments
  id              uuid PK
  project_id      integer FK -> projects
  developer_id    uuid FK -> developers
  name            string NOT NULL       -- "feature-auth-rewrite", "clean-baseline", "e2e-stable"
  environment_type string NOT NULL      -- snapshot, branch, compose_profile, lightweight
  branch          string                -- git branch (if branch-scoped)
  status          string DEFAULT 'stopped'  -- stopped, starting, running, error, archived
  config          jsonb DEFAULT {}      -- ports, env vars, seed dataset name, docker profile
  snapshot_path   string                -- path to DB dump / state archive
  notes           text
  last_used_at    datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(project_id)
  INDEX(status)
  UNIQUE(project_id, name)

  Layer: 1
  Note: Scales from lightweight (pg_dump/restore) to full compose orchestration
  depending on environment_type. Developer chooses the level of isolation needed.

environment_services
  id              uuid PK
  environment_id  uuid FK -> environments
  service_name    string NOT NULL       -- postgres, redis, elasticsearch, mailcatcher
  service_type    string NOT NULL       -- docker, brew, process
  container_id    string                -- Docker container ID (if docker)
  port            integer
  status          string DEFAULT 'stopped'
  config          jsonb DEFAULT {}      -- image, volumes, env vars
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(environment_id)

  Layer: 1
  Note: Services that make up an environment. Could be Docker containers,
  brew services, or raw processes. Flexible to support the testing level needed.
```

### Planning Integration (Layer 1)

```
planning_snapshots
  id              uuid PK
  project_id      integer FK -> projects
  objective       string                -- "2.1"
  objective_name  string
  status          string                -- planned, in_progress, completed, blocked
  wave_count      integer
  job_count       integer
  jobs_completed  integer
  current_wave    integer
  state_hash      string                -- SHA256 of STATE.md for change detection
  state_content   text                  -- raw STATE.md content
  roadmap_hash    string                -- SHA256 of ROADMAP.md
  roadmap_content text                  -- raw ROADMAP.md content
  captured_at     datetime
  metadata        jsonb DEFAULT {}
  created_at      datetime
  INDEX(project_id)
  INDEX(captured_at)

  Layer: 1
  Note: Synced from .planning/ filesystem via file watcher (fswatch).
  Layer 2 adds hook-driven events from devflow-claude skills for precise updates.
  Watcher compares content hashes to avoid redundant updates.
```

### Notifications (Layer 1)

```
notification_rules
  id              uuid PK
  developer_id    uuid FK -> developers
  channel         string NOT NULL       -- imessage, web_push, slack, email
  min_severity    string DEFAULT 'review'  -- safe, scoped, review, destructive
  event_types     jsonb DEFAULT []      -- filter by event type, empty = all
  project_id      integer FK -> projects (nullable, null = all projects)
  quiet_start     time                  -- e.g. 22:00
  quiet_end       time                  -- e.g. 07:00
  active          boolean DEFAULT true
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(developer_id, active)

  Layer: 1 (iMessage + PWA only), Layer 3+ (Slack, email, team channels)
  Note: Layer 1 keeps it simple — iMessage for destructive, PWA badge for all.
  Complex team notifications (Slack channels, @mentions) deferred to Layer 3.
```

### Cross-Project Awareness (Layer 2)

```
project_dependencies
  id              uuid PK
  project_id      integer FK -> projects     -- the dependent project
  depends_on_id   integer FK -> projects     -- what it depends on
  dependency_type string NOT NULL            -- api, package, shared_schema, deploy_order, monorepo
  auto_detected   boolean DEFAULT false      -- true if inferred from code
  description     text
  detection_source string                    -- package.json, Gemfile, import_map, manual
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  UNIQUE(project_id, depends_on_id, dependency_type)
  INDEX(depends_on_id)

  Layer: 2
  Note: Auto-inferred from package.json, Gemfile, import paths on project scan.
  Developer can declare missed dependencies manually. When an agent modifies a
  shared interface in project A, Hub flags: "Project B depends on this — run its tests."
```

### CI/CD Awareness (Layer 1 events, Layer 2 knowledge)

GitHub Actions failures and fixes flow through the event pipeline. Over time, the
failure→resolution pairs build institutional knowledge that Claude Code sessions
can query via MCP: "we've seen this test failure before, here's how it was fixed."

```
ci_incidents
  id              uuid PK
  project_id      integer FK -> projects
  source          string NOT NULL          -- github_actions, digitalocean, custom
  external_id     string                   -- GitHub workflow run ID, DO deploy ID
  external_url    string                   -- link to CI run / deploy
  incident_type   string NOT NULL          -- test_failure, build_failure, deploy_failure, lint_error
  workflow_name   string                   -- "CI", "Deploy Production", etc.
  branch          string
  commit_sha      string
  error_summary   string NOT NULL          -- concise description of what failed
  error_detail    text                     -- full error output (truncated)
  failing_tests   jsonb DEFAULT []         -- ["test/models/user_test.rb:45", ...]
  status          string DEFAULT 'open'    -- open, resolved, ignored
  resolved_at     datetime
  resolved_by     string                   -- commit SHA that fixed it
  resolution_summary text                  -- what fixed it (auto-generated from commit/PR)
  resolution_pr   string                   -- PR number/URL that resolved it
  metadata        jsonb DEFAULT {}         -- workflow inputs, runner info, etc.
  created_at      datetime
  updated_at      datetime
  INDEX(project_id, status)
  INDEX(incident_type)
  INDEX(status, created_at)

  Layer: 1 (capture incidents), Layer 2 (searchable knowledge)
  Note: When a CI run fails, an event (event_type: "ci_failure") is created AND
  a ci_incident is opened. When the same workflow later passes on the same branch,
  the incident auto-resolves and captures the fixing commit/PR. Over time, this
  becomes a searchable knowledge base of "what breaks and why."

  Resolution detection:
  - Same workflow + same branch passes → auto-resolve, link fixing commit
  - PR merged that references the failure → link PR as resolution
  - Manual resolution via Flutter UI or MCP tool
```

#### GitHub Integration Flow

```
GitHub webhook (workflow_run.completed)
  │
  ▼
POST /api/v1/webhooks/github
  │
  ├── conclusion: "failure"
  │     → Create event (type: ci_failure, classification: review)
  │     → Create/update ci_incident (status: open)
  │     → Notify via existing notification pipeline
  │
  └── conclusion: "success" + open incident exists for this workflow+branch
        → Create event (type: ci_resolved, classification: safe)
        → Resolve ci_incident (link fixing commit)
        → Auto-generate resolution_summary from commit diff
```

#### What Hub Does NOT Do

- No pipeline management — use GitHub Actions UI for that
- No build logs storage — link to GitHub, don't duplicate
- No deployment orchestration — DigitalOcean handles deploys
- No re-run triggers — developer does that in GitHub

Hub is awareness only: "something broke, here's context, here's how similar things were fixed before."

### Audit Trail (Layer 3)

```
audit_logs
  id              uuid PK
  developer_id    uuid FK -> developers
  action          string NOT NULL       -- created, updated, deleted, resolved, paused, started, stopped
  resource_type   string NOT NULL       -- ai_subscription, agent_session, environment, routing_rule, notification_rule
  resource_id     string NOT NULL
  changes         jsonb DEFAULT {}      -- { field: [old_value, new_value] }
  ip_address      string
  user_agent      string
  created_at      datetime
  INDEX(resource_type, resource_id)
  INDEX(developer_id, created_at)

  Layer: 3
  Note: Tracks human actions in the Hub itself. Essential for multi-developer:
  "Who changed the routing rules? Who paused the Anthropic subscription?"
```

### AI Providers & Local Models (Layer 1)

**AOSentry Integration**: AOSentry (the LLM gateway at `/Users/markemerson/Source/aosentry-rails/`)
already handles cloud AI usage tracking, cost calculation, budget enforcement, and rate limiting
as a transparent proxy. Hub does NOT duplicate this — it queries AOSentry's spend API for
dashboards and focuses on what AOSentry doesn't cover: local models and routing preferences.

```
ai_routing_rules
  id              uuid PK
  developer_id    uuid FK -> developers
  task_type       string NOT NULL          -- embedding, classification, code_search, chat, code_generation, review
  preferred_model string NOT NULL          -- model ID (e.g. "nomic-embed-text", "claude-opus-4-6")
  preferred_provider string NOT NULL       -- ollama, anthropic, openai, etc.
  fallback_model  string                   -- fallback model ID
  fallback_provider string                 -- fallback provider
  prefer_local    boolean DEFAULT true     -- try local first for this task type
  priority        integer DEFAULT 0        -- higher = checked first
  active          boolean DEFAULT true
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(developer_id, task_type)
  INDEX(active)

  Layer: 1
  Note: "Use local Llama for embeddings, Claude for code generation,
  GPT-4o as fallback when Claude is rate-limited." Developer-configurable.
  Model/provider are strings (not FKs) — models come from Ollama + AOSentry,
  not a local registry.

local_model_instances
  id              uuid PK
  model_name      string NOT NULL          -- Ollama model name (e.g. "llama3.3:70b", "nomic-embed-text")
  runtime         string NOT NULL          -- ollama, llama_cpp, mlx, vllm
  status          string DEFAULT 'stopped' -- stopped, starting, running, error, downloading
  port            integer                  -- inference endpoint port
  quantization    string                   -- Q4_K_M, Q8_0, F16, etc.
  auto_start      boolean DEFAULT false    -- start on Hub launch
  resource_limit_mb integer               -- max VRAM/RAM to use
  avg_tokens_per_sec float                 -- performance metric (updated from Flutter)
  metadata        jsonb DEFAULT {}
  created_at      datetime
  updated_at      datetime
  INDEX(status)

  Layer: 1
  Note: Catalog of local models the developer has configured. Flutter manages
  lifecycle directly via Ollama API — this table tracks config and preferences.
  Runtime state (pid, vram, gpu_layers) is read live from Ollama, not stored.
```

#### What lives where

```
AOSentry (already built)              Hub (new)                     Flutter (direct)
────────────────────────              ─────────                     ────────────────
Cloud usage tracking (spend_logs)     Routing rules (task → model)  Ollama inference
Cost calculation (per-model pricing)  Local model config            Ollama pull/start/stop
Budget enforcement (per-key/team)     AOSentry API key (in settings)GPU/VRAM monitoring
Rate limiting (RPM/TPM)
Provider health (error_logs)
Usage analytics API (/spend/*)
Model registry (proxy_models)

Hub AI dashboard = AOSentry /spend/* API + Flutter local model status
```

#### Removed tables (handled by AOSentry)

- ~~`ai_providers`~~ → AOSentry's provider registry
- ~~`ai_subscriptions`~~ → AOSentry's `api_keys` with budget/plan info
- ~~`ai_models`~~ → AOSentry's `proxy_models` catalog
- ~~`ai_usage_records`~~ → AOSentry's `spend_logs`
- ~~`ai_usage_limits`~~ → AOSentry's budget enforcement
- ~~`provider_health_checks`~~ → AOSentry's `error_logs`

### Dev Environment (Layer 1, already built)

```
-- These stay as-is from existing schema:
settings              -- key/value store (includes AOSentry connection URL)
devflow_installations -- DevFlow version tracking
env_templates         -- .env file templates
mail_messages         -- SMTP mail catcher

-- proxy_accounts and proxy_requests are SUPERSEDED by AOSentry.
-- Migration: remove after confirming AOSentry covers all use cases.
-- Keep old tables temporarily for backward compat.

-- Brew, Mise, Ports, Hosts, SSH, Git, Puma-dev are
-- in-memory models (no database tables), which is correct.
-- They read live system state on each request.
```

---

## API Surface

### Namespace Structure

```
/api/v1/                         -- Machine API (hooks, MCP, Flutter)
  /agent_sessions                -- Session lifecycle
  /events                        -- Event pipeline
  /work_summaries                -- Session reports
  /prompt_runs                   -- Remote prompt execution
  /projects                      -- Project registry
  /developers                    -- Developer identity
  /environments                  -- Test environment management
  /planning                      -- DevFlow planning state
  /activity                      -- Activity feed / briefing
  /knowledge                     -- Knowledge CRUD + search (Layer 2)
  /decisions                     -- Decision log (Layer 2)
  /dependencies                  -- Cross-project dependencies (Layer 2)
  /ci                            -- CI/CD incidents + knowledge
  /webhooks                      -- Inbound webhooks (GitHub, etc.)
  /tasks                         -- Task board (Layer 3)
  /conflicts                     -- Conflict detection (Layer 3)
  /audit                         -- Audit trail (Layer 3)

/api/v1/mcp/                     -- MCP tool endpoint (Layer 2)
  /tools                         -- Tool discovery
  /execute                       -- Tool execution

/api/v1/system/                  -- Dev environment
  /services                      -- Brew services
  /packages                      -- Brew packages
  /tools                         -- Mise tools
  /ports                         -- Listening ports
  /hosts                         -- /etc/hosts
  /ssh_keys                      -- SSH key management
  /git_config                    -- Git configuration
  /puma_dev                      -- Puma-dev apps

/api/v1/claude_code/             -- Claude Code config
  /settings                      -- settings.json management
  /hooks                         -- Hook configuration
  /mcp_servers                   -- MCP server config
  /plugins                       -- Plugin management
  /permissions                   -- Permission lists

/api/v1/ai/                      -- AI routing, local models, usage (via AOSentry)
  /usage                         -- Proxied from AOSentry /spend/* API
  /routing                       -- Task-type → model routing rules
  /local_models                  -- Local model config + remote lifecycle

/api/v1/proxy/                   -- Claude API proxy (passthrough)
  /messages                      -- Forward to provider (legacy compat)

/api/v1/devflow/                 -- DevFlow integration
  /state                         -- .planning/ state
  /installations                 -- Version management

/health                          -- Health check
/up                              -- Uptime check
```

### Key Endpoints by Layer

#### Layer 1: Agent Control Plane

```
# Agent Sessions
POST   /api/v1/agent_sessions              -- Register session (from hook)
GET    /api/v1/agent_sessions              -- List sessions (Flutter dashboard)
GET    /api/v1/agent_sessions/:id          -- Session detail
PATCH  /api/v1/agent_sessions/:id          -- Update (autonomy, remote, etc.)
DELETE /api/v1/agent_sessions/:id          -- End session

# Events
POST   /api/v1/events                      -- Create event (from hook)
GET    /api/v1/events                      -- List events (filterable)
GET    /api/v1/events/:id                  -- Event detail
PATCH  /api/v1/events/:id/resolve          -- Human decision
GET    /api/v1/events/pending              -- All pending across sessions

# Work Summaries
POST   /api/v1/work_summaries             -- Create (from stop hook)
GET    /api/v1/work_summaries             -- List (filterable by session)
PATCH  /api/v1/work_summaries/:id/read    -- Mark read

# Prompt Runs
POST   /api/v1/prompt_runs                -- Queue prompt (from phone)
GET    /api/v1/prompt_runs                -- List runs
GET    /api/v1/prompt_runs/:id            -- Run detail + output

# Projects
GET    /api/v1/projects                   -- List adopted projects
POST   /api/v1/projects                   -- Adopt project
DELETE /api/v1/projects/:id               -- Remove project
POST   /api/v1/projects/scan              -- Scan filesystem
PATCH  /api/v1/projects/:id/activate      -- Set as current

# System (dev environment)
# Flutter manages these directly when at desk (shell commands, launchctl).
# Rails exposes them as API for remote/relay operations only.
# All endpoints are pass-through to local system commands.
GET    /api/v1/system/services             -- List brew services
POST   /api/v1/system/services/:name/start   -- (remote only)
POST   /api/v1/system/services/:name/stop    -- (remote only)
POST   /api/v1/system/services/:name/restart -- (remote only)
GET    /api/v1/system/ports                -- List listening ports
DELETE /api/v1/system/ports/:pid           -- Kill process (remote only)
GET    /api/v1/system/packages             -- List brew packages
POST   /api/v1/system/packages/:name/install   -- (remote only)
POST   /api/v1/system/packages/:name/uninstall -- (remote only)
GET    /api/v1/system/tools                -- List mise tools
POST   /api/v1/system/tools/:name/install  -- (remote only)
GET    /api/v1/system/hosts                -- List hosts entries
POST   /api/v1/system/hosts               -- Add entry (remote only)
DELETE /api/v1/system/hosts/:id            -- Remove entry (remote only)
GET    /api/v1/system/ssh_keys             -- List SSH keys
GET    /api/v1/system/puma_dev             -- List puma-dev apps

# Dashboard aggregate
GET    /api/v1/dashboard                   -- Combined stats for Flutter home

# Activity Feed / Morning Briefing
GET    /api/v1/activity                    -- Chronological feed across all sessions/projects
  params: { since, project_id, limit }
  Response: synthesized narrative entries (not raw events)
GET    /api/v1/activity/briefing           -- "What happened while I was gone?"
  Response: {
    sessions_since_last_visit: [...],
    pending_actions: [...],
    completed_work: [...],
    warnings: [...],          -- limit warnings, failed sessions, unresolved conflicts
    summary: "3 sessions ran overnight..."
  }

# Session Intelligence
GET    /api/v1/agent_sessions/:id/changesets  -- What this session changed
GET    /api/v1/agent_sessions/:id/metrics     -- Session effectiveness stats

# Environments
GET    /api/v1/environments                -- List environments for a project
POST   /api/v1/environments                -- Create environment
PATCH  /api/v1/environments/:id            -- Update config
DELETE /api/v1/environments/:id            -- Remove environment
POST   /api/v1/environments/:id/start      -- Start environment
POST   /api/v1/environments/:id/stop       -- Stop environment
POST   /api/v1/environments/:id/snapshot   -- Capture current state as snapshot
POST   /api/v1/environments/:id/restore    -- Restore from snapshot
GET    /api/v1/environments/:id/services   -- List services in environment

# Planning State
GET    /api/v1/planning/:project_id        -- Current planning state for project
GET    /api/v1/planning/:project_id/objectives  -- Objectives with progress
POST   /api/v1/planning/:project_id/sync   -- Force re-sync from filesystem

# Notification Rules
GET    /api/v1/notification_rules          -- List rules
POST   /api/v1/notification_rules          -- Create rule
PATCH  /api/v1/notification_rules/:id      -- Update rule
DELETE /api/v1/notification_rules/:id      -- Remove rule
```

#### Layer 1: AI — Routing & Local Models

Cloud usage tracking, cost calculation, budgets, and rate limiting are handled by
**AOSentry** (LLM gateway). Hub queries AOSentry's `/spend/*` API for dashboards
and manages only what AOSentry doesn't cover: local models and routing preferences.

```
# Usage (proxy to AOSentry /spend/* API)
GET    /api/v1/ai/usage                    -- Proxies to AOSentry /spend/logs
GET    /api/v1/ai/usage/dashboard          -- Aggregates AOSentry /spend/report + local model stats
GET    /api/v1/ai/usage/providers          -- Proxies to AOSentry /spend/provider
GET    /api/v1/ai/usage/models             -- Proxies to AOSentry /spend/models

# Routing Rules (Hub-owned)
GET    /api/v1/ai/routing                  -- List routing rules
POST   /api/v1/ai/routing                  -- Create rule
PATCH  /api/v1/ai/routing/:id              -- Update rule
DELETE /api/v1/ai/routing/:id              -- Remove rule
POST   /api/v1/ai/routing/resolve          -- Given a task_type, return which model to use
  body: { task_type: "embedding" }
  Response: { model: "nomic-embed-text", provider: "ollama", endpoint: "localhost:11434", reason: "local preferred, model loaded" }

# Local Models (catalog in Rails, lifecycle in Flutter)
# Flutter talks to Ollama directly for pull/start/stop/inference.
# Rails tracks config and preferences only.
GET    /api/v1/ai/local_models             -- List configured local models
POST   /api/v1/ai/local_models             -- Register a local model
PATCH  /api/v1/ai/local_models/:id         -- Update config (auto-start, resource limits)
DELETE /api/v1/ai/local_models/:id         -- Remove from catalog

# Remote-only (relay mode — developer away from desk):
POST   /api/v1/ai/local_models/:id/pull    -- Rails → Ollama pull
POST   /api/v1/ai/local_models/:id/start   -- Rails → Ollama start
POST   /api/v1/ai/local_models/:id/stop    -- Rails → Ollama stop
```

#### Layer 2: Knowledge & Context

```
# Knowledge Sources
GET    /api/v1/knowledge/sources           -- List sources
POST   /api/v1/knowledge/sources           -- Add source (file, URL, manual)
PATCH  /api/v1/knowledge/sources/:id       -- Update metadata
DELETE /api/v1/knowledge/sources/:id       -- Remove source + chunks
POST   /api/v1/knowledge/sources/:id/sync  -- Re-sync from origin

# Knowledge Search
POST   /api/v1/knowledge/search            -- Search chunks
  body: { query, project_id, tags, source_types, top_k, include_code }

# Decisions
GET    /api/v1/decisions                   -- List decisions
POST   /api/v1/decisions                   -- Record decision
PATCH  /api/v1/decisions/:id               -- Update/supersede
GET    /api/v1/decisions/for_project/:id   -- Decisions for a project

# Cross-Project Dependencies
GET    /api/v1/dependencies                -- List all dependencies
GET    /api/v1/dependencies/for/:project_id -- Dependencies for a project
POST   /api/v1/dependencies                -- Declare dependency manually
DELETE /api/v1/dependencies/:id            -- Remove dependency
POST   /api/v1/dependencies/scan           -- Re-scan all projects for auto-detection
GET    /api/v1/dependencies/impact/:project_id  -- "If I change project X, what's affected?"

# CI/CD Incidents
GET    /api/v1/ci/incidents                -- List incidents (filterable by project, status, type)
GET    /api/v1/ci/incidents/:id            -- Incident detail
PATCH  /api/v1/ci/incidents/:id            -- Manual resolve / ignore
GET    /api/v1/ci/incidents/open           -- All open incidents across projects
GET    /api/v1/ci/incidents/similar        -- Search past incidents by error message
  body: { error_summary, project_id, limit }
  Response: [{ incident, resolution_summary, resolved_by_commit, similarity }]

# Inbound Webhooks
POST   /api/v1/webhooks/github            -- GitHub webhook receiver (workflow_run, check_suite, deployment_status)
  Verified via webhook secret in settings.
  Creates events + ci_incidents automatically.

# MCP Interface (SSE transport)
GET    /api/v1/mcp/tools                   -- Discover available tools
POST   /api/v1/mcp/execute                 -- Execute tool
  Exposed MCP tools:
    - hub_search_knowledge(query, project_id, top_k)
    - hub_get_decisions(project_id, type)
    - hub_record_decision(project_id, title, description, rationale, type)
    - hub_get_project_context(project_id)
    - hub_report_status(session_id, status, summary)
    - hub_get_active_sessions(project_id)
    - hub_detect_conflicts(session_id, files)
    - hub_get_dependencies(project_id)
    - hub_get_planning_state(project_id)
    - hub_get_ci_status(project_id)              -- Open CI failures for this project
    - hub_search_ci_incidents(error_summary)     -- "Have we seen this failure before?"
    - hub_resolve_ci_incident(incident_id, summary)  -- Mark resolved with context
```

#### Layer 3: Multi-Developer Orchestration

```
# Developers
GET    /api/v1/developers                  -- List developers
POST   /api/v1/developers                  -- Register developer
PATCH  /api/v1/developers/:id              -- Update profile

# Task Board
GET    /api/v1/tasks                       -- List tasks (filterable)
POST   /api/v1/tasks                       -- Create task
PATCH  /api/v1/tasks/:id                   -- Update task
POST   /api/v1/tasks/:id/claim             -- Claim task (assign to session)
POST   /api/v1/tasks/:id/complete          -- Mark done
GET    /api/v1/tasks/board                 -- Kanban board view

# Conflicts
GET    /api/v1/conflicts                   -- List conflicts
POST   /api/v1/conflicts                   -- Report conflict (auto-detected)
PATCH  /api/v1/conflicts/:id/resolve       -- Resolve conflict
GET    /api/v1/conflicts/active            -- Currently open conflicts
```

#### Layer 4: Hosted Mode Extensions

```
# Auth (not needed for local, required for hosted)
POST   /api/v1/auth/register               -- Developer registration
POST   /api/v1/auth/login                  -- JWT login
POST   /api/v1/auth/refresh                -- Token refresh

# Team management
GET    /api/v1/team                        -- Team members + online status
POST   /api/v1/team/invite                 -- Invite developer

# Cross-machine sync
POST   /api/v1/sync/knowledge              -- Push local knowledge to hub
GET    /api/v1/sync/knowledge              -- Pull shared knowledge
POST   /api/v1/sync/decisions              -- Push decisions
```

---

## WebSocket Channels (ActionCable)

```
AgentSessionChannel
  - Subscribes to: session updates, new events, event resolutions
  - Broadcasts: session_updated, event_created, event_resolved, summary_created

DashboardChannel
  - Subscribes to: aggregate stats, system status
  - Broadcasts: stats_updated, service_changed, session_started, session_ended

ProjectChannel (Layer 2+)
  - Subscribes to: project-scoped events
  - Broadcasts: knowledge_updated, decision_recorded, conflict_detected

TaskBoardChannel (Layer 3+)
  - Subscribes to: task board changes
  - Broadcasts: task_created, task_claimed, task_completed, task_blocked
```

---

## Flutter App Structure

```
devflow_hub/
  lib/
    main.dart                    -- App entry, tray setup
    app.dart                     -- MaterialApp, routing, theme

    core/
      api_client.dart            -- HTTP client for Rails API
      websocket_client.dart      -- ActionCable connection
      cache.dart                 -- Local cache (SQLite or Hive)
      theme.dart                 -- macOS-native theme

    models/                      -- Dart data classes (from API)
      agent_session.dart
      event.dart
      work_summary.dart
      project.dart
      developer.dart
      environment.dart             -- Test environment + services
      session_changeset.dart       -- What a session changed (files, tests, migrations)
      session_metric.dart          -- Session effectiveness metrics
      planning_snapshot.dart       -- Planning state from .planning/
      notification_rule.dart       -- User notification preferences
      knowledge_source.dart        -- Layer 2
      decision.dart                -- Layer 2
      ci_incident.dart               -- CI failure→resolution lifecycle
      project_dependency.dart      -- Layer 2: cross-project deps
      task_board_item.dart         -- Layer 3
      conflict.dart                -- Layer 3
      audit_log.dart               -- Layer 3

    services/                    -- Business logic
      session_service.dart       -- Session state (talks to Rails)
      event_service.dart         -- Event pipeline (talks to Rails)
      notification_service.dart  -- Notification rules (talks to Rails)
      ci_service.dart            -- CI incidents + similar search (talks to Rails)
      aosentry_client.dart       -- AOSentry /spend/* API client
      knowledge_service.dart     -- Layer 2 (talks to Rails)
      task_service.dart          -- Layer 3 (talks to Rails)

    local/                       -- Direct system access (no Rails)
      ollama_client.dart         -- Ollama REST API on :11434
      brew_service.dart          -- brew commands via shell
      mise_service.dart          -- mise commands via shell
      launchctl_service.dart     -- Service start/stop
      git_service.dart           -- Git status, diff, changeset detection
      planning_watcher.dart      -- FileSystemEntity watcher on .planning/
      resource_monitor.dart      -- GPU/VRAM/RAM via sysctl/IOKit
      environment_service.dart   -- Test env lifecycle (pg_dump, Docker)

    screens/
      dashboard/                 -- Home: active sessions, system status, pending events
        dashboard_screen.dart
        widgets/
          session_card.dart
          system_status.dart
          pending_events.dart
          ci_summary.dart            -- Open CI failures across all projects

      sessions/                  -- Agent session list + detail
        session_list_screen.dart
        session_detail_screen.dart
        widgets/
          event_timeline.dart
          event_resolver.dart
          work_summary_card.dart
          prompt_form.dart

      projects/                  -- Project registry
        project_list_screen.dart
        project_detail_screen.dart   -- includes CI status badge + recent incidents
        widgets/
          ci_status_badge.dart       -- green/red/yellow per-project CI status
          incident_list.dart         -- recent CI incidents for project

      system/                    -- Dev environment
        system_screen.dart
        services_tab.dart
        packages_tab.dart
        ports_tab.dart
        tools_tab.dart

      ai/                        -- AI routing & local models
        ai_dashboard_screen.dart     -- Usage overview (AOSentry) + local model status
        local_models_screen.dart     -- Local model lifecycle: pull, start, stop, resources
        routing_rules_screen.dart    -- Task-type → model routing configuration
        usage_detail_screen.dart     -- Deep usage analytics (AOSentry /spend/* API)
        widgets/
          usage_chart.dart           -- Token/cost over time (data from AOSentry)
          budget_gauge.dart          -- Budget progress bar (data from AOSentry)
          model_status_card.dart     -- Local model with VRAM/perf (data from Ollama)
          resource_monitor.dart      -- GPU/VRAM/RAM live display (direct system access)
          cost_ticker.dart           -- Today's spend, projected monthly (AOSentry)

      environments/              -- Test environments
        environment_list_screen.dart   -- All environments, status, actions
        environment_detail_screen.dart -- Services, logs, snapshot/restore
        widgets/
          service_status_card.dart     -- Per-service status + logs
          snapshot_list.dart           -- Snapshot history with restore action

      activity/                  -- Session intelligence & briefing
        activity_feed_screen.dart      -- Cross-session recent activity
        morning_briefing_screen.dart   -- Morning context: overnight changes, pending items
        session_metrics_screen.dart    -- Effectiveness analytics per session
        widgets/
          changeset_diff.dart          -- Visual diff of session changes
          metric_chart.dart            -- Effectiveness over time

      planning/                  -- Planning state viewer
        planning_overview_screen.dart  -- Current planning state from .planning/
        objective_detail_screen.dart   -- Single objective status + tasks
        widgets/
          roadmap_progress.dart        -- Visual roadmap with completion %
          state_badge.dart             -- Objective/task state indicator

      notifications/             -- Notification preferences
        notification_rules_screen.dart -- Rule list + create/edit
        widgets/
          rule_form.dart               -- Condition builder for notification rules

      knowledge/                 -- Layer 2
        knowledge_screen.dart
        source_list.dart
        search_screen.dart
        decision_log.dart

      tasks/                     -- Layer 3
        kanban_board_screen.dart
        task_detail_screen.dart

      settings/
        settings_screen.dart
        claude_code_settings.dart
        devflow_settings.dart

    tray/                        -- macOS menu bar
      tray_manager.dart
      tray_menu.dart
```

---

## Migration Strategy

### Phase 1: Schema Migration (Rails)

Rename `relay_sessions` → `agent_sessions` with alias for backward compat.
Add `developers` table with single "me" row.
Add `developer_id` FK to existing tables (nullable, backfill later).
Add Layer 2 tables (knowledge_sources, knowledge_chunks, decisions) as empty.
Add Layer 3 tables (task_board_items, conflicts) as empty.
Move all routes under `/api/v1/` namespace.
Keep ERB views temporarily (dual-serve until Flutter is ready).

### Phase 2: Flutter Shell (macOS)

Create Flutter project with macos target.
Implement core API client + WebSocket connection.
Build dashboard screen (sessions + system status).
Build session detail screen (events + resolver).
Build system screen (services, ports, packages).
Implement tray icon with session count.

### Phase 3: Drop Electron + ERB

Remove Electron app entirely.
Remove ERB views and Turbo dependencies.
Rails becomes pure API server.
Flutter handles all UI.

### Phase 4: Knowledge Layer

Implement knowledge source ingestion (CLAUDE.md, ADRs, docs).
Build MCP server endpoint in Rails.
Configure Claude Code to connect to Hub MCP.
Build knowledge search UI in Flutter.
Build decision log UI.

---

## Authentication Model

### Local Mode (Layers 1-2)
- No auth on API — single machine, single user
- Bearer token on hook endpoints (existing DEVFLOW_RELAY_TOKEN)
- Flutter connects to localhost:3100 directly

### Team Mode (Layer 3)
- Developer identity via machine_id (auto-detected)
- Optional bearer token per developer
- No passwords — trust the network (local/VPN)

### Hosted Mode (Layer 4)
- JWT authentication (Devise + doorkeeper)
- OAuth for team SSO
- API keys for CI/CD integration

---

## Key Design Decisions

1. **UUID primary keys on new tables** — required for Layer 4 sync. Existing integer PKs on settings/projects/etc. stay as-is.

2. **jsonb for flexible fields** — metadata, action_data, response_data, tags. Avoids migration churn as we learn what's needed.

3. **SQLite stays for Layers 1-3** — PostgreSQL only required for Layer 4 (hosted). Local dev tool shouldn't need Postgres.

4. **No vector store for Layer 2** — start with full-text search on knowledge_chunks. SQLite FTS5 is sufficient for structured knowledge. Add Qdrant/pgvector only if search quality demands it.

5. **ActionCable over REST polling** — Flutter connects via WebSocket for real-time. Events, session updates, and task changes broadcast immediately.

6. **MCP via HTTP, not stdio** — Hub runs as a network MCP server. Claude Code connects via SSE transport. This allows multiple sessions to share one Hub instance.

7. **Events are append-only** — never delete events. Decision resolution updates the existing record but the event itself persists forever. This is the audit trail.

8. **Local models are first-class** — not an afterthought. Embeddings, classification, and code search default to local models, burning cloud tokens only when necessary. Flutter talks to Ollama/MLX directly — Rails never proxies inference traffic.

9. **AI usage is visible** — every token, every dollar, every rate limit. The developer always knows what they're spending and where. No surprise bills, no silent throttling.

10. **Rails never proxies hot-path traffic** — Cloud AI calls go direct (Claude Code → Anthropic). Local model calls go direct (Flutter → Ollama). Rails records usage from hook events and Flutter posts, not by sitting in the middle. This means Rails can restart without interrupting any active work.

11. **Flutter direct, Rails remote** — When at desk, Flutter executes system operations directly (shell, launchctl, git). When away, the same operations route through Rails API for relay access. Same UI, different execution path.

---

## AI Provider Integration

Rails **does not proxy AI traffic**. Claude Code already talks directly to Anthropic. Ollama runs locally. Putting Rails in the middle adds latency to the most performance-sensitive interactions.

### How It Works

```
Claude Code ──► AOSentry ──► Anthropic/OpenAI    (usage tracked by AOSentry)
Flutter     ──direct──► Ollama :11434             (local inference, no proxy)

Hub reads from both:

Flutter ──► AOSentry /spend/* API     (cloud usage, costs, budgets)
Flutter ──► Ollama :11434/api/tags    (local model status, resources)
Flutter ──► Rails /api/v1/ai/routing  (which model to use for what)

              ┌──────────────────────┐
              │ AOSentry (LLM GW)    │
              │                      │
              │ spend_logs           │ ← per-request token/cost tracking
              │ api_keys + budgets   │ ← budget enforcement, rate limiting
              │ proxy_models         │ ← model registry + pricing
              │ error_logs           │ ← provider health
              └──────────────────────┘

              ┌──────────────────────┐
              │ Hub Rails            │
              │                      │
              │ ai_routing_rules     │ ← task_type → model preferences
              │ local_model_instances│ ← Ollama model config
              │ settings             │ ← AOSentry connection URL
              └──────────────────────┘
```

**Routing resolution** is a read-only lookup, not a proxy hop:
```
Flutter: POST /api/v1/ai/routing/resolve { task_type: "embedding" }
Rails:   → { model: "nomic-embed-text", provider: "ollama", endpoint: "localhost:11434", reason: "local preferred, model loaded" }
Flutter: → talks to Ollama directly using the resolved endpoint
```

### Default Routing (Developer Can Override)

| Task Type | Primary | Fallback | Who Executes |
|-----------|---------|----------|-------------|
| embedding | Local (nomic-embed-text) | OpenAI text-embedding-3-small | Flutter → Ollama |
| classification | Local (small LLM) | Rules-based (ActionClassifier) | Flutter → Ollama |
| code_search | Local (code model) | Cloud model | Flutter → Ollama |
| chat / code_generation | Claude (subscription) | OpenAI / local large | Claude Code → Anthropic (direct) |
| review | Claude (subscription) | OpenAI | Claude Code → Anthropic (direct) |

### Subscription Types Supported

| Provider | Auth Method | Plan Types |
|----------|------------|------------|
| Anthropic | API key, OAuth | Pro, Max, Team, Enterprise, API |
| OpenAI | API key | Plus, Pro, Team, API |
| Google | API key, OAuth | Gemini Advanced, API |
| Local (Ollama) | None | Free (self-hosted) |
| Custom | API key | Any OpenAI-compatible endpoint |

### Usage Dashboard Shows

Flutter composes this from two sources:

**From AOSentry `/spend/*` API** (cloud usage):
- **Today / This Month**: tokens consumed, estimated cost, requests
- **By Provider**: breakdown across Anthropic, OpenAI, Google, etc.
- **By Model**: which models are burning tokens
- **Cost Projection**: "at current rate, you'll spend $X this month"
- **Budget Status**: per-key and per-team budget remaining

**From Flutter direct** (local models):
- **Local Model Performance**: tokens/sec, VRAM usage, GPU utilization
- **Resource Monitor**: GPU/VRAM/RAM live display
- **Model Status**: which models are loaded, downloading, idle
