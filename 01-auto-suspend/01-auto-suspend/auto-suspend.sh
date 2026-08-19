#!/usr/bin/env bash

LOG_TAG="auto-suspend"

# Configuration
THRESHOLD_MIN=10
IDLE_FILE="/run/auto-suspend/idle-start"
LOAD_THRESHOLD=0.5

log() {
    logger -t "$LOG_TAG" -- "$1"
}

# Create the runtime directory if it does not exist.
mkdir -p "$(dirname "$IDLE_FILE")"

# Count established SSH connections to the local SSH service.
SSH_CONNECTIONS=$(
    ss -tn state established '( sport = :ssh )' 2>/dev/null |
    tail -n +2 |
    wc -l
)

# Count logged-in user sessions.
ACTIVE_USERS=$(who | wc -l)

# Read the one-minute system load average.
CPU_LOAD=$(awk '{print $1}' /proc/loadavg)

log "Check: SSH=$SSH_CONNECTIONS, Users=$ACTIVE_USERS, CPU=$CPU_LOAD"

# Do not suspend while an SSH connection or user session exists.
if [ "$SSH_CONNECTIONS" -gt 0 ] || [ "$ACTIVE_USERS" -gt 0 ]; then
    log "Active session detected; suspend skipped."
    rm -f "$IDLE_FILE"
    exit 0
fi

# Compare the one-minute load average with the configured threshold.
CPU_HIGH=$(
    awk -v load="$CPU_LOAD" -v threshold="$LOAD_THRESHOLD" \
        'BEGIN {
            if (load > threshold)
                print "1";
            else
                print "0";
        }'
)

if [ "$CPU_HIGH" = "1" ]; then
    log "CPU load is high ($CPU_LOAD); suspend skipped."
    rm -f "$IDLE_FILE"
    exit 0
fi

# Start the idle timer if this is the first idle check.
if [ ! -f "$IDLE_FILE" ]; then
    date +%s > "$IDLE_FILE"
    log "System became idle; idle timer started."
    exit 0
fi

START=$(cat "$IDLE_FILE" 2>/dev/null || true)
NOW=$(date +%s)

# Validate the stored timestamp before using it in arithmetic.
if [[ ! "$START" =~ ^[0-9]+$ ]]; then
    date +%s > "$IDLE_FILE"
    log "Invalid idle timestamp; timer reset."
    exit 0
fi

ELAPSED_MIN=$(( (NOW - START) / 60 ))

if [ "$ELAPSED_MIN" -ge "$THRESHOLD_MIN" ]; then
    log "System has been idle for $ELAPSED_MIN minutes; suspending."

    rm -f "$IDLE_FILE"

    # Flush pending filesystem writes before suspending.
    sync

    systemctl suspend
else
    log "Idle time: $ELAPSED_MIN minutes; threshold: $THRESHOLD_MIN minutes."
fi
