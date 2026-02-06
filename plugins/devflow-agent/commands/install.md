---
description: Auto-install missing tools that don't require sudo
allowed-tools:
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh)
  # npm - only specific allowed packages
  - Bash(npm install -g pnpm)
  - Bash(npm install -g supabase)
  - Bash(npm install -g typescript-language-server)
  - Bash(npm install -g svelte-language-server)
  - Bash(npm install -g @tailwindcss/language-server)
  - Bash(npm install -g yaml-language-server)
  - Bash(npm install -g vscode-json-languageserver)
  # pip - only specific allowed packages
  - Bash(pip3 install --user poetry)
  - Bash(pip3 install --user pytest)
  - Bash(pip3 install --user ruff)
  - Bash(pip3 install --user black)
  - Bash(pip3 install --user mypy)
  - Bash(pip3 install --user uvicorn)
  - Bash(pip3 install --user yq)
  - Bash(pip3 install --user pyright)
  # brew - only specific allowed packages
  - Bash(brew install ruff)
  - Bash(brew install black)
  - Bash(brew install mypy)
  - Bash(brew install jq)
  - Bash(brew install yq)
  - Bash(brew install ripgrep)
  - Bash(brew install fd)
  - Bash(brew install tree)
  - Bash(brew install supabase/tap/supabase)
  - Bash(brew tap supabase/tap)
slash-command-tools: hidden
---

# DevFlow Auto-Install

Automatically install missing tools that don't require sudo/admin privileges.

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh
```

This installs via:
- **npm**: pnpm, supabase (if brew unavailable)
- **pip3 --user**: poetry, pytest, ruff, black, mypy, uvicorn, yq
- **brew** (macOS): ruff, black, mypy, jq, yq, ripgrep, fd, tree, supabase

Tools requiring sudo (node, python3, git, docker, etc.) will show install commands but won't be auto-installed.
