import md5 from "npm:md5";

export interface KeeneticSecrets {
  keeneticUrl: string;
  keeneticUser: string;
  keeneticPassword: string;
}

export interface WolResult {
  success: boolean;
  mac: string;
  message: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

function fixUrl(value: string): string {
  let url = value.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  return url.replace(/\/+$/, "");
}

function validateMac(mac: string): boolean {
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac);
}

function createTimeoutSignal(): AbortSignal {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  return controller.signal;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie");

  if (!setCookie) {
    return null;
  }

  return setCookie.split(";")[0];
}

async function authenticate(
  baseUrl: string,
  secrets: KeeneticSecrets,
): Promise<string | null> {
  let cookie: string | null = null;

  const initialResponse = await fetch(`${baseUrl}/auth`, {
    method: "GET",
    redirect: "manual",
    signal: createTimeoutSignal(),
  });

  cookie = getCookie(initialResponse);

  if (initialResponse.status === 200) {
    return cookie;
  }

  if (initialResponse.status !== 401) {
    return null;
  }

  const challenge =
    initialResponse.headers.get("X-NDM-Challenge")?.trim() ?? "";

  const realm =
    initialResponse.headers.get("X-NDM-Realm")?.trim() ?? "";

  if (!challenge || !realm) {
    return null;
  }

  const passwordHash = md5(
    `${secrets.keeneticUser}:${realm}:${secrets.keeneticPassword}`,
  );

  const responseHash = await sha256Hex(`${challenge}${passwordHash}`);

  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const authResponse = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      login: secrets.keeneticUser,
      password: responseHash,
    }),
    signal: createTimeoutSignal(),
  });

  if (authResponse.status !== 200) {
    return null;
  }

  const newCookie = getCookie(authResponse);

  return newCookie ?? cookie;
}

export async function wakeDevice(
  mac: string,
  secrets: KeeneticSecrets,
): Promise<WolResult> {
  const normalizedMac = mac.trim().toLowerCase();

  if (!validateMac(normalizedMac)) {
    return {
      success: false,
      mac,
      message: "Invalid MAC address.",
    };
  }

  const baseUrl = fixUrl(secrets.keeneticUrl);

  try {
    const cookie = await authenticate(baseUrl, secrets);

    if (!cookie) {
      return {
        success: false,
        mac: normalizedMac,
        message: "Keenetic authentication failed.",
      };
    }

    const headers = new Headers({
      "Content-Type": "application/json",
      "Cookie": cookie,
    });

    const response = await fetch(
      `${baseUrl}/rci/ip/hotspot/wake`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          mac: normalizedMac,
        }),
        signal: createTimeoutSignal(),
      },
    );

    if (response.status === 200) {
      return {
        success: true,
        mac: normalizedMac,
        message: "Wake-on-LAN packet sent successfully.",
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        mac: normalizedMac,
        message: "Keenetic authentication expired or was rejected.",
      };
    }

    if (response.status === 403) {
      return {
        success: false,
        mac: normalizedMac,
        message: "Keenetic user is not allowed to send Wake-on-LAN packets.",
      };
    }

    return {
      success: false,
      mac: normalizedMac,
      message: `Keenetic returned HTTP ${response.status}.`,
    };
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unknown Keenetic request error.";

    return {
      success: false,
      mac: normalizedMac,
      message,
    };
  }
}
