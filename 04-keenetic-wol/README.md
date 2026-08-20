# Docker Recovery

The Docker Recovery module restores and verifies Docker services after a Linux
server resumes from suspend.

A system may wake up successfully while:

- The Docker daemon is still starting.
- A container has stopped.
- A container is restarting.
- The application inside a container is not ready yet.

This module helps restore the required Docker services and optionally checks
whether the target application is responding.

## Recovery Flow

```text
The system resumes
        |
        v
Check Docker service
        |
        +-- Docker is inactive: start Docker
        |
        v
Check required containers
        |
        +-- Container is stopped: start container
        |
        v
Wait for the application
        |
        v
Run readiness check
```

## Features

- Checks the Docker daemon
- Starts Docker when necessary
- Starts selected containers
- Waits for container startup
- Supports HTTP readiness checks
- Logs recovery events
- Can run independently from Tailscale and Keenetic

## Requirements

- Linux with systemd
- Docker Engine
- Docker CLI
- Root privileges
- Optional: `curl` for HTTP readiness checks

## Module Files

```text
03-docker-recovery/
├── README.md
└── docker-recovery.sh
```

## Configuration

The configuration is defined at the top of `docker-recovery.sh`.

Example:

```bash
DOCKER_SERVICE="docker"
CONTAINERS=("tapu-agent")
READINESS_URL="http://127.0.0.1:8000"
MAX_WAIT_SECONDS=60
CHECK_INTERVAL_SECONDS=2
```

| Variable | Description | Default |
|---|---|---|
| `DOCKER_SERVICE` | Docker systemd service name | `docker` |
| `CONTAINERS` | Containers that must be running | `tapu-agent` |
| `READINESS_URL` | Optional HTTP readiness URL | Empty |
| `MAX_WAIT_SECONDS` | Maximum startup wait time | `60` |
| `CHECK_INTERVAL_SECONDS` | Time between checks | `2` |

## Installation

Install the recovery script:

```bash
sudo install -Dm755 docker-recovery.sh \
  /usr/local/bin/docker-recovery.sh
```

Run it manually:

```bash
sudo /usr/local/bin/docker-recovery.sh
```

## Manual Test

Check Docker:

```bash
systemctl status docker --no-pager
```

Check all containers:

```bash
docker ps -a
```

Check a specific container:

```bash
docker inspect -f '{{.State.Status}}' tapu-agent
```

Check the application manually:

```bash
curl -I http://127.0.0.1:8000
```

## Readiness Checks

A running container does not necessarily mean that the application inside it
is ready.

For example:

```text
Container state: running
Application state: still starting
```

If `READINESS_URL` is configured, the script waits until the endpoint returns
an HTTP response.

The response may be:

- `200 OK`
- `401 Unauthorized`
- `403 Forbidden`
- Another expected application response

The important condition is that the application is reachable.

## Security Warnings

This module requires root or Docker socket access.

- Docker access is effectively root-level access.
- Do not expose `/var/run/docker.sock` to the public internet.
- Do not accept container names directly from users.
- Keep the container list statically configured.
- Review every container name before adding it.
- Do not run arbitrary Docker commands from HTTP request parameters.
- Keep Docker images updated and use trusted image sources.
- Do not include registry passwords or private image credentials in the script.
- Protect the recovery script from non-root modification.

Check file permissions:

```bash
ls -l /usr/local/bin/docker-recovery.sh
```

Expected ownership:

```text
root root
```

## Limitations

This module does not:

- Repair broken Docker images.
- Rebuild containers automatically.
- Validate application data.
- Check database integrity.
- Repair failed storage mounts.
- Manage Docker Compose projects automatically.
- Restart every container by default.

Only explicitly configured containers should be managed.

## Troubleshooting

### Docker is not running

```bash
systemctl status docker --no-pager
journalctl -u docker -n 100 --no-pager
```

Start Docker manually:

```bash
sudo systemctl start docker
```

### A container repeatedly stops

Check its logs:

```bash
docker logs --tail 100 <container-name>
```

Check its state:

```bash
docker inspect <container-name>
```

### The container is running but the application is unavailable

Check listening ports:

```bash
ss -tlnp
```

Check the application locally:

```bash
curl -v http://127.0.0.1:8000
```

Check container logs:

```bash
docker logs --tail 100 <container-name>
```

## Uninstallation

Remove the recovery script:

```bash
sudo rm -f /usr/local/bin/docker-recovery.sh
```

## License

This module is part of the Wake-on-Demand Gateway project and is licensed
under the MIT License.
