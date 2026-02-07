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

## Commands

| Command | Description |
|---------|-------------|
| `create <name>` | Create new TRD with auto-incremented ID |
| `list` | List all TRDs with status |
| `view <id>` | View TRD content |
| `status <id> <status>` | Update TRD status |
| `template` | Show TRD template |

## Options

- `--priority <n>` - Set priority (1=critical, 2=high, 3=medium, 4=low)
- `--effort <size>` - Set effort (small/medium/large/xlarge)

## Examples

```bash
# Create a new TRD
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

1. Create TRD: `/devflow:trd create "Feature name"`
2. Edit TRD to fill in details
3. Start work: `/devflow:trd status 001 in_progress`
4. Implement following the TRD's technical approach
5. Complete: `/devflow:trd status 001 complete`
6. Sync features: `/devflow:features sync`
7. Add to regression: `/devflow:regression add TRD-001`
