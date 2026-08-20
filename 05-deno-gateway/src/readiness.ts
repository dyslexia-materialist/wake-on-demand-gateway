export interface ReadinessOptions {
  timeoutMs?: number;
  maxWaitMs?: number;
  retryIntervalMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface ReadinessResult {
  ready: boolean;
  status?: number;
  elapsedMs: number;
  error?: string;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown connection error.";
}

export async function checkTargetReady(
  targetUrl: string,
  timeoutMs = 3_000,
): Promise<ReadinessResult> {
  const startedAt = Date.now();
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(normalizeUrl(targetUrl), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });

    // The response body is not needed for a readiness check.
    await response.body?.cancel();

    return {
      ready: true,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ready: false,
      elapsedMs: Date.now() - startedAt,
      error: getErrorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForTarget(
  targetUrl: string,
  options: ReadinessOptions = {},
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const maxWaitMs = options.maxWaitMs ?? 90_000;
  const retryIntervalMs = options.retryIntervalMs ?? 2_000;

  const startedAt = Date.now();
  let attempt = 0;
  let lastResult: ReadinessResult | null = null;

  while (Date.now() - startedAt < maxWaitMs) {
    attempt++;

    const result = await checkTargetReady(targetUrl, timeoutMs);
    lastResult = result;

    if (result.ready) {
      return {
        ...result,
        elapsedMs: Date.now() - startedAt,
      };
    }

    options.onRetry?.(attempt, result.error);

    await new Promise((resolve) => {
      setTimeout(resolve, retryIntervalMs);
    });
  }

  return {
    ready: false,
    elapsedMs: Date.now() - startedAt,
    error: lastResult?.error ?? "Target did not become ready in time.",
  };
}
