---
description: Manage anti-regression test suite from completed TRDs
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh *)
  - Read
slash-command-tools: hidden
---

# Regression Test Suite Management

Run the regression manager:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/regression.sh $ARGUMENTS
```

## Commands

| Command | Description |
|---------|-------------|
| `add <trd-id>` | Add tests from completed TRD |
| `run [type]` | Run all regression tests (or specific type) |
| `list` | List registered tests |
| `report` | Show run history |
| `init` | Initialize manifest |
| `clear` | Clear all tests (with confirmation) |

## Test Types

- `unit` - Unit tests
- `integration` - Integration tests
- `ui` - UI tests (Playwright MCP)
- `e2e` - End-to-end tests

## Options

- `--continue` - Continue on failure
- `--baseline` - Capture new UI baselines

## Examples

```bash
# Add tests from completed TRD
/devflow-agent:regression add TRD-001

# Run all regression tests
/devflow-agent:regression run

# Run only unit tests
/devflow-agent:regression run unit

# Capture new UI baselines
/devflow-agent:regression run ui --baseline

# View history
/devflow-agent:regression report
```

## How It Works

1. Complete a TRD: `/devflow-agent:trd status 001 complete`
2. Add its tests: `/devflow-agent:regression add TRD-001`
3. Tests from the TRD's "Regression Tests to Add" section are registered
4. Run regression suite before each new feature to prevent breakage

## Directory Structure

```
.devflow/regression/
├── manifest.json        # Test registry
├── baselines/           # UI screenshot baselines
│   └── TRD-001/         # Per-TRD baseline directories
└── history/runs/        # Run history JSON files
```

## Manifest Schema

```json
{
  "version": "1.0",
  "tests": {
    "unit": [
      {"path": "src/__tests__/auth.test.ts", "description": "Auth tests", "source": "TRD-001"}
    ],
    "integration": [],
    "ui": [
      {"scenario": "Login flow", "baseline_path": "baselines/TRD-001/login", "source": "TRD-001"}
    ],
    "e2e": []
  },
  "sources": ["TRD-001", "TRD-002"],
  "statistics": {
    "total_runs": 10,
    "last_run": "2024-01-15T10:30:00Z",
    "pass_rate": 95.5
  }
}
```

## Autonomous Integration

The regression suite runs automatically:
1. Before starting work on each TRD
2. After implementing a feature (before marking complete)
3. Prevents TRD completion if regression tests fail
