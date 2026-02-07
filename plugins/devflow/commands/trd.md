---
description: Manage Task Requirement Documents (TRDs) - create, list, view, update
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/trd.sh *)
  - Read
slash-command-tools: hidden
---

# TRD Management

Run the TRD manager script:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/trd.sh $ARGUMENTS
```

## Default Behavior

Running `/devflow:trd` with no arguments auto-generates TRDs from `.devflow/design.md`.
It parses the `## Implementation Plan` section and creates a TRD for each `- [ ] Task` line,
mapping phase numbers to priorities.

## Commands

| Command | Description |
|---------|-------------|
| *(no args)* | Generate TRDs from design doc's Implementation Plan |
| `create <name>` | Create new TRD with auto-incremented ID |
| `list` | List all TRDs with status |
| `view <id>` | View TRD content |
| `status <id> <status>` | Update TRD status |
| `template` | Show TRD template |

## Options

### Generate options
- `--dry-run` - Preview TRDs that would be created without writing files
- `--force` - Regenerate even if TRDs already exist

### Create options
- `--priority <n>` - Set priority (1=critical, 2=high, 3=medium, 4=low)
- `--effort <size>` - Set effort (small/medium/large/xlarge)

## Examples

```bash
# Auto-generate TRDs from design doc (default)
/devflow:trd

# Preview what would be generated
/devflow:trd --dry-run

# Force regenerate (when TRDs already exist)
/devflow:trd --force

# Create a single TRD manually
/devflow:trd create "User authentication flow"
/devflow:trd create "API rate limiting" --priority 2 --effort medium

# List all TRDs
/devflow:trd list

# View a specific TRD
/devflow:trd view 001

# Update status
/devflow:trd status 001 in_progress
/devflow:trd status 001 complete
```

## TRD Structure

Each TRD includes:
- **Metadata**: ID, status, priority, effort, dates
- **Description**: Feature details
- **Acceptance Criteria**: Checkboxes for completion
- **Dependencies**: Blocked by / blocks relationships
- **Technical Approach**: Implementation plan
- **Verification Steps**: Unit, integration, manual tests
- **UI Test Scenarios**: Playwright MCP test definitions
- **Regression Tests**: Tests to add when complete

## Workflow

1. Design: `/devflow:design` to create design doc
2. Generate TRDs: `/devflow:trd` to auto-create from design
3. Edit each TRD to fill in details
4. Start work: `/devflow:trd status 001 in_progress`
5. Implement following the TRD's technical approach
6. Complete: `/devflow:trd status 001 complete`
7. Sync features: `/devflow:features sync`
8. Add to regression: `/devflow:regression add TRD-001`
