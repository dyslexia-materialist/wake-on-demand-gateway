# Deno Gateway

The Deno Gateway is the authentication, Wake-on-LAN, readiness-check, and
reverse-proxy layer of the Wake-on-Demand Gateway project.

It provides a public entry point without exposing the sleeping target server
directly.

## Architecture

```text
External user
      |
      v
Deno Gateway
      |
      +-- Authentication
      +-- Session management
      +-- Encrypted configuration storage
      +-- Keenetic Wake-on-LAN
      +-- Target readiness check
      +-- Reverse proxy
      |
      v
Target server over Tailscale
      |
      +-- Tailscale Serve
      +-- Local application
```

## Request Flow

```text
1. User opens the gateway.
2. User submits a password.
3. Gateway validates the credentials.
4. Gateway creates a temporary session.
5. Gateway sends a Wake-on-LAN packet.
6. Gateway waits for the target service to respond.
7. Gateway forwards authenticated requests to the target service.
```

## Features

- Deno and Oak-based HTTP server
- Password-protected login
- Temporary session cookies
- Deno KV configuration storage
- Encrypted sensitive configuration
- Keenetic Wake-on-LAN integration
- Target readiness polling
- Reverse proxy support
- Request and response header filtering
- Upload support
- Configurable session expiration

## Requirements

- Deno 2.x or newer
- Network access to the Keenetic router
- Network access to the Tailscale target
- Deno KV access
- A configured Keenetic Wake-on-LAN user
- A target service reachable through Tailscale

Check the Deno version:

```bash
deno --version
```

## Module Structure

```text
05-deno-gateway/
├── README.md
├── deno.json
├── Dockerfile
├── compose.yml
├── src/
│   ├── main.ts
│   ├── auth.ts
│   ├── kv.ts
│   ├── proxy.ts
│   ├── readiness.ts
│   └── session.ts
└── static/
    ├── login.html
    ├── setup.html
    └── waiting.html
```

## Configuration

Configuration should be provided through environment variables or a secure
configuration store.

Example:

```bash
PORT=6910
SESSION_TTL_SECONDS=600

DENO_KV_ID=
DENO_KV_ACCESS_TOKEN=

ENCRYPTION_KEY=

TARGET_SERVICE_URL=https://target.example.ts.net
TARGET_READINESS_PATH=/
TARGET_READINESS_TIMEOUT_SECONDS=90
```

Do not commit real values.

Use an example file:

```text
.env.example
```

Keep the real file private:

```text
.env
```

## Endpoints

The exact endpoints may vary depending on the implementation.

Typical endpoints include:

| Method | Endpoint            | Purpose                     |
| ------ | ------------------- | --------------------------- |
| `GET`  | `/`                 | Login page                  |
| `GET`  | `/setup`            | Initial configuration       |
| `GET`  | `/api/status`       | Gateway status              |
| `POST` | `/api/setup`        | Initial setup               |
| `POST` | `/api/login`        | User login                  |
| `POST` | `/api/logout`       | End session                 |
| `GET`  | `/api/ready/:token` | Target readiness check      |
| `ANY`  | `/go/:token/*`      | Authenticated reverse proxy |

## Session Handling

Sessions should:

- Use cryptographically secure random tokens.
- Have a limited lifetime.
- Be stored server-side or in a secure session store.
- Use `HttpOnly` cookies.
- Use `Secure` cookies when HTTPS is enabled.
- Use an appropriate `SameSite` policy.
- Be invalidated during logout.
- Never be written to normal logs.

Example cookie settings:

```text
HttpOnly
Secure
SameSite=Lax
Max-Age=600
```

## Readiness Checking

The gateway should not immediately proxy a request after sending Wake-on-LAN.

The target may need time to:

- Resume from suspend.
- Receive a network address.
- Restore routes.
- Reconnect to Tailscale.
- Start Docker.
- Start the application.

The gateway should poll the target until it receives an HTTP response or the
maximum timeout is reached.

A response such as `401 Unauthorized` may still indicate that the target is
ready. The important distinction is:

```text
HTTP response received = target reachable
Connection or TLS error = target not ready or unreachable
```

## Reverse Proxy Security

The proxy target must be configured server-side.

Do not allow users to provide arbitrary proxy URLs.

Unsafe example:

```text
/proxy?url=http://internal-service
```

This may introduce a Server-Side Request Forgery vulnerability and expose:

- Internal services
- Router interfaces
- Docker APIs
- Cloud metadata endpoints
- Private network resources

The gateway should proxy only to a predefined target such as:

```text
https://target.example.ts.net
```

## Header Handling

The proxy should carefully handle request and response headers.

Important considerations:

- Do not forward user-supplied authorization headers to the target.
- Do not expose session cookies to the target application.
- Do not copy `Set-Cookie` headers blindly.
- Remove hop-by-hop headers.
- Validate or replace the `Host` header.
- Avoid leaking internal server information.
- Do not trust forwarded headers from untrusted clients.

## Security Warnings

This gateway may be exposed to the public internet.

Before public deployment:

- Use a strong login password.
- Add rate limiting.
- Limit failed login attempts.
- Use secure session cookies.
- Keep Deno and dependencies updated.
- Do not expose setup endpoints after initialization.
- Do not log passwords, tokens, cookies, or API keys.
- Do not allow arbitrary proxy destinations.
- Validate all request paths.
- Restrict upload sizes.
- Add request timeouts.
- Use HTTPS.
- Review CORS settings carefully.
- Avoid using `Access-Control-Allow-Origin: *` unless it is truly required.
- Keep Deno KV credentials outside the repository.
- Rotate secrets if they are ever exposed.

## Encryption Warning

Encryption at rest protects stored data if the database or storage layer is
copied.

It does not protect against a complete compromise of the gateway host.

If an attacker obtains:

- The encryption key
- The running process memory
- The environment variables
- The Deno KV access credentials
- Root access to the gateway

then encrypted configuration may be recoverable.

Use host hardening, least privilege, firewall rules, and monitoring in addition
to encryption.

## Deno Permissions

Run the gateway with only the permissions it needs.

Avoid:

```bash
deno run -A
```

Prefer explicit permissions, for example:

```bash
deno run \
  --allow-net \
  --allow-env \
  --allow-read=./static \
  src/main.ts
```

Add filesystem or subprocess permissions only when required.

## Docker Deployment

A Docker deployment should:

- Use a minimal base image.
- Run as a non-root user when possible.
- Avoid mounting the Docker socket unless necessary.
- Store secrets outside the image.
- Use a read-only filesystem where practical.
- Limit exposed ports.
- Use health checks.
- Pin or review dependency versions.

## Troubleshooting

### Login works but Wake-on-LAN fails

Check:

- Keenetic URL
- Keenetic credentials
- User permissions
- Target MAC address
- Router API availability
- Router logs

### The gateway shows a negative or endlessly increasing counter

This usually indicates that the target readiness request failed.

Check:

```bash
curl -v https://target.example.ts.net
```

Also check:

- Tailscale status
- Target server power state
- Docker container state
- Target application logs
- DNS resolution inside the gateway container

### The target is ready but proxying fails

Check:

- Target URL
- Tailscale connectivity
- TLS certificate
- Container DNS
- `extra_hosts` configuration
- Reverse proxy logs

### TLS handshake errors occur

Possible causes:

- Target server is not ready.
- Target Tailscale node is offline.
- Gateway resolves an obsolete public Funnel address.
- The gateway container cannot reach the Tailscale network.
- The target service is not listening.

## Limitations

This gateway:

- Does not guarantee application availability.
- Does not replace firewall configuration.
- Does not replace Tailscale ACLs.
- Does not protect a compromised gateway host.
- Does not make public services invisible.
- Does not eliminate the need for rate limiting and monitoring.

## License

This module is part of the Wake-on-Demand Gateway project and is licensed
under the MIT License.
