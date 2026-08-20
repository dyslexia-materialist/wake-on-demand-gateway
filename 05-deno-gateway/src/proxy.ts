const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const BLOCKED_REQUEST_HEADERS = new Set([
  "authorization",
  "cookie",
  "host",
  "content-length",
  "connection",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

function normalizeBaseUrl(value: string): URL {
  const normalized = value.trim().startsWith("http://") ||
      value.trim().startsWith("https://")
    ? value.trim()
    : `https://${value.trim()}`;

  const url = new URL(normalized);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Target URL must use HTTP or HTTPS.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");

  return url;
}

function buildTargetUrl(
  targetBaseUrl: string,
  requestPath: string,
  queryString: string,
): string {
  if (!requestPath.startsWith("/")) {
    throw new Error("Proxy path must start with '/'.");
  }

  const baseUrl = normalizeBaseUrl(targetBaseUrl);
  const targetUrl = new URL(baseUrl.toString());

  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  const cleanPath = requestPath.replace(/^\/+/, "");

  targetUrl.pathname = `${basePath}/${cleanPath}`.replace(
    /\/{2,}/g,
    "/",
  );

  targetUrl.search = queryString;

  return targetUrl.toString();
}

function copyRequestHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const [name, value] of request.headers.entries()) {
    if (BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();

  for (const [name, value] of response.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    // Do not expose target application cookies through the gateway.
    if (name.toLowerCase() === "set-cookie") {
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

export interface ProxyOptions {
  timeoutMs?: number;
}

export async function proxyRequest(
  request: Request,
  targetBaseUrl: string,
  requestPath: string,
  queryString = "",
  options: ProxyOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000;

  const targetUrl = buildTargetUrl(
    targetBaseUrl,
    requestPath,
    queryString,
  );

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const headers = copyRequestHeaders(request);

    headers.set("X-Forwarded-Proto", "https");

    const method = request.method.toUpperCase();
    const bodyAllowed = !["GET", "HEAD", "OPTIONS"].includes(method);

    const fetchOptions: RequestInit & { duplex?: string } = {
      method,
      headers,
      redirect: "manual",
      signal: controller.signal,
    };

    if (bodyAllowed && request.body) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    const response = await fetch(targetUrl, fetchOptions);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: copyResponseHeaders(response),
    });
  } finally {
    clearTimeout(timeout);
  }
}
