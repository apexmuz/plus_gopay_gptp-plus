#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="/opt/plus_gopay_gptp-plus"
COMPOSE_FILE="docker-compose.isolated.yml"
ENV_FILE=".env.isolated"
DOCKER_BIN="$(command -v docker)"
PROJECT_APP="plus_gopay_gptp_plus_app"
PROJECT_DB="plus_gopay_gptp_plus_db"
PROJECT_DOMAIN="register.lovelymira.com"

log() {
  printf '[guard] %s\n' "$*"
}

compose() {
  cd "$STACK_DIR"
  "$DOCKER_BIN" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

ensure_service_active() {
  local unit="$1"
  if ! systemctl is-active --quiet "$unit"; then
    log "starting service: $unit"
    systemctl start "$unit"
  fi
}

container_exists() {
  "$DOCKER_BIN" inspect "$1" >/dev/null 2>&1
}

container_state() {
  "$DOCKER_BIN" inspect -f '{{.State.Status}}' "$1"
}

container_health() {
  "$DOCKER_BIN" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1"
}

ensure_container_healthy() {
  local name="$1"
  if ! container_exists "$name"; then
    log "container missing: $name; compose up -d"
    compose up -d --remove-orphans
    return
  fi

  local state
  state="$(container_state "$name")"
  if [ "$state" != "running" ]; then
    log "container not running: $name state=$state; compose up -d"
    compose up -d --remove-orphans
    return
  fi

  local health
  health="$(container_health "$name")"
  if [ "$health" = "unhealthy" ]; then
    log "container unhealthy: $name; docker restart"
    "$DOCKER_BIN" restart "$name" >/dev/null
  fi
}

check_local_app() {
  curl -fsS --max-time 10 http://127.0.0.1:13000/ >/dev/null
}

check_local_https_ingress() {
  curl -kfsS --max-time 10 --resolve "$PROJECT_DOMAIN:443:127.0.0.1" "https://$PROJECT_DOMAIN/" >/dev/null
}

main() {
  ensure_service_active docker
  ensure_service_active nginx

  if [ ! -d "$STACK_DIR" ]; then
    log "stack dir missing: $STACK_DIR"
    exit 1
  fi

  ensure_container_healthy "$PROJECT_DB"
  ensure_container_healthy "$PROJECT_APP"

  if ! check_local_app; then
    log "localhost:13000 failed; restarting app container"
    "$DOCKER_BIN" restart "$PROJECT_APP" >/dev/null || true
    sleep 5
    check_local_app
  fi

  if ! check_local_https_ingress; then
    log "local https ingress failed; restarting nginx and ensuring compose"
    systemctl restart nginx
    compose up -d --remove-orphans
    sleep 3
    check_local_https_ingress
  fi

  log "guard completed"
}

main "$@"
