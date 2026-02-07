---
description: Check for required tools and show install commands
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/doctor.sh)
slash-command-tools: hidden
---

# DevFlow Dependency Doctor

Run the dependency checker to see which tools are installed and get install commands for missing ones.

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/doctor.sh
```

This will:
1. Detect your operating system (macOS, Debian/Ubuntu, etc.)
2. Check for all required tools
3. Show which tools are installed vs missing
4. Provide install commands appropriate for your system
5. Separate tools that need sudo from those that don't
