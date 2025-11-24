#!/bin/bash
# Test Runner Script
# Runs tests for a project

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
SUITE="${2:-all}"
shift 2 2>/dev/null || shift 2>/dev/null || true

validate_project "$PROJECT"

print_header "Running tests: $PROJECT"

PROJECT_DIR="$PROJECTS_DIR/$PROJECT"
TESTS_DIR="$PROJECT_DIR/tests"

run_etl_tests() {
    print_info "Running ETL tests (pytest)..."
    if [ -d "$TESTS_DIR/etl" ] && find "$TESTS_DIR/etl" -name "test_*.py" | grep -q .; then
        cd "$ROOT_DIR"
        if [ -d ".venv" ]; then
            source ".venv/bin/activate"
        fi
        pytest "$TESTS_DIR/etl" -v --tb=short
        print_success "ETL tests passed"
    else
        print_warning "No ETL tests found"
    fi
}

run_api_tests() {
    print_info "Running API tests (Jest)..."
    if [ -d "$TESTS_DIR/api" ] && find "$TESTS_DIR/api" -name "*.test.ts" | grep -q .; then
        cd "$ROOT_DIR/src/api"
        npm test -- --testPathPattern="$TESTS_DIR/api"
        print_success "API tests passed"
    else
        print_warning "No API tests found"
    fi
}

run_ui_tests() {
    print_info "Running UI tests (Vitest)..."
    if [ -d "$TESTS_DIR/ui" ] && find "$TESTS_DIR/ui" -name "*.test.tsx" | grep -q .; then
        cd "$ROOT_DIR/src/ui"
        npm test -- --run "$TESTS_DIR/ui"
        print_success "UI tests passed"
    else
        print_warning "No UI tests found"
    fi
}

run_e2e_tests() {
    print_info "Running E2E tests (Playwright)..."
    if [ -d "$TESTS_DIR/e2e" ] && find "$TESTS_DIR/e2e" -name "*.spec.ts" | grep -q .; then
        cd "$ROOT_DIR"
        npx playwright test "$TESTS_DIR/e2e"
        print_success "E2E tests passed"
    else
        print_warning "No E2E tests found"
    fi
}

case "$SUITE" in
    etl)
        run_etl_tests
        ;;
    api)
        run_api_tests
        ;;
    ui)
        run_ui_tests
        ;;
    e2e)
        run_e2e_tests
        ;;
    all)
        run_etl_tests
        run_api_tests
        run_ui_tests
        run_e2e_tests
        ;;
    *)
        print_error "Unknown test suite: $SUITE"
        echo "Available: etl, api, ui, e2e, all"
        exit 1
        ;;
esac

print_success "All tests complete"
