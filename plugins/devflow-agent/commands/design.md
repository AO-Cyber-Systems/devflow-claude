---
description: Create and view project design document
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/design.sh *)
  - Read
slash-command-tools: hidden
---

# Design Document Management

Run the design manager:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/design.sh $ARGUMENTS
```

## Commands

| Command | Description |
|---------|-------------|
| `init [name]` | Initialize design.md from template |
| `view` | View current design document |
| `edit` | Open in $EDITOR |
| `validate` | Check document structure |

## Options

- `--template <type>` - Template: fullstack, svelte, fastapi

## Examples

```bash
# Create design document
/devflow-agent:design init "My Project"

# Use specific template
/devflow-agent:design init --template svelte

# View design
/devflow-agent:design view

# Validate structure
/devflow-agent:design validate
```

## Templates

### fullstack (default)
Full-stack template with frontend (SvelteKit), backend (FastAPI), and database sections.

### svelte
Frontend-focused template for SvelteKit applications.

### fastapi
Backend-focused template for FastAPI REST APIs.

## Design Document Structure

The design document includes:
- **Metadata**: Project info, version, status
- **Overview**: Purpose, goals, non-goals
- **Architecture**: System diagrams, components
- **Tech Stack**: Technologies and their purposes
- **Data Models**: Entity definitions, relationships
- **API Design**: Endpoints, auth, errors
- **Security**: Auth, authorization, data protection
- **Deployment**: Environments, CI/CD
- **Project Structure**: Directory layout
- **Implementation Plan**: Phased task breakdown

## Workflow

1. Create design: `/devflow-agent:design init "Project Name"`
2. Edit to fill in details
3. Create TRDs from implementation plan phases
4. Execute TRDs with autonomous loop

## Location

Design document is stored at: `.devflow/design.md`
