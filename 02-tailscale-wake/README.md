# Tailscale Wake Recovery

The Tailscale Wake Recovery module helps restore Tailscale connectivity after
a Linux server resumes from suspend.

A server may wake up successfully while its network stack, routes, or
`tailscaled` service are not fully ready. In that situation, the Tailscale
process may remain running but appear offline or fail to reconnect to the
coordination server.

This module is designed to run after system resume.

## Problem

A typical failure sequence may look like this:

```text
The server enters suspend
        |
        v
The server resumes
        |
        v
The network becomes available
        |
        v
Tailscale remains offline or stale
        |
        v
Private services are unreachable
```

The recovery module changes the sequence to:

```text
The server resumes
        |
        v
Wait for a default network route
        |
        v
Restart tailscaled
        |
        v
Check the Tailscale connection
        |
        v
Restore private connectivity
```

## Features

- Runs after system resume
- Waits for the network route
- Restarts `tailscaled`
- Writes recovery messages to system logs
- Can be used independently from the gateway
- Does not require Docker
- Does not require Keenetic integration

## Requirements

- Linux with systemd
- Tailscale
- `tailscaled` systemd service
- Root privileges
- A working network connection after resume

## Module Files

```text
02-tailscale-wake/
├── README.md
├── tailscale-wake.sh
└── tailscale-wake
```

The `tailscale-wake` file is a system-sleep hook. It starts the recovery
script after the system resumes.

## Installation

Install the recovery script:

```bash
sudo install -Dm755 tailscale-wake.sh \
  /usr/local/bin/tailscale-wake.sh
```

Install the system-sleep hook:

```bash
sudo install -Dm755 tailscale-wake \
  /usr/lib/systemd/system-sleep/tailscale-wake
```

The system-sleep hook is executed automatically by systemd during suspend and
resume events.

## Manual Test

Run the recovery script manually:

```bash
sudo /usr/local/bin/tailscale-wake.sh
```

Check the Tailscale status:

```bash
tailscale status
```

Check the Tailscale service:

```bash
systemctl status tailscaled --no-pager
```

Check recent recovery logs:

```bash
journalctl -t tailscale-wake -n 30 --no-pager
```

## Expected Log Flow

A successful recovery may produce messages similar to:

```text
Network is not ready; waiting.
Network route detected.
Restarting tailscaled.
Tailscale recovery completed.
```

## Important Design Notes

The recovery script should first try to restart the Tailscale service:

```bash
systemctl restart tailscaled
```

A full:

```bash
tailscale down
tailscale up
```

cycle should not be used as the default recovery method because it temporarily
removes the node from the tailnet and may affect active connections.

If a fallback is required, it should be implemented carefully and should not
replace existing Tailscale configuration unexpectedly.

## Security Warnings

This module requires root privileges because it restarts a system service and
is executed by systemd during resume.

- Review the script before installing it.
- Do not download and execute the script blindly.
- Do not store Tailscale auth keys in the script.
- Do not run `tailscale up` with unknown or untrusted arguments.
- Protect `/usr/local/bin/tailscale-wake.sh` from non-root modification.
- Protect `/usr/lib/systemd/system-sleep/tailscale-wake` from non-root modification.
- Test the module locally before using it on a remote-only server.
- Keep a physical or alternative recovery method available.
- A faulty recovery hook may leave the server unreachable after resume.

Check file ownership and permissions:

```bash
ls -l /usr/local/bin/tailscale-wake.sh
ls -l /usr/lib/systemd/system-sleep/tailscale-wake
```

Expected ownership:

```text
root root
```

## Limitations

This module does not:

- Wake the server remotely.
- Send Wake-on-LAN packets.
- Start Docker containers.
- Verify application readiness.
- Configure Tailscale ACLs.
- Configure Tailscale Serve or Funnel.
- Repair DNS configuration automatically.
- Guarantee that every network manager works identically.

These responsibilities belong to other modules.

## Troubleshooting

### Tailscale remains offline

Check the service:

```bash
systemctl status tailscaled --no-pager
```

Check the logs:

```bash
journalctl -u tailscaled -b --no-pager
```

Check the network route:

```bash
ip route
```

Check connectivity:

```bash
tailscale netcheck
```

### The recovery hook does not run

Check that it is executable:

```bash
sudo chmod 755 /usr/lib/systemd/system-sleep/tailscale-wake
```

Check its location:

```bash
ls -l /usr/lib/systemd/system-sleep/tailscale-wake
```

Check resume-related logs:

```bash
journalctl -b --no-pager | grep -iE \
  'suspend|resume|system-sleep|tailscale'
```

### The server becomes unreachable after installation

Use an alternative access method such as:

- Local console
- LAN SSH
- Serial console
- Hypervisor console
- Recovery environment

Then remove the hook:

```bash
sudo rm -f /usr/lib/systemd/system-sleep/tailscale-wake
```

## Uninstallation

Remove the system-sleep hook:

```bash
sudo rm -f /usr/lib/systemd/system-sleep/tailscale-wake
```

Remove the recovery script:

```bash
sudo rm -f /usr/local/bin/tailscale-wake.sh
```

## License

This module is part of the Wake-on-Demand Gateway project and is licensed
under the MIT License.
