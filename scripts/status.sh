#!/bin/bash
# Project Status Script
# Shows the status of all project services

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"

PROJECT="$1"
shift 2>/dev/null || true

# Parse options
JSON_OUTPUT=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

validate_project "$PROJECT"

# Get project config
POSTGRES_PORT=$(get_project_config "$PROJECT" "docker.postgresPort")
API_PORT=$(get_project_config "$PROJECT" "api.port")
UI_PORT=$(get_project_config "$PROJECT" "ui.port")
COMPOSE_PROJECT=$(get_compose_project "$PROJECT")

# Check service status
check_postgres() {
    if port_in_use "$POSTGRES_PORT"; then
        # Try to connect
        if PGPASSWORD=postgres psql -h localhost -p "$POSTGRES_PORT" -U postgres -d datagoose -c "SELECT 1" > /dev/null 2>&1; then
            echo "healthy"
        else
            echo "unhealthy"
        fi
    else
        echo "stopped"
    fi
}

check_api() {
    if port_in_use "$API_PORT"; then
        # Try health endpoint
        if curl -s "http://localhost:$API_PORT/health" | grep -q "healthy" 2>/dev/null; then
            echo "healthy"
        else
            echo "unhealthy"
        fi
    else
        echo "stopped"
    fi
}

check_ui() {
    if port_in_use "$UI_PORT"; then
        echo "running"
    else
        echo "stopped"
    fi
}

# Get statuses
PG_STATUS=$(check_postgres)
API_STATUS=$(check_api)
UI_STATUS=$(check_ui)

# JSON output
if [ "$JSON_OUTPUT" = true ]; then
    cat <<EOF
{
  "project": "$PROJECT",
  "services": {
    "postgres": {
      "port": $POSTGRES_PORT,
      "status": "$PG_STATUS"
    },
    "api": {
      "port": $API_PORT,
      "status": "$API_STATUS"
    },
    "ui": {
      "port": $UI_PORT,
      "status": "$UI_STATUS"
    }
  }
}
EOF
    exit 0
fi

# Human readable output
print_header "Status: $PROJECT"

status_icon() {
    local status="$1"
    case "$status" in
        healthy|running)
            echo -e "${GREEN}●${NC}"
            ;;
        unhealthy)
            echo -e "${YELLOW}●${NC}"
            ;;
        stopped)
            echo -e "${RED}○${NC}"
            ;;
    esac
}

echo "Services:"
echo ""
echo "  $(status_icon "$PG_STATUS") PostgreSQL   port $POSTGRES_PORT   $PG_STATUS"
echo "  $(status_icon "$API_STATUS") API          port $API_PORT   $API_STATUS"
echo "  $(status_icon "$UI_STATUS") UI           port $UI_PORT   $UI_STATUS"
echo ""

# URLs if services are running
if [ "$API_STATUS" = "healthy" ]; then
    echo "URLs:"
    echo "  API:      http://localhost:$API_PORT"
    echo "  Swagger:  http://localhost:$API_PORT/api/docs"
fi
if [ "$UI_STATUS" = "running" ]; then
    echo "  UI:       http://localhost:$UI_PORT"
fi
echo ""

# Overall status
ALL_HEALTHY=true
[ "$PG_STATUS" != "healthy" ] && ALL_HEALTHY=false
[ "$API_STATUS" != "healthy" ] && ALL_HEALTHY=false
[ "$UI_STATUS" != "running" ] && ALL_HEALTHY=false

if [ "$ALL_HEALTHY" = true ]; then
    print_success "All services healthy"
else
    print_warning "Some services need attention"
    echo "Use 'dg $PROJECT setup' to start missing services"
fi
