---
description: Run build verification checks from verification.json
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh *)
  - Read
slash-command-tools: hidden
---

# Build Verification

Run verification checks:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/verify.sh $ARGUMENTS
```

## Commands

| Command | Description |
|---------|-------------|
| `run [category]` | Run all checks (or specific category) |
| `init` | Initialize verification.json with defaults |
| `list` | List configured checks |
| `add <json>` | Add a check |
| `status` | Show last run status |

## Categories

- `unit` - Unit tests
- `integration` - Integration tests
- `type_check` - Type checking (tsc, mypy, svelte-check)
- `lint` - Linting (eslint, ruff)
- `build` - Build verification

## Options

- `--required` - Only run required checks
- `--continue` - Continue on failure (don't stop at first error)

## Examples

```bash
# Run all verification checks
/devflow:verify run

# Run only unit tests
/devflow:verify run unit

# Run only required checks
/devflow:verify run --required

# Initialize verification config
/devflow:verify init

# List configured checks
/devflow:verify list
```

## Configuration

The `.devflow/verification.json` schema:

```json
{
  "version": "1.0",
  "categories": {
    "unit": {
      "description": "Unit tests",
      "checks": [
        {
          "name": "npm-test",
          "command": "npm run test",
          "timeout": 120,
          "required": true,
          "working_dir": ".",
          "enabled": true,
          "detect": "package.json"
        }
      ]
    }
  },
  "lastRun": {
    "timestamp": "2024-01-15T10:30:00Z",
    "passed": 5,
    "failed": 0,
    "skipped": 2
  }
}
```

## Check Properties

| Property | Description |
|----------|-------------|
| `name` | Check identifier |
| `command` | Shell command to run |
| `timeout` | Max seconds before timeout |
| `required` | If true, failure stops the run |
| `working_dir` | Directory to run command in |
| `enabled` | If false, check is skipped |
| `detect` | File that must exist for check to run |

## Exit Codes

- `0` - All checks passed
- `1` - One or more checks failed

## Autonomous Integration

Verification runs automatically before TRD completion in the autonomous loop.
