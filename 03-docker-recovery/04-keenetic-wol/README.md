# Keenetic Wake-on-LAN

This module sends Wake-on-LAN requests through a Keenetic router using the
Keenetic API.

It is useful when the target Linux server is asleep and the Wake-on-LAN
packet must be sent by a device that remains online.

## Architecture

```text
Client or gateway
       |
       v
Keenetic API authentication
       |
       v
Keenetic Wake-on-LAN endpoint
       |
       v
Magic packet
       |
       v
Sleeping server
```

## Features

- Keenetic API authentication
- Challenge-response login
- Session cookie handling
- Wake-on-LAN request
- Configurable target MAC address
- No direct access to the sleeping server required

## Requirements

- Keenetic router with API access enabled
- A Keenetic user with permission to send Wake-on-LAN packets
- Network access to the router
- A valid target MAC address
- Deno, if using the TypeScript implementation

## Important Keenetic Permissions

A read-only Keenetic user may be unable to trigger Wake-on-LAN.

The account used by this module must have:

- Access to the Keenetic web interface
- Permission to perform configuration-changing actions
- Permission to send Wake-on-LAN packets

If available, start with the least-privileged write permission that allows the
Wake-on-LAN action. Full administrator access should only be used when
necessary.

## API Flow

The module generally follows this flow:

```text
GET /auth
       |
       +-- HTTP 200: session already available
       |
       +-- HTTP 401: challenge and realm returned
                    |
                    v
             Calculate response hash
                    |
                    v
             POST /auth
                    |
                    v
             Receive session cookie
                    |
                    v
             POST /rci/ip/hotspot/wake
```

## Configuration

Example configuration:

```typescript
const settings = {
  keeneticUrl: "https://router.example.local",
  keeneticUser: "wake-user",
  keeneticPassword: "replace-me",
  targetMac: "AA:BB:CC:DD:EE:FF",
};
```

Do not commit real values to the repository.

Use environment variables or a secret manager instead:

```text
KEENETIC_URL=
KEENETIC_USER=
KEENETIC_PASSWORD=
TARGET_MAC=
```

## Example API Request

The Wake-on-LAN request uses the Keenetic API endpoint:

```text
POST /rci/ip/hotspot/wake
```

Example request body:

```json
{
  "mac": "aa:bb:cc:dd:ee:ff"
}
```

The exact response may vary depending on the Keenetic firmware version.

## Security Warnings

This module can wake a device on the local network and uses router
credentials.

- Never commit router credentials.
- Never place credentials directly in public source code.
- Use a dedicated Keenetic user for Wake-on-LAN.
- Use the least-privileged account that supports the required action.
- Do not expose the Keenetic API directly to the public internet.
- Do not accept arbitrary MAC addresses from unauthenticated users.
- Validate MAC address format before sending a request.
- Rate-limit Wake-on-LAN requests.
- Log the result of the request without logging passwords or session cookies.
- Protect session cookies in memory and do not write them to public logs.
- Use HTTPS when communicating with the router whenever possible.
- Review TLS certificate validation before disabling it.
- Do not disable TLS verification as a permanent solution.

## MAC Address Validation

A valid MAC address should be checked before sending the request.

Example validation pattern:

```typescript
const macPattern =
  /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

if (!macPattern.test(targetMac)) {
  throw new Error("Invalid MAC address");
}
```

## Error Handling

The caller should distinguish between:

- Router connection failure
- Authentication failure
- Permission failure
- Invalid MAC address
- Wake-on-LAN request failure
- Network timeout

Example result:

```typescript
{
  success: false,
  message: "Router authentication failed"
}
```

Avoid returning sensitive details to public users.

Detailed errors should be written only to protected server logs.

## Testing

Before connecting this module to a public gateway, test it locally:

```text
1. Confirm the target server is asleep.
2. Run the module manually.
3. Confirm the router accepts the request.
4. Confirm the target server wakes.
5. Verify the result in the router logs.
```

If possible, test with a dedicated test device before using the main server.

## Troubleshooting

### HTTP 401 from the router

Possible causes:

- Incorrect username or password
- Incorrect challenge-response calculation
- Expired session cookie
- Firmware-specific authentication behavior

### HTTP 403 from the router

Possible causes:

- User has read-only permissions
- User cannot access the web interface
- User cannot trigger Wake-on-LAN
- Router policy blocks the action

### HTTP 404 from the router

Possible causes:

- Unsupported firmware version
- Incorrect API endpoint
- Incorrect router URL
- API path changed in the firmware

### The request succeeds but the server does not wake

Check:

- Target MAC address
- BIOS/UEFI Wake-on-LAN settings
- Network adapter power settings
- Ethernet cable and switch state
- Router’s known device list
- Whether the server supports wake from the selected sleep state

## Limitations

This module:

- Depends on Keenetic API behavior.
- Does not guarantee that the target device supports Wake-on-LAN.
- Does not verify that the operating system has fully booted.
- Does not provide authentication by itself.
- Should be called through a protected gateway or application.

## License

This module is part of the Wake-on-Demand Gateway project and is licensed
under the MIT License.
