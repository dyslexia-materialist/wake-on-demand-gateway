# Wake-on-Demand Gateway

A modular, self-hosted system for waking sleeping Linux servers on demand,
recovering their services after resume, and securely proxying traffic through
a gateway server.

## Project Goals

This project is designed for home servers, homelabs, and self-hosted services
that do not need to run continuously.

The system can:

- Suspend an idle Linux server.
- Wake it using Wake-on-LAN.
- Recover Tailscale after system resume.
- Recover Docker services after resume.
- Wait until the target application is ready.
- Proxy authenticated traffic to the target server.
- Keep the target server hidden behind a private network.

## Architecture

```text
External user
     |
     v
Gateway server
     |
     +-- Authentication
     +-- Wake-on-LAN
     +-- Readiness check
     +-- Reverse proxy
     |
     v
Sleeping Linux server
     |
     +-- Tailscale
     +-- Docker
     +-- Self-hosted application
```

## Modules

| Module | Description | Status |
|---|---|---|
| `01-auto-suspend` | Suspend the server after an idle period | In progress |
| `02-tailscale-wake` | Recover Tailscale after resume | Planned |
| `03-docker-recovery` | Recover Docker services after resume | Planned |
| `04-keenetic-wol` | Send Wake-on-LAN through Keenetic | Planned |
| `05-deno-gateway` | Authentication and reverse proxy gateway | Planned |
| `06-tailscale-integration` | Tailscale Serve and Funnel integration | Planned |

## How It Works

The system is composed of independent modules.

A typical deployment follows this sequence:

```text
1. The Linux server remains idle.
2. The auto-suspend module puts the server to sleep.
3. An external user accesses the gateway.
4. The gateway authenticates the user.
5. The gateway sends a Wake-on-LAN packet.
6. The Linux server resumes.
7. Tailscale recovery restores the private network connection.
8. Docker recovery starts the required containers.
9. The gateway waits until the target application is ready.
10. Authenticated traffic is forwarded to the target application.
```

## Why Use a Gateway?

A sleeping server cannot receive an HTTP request before it wakes up.

The gateway remains online and handles the initial request. It can then:

- Authenticate the user.
- Send the Wake-on-LAN packet.
- Wait for the target server to become ready.
- Forward the request through a private network.

This makes it possible to keep the main server powered off while it is not needed.

## Requirements

The complete setup may require:

- A Linux server that supports suspend and Wake-on-LAN.
- A second device or VPS that remains online.
- Tailscale.
- Docker and Docker Compose.
- A router or network device that supports Wake-on-LAN.
- An authentication layer.
- A reverse proxy or gateway application.

Individual modules may have fewer requirements.

## Security Notice

This project is intended for self-hosted, homelab, and educational use.

It does not guarantee that a system is unbreakable. It reduces the attack
surface and adds multiple security layers, but every deployment must be
reviewed and configured according to its own threat model.

### Never Commit Secrets

Never upload the following information to a public repository:

- Passwords
- API keys
- Tailscale authentication keys
- Encryption keys
- Deno KV credentials
- Session secrets
- Real MAC addresses
- Private IP addresses
- Private domain names
- `.env` files
- TLS private keys
- SSH private keys

Use placeholders and example files instead.

For example:

```text
.env.example
```

can be committed, while the real file must remain local:

```text
.env
```

A recommended `.gitignore` file should contain:

```gitignore
.env
.env.*
!.env.example

secrets/
*.key
*.pem
*.crt

id_rsa
id_ed25519
```

### Public Access

If Tailscale Funnel or another public tunnel is enabled, the gateway may be
reachable by anyone on the internet.

Before exposing the gateway publicly:

- Use strong authentication.
- Enable rate limiting.
- Limit failed login attempts.
- Use secure session cookies.
- Change all default passwords.
- Do not expose administrative endpoints.
- Do not allow arbitrary proxy destinations.
- Validate all user-supplied input.
- Keep dependencies updated.
- Monitor authentication and proxy logs.

### Reverse Proxy Security

The reverse proxy must forward requests only to a predefined target.

Do not allow users to provide arbitrary URLs such as:

```text
https://gateway.example/proxy?url=http://internal-service
```

This can create an SSRF vulnerability and may expose internal services.

The target service should be configured server-side and should not be
modifiable by an unauthenticated user.

### Root Privileges

Some modules require root or system-level privileges because they may:

- Suspend the operating system.
- Restart system services.
- Access Docker.
- Modify systemd files.
- Configure network services.

Review every script before running it with `sudo`.

## Privacy Notice

This project may handle:

- Login credentials
- Router credentials
- Session tokens
- Network addresses
- Device MAC addresses
- Service URLs

Store this information securely. Do not include real deployment data in
documentation, screenshots, logs, or issue reports.

## Project Status

This project is under active development.

The modules are designed to be used independently where possible. The complete
gateway workflow is still being documented and tested.

## Contributing

Contributions are welcome.

Before submitting a pull request:

1. Do not include secrets or private deployment information.
2. Test changes in an isolated environment.
3. Update the relevant README file.
4. Explain any security implications.
5. Keep modules independent where possible.
6. Avoid breaking existing configuration without documentation.

## License

This project is licensed under the MIT License.

See the `LICENSE` file for details.
