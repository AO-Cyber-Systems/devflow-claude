---
description: Generate and manage feature_list.json from TRDs
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/features.sh *)
  - Read
slash-command-tools: hidden
---

# Feature List Management

Run the features script:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/features.sh $ARGUMENTS
```

## Commands

| Command | Description |
|---------|-------------|
| `sync` | Parse TRDs and regenerate feature_list.json |
| `list` | List features with status |
| `status <id> <s>` | Update feature status |
| `get <id>` | Get feature details as JSON |
| `init` | Initialize empty feature_list.json |

## Examples

```bash
# Sync features from TRDs
/devflow:features sync

# List all features
/devflow:features list

# Update status
/devflow:features status TRD-001 complete

# Get feature details
/devflow:features get TRD-001
```

## Feature List Schema

The generated `.devflow/feature_list.json`:

```json
{
  "version": "1.0",
  "generated_at": "2024-01-15T10:30:00Z",
  "source": ".devflow/trds",
  "features": [
    {
      "id": "TRD-001",
      "name": "User authentication flow",
      "status": "pending",
      "priority": 1,
      "effort": "medium",
      "dependencies": ["TRD-000"],
      "verification": {
        "criteria_met": false,
        "tests_pass": false,
        "regression_added": false
      },
      "source_file": ".devflow/trds/TRD-001-user-authentication.md"
    }
  ]
}
```

## Autonomous Loop Integration

The feature_list.json is used by `/devflow:autonomous` to:
1. Identify next task to work on (first pending, non-blocked)
2. Track completion progress
3. Exit loop when all features are complete

## Workflow

1. Create TRDs: `/devflow:trd create "Feature"`
2. Sync features: `/devflow:features sync`
3. Start autonomous: `/devflow:autonomous --task-file .devflow/feature_list.json`
4. Features auto-update as TRDs are completed
