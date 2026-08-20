#!/usr/bin/env bash

set -u

LOG_TAG="tailscale-wake"

log() {
    logger -t "$LOG_TAG" -- "$1"
}

log "Resume recovery started."

# Wait for a default IPv4 route.
NETWORK_READY=0

for _ in $(seq 1 45); do
    if ip -4 route show default 2>/dev/null | grep -q '^default'; then
        NETWORK_READY=1
        break
    fi

    log "Default network route is not ready; waiting."
    sleep 2
done

if [ "$NETWORK_READY" -ne 1 ]; then
    log "Network route did not become ready within the timeout."
    exit 1
fi

log "Default network route detected."

# Give the network manager a short moment to settle.
sleep 3

if ! systemctl is-active --quiet tailscaled; then
    log "tailscaled is not active; starting the service."
    systemctl start tailscaled
else
    log "Restarting tailscaled."
    systemctl restart tailscaled
fi

# Allow tailscaled to initialize after the restart.
sleep 5

if systemctl is-active --quiet tailscaled; then
    log "tailscaled service is active."
else
    log "tailscaled service is not active after recovery."
    exit 1
fi

# This command may return a non-zero status while Tailscale is still
# reconnecting. It is used for logging only.
if tailscale status >/dev/null 2>&1; then
    log "Tailscale status command completed successfully."
else
    log "Tailscale is still reconnecting or status is not ready yet."
fi

log "Resume recovery completed."
