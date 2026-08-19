# Auto Suspend

The Auto Suspend module automatically suspends a Linux server after it has
remained idle for a configured period.

It is designed for home servers, homelabs, and self-hosted systems that do
not need to run continuously.

## What It Does

The module checks:

- Established SSH connections
- Logged-in user sessions
- System CPU load
- How long the system has remained idle

If no active session is detected, the CPU load is below the configured
threshold, and the idle period has been reached, the module runs:

```bash
systemctl suspend
```

## Decision Flow

```text
Check for established SSH connections
              |
              +-- Found: skip suspend
              |
              v
Check for logged-in users
              |
              +-- Found: skip suspend
              |
              v
Check CPU load
              |
              +-- Above threshold: skip suspend
              |
              v
Start or continue idle timer
              |
              v
Idle threshold reached
              |
              v
Suspend the system
```

## Features

- SSH connection detection
- Logged-in user detection
- CPU load threshold
- Configurable idle timeout
- Systemd service integration
- Systemd timer integration
- Journald/syslog logging
- Invalid idle timestamp protection
- Independent operation without Tailscale, Docker, or a gateway

## Requirements

- Linux
- systemd
- Bash
- `ss`
- `awk`
- `logger`
- `systemctl`
- Root privileges

## Module Files

The module contains the following files:

```text
01-auto-suspend/
├── README.md
├── auto-suspend.sh
├── auto-suspend.service
└── auto-suspend.timer
```

## Configuration

The main configuration values are defined at the top of
`auto-suspend.sh`:

```bash
THRESHOLD_MIN=10
IDLE_FILE="/run/auto-suspend/idle-start"
LOAD_THRESHOLD=0.5
```

| Variable | Description | Default |
|---|---|---:|
| `THRESHOLD_MIN` | Number of idle minutes before suspension | `10` |
| `IDLE_FILE` | File storing the idle start timestamp | `/run/auto-suspend/idle-start` |
| `LOAD_THRESHOLD` | Maximum allowed 1-minute load average | `0.5` |

### Example

With the default configuration:

- The system must remain idle for 10 minutes.
- The 1-minute CPU load must remain at or below `0.5`.
- No established SSH connection may exist.
- No logged-in user session may exist.

## Installation

Install the script:

```bash
sudo install -Dm755 auto-suspend.sh \
  /usr/local/bin/auto-suspend.sh
```

Install the systemd service:

```bash
sudo install -Dm644 auto-suspend.service \
  /etc/systemd/system/auto-suspend.service
```

Install the systemd timer:

```bash
sudo install -Dm644 auto-suspend.timer \
  /etc/systemd/system/auto-suspend.timer
```

Reload systemd and enable the timer:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now auto-suspend.timer
```

## Manual Test

Run a single check manually:

```bash
sudo /usr/local/bin/auto-suspend.sh
```

The first execution normally starts the idle timer. It does not immediately
suspend the system.

View recent log messages:

```bash
journalctl -t auto-suspend -n 30 --no-pager
```

Check the timer:

```bash
systemctl status auto-suspend.timer
```

List scheduled timers:

```bash
systemctl list-timers auto-suspend.timer
```

Inspect the installed service and timer:

```bash
systemctl cat auto-suspend.service
systemctl cat auto-suspend.timer
```

## Timer Behavior

The timer runs the check once per minute.

If `Persistent=true` is enabled, systemd may run a missed timer event after
the system becomes available again. This behavior should be understood before
using the module on production systems.

## Logs

The script writes messages using the `auto-suspend` log tag.

View all recent messages:

```bash
journalctl -t auto-suspend --no-pager
```

View messages from the current boot:

```bash
journalctl -b -t auto-suspend --no-pager
```

Follow messages in real time:

```bash
journalctl -f -t auto-suspend
```

Example messages:

```text
Active session detected; suspend skipped.
CPU load is high; suspend skipped.
System became idle; idle timer started.
Idle time: 5 minutes; threshold: 10 minutes.
System has been idle for 10 minutes; suspending.
```

## Security and Operational Warnings

This script can suspend the host and normally requires root privileges.

- A configuration error may suspend an active server.
- Web traffic is not automatically treated as an active user session.
- Tailscale traffic is not automatically treated as an active user session.
- Docker activity is not automatically treated as an active user session.
- `who` only detects logged-in user sessions.
- SSH detection only covers established SSH connections.
- Critical background jobs may not be detected.
- Test the script manually before enabling the timer.
- Use a longer idle threshold during initial testing.
- Do not deploy it on a critical production server without additional checks.
- Review the script before running it with `sudo`.

## Limitations

This module intentionally does not check:

- Tailscale activity
- Docker container activity
- HTTP requests
- Reverse proxy requests
- Database jobs
- File transfers
- GPU workloads
- Background application jobs
- Custom application state

These checks should be implemented as separate modules or additional
application-specific integrations.

## Uninstallation

Disable the timer:

```bash
sudo systemctl disable --now auto-suspend.timer
```

Remove the systemd files:

```bash
sudo rm -f /etc/systemd/system/auto-suspend.timer
sudo rm -f /etc/systemd/system/auto-suspend.service
```

Remove the script:

```bash
sudo rm -f /usr/local/bin/auto-suspend.sh
```

Reload systemd:

```bash
sudo systemctl daemon-reload
```

## Troubleshooting

### The system suspends unexpectedly

Check the logs:

```bash
journalctl -t auto-suspend -n 100 --no-pager
```

Increase the idle threshold:

```bash
THRESHOLD_MIN=30
```

Then run a manual test:

```bash
sudo /usr/local/bin/auto-suspend.sh
```

### The timer is not running

Check its status:

```bash
systemctl status auto-suspend.timer
```

Enable it:

```bash
sudo systemctl enable --now auto-suspend.timer
```

### The script cannot suspend the system

Check whether the service is running with sufficient privileges:

```bash
systemctl status auto-suspend.service
journalctl -u auto-suspend.service --no-pager
```

## License

This module is part of the Wake-on-Demand Gateway project and is licensed
under the MIT License.
