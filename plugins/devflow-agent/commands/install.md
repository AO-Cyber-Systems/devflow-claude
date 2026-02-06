---
description: Auto-install missing tools that don't require sudo
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh)
  # npm - only specific allowed packages
  - Bash(npm install -g pnpm)
  - Bash(npm install -g typescript-language-server)
  - Bash(npm install -g svelte-language-server)
  - Bash(npm install -g @tailwindcss/language-server)
  - Bash(npm install -g yaml-language-server)
  - Bash(npm install -g vscode-json-languageserver)
  # pip - only specific allowed packages (mise-managed Python, no --user needed)
  - Bash(pip3 install poetry)
  - Bash(pip3 install pytest)
  - Bash(pip3 install ruff)
  - Bash(pip3 install black)
  - Bash(pip3 install mypy)
  - Bash(pip3 install uvicorn)
  - Bash(pip3 install yq)
  - Bash(pip3 install pyright)
  # brew - only specific allowed packages
  - Bash(brew install ruff)
  - Bash(brew install black)
  - Bash(brew install mypy)
  - Bash(brew install jq)
  - Bash(brew install yq)
  - Bash(brew install ripgrep)
  - Bash(brew install fd)
  - Bash(brew install tree)
slash-command-tools: hidden
---

# DevFlow Auto-Install

Automatically install missing tools that don't require sudo/admin privileges.

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh
```

This installs via:
- **npm**: pnpm
- **pip3** (mise-managed): poetry, pytest, ruff, black, mypy, uvicorn, yq
- **brew** (macOS): ruff, black, mypy, jq, yq, ripgrep, fd, tree

Tools requiring sudo (node, python3, git, docker, etc.) will show install commands but won't be auto-installed.
