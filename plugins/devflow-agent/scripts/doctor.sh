#!/bin/bash
# DevFlow Agent - Dependency Doctor
# Checks for required tools using mise as the primary installer
# Compatible with bash 3.x (macOS default)

set -euo pipefail

# =============================================================================
# COLORS
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# =============================================================================
# OS DETECTION
# =============================================================================
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*) echo "linux" ;;
    *) echo "unknown" ;;
  esac
}

OS=$(detect_os)

echo -e "${BLUE}DevFlow Agent - Dependency Doctor${NC}"
echo -e "${BLUE}===================================${NC}"
echo ""
echo -e "OS: ${GREEN}$OS${NC}"
echo ""

# =============================================================================
# CHECK FOR MISE
# =============================================================================
MISE_AVAILABLE=false
if command -v mise &>/dev/null; then
  MISE_AVAILABLE=true
  MISE_VERSION=$(mise --version 2>/dev/null | head -1)
  echo -e "mise: ${GREEN}✓ $MISE_VERSION${NC}"
else
  echo -e "mise: ${RED}✗ not installed${NC}"
  echo ""
  echo -e "${YELLOW}mise is the recommended way to install tools.${NC}"
  echo -e "Install mise first:"
  echo ""
  if [[ "$OS" == "macos" ]]; then
    echo "  brew install mise"
    echo "  # or"
    echo "  curl https://mise.run | sh"
  else
    echo "  curl https://mise.run | sh"
  fi
  echo ""
  echo "Then add to your shell:"
  echo "  echo 'eval \"\$(mise activate bash)\"' >> ~/.bashrc"
  echo "  # or for zsh:"
  echo "  echo 'eval \"\$(mise activate zsh)\"' >> ~/.zshrc"
  echo ""
fi
echo ""

# =============================================================================
# COUNTERS
# =============================================================================
INSTALLED_COUNT=0
MISSING_COUNT=0
MISSING_TOOLS=""
MISE_INSTALL_CMD=""

# =============================================================================
# CHECK TOOL FUNCTION
# =============================================================================
check_tool() {
  local name=$1
  local check_cmd=$2
  local mise_plugin=$3  # mise plugin name (or "_" if not available via mise)
  local fallback=$4     # fallback install command

  if eval "$check_cmd" &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $name"
    INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    return 0
  fi

  echo -e "  ${RED}✗${NC} $name"
  MISSING_COUNT=$((MISSING_COUNT + 1))

  if [[ "$mise_plugin" != "_" ]] && [[ "$MISE_AVAILABLE" == "true" ]]; then
    MISSING_TOOLS="${MISSING_TOOLS}  mise use -g $mise_plugin@latest\n"
    MISE_INSTALL_CMD="$MISE_INSTALL_CMD $mise_plugin@latest"
  elif [[ "$fallback" != "_" ]]; then
    MISSING_TOOLS="${MISSING_TOOLS}  $fallback\n"
  else
    MISSING_TOOLS="${MISSING_TOOLS}  # $name: no install method available\n"
  fi

  return 1
}

# =============================================================================
# CHECK TOOLS BY CATEGORY
# =============================================================================

# Format: name, check_cmd, mise_plugin, fallback_install

echo -e "${YELLOW}Core Tools:${NC}"
check_tool "node" "node --version" "node" "brew install node" || true
check_tool "pnpm" "pnpm --version" "pnpm" "npm install -g pnpm" || true
check_tool "git" "git --version" "_" "brew install git" || true
check_tool "gh" "gh --version" "github-cli" "brew install gh" || true
check_tool "docker" "docker --version" "_" "brew install --cask docker" || true
echo ""

echo -e "${YELLOW}Python Tools:${NC}"
check_tool "python3" "python3 --version" "python" "brew install python3" || true
check_tool "poetry" "poetry --version" "poetry" "pip3 install --user poetry" || true
check_tool "pytest" "pytest --version" "_" "pip3 install --user pytest" || true
check_tool "ruff" "ruff --version" "ruff" "pip3 install --user ruff" || true
check_tool "black" "black --version" "_" "pip3 install --user black" || true
check_tool "mypy" "mypy --version" "_" "pip3 install --user mypy" || true
check_tool "uvicorn" "uvicorn --version" "_" "pip3 install --user uvicorn" || true
echo ""

echo -e "${YELLOW}Ruby Tools:${NC}"
check_tool "ruby" "ruby --version" "ruby" "brew install ruby" || true
check_tool "bundler" "bundle --version" "_" "gem install bundler" || true
check_tool "rake" "rake --version" "_" "gem install rake" || true
check_tool "rspec" "rspec --version" "_" "gem install rspec" || true
check_tool "rubocop" "rubocop --version" "_" "gem install rubocop" || true
check_tool "solargraph" "solargraph --version" "_" "gem install solargraph" || true
echo ""

echo -e "${YELLOW}Rust Tools:${NC}"
check_tool "rustc" "rustc --version" "rust" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" || true
check_tool "cargo" "cargo --version" "_" "_" || true
check_tool "rust-analyzer" "rust-analyzer --version" "_" "rustup component add rust-analyzer" || true
echo ""

echo -e "${YELLOW}Go Tools:${NC}"
check_tool "go" "go version" "go" "brew install go" || true
check_tool "gopls" "gopls version" "_" "go install golang.org/x/tools/gopls@latest" || true
echo ""

echo -e "${YELLOW}CLI Tools:${NC}"
check_tool "jq" "jq --version" "jq" "brew install jq" || true
check_tool "yq" "yq --version" "yq" "brew install yq" || true
check_tool "tree" "tree --version" "_" "brew install tree" || true
check_tool "ripgrep" "rg --version" "ripgrep" "brew install ripgrep" || true
check_tool "fd" "fd --version" "fd" "brew install fd" || true
check_tool "make" "make --version" "_" "xcode-select --install" || true
echo ""

echo -e "${YELLOW}Project Tools:${NC}"
check_tool "stripe" "stripe --version" "_" "brew install stripe/stripe-cli/stripe" || true
echo ""

echo -e "${YELLOW}LSP Servers:${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LSP_BIN="$SCRIPT_DIR/../lsp/node_modules/.bin"
check_tool "typescript-lsp" "command -v typescript-language-server || test -f $LSP_BIN/typescript-language-server" "_" "npm i -g typescript-language-server" || true
check_tool "svelte-lsp" "command -v svelteserver || test -f $LSP_BIN/svelteserver" "_" "npm i -g svelte-language-server" || true
check_tool "pyright" "command -v pyright-langserver || test -f $LSP_BIN/pyright-langserver" "_" "npm i -g pyright" || true
check_tool "tailwind-lsp" "command -v tailwindcss-language-server || test -f $LSP_BIN/tailwindcss-language-server" "_" "npm i -g @tailwindcss/language-server" || true
check_tool "yaml-lsp" "command -v yaml-language-server || test -f $LSP_BIN/yaml-language-server" "_" "npm i -g yaml-language-server" || true
check_tool "json-lsp" "command -v vscode-json-languageserver || test -f $LSP_BIN/vscode-json-languageserver" "_" "npm i -g vscode-json-languageserver" || true
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}-------${NC}"
echo -e "  Installed: ${GREEN}$INSTALLED_COUNT${NC}"
echo -e "  Missing: ${YELLOW}$MISSING_COUNT${NC}"
echo ""

# =============================================================================
# INSTALL COMMANDS
# =============================================================================
if [[ $MISSING_COUNT -gt 0 ]]; then
  if [[ "$MISE_AVAILABLE" == "true" ]] && [[ -n "$MISE_INSTALL_CMD" ]]; then
    echo -e "${GREEN}Install with mise (recommended):${NC}"
    echo ""
    echo "  mise use -g$MISE_INSTALL_CMD"
    echo ""
    echo -e "${YELLOW}Or install individually:${NC}"
  else
    echo -e "${YELLOW}Install commands:${NC}"
  fi
  echo ""
  echo -e "$MISSING_TOOLS"
fi

if [[ $MISSING_COUNT -gt 0 ]]; then
  echo -e "${BLUE}---${NC}"
  if [[ "$MISE_AVAILABLE" == "true" ]]; then
    echo -e "Run ${GREEN}/devflow-agent:install${NC} to auto-install via mise."
  else
    echo -e "Install mise first, then run ${GREEN}/devflow-agent:install${NC}"
  fi
  echo ""
fi
