#!/usr/bin/env bash

set -u

LOG_TAG="docker-recovery"

# Configuration
DOCKER_SERVICE="docker"

# Replace these names with the containers required by your deployment.
CONTAINERS=("target-app")

# Leave empty to skip the HTTP readiness check.
READINESS_URL=""

MAX_WAIT_SECONDS=60
CHECK_INTERVAL_SECONDS=2

log() {
    logger -t "$LOG_TAG" -- "$1"
}

log "Docker recovery started."

# Check whether the Docker service is active.
if ! systemctl is-active --quiet "$DOCKER_SERVICE"; then
    log "Docker service is inactive; starting it."

    if ! systemctl start "$DOCKER_SERVICE"; then
        log "Failed to start the Docker service."
        exit 1
    fi
else
    log "Docker service is already active."
fi

# Wait until the Docker daemon responds.
DOCKER_READY=0
WAITED_SECONDS=0

while [ "$WAITED_SECONDS" -lt "$MAX_WAIT_SECONDS" ]; do
    if docker info >/dev/null 2>&1; then
        DOCKER_READY=1
        break
    fi

    log "Docker daemon is not ready; waiting."
    sleep "$CHECK_INTERVAL_SECONDS"
    WAITED_SECONDS=$((WAITED_SECONDS + CHECK_INTERVAL_SECONDS))
done

if [ "$DOCKER_READY" -ne 1 ]; then
    log "Docker daemon did not become ready within the timeout."
    exit 1
fi

log "Docker daemon is ready."

# Start the required containers.
for CONTAINER in "${CONTAINERS[@]}"; do
    if [ -z "$CONTAINER" ]; then
        continue
    fi

    if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
        log "Required container does not exist: $CONTAINER"
        exit 1
    fi

    STATUS=$(docker inspect \
        --format '{{.State.Status}}' \
        "$CONTAINER" 2>/dev/null || true)

    if [ "$STATUS" = "running" ]; then
        log "Container is already running: $CONTAINER"
        continue
    fi

    log "Starting container: $CONTAINER"

    if ! docker start "$CONTAINER" >/dev/null; then
        log "Failed to start container: $CONTAINER"
        exit 1
    fi
done

# Wait until all required containers are running.
WAITED_SECONDS=0

while [ "$WAITED_SECONDS" -lt "$MAX_WAIT_SECONDS" ]; do
    ALL_RUNNING=1

    for CONTAINER in "${CONTAINERS[@]}"; do
        if [ -z "$CONTAINER" ]; then
            continue
        fi

        STATUS=$(docker inspect \
            --format '{{.State.Status}}' \
            "$CONTAINER" 2>/dev/null || true)

        if [ "$STATUS" != "running" ]; then
            ALL_RUNNING=0
            log "Container is not ready yet: $CONTAINER (state: $STATUS)"
        fi
    done

    if [ "$ALL_RUNNING" -eq 1 ]; then
        break
    fi

    sleep "$CHECK_INTERVAL_SECONDS"
    WAITED_SECONDS=$((WAITED_SECONDS + CHECK_INTERVAL_SECONDS))
done

if [ "$ALL_RUNNING" -ne 1 ]; then
    log "One or more containers did not become ready within the timeout."
    exit 1
fi

log "Required containers are running."

# Optionally check whether the application is reachable.
if [ -n "$READINESS_URL" ]; then
    log "Checking application readiness: $READINESS_URL"

    WAITED_SECONDS=0
    APPLICATION_READY=0

    while [ "$WAITED_SECONDS" -lt "$MAX_WAIT_SECONDS" ]; do
        HTTP_CODE=$(
            curl \
                --silent \
                --output /dev/null \
                --write-out '%{http_code}' \
                --max-time 5 \
                "$READINESS_URL" 2>/dev/null || true
        )

        # Any HTTP response means that the application is reachable.
        if [[ "$HTTP_CODE" =~ ^[1-5][0-9][0-9]$ ]]; then
            APPLICATION_READY=1
            log "Application is reachable (HTTP $HTTP_CODE)."
            break
        fi

        log "Application is not ready yet."
        sleep "$CHECK_INTERVAL_SECONDS"
        WAITED_SECONDS=$((WAITED_SECONDS + CHECK_INTERVAL_SECONDS))
    done

    if [ "$APPLICATION_READY" -ne 1 ]; then
        log "Application did not become reachable within the timeout."
        exit 1
    fi
fi

log "Docker recovery completed."
