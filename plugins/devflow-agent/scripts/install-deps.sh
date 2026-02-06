#!/bin/bash
# DevFlow Agent - Auto-Install Dependencies
# Installs: mise tools, MCP servers, LSPs, and language-specific packages

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# COLORS
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}DevFlow Agent - Full Installation${NC}"
echo -e "${BLUE}===================================${NC}"
echo ""

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }

install_if_missing() {
  local tool=$1
  local check_cmd=$2

  # Check if tool is already in mise global config.
  # We can't just check if the command exists — macOS ships restricted system
  # versions (e.g., /usr/bin/python3 is Xcode's Python 3.9 which can't create
  # venvs, /usr/bin/ruby is 2.6 which requires sudo for gem install).
  # We must ensure the tool is in mise's global config so shims resolve to
  # the mise-managed version.
  if mise ls "$tool" 2>/dev/null | grep -q '\.config/mise'; then
    success "$tool (mise-managed)"
    return
  fi

  if eval "$check_cmd" &>/dev/null; then
    info "$tool found (not mise-managed) — adding to mise global..."
  else
    info "Installing $tool..."
  fi

  if mise use -g "$tool@latest" 2>/dev/null; then
    success "$tool installed"
  else
    error "Failed to install $tool"
  fi
}

# =============================================================================
# PHASE 0: MISE SETUP
# =============================================================================
echo -e "${BLUE}Phase 0: Mise Setup${NC}"
echo ""

if ! command -v mise &>/dev/null; then
  error "mise is not installed."
  echo ""
  echo "Install mise first:"
  echo ""
  case "$(uname -s)" in
    Darwin*)
      echo "  brew install mise"
      echo "  # or"
      echo "  curl https://mise.run | sh"
      ;;
    *)
      echo "  curl https://mise.run | sh"
      ;;
  esac
  echo ""
  echo "Then run this script again."
  echo ""
  exit 1
fi

success "mise: $(mise --version | head -1)"

# --- Ensure mise shims are on PATH ---
# mise has two modes: "activate" (hook-based, modifies PATH on cd) and
# "shims" (static binaries at ~/.local/share/mise/shims).
#
# The activate mode only puts tools on PATH that are in the global config
# AND only after a shell hook fires. This means:
#   - Tools installed but not in global config won't be found
#   - Non-interactive shells (like Claude Code's Bash tool) may not trigger hooks
#
# The shims directory always works: it contains a shim for every installed tool.
# We add it to PATH for this script AND ensure it's in the user's shell profile
# so Claude Code and other tools can find mise-managed runtimes.

MISE_SHIMS="$HOME/.local/share/mise/shims"
export PATH="$MISE_SHIMS:$PATH"

# Detect the user's default shell and its config file
detect_shell_config() {
  local user_shell
  user_shell=$(basename "${SHELL:-/bin/zsh}")
  case "$user_shell" in
    zsh)  echo "$HOME/.zshrc" ;;
    bash)
      # bash reads .bash_profile for login shells, .bashrc for non-login
      if [[ -f "$HOME/.bash_profile" ]]; then
        echo "$HOME/.bash_profile"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    fish) echo "$HOME/.config/fish/config.fish" ;;
    *)    echo "$HOME/.profile" ;;
  esac
}

SHELL_CONFIG=$(detect_shell_config)

# Add mise shims to shell profile if not already present
if [[ -f "$SHELL_CONFIG" ]]; then
  if ! grep -q 'mise/shims' "$SHELL_CONFIG" 2>/dev/null; then
    info "Adding mise shims to $SHELL_CONFIG..."
    {
      echo ""
      echo "# mise shims - ensures mise-managed tools are always on PATH"
      echo "export PATH=\"\$HOME/.local/share/mise/shims:\$PATH\""
    } >> "$SHELL_CONFIG"
    success "mise shims added to $SHELL_CONFIG"
    warn "Restart your shell or run: source $SHELL_CONFIG"
  else
    success "mise shims already in $SHELL_CONFIG"
  fi
else
  warn "Shell config not found at $SHELL_CONFIG - add this manually:"
  echo "  export PATH=\"\$HOME/.local/share/mise/shims:\$PATH\""
fi

echo ""

# =============================================================================
# PHASE 1: MISE TOOLS
# =============================================================================
echo -e "${BLUE}Phase 1: Core Tools (via mise)${NC}"
echo ""

# Core tools
install_if_missing "node" "node --version"
install_if_missing "pnpm" "pnpm --version"
install_if_missing "python" "python3 --version"
install_if_missing "ruby" "ruby --version"
install_if_missing "ruff" "ruff --version"
install_if_missing "github-cli" "gh --version"
install_if_missing "jq" "jq --version"
install_if_missing "yq" "yq --version"
install_if_missing "ripgrep" "rg --version"
install_if_missing "fd" "fd --version"
install_if_missing "go" "go version"
install_if_missing "rust" "rustc --version"

# Reshim after installing tools so shims are up to date
mise reshim 2>/dev/null || true
# Re-export PATH to pick up any newly created shims
export PATH="$MISE_SHIMS:$PATH"
hash -r 2>/dev/null || true

echo ""

# =============================================================================
# PHASE 2: LANGUAGE-SPECIFIC PACKAGES
# =============================================================================
echo -e "${BLUE}Phase 2: Language Packages${NC}"
echo ""

# Verify a tool resolves to mise-managed version (not macOS system)
verify_mise_runtime() {
  local cmd=$1
  local name=$2
  local path
  path=$(command -v "$cmd" 2>/dev/null || true)
  if [[ -z "$path" ]]; then
    error "$name not found - install it first: mise use -g $name@latest"
    return 1
  elif [[ "$path" == /usr/bin/* ]] || [[ "$path" == /Applications/* ]] || [[ "$path" == /Library/* ]]; then
    warn "$name is using system version at $path"
    warn "Installing mise-managed $name to avoid permission issues..."
    if mise use -g "$name@latest" 2>/dev/null; then
      mise reshim 2>/dev/null || true
      hash -r 2>/dev/null || true
      success "$name now using mise-managed version"
    else
      error "Failed to install mise-managed $name"
      return 1
    fi
  fi
  return 0
}

# Python packages (use mise-managed Python, no --user flag needed)
echo "Python packages:"
if verify_mise_runtime "python3" "python"; then
  pip_install() {
    local pkg=$1
    local cmd=$2
    if command -v "$cmd" &>/dev/null; then
      success "  $pkg"
    else
      info "  Installing $pkg..."
      pip3 install "$pkg" 2>/dev/null && success "  $pkg installed" || error "  Failed: $pkg"
    fi
  }

  # Poetry — installed via pip, not mise. The mise vfox-poetry plugin creates a
  # venv that can't resolve libpython dylibs from mise's standalone Python builds.
  pip_install "poetry" "poetry"

  pip_install "pytest" "pytest"
  pip_install "black" "black"
  pip_install "mypy" "mypy"
  pip_install "uvicorn" "uvicorn"
else
  warn "Skipping Python packages (no mise-managed Python available)"
fi

echo ""

# Ruby gems (use mise-managed Ruby, no sudo needed)
echo "Ruby gems:"
if verify_mise_runtime "ruby" "ruby"; then
  gem_install() {
    local gem_name=$1
    local cmd=$2
    if command -v "$cmd" &>/dev/null || gem list -i "$gem_name" &>/dev/null; then
      success "  $gem_name"
    else
      info "  Installing $gem_name..."
      gem install "$gem_name" --no-document 2>/dev/null && success "  $gem_name installed" || error "  Failed: $gem_name"
    fi
  }

  gem_install "bundler" "bundle"
  gem_install "rake" "rake"
  gem_install "rspec" "rspec"
  gem_install "rubocop" "rubocop"
  gem_install "solargraph" "solargraph"
else
  warn "Skipping Ruby gems (no mise-managed Ruby available)"
fi

echo ""

# =============================================================================
# PHASE 3: MCP SERVERS
# =============================================================================
echo -e "${BLUE}Phase 3: MCP Servers${NC}"
echo ""

MCP_DIR="$PLUGIN_DIR/mcp-servers"

if [[ -d "$MCP_DIR" ]] && [[ -f "$MCP_DIR/package.json" ]]; then
  info "Installing MCP server dependencies..."
  cd "$MCP_DIR"
  if npm install 2>/dev/null; then
    success "MCP servers installed"
  else
    warn "MCP server installation had issues (may need manual review)"
  fi
  cd "$SCRIPT_DIR"
else
  warn "MCP servers directory not found at $MCP_DIR"
fi

echo ""

# Register MCP servers with Claude Code (if claude CLI available)
if command -v claude &>/dev/null; then
  echo "Registering MCP servers with Claude Code..."

  # Only register if not already registered
  register_mcp() {
    local name=$1
    local pkg=$2
    if claude mcp list 2>/dev/null | grep -q "$name"; then
      success "  $name (already registered)"
    else
      info "  Registering $name..."
      if claude mcp add "$name" -- npx "$pkg" 2>/dev/null; then
        success "  $name registered"
      else
        warn "  Failed to register $name (may need manual setup)"
      fi
    fi
  }

  register_mcp "playwright" "@playwright/mcp"
  register_mcp "filesystem" "@anthropic-ai/mcp-server-filesystem"
  register_mcp "git" "@anthropic-ai/mcp-server-git"
  register_mcp "fetch" "@anthropic-ai/mcp-server-fetch"
  register_mcp "memory" "@anthropic-ai/mcp-server-memory"
  register_mcp "sequential-thinking" "@anthropic-ai/mcp-server-sequential-thinking"

else
  warn "Claude CLI not found - MCP servers installed but not registered"
  echo "    Run 'claude mcp add <name> -- npx <package>' to register manually"
fi

echo ""

# =============================================================================
# PHASE 4: LSP SERVERS
# =============================================================================
echo -e "${BLUE}Phase 4: Language Server Protocol (LSP) Servers${NC}"
echo ""

LSP_DIR="$PLUGIN_DIR/lsp"

if [[ -d "$LSP_DIR" ]] && [[ -f "$LSP_DIR/package.json" ]]; then
  info "Installing npm-based LSP servers..."
  cd "$LSP_DIR"
  if npm install 2>/dev/null; then
    success "npm LSP servers installed"
  else
    warn "npm LSP installation had issues"
  fi
  cd "$SCRIPT_DIR"
fi

# System LSPs (not npm-based)
echo ""
echo "System LSP servers:"

# Rust analyzer
if command -v rust-analyzer &>/dev/null; then
  success "  rust-analyzer"
elif command -v rustup &>/dev/null; then
  info "  Installing rust-analyzer via rustup..."
  rustup component add rust-analyzer 2>/dev/null && success "  rust-analyzer installed" || warn "  rust-analyzer failed"
else
  warn "  rust-analyzer (rustup not available)"
fi

# gopls
if command -v gopls &>/dev/null; then
  success "  gopls"
elif command -v go &>/dev/null; then
  info "  Installing gopls..."
  go install golang.org/x/tools/gopls@latest 2>/dev/null && success "  gopls installed" || warn "  gopls failed"
else
  warn "  gopls (go not available)"
fi

# solargraph (Ruby) - already handled in gems section
if command -v solargraph &>/dev/null; then
  success "  solargraph (Ruby LSP)"
fi

echo ""

# =============================================================================
# PHASE 5: MANUAL INSTALLS
# =============================================================================
echo -e "${BLUE}Phase 5: Tools Requiring Manual Install${NC}"
echo ""

check_manual() {
  local cmd=$1
  local name=$2
  local install_hint=$3
  if command -v "$cmd" &>/dev/null; then
    success "$name"
  else
    error "$name - $install_hint"
  fi
}

check_manual "docker" "docker" "Install Docker Desktop: https://docker.com/products/docker-desktop"
check_manual "stripe" "stripe" "brew install stripe/stripe-cli/stripe"
check_manual "tree" "tree" "brew install tree"
check_manual "make" "make" "xcode-select --install (macOS)"

echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo -e "${BLUE}==================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""
echo -e "Run ${GREEN}/devflow-agent:doctor${NC} to verify all dependencies."
echo ""
echo -e "MCP server configs: ${CYAN}$PLUGIN_DIR/mcp-servers/config/${NC}"
echo -e "LSP packages:       ${CYAN}$PLUGIN_DIR/lsp/node_modules/.bin/${NC}"
echo ""
