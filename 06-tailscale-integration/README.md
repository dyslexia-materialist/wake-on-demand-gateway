# Tailscale Integration

This module documents how to connect the gateway and the target server through
Tailscale.

The recommended architecture uses:

- Tailscale Funnel on the gateway for public HTTPS access.
- Tailscale Serve on the target server for tailnet-only access.
- The gateway as the only path to the target application.
- No public Funnel on the target server.

## Architecture

```text
External user
      |
      v
Tailscale Funnel
      |
      v
Gateway server
      |
      v
Tailscale private network
      |
      v
Tailscale Serve
      |
      v
Target application
```

## Two Tailscale Modes

### Funnel

Funnel provides public HTTPS access through the Tailscale network.

```text
Internet
   |
   v
https://gateway.example.ts.net
   |
   v
Tailscale Funnel
```

Use Funnel only on the gateway when external users need to reach the login
page.

### Serve

Serve exposes a service only within the tailnet.

```text
Tailnet member
   |
   v
https://target.example.ts.net
   |
   v
Tailscale Serve
```

The target server should normally use Serve instead of Funnel.

## Gateway Configuration

On the gateway server, expose the Deno application through localhost:

```text
127.0.0.1:6910
```

Example Docker port binding:

```yaml
ports:
  - "127.0.0.1:6910:6910"
```

Start Tailscale Serve or Funnel depending on the desired access mode.

Tailnet-only Serve:

```bash
tailscale serve --bg http://localhost:6910
```

Public Funnel:

```bash
tailscale funnel --bg http://localhost:6910
```

Check the configuration:

```bash
tailscale serve status
tailscale funnel status
```

## Target Server Configuration

The target application should listen on localhost or a specific LAN address.

Example Docker port bindings:

```yaml
ports:
  - "127.0.0.1:8000:8000"
  - "192.168.1.77:8000:8000"
```

The first binding allows Tailscale Serve to reach the application through
localhost.

The second binding allows access from the local network.

Avoid binding the application to all interfaces unless it is intentional:

```yaml
# Avoid when not required:
- "0.0.0.0:8000:8000"
```

Start Tailscale Serve on the target server:

```bash
tailscale serve --bg http://localhost:8000
```

Check the configuration:

```bash
tailscale serve status
tailscale status
```

## Recommended Access Model

```text
Public internet
      |
      v
Gateway Funnel
      |
      v
Gateway authentication
      |
      v
Wake-on-LAN
      |
      v
Gateway Tailscale connection
      |
      v
Target Server Serve
      |
      v
Target application authentication
```

The target server should not use public Funnel unless there is a specific
reason to expose it directly.

## Tailscale ACLs

Tailscale ACLs can restrict which devices may access which ports.

A restrictive example:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["gateway-device"],
      "dst": ["target-device:443"]
    }
  ]
}
```

Adapt device names and ports to your own tailnet.

Important:

- Test ACL changes carefully.
- Keep an alternative administration path available.
- Do not lock yourself out of the target server.
- Remember that ACLs do not replace host firewalls.
- Review existing access rules before replacing them.

## DNS and Container Networking

The host operating system and a Docker container may resolve Tailscale
hostnames differently.

For example:

```text
Host:
target.example.ts.net -> Tailscale IP

Container:
target.example.ts.net -> obsolete public Funnel relay IP
```

This may cause errors such as:

```text
TLS handshake EOF
connection reset
502 Bad Gateway
```

Check resolution on the host:

```bash
getent hosts target.example.ts.net
```

Check resolution inside the gateway container:

```bash
docker exec <gateway-container> \
  getent hosts target.example.ts.net
```

If the container resolves the target incorrectly, use a carefully managed
`extra_hosts` entry:

```yaml
extra_hosts:
  - "target.example.ts.net:100.64.0.10"
```

Replace the example address with the current Tailscale IP of the target server.

Document why the static mapping exists and review it when the Tailscale IP
changes.

## Verification

From the gateway host:

```bash
tailscale ping target-device
```

Check the target service:

```bash
curl -I https://target.example.ts.net
```

A response such as:

```text
HTTP/2 401
```

may be expected if the target application requires authentication.

From inside the gateway container:

```bash
docker exec <gateway-container> \
  curl -I https://target.example.ts.net
```

The container test is important because container DNS and routing may differ
from the host.

## Troubleshooting

### The target is offline

Check:

```bash
tailscale status
tailscale ping target-device
systemctl status tailscaled --no-pager
```

### Serve returns HTTP 502

Check:

```bash
tailscale serve status
curl -I http://127.0.0.1:8000
```

Possible causes:

- Target application is not running.
- The Serve backend points to the wrong port.
- The localhost binding is missing.
- Docker has not finished starting.

### TLS handshake errors occur

Check:

- Whether the target server is actually awake.
- Whether Tailscale is online.
- Whether the target hostname resolves correctly.
- Whether the gateway container reaches the Tailscale IP.
- Whether the target application is listening.
- Whether an obsolete Funnel address is being used.

### Public Funnel access does not work

Check:

```bash
tailscale funnel status
journalctl -u tailscaled -n 100 --no-pager
```

TLS certificate status may require some time after Funnel is enabled.

Test public access from a device outside the tailnet.

## Security Warnings

- Do not enable Funnel on the target server unless required.
- Keep the target server’s SSH port closed to unnecessary tailnet devices.
- Do not expose Docker API ports publicly.
- Do not expose Ollama or management interfaces unnecessarily.
- Use Tailscale ACLs together with host firewall rules.
- Keep the gateway authentication layer enabled.
- Do not trust obscurity as a security control.
- Treat the gateway as a high-value system because it has access to the target.
- Protect Tailscale state files and auth keys.
- Review Funnel exposure regularly.

## Limitations

Tailscale provides private networking and transport security, but it does not
automatically secure the application itself.

You may still need:

- Application authentication
- Host firewall rules
- Tailscale ACLs
- Rate limiting
- Monitoring
- Security updates
- Backup and recovery procedures

## License

This module is part of the Wake-on-Demand Gateway project and is licensed
under the MIT License.
