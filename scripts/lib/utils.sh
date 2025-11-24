#!/bin/bash
# Datagoose Shared Utilities
# Common functions used by lifecycle scripts

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Icons
CHECK="✓"
CROSS="✗"
ARROW="→"
WARN="⚠"

# Get the root directory of the datagoose project
get_root_dir() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$(cd "$script_dir/../.." && pwd)"
}

ROOT_DIR="$(get_root_dir)"
PROJECTS_DIR="$ROOT_DIR/projects"
PID_DIR="$HOME/.datagoose/pids"

# Print colored message
print_info() {
    echo -e "${BLUE}${ARROW}${NC} $1"
}

print_success() {
    echo -e "${GREEN}${CHECK}${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}${WARN}${NC} $1"
}

print_error() {
    echo -e "${RED}${CROSS}${NC} $1"
}

print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Validate project exists
validate_project() {
    local project="$1"
    if [ -z "$project" ]; then
        print_error "No project specified"
        echo "Usage: dg <project> <command>"
        echo "Available projects:"
        list_projects
        exit 1
    fi

    if [ ! -d "$PROJECTS_DIR/$project" ]; then
        print_error "Project '$project' not found"
        echo "Available projects:"
        list_projects
        exit 1
    fi
}

# List available projects
list_projects() {
    if [ -d "$PROJECTS_DIR" ]; then
        for dir in "$PROJECTS_DIR"/*/; do
            if [ -d "$dir" ]; then
                local name=$(basename "$dir")
                echo "  - $name"
            fi
        done
    else
        echo "  (no projects found)"
    fi
}

# Get project config value (requires node)
get_project_config() {
    local project="$1"
    local key="$2"
    local config_file="$PROJECTS_DIR/$project/project.config.ts"

    if [ -f "$config_file" ]; then
        # Simple grep-based extraction for common values
        case "$key" in
            "docker.postgresPort")
                grep -o "postgresPort: [0-9]*" "$config_file" | grep -o "[0-9]*" || echo "5432"
                ;;
            "api.port")
                grep -o "port: [0-9]*" "$config_file" | head -1 | grep -o "[0-9]*" || echo "3000"
                ;;
            "ui.port")
                grep -o "port: [0-9]*" "$config_file" | tail -1 | grep -o "[0-9]*" || echo "5173"
                ;;
            "docker.projectName")
                grep -o "projectName: '[^']*'" "$config_file" | cut -d"'" -f2 || echo "datagoose-$project"
                ;;
            *)
                echo ""
                ;;
        esac
    fi
}

# Save PID for a service
save_pid() {
    local project="$1"
    local service="$2"
    local pid="$3"

    mkdir -p "$PID_DIR/$project"
    echo "$pid" > "$PID_DIR/$project/$service.pid"
}

# Get saved PID for a service
get_pid() {
    local project="$1"
    local service="$2"
    local pid_file="$PID_DIR/$project/$service.pid"

    if [ -f "$pid_file" ]; then
        cat "$pid_file"
    fi
}

# Remove PID file
remove_pid() {
    local project="$1"
    local service="$2"
    local pid_file="$PID_DIR/$project/$service.pid"

    rm -f "$pid_file"
}

# Check if a process is running
is_running() {
    local pid="$1"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    return 1
}

# Check if a port is in use
port_in_use() {
    local port="$1"
    if lsof -i ":$port" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Kill process on port
kill_port() {
    local port="$1"
    local pids=$(lsof -ti ":$port" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        return 0
    fi
    return 1
}

# Wait for port to be available
wait_for_port() {
    local port="$1"
    local timeout="${2:-30}"
    local count=0

    while ! port_in_use "$port"; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $timeout ]; then
            return 1
        fi
    done
    return 0
}

# Wait for port to be free
wait_for_port_free() {
    local port="$1"
    local timeout="${2:-10}"
    local count=0

    while port_in_use "$port"; do
        sleep 1
        count=$((count + 1))
        if [ $count -ge $timeout ]; then
            return 1
        fi
    done
    return 0
}

# Get docker compose project name
get_compose_project() {
    local project="$1"
    echo "datagoose-$project"
}

# Run docker compose with project prefix
docker_compose() {
    local project="$1"
    shift
    local compose_project=$(get_compose_project "$project")

    docker compose -p "$compose_project" "$@"
}

# Check if docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running"
        exit 1
    fi
}

# Export functions for use in other scripts
export -f get_root_dir
export -f print_info print_success print_warning print_error print_header
export -f validate_project list_projects get_project_config
export -f save_pid get_pid remove_pid is_running
export -f port_in_use kill_port wait_for_port wait_for_port_free
export -f get_compose_project docker_compose check_docker
