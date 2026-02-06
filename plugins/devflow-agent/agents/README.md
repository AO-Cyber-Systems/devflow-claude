# DevFlow Subagents

This directory contains custom subagents for the DevFlow autonomous development workflow.

## Available Subagents

| Agent | Purpose | Memory | Mode |
|-------|---------|--------|------|
| `trd-implementer` | Implements a single TRD | project | acceptEdits |
| `trd-designer` | Designs TRDs by exploring codebase | project | plan (read-only) |
| `code-reviewer` | Reviews code quality and security | project | plan (read-only) |
| `debugger` | Investigates and fixes failures | project | acceptEdits |

## How Subagents Work

Subagents run in **isolated context windows**, separate from the main conversation:

```
Main Conversation (Orchestrator)
├── TaskList, TaskCreate, TaskUpdate
├── High-level coordination
└── Spawns subagents for actual work
    │
    ├── trd-implementer (isolated context)
    │   ├── Reads TRD
    │   ├── Implements feature
    │   ├── Runs verification
    │   └── Returns summary only
    │
    └── code-reviewer (isolated context)
        ├── Reviews changes
        └── Returns findings only
```

Benefits:
- **Context isolation**: Verbose output stays in subagent, only summary returns
- **Fresh context per TRD**: No accumulation of old context
- **Persistent memory**: Subagents learn patterns across invocations

## Native Subagent Memory

Each subagent uses native Claude Code memory (not Memory MCP):

```yaml
# In subagent frontmatter
memory: project  # Persists in .claude/agent-memory/<agent-name>/
```

Memory locations:
- `project`: `.claude/agent-memory/<agent-name>/` (git-trackable)
- `user`: `~/.claude/agent-memory/<agent-name>/` (personal, all projects)
- `local`: `.claude/agent-memory-local/<agent-name>/` (gitignored)

### Memory Files

- `MEMORY.md`: First 200 lines auto-loaded into subagent's system prompt
- Other files: Subagent can read/write additional files for detailed notes

### Memory Best Practices

1. **Before starting**: Check memory for relevant patterns
2. **After completing**: Update memory with insights learned
3. **Keep concise**: MEMORY.md should be high-level notes
4. **Use files for details**: Link to separate files for verbose content

## Spawning Subagents

From the orchestrator:

```
Task(subagent_type: "trd-implementer"):
  Implement the TRD at .devflow/trds/TRD-001-feature.md
  Follow all acceptance criteria.
```

The subagent:
1. Receives the prompt
2. Has access to its configured tools
3. Has its memory auto-loaded
4. Works autonomously
5. Returns a summary

## Creating New Subagents

1. Create `agents/your-agent.md`
2. Add YAML frontmatter with configuration
3. Write system prompt in markdown body

### Frontmatter Options

```yaml
---
name: your-agent                    # Required: lowercase, hyphens
description: What this agent does   # Required: used for auto-delegation
tools: Read, Edit, Bash             # Optional: allowed tools
model: inherit                      # Optional: sonnet, opus, haiku, inherit
permissionMode: default             # Optional: default, acceptEdits, plan, dontAsk
memory: project                     # Optional: project, user, local
skills:                             # Optional: preload skills
  - verify
  - regression
hooks:                              # Optional: agent-specific hooks
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./validate.sh"
---
```

## Migration from Memory MCP

If you were using Memory MCP (`mcp__memory__*` tools):

**Before (Memory MCP):**
```
mcp__memory__create_entities: [...]
mcp__memory__search_nodes: "keyword"
```

**After (Native Memory):**
```yaml
# In subagent frontmatter
memory: project
```

Subagent can now:
- Read from `.claude/agent-memory/<name>/MEMORY.md` (auto-loaded)
- Write to any file in that directory
- Memory persists across sessions

The Memory MCP is still available but deprecated. Native subagent memory provides better integration with Claude Code's architecture.
