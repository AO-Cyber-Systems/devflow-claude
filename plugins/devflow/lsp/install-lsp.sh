#!/bin/bash
# DevFlow Agent LSP Installation Script
# Installs all Language Server Protocol servers for supported platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== DevFlow Agent LSP Installation ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Install npm-based LSPs
echo "Installing npm-based LSP servers..."
cd "$SCRIPT_DIR"
if npm install; then
    success "npm LSP packages installed"
else
    error "Failed to install npm LSP packages"
    exit 1
fi

# Install Rust Analyzer
echo ""
echo "Checking rust-analyzer..."
if command -v rustup &> /dev/null; then
    if rustup component add rust-analyzer 2>/dev/null; then
        success "rust-analyzer installed via rustup"
    else
        warn "rust-analyzer may already be installed or rustup failed"
    fi
elif command -v brew &> /dev/null; then
    if brew install rust-analyzer 2>/dev/null; then
        success "rust-analyzer installed via Homebrew"
    else
        warn "rust-analyzer may already be installed"
    fi
else
    warn "Skipping rust-analyzer (no rustup or brew found)"
fi

# Install gopls
echo ""
echo "Checking gopls..."
if command -v go &> /dev/null; then
    if go install golang.org/x/tools/gopls@latest 2>/dev/null; then
        success "gopls installed"
    else
        warn "gopls installation failed or already installed"
    fi
else
    warn "Skipping gopls (Go not installed)"
fi

# Install Solargraph (Ruby LSP)
echo ""
echo "Checking solargraph (Ruby LSP)..."
if command -v gem &> /dev/null; then
    if gem install solargraph --no-document 2>/dev/null; then
        success "solargraph installed"
    else
        warn "solargraph installation failed or already installed"
    fi
else
    warn "Skipping solargraph (Ruby/gem not installed)"
fi

# Verify installations
echo ""
echo "=== LSP Installation Summary ==="
echo ""

check_lsp() {
    local name="$1"
    local cmd="$2"
    if command -v "$cmd" &> /dev/null || [ -f "$SCRIPT_DIR/node_modules/.bin/$cmd" ]; then
        success "$name"
    else
        error "$name (not found)"
    fi
}

echo "npm-based LSPs:"
check_lsp "  TypeScript LSP" "typescript-language-server"
check_lsp "  Svelte LSP" "svelteserver"
check_lsp "  Python LSP (Pyright)" "pyright-langserver"
check_lsp "  Tailwind CSS LSP" "tailwindcss-language-server"
check_lsp "  JSON LSP" "vscode-json-languageserver"
check_lsp "  YAML LSP" "yaml-language-server"

echo ""
echo "System LSPs:"
check_lsp "  Rust Analyzer" "rust-analyzer"
check_lsp "  Go LSP (gopls)" "gopls"
check_lsp "  Ruby LSP (Solargraph)" "solargraph"

echo ""
success "LSP installation complete!"
