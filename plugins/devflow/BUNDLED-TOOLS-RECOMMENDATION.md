# DevFlow Agent: Bundled MCP Servers & LSP Reference

This document describes the MCP servers and LSP servers bundled with the DevFlow Agent plugin.

---

## Supported Platforms

| Platform | Languages/Frameworks |
|----------|---------------------|
| **Frontend** | Svelte 5, SvelteKit, TypeScript, JavaScript, Tailwind CSS |
| **Backend** | FastAPI (Python), Rails (Ruby), Go, Rust |
| **Database** | PostgreSQL |
| **Testing** | Playwright, Vitest, pytest, RSpec |

---

## Bundled MCP Servers

### Installation

```bash
# Install all MCP servers
cd plugins/devflow/mcp-servers && npm install

# Or use the full installer
/devflow:install
```

### Available Servers

| Server | Package | Purpose |
|--------|---------|---------|
| **Playwright** | `@playwright/mcp` | Browser automation, UI testing |
| **Filesystem** | `@anthropic-ai/mcp-server-filesystem` | Enhanced file operations |
| **Git** | `@anthropic-ai/mcp-server-git` | Version control operations |
| **Fetch** | `@anthropic-ai/mcp-server-fetch` | HTTP requests, API testing |
| **Memory** | `@anthropic-ai/mcp-server-memory` | Persistent knowledge graph |
| **Sequential Thinking** | `@anthropic-ai/mcp-server-sequential-thinking` | Complex reasoning |

### MCP Tools by Server

#### Playwright (22 tools)
- `browser_navigate`, `browser_navigate_back`
- `browser_snapshot`, `browser_take_screenshot`
- `browser_click`, `browser_type`, `browser_hover`, `browser_drag`
- `browser_select_option`, `browser_fill_form`
- `browser_wait_for`, `browser_press_key`
- `browser_evaluate`, `browser_run_code`
- `browser_console_messages`, `browser_network_requests`
- `browser_tabs`, `browser_resize`
- `browser_handle_dialog`, `browser_file_upload`
- `browser_close`, `browser_install`

#### Git
- `git_status`, `git_diff`, `git_diff_staged`
- `git_log`, `git_show`, `git_commit`, `git_add`
- `git_branch`, `git_checkout`
- `git_search`, `git_blame`

#### Filesystem
- `read_file`, `read_multiple_files`, `write_file`
- `list_directory`, `create_directory`
- `search_files`, `get_file_info`, `move_file`

#### Fetch
- `fetch` - HTTP requests with LLM-optimized responses

#### Memory
- `create_entities`, `create_relations`
- `search_nodes`, `open_nodes`, `read_graph`
- `add_observations`, `delete_entities`

---

## Bundled LSP Servers

### Installation

```bash
# Install all LSP servers
cd plugins/devflow/lsp && npm install
./install-lsp.sh

# Or use the full installer
/devflow:install
```

### Available LSPs

| Language | LSP Server | Install Method |
|----------|------------|----------------|
| **TypeScript/JS** | `typescript-language-server` | npm |
| **Svelte** | `svelte-language-server` | npm |
| **Python** | `pyright` | npm |
| **Ruby** | `solargraph` | gem |
| **Rust** | `rust-analyzer` | rustup |
| **Go** | `gopls` | go install |
| **Tailwind CSS** | `@tailwindcss/language-server` | npm |
| **JSON** | `vscode-json-languageserver` | npm |
| **YAML** | `yaml-language-server` | npm |

### LSP Configuration

See `lsp/claude-lsp-config.json` for the full Claude Code LSP configuration.

---

## Directory Structure

```
devflow/
├── mcp-servers/
│   ├── package.json              # MCP server dependencies
│   └── config/
│       ├── playwright.json       # Playwright config & tool list
│       ├── filesystem.json       # Filesystem allowed paths
│       ├── git.json              # Git operations
│       ├── fetch.json            # HTTP/API testing
│       ├── memory.json           # Knowledge graph persistence
│       ├── sequential-thinking.json
│       └── ruby-lsp.json         # Ruby LSP (Solargraph) config
├── lsp/
│   ├── package.json              # npm-based LSP dependencies
│   ├── install-lsp.sh            # Full LSP installation script
│   └── claude-lsp-config.json    # Claude Code LSP configuration
├── scripts/
│   ├── install-deps.sh           # Full installer (mise + MCP + LSP)
│   └── doctor.sh                 # Dependency checker
└── hooks/
    └── security-hook.sh          # Allowlist (includes Ruby commands)
```

---

## Security

### Allowed Commands (security-hook.sh)

The security hook allowlists commands for:
- **Node/JS**: npm, pnpm, npx, node
- **Python**: python, pip, poetry, pytest, ruff, black, mypy, uvicorn
- **Ruby**: ruby, bundle, gem, rake, rails, rspec, rubocop, solargraph
- **Build**: vite, vitest, playwright, eslint, prettier, tsc, svelte-check
- **Git**: git, gh
- **Docker**: docker, docker-compose
- **Services**: stripe
- **Utilities**: curl, wget, jq, yq, rg, fd, make

### MCP Server Permissions

| Server | Read | Write | Execute | Network |
|--------|------|-------|---------|---------|
| Playwright | Yes | No | No | Browser |
| Filesystem | Yes | Yes | No | No |
| Git | Yes | Yes | No | No |
| Fetch | Yes | No | No | HTTP |
| Memory | Yes | Yes | No | No |

---

## Quick Start

```bash
# 1. Install all dependencies
/devflow:install

# 2. Check installation
/devflow:doctor

# 3. Start using
/devflow:autonomous
```

---

## Sources

- [MCP Official Servers](https://github.com/modelcontextprotocol/servers)
- [Playwright MCP](https://github.com/anthropics/mcp-playwright)
- [Svelte Language Tools](https://github.com/sveltejs/language-tools)
- [Solargraph (Ruby LSP)](https://solargraph.org/)
