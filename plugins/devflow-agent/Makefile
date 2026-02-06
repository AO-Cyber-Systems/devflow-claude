# DevFlow Agent Plugin Makefile
# Test targets for BATS test suite

.PHONY: test test-unit test-integration test-config test-security test-verbose install-test-deps help

# Default target
help:
	@echo "DevFlow Agent Plugin - Test Targets"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Test Targets:"
	@echo "  test             Run all tests"
	@echo "  test-unit        Run unit tests only"
	@echo "  test-integration Run integration tests only"
	@echo "  test-config      Run configuration validation tests"
	@echo "  test-security    Run security hook tests only"
	@echo "  test-verbose     Run all tests with verbose output"
	@echo ""
	@echo "Setup Targets:"
	@echo "  install-test-deps  Install BATS and extensions"
	@echo ""
	@echo "Examples:"
	@echo "  make test                 # Run all tests"
	@echo "  make test-security        # Run security tests"
	@echo "  make test-verbose         # Verbose output"

# Run all tests
test:
	@./tests/run-tests.sh all

# Run unit tests
test-unit:
	@./tests/run-tests.sh unit

# Run integration tests
test-integration:
	@./tests/run-tests.sh integration

# Run configuration tests
test-config:
	@./tests/run-tests.sh config

# Run security hook tests specifically
test-security:
	@bats tests/unit/security-hook.bats

# Run stop hook tests specifically
test-stop:
	@bats tests/unit/stop-hook.bats

# Run all tests with verbose output
test-verbose:
	@./tests/run-tests.sh all --verbose

# Run tests in parallel (if supported)
test-parallel:
	@./tests/run-tests.sh all -j 4

# Run tests with TAP output (for CI)
test-tap:
	@./tests/run-tests.sh all --tap

# Install test dependencies
install-test-deps:
	@echo "Installing BATS test framework..."
	@if command -v brew >/dev/null 2>&1; then \
		brew install bats-core; \
		echo "Note: For bats-support, bats-assert, and bats-file:"; \
		echo "  npm install -g bats-support bats-assert bats-file"; \
	elif command -v npm >/dev/null 2>&1; then \
		npm install -g bats bats-support bats-assert bats-file; \
	else \
		echo "Please install BATS manually:"; \
		echo "  https://github.com/bats-core/bats-core#installation"; \
	fi

# Check if BATS is installed
check-bats:
	@which bats >/dev/null 2>&1 || (echo "BATS not installed. Run: make install-test-deps" && exit 1)

# Clean up test artifacts
clean:
	@rm -rf tests/fixtures/tmp
	@echo "Cleaned test artifacts"

# CI target - run tests with TAP output and fail fast
ci: check-bats
	@bats tests/unit/*.bats tests/integration/*.bats tests/config/*.bats --tap

# Watch mode - run tests on file changes (requires entr)
watch:
	@echo "Watching for changes... (requires 'entr' to be installed)"
	@find hooks scripts tests -name "*.sh" -o -name "*.bats" | entr -c make test

# Coverage report (counts test cases)
coverage:
	@echo "Test Coverage Summary"
	@echo "====================="
	@echo ""
	@echo "Unit Tests:"
	@for f in tests/unit/*.bats; do \
		count=$$(grep -c "^@test" "$$f" 2>/dev/null || echo 0); \
		echo "  $$(basename $$f): $$count tests"; \
	done
	@echo ""
	@echo "Integration Tests:"
	@for f in tests/integration/*.bats; do \
		count=$$(grep -c "^@test" "$$f" 2>/dev/null || echo 0); \
		echo "  $$(basename $$f): $$count tests"; \
	done
	@echo ""
	@echo "Config Tests:"
	@for f in tests/config/*.bats; do \
		count=$$(grep -c "^@test" "$$f" 2>/dev/null || echo 0); \
		echo "  $$(basename $$f): $$count tests"; \
	done
	@echo ""
	@total=$$(grep -r "^@test" tests/ 2>/dev/null | wc -l | tr -d ' '); \
	echo "Total: $$total tests"
