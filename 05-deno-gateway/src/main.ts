import { Application, Router } from "@oak/oak";

import {
  getConfig,
  initialize,
  isInitialized,
  verifyGatewayPassword,
} from "./kv.ts";

import {
  createSession,
  deleteSession,
  getSession,
} from "./session.ts";

const PORT = Number(Deno.env.get("PORT") ?? "6910");

const router = new Router();

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function getSessionToken(context: any): string | null {
  const bearerToken = getBearerToken(context.request.source);

  if (bearerToken) {
    return bearerToken;
  }

  try {
    return context.cookies.get("session") ?? null;
  } catch {
    return null;
  }
}

router.get("/", async (context) => {
  if (await isInitialized()) {
    context.response.headers.set(
      "Content-Type",
      "text/html; charset=utf-8",
    );

    context.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wake-on-Demand Gateway</title>
</head>
<body>
  <h1>Wake-on-Demand Gateway</h1>

  <form method="post" action="/api/login">
    <label>
      Password:
      <input type="password" name="password" required>
    </label>
    <button type="submit">Login</button>
  </form>
</body>
</html>
`;

    return;
  }

  context.response.redirect("/setup");
});

router.get("/setup", async (context) => {
  if (await isInitialized()) {
    context.response.redirect("/");
    return;
  }

  context.response.headers.set(
    "Content-Type",
    "text/html; charset=utf-8",
  );

  context.response.body = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gateway Setup</title>
</head>
<body>
  <h1>Initial Gateway Setup</h1>

  <form method="post" action="/api/setup">
    <p>
      <label>
        Gateway password:
        <input type="password" name="password" required>
      </label>
    </p>

    <p>
      <label>
        Keenetic URL:
        <input type="url" name="keeneticUrl" required>
      </label>
    </p>

    <p>
      <label>
        Keenetic username:
        <input type="text" name="keeneticUser" required>
      </label>
    </p>

    <p>
      <label>
        Keenetic password:
        <input type="password" name="keeneticPassword" required>
      </label>
    </p>

    <p>
      <label>
        Target service URL:
        <input type="url" name="serviceUrl" required>
      </label>
    </p>

    <p>
      <label>
        Target MAC address:
        <input type="text" name="mac" required>
      </label>
    </p>

    <button type="submit">Initialize Gateway</button>
  </form>
</body>
</html>
`;

  return;
});

router.get("/api/status", async (context) => {
  context.response.body = {
    initialized: await isInitialized(),
    service: "wake-on-demand-gateway",
    timestamp: new Date().toISOString(),
  };
});

router.post("/api/setup", async (context) => {
  if (await isInitialized()) {
    context.response.status = 400;
    context.response.body = {
      success: false,
      message: "Gateway is already initialized.",
    };
    return;
  }

  const body = await context.request.body.form();

  const password = body.get("password")?.toString() ?? "";
  const keeneticUrl = body.get("keeneticUrl")?.toString() ?? "";
  const keeneticUser = body.get("keeneticUser")?.toString() ?? "";
  const keeneticPassword = body.get("keeneticPassword")?.toString() ?? "";
  const serviceUrl = body.get("serviceUrl")?.toString() ?? "";
  const mac = body.get("mac")?.toString() ?? "";

  if (password.length < 12) {
    context.response.status = 400;
    context.response.body = {
      success: false,
      message: "Gateway password must contain at least 12 characters.",
    };
    return;
  }

  if (
    !keeneticUrl ||
    !keeneticUser ||
    !keeneticPassword ||
    !serviceUrl ||
    !mac
  ) {
    context.response.status = 400;
    context.response.body = {
      success: false,
      message: "All fields are required.",
    };
    return;
  }

  try {
    await initialize(password, {
      keeneticUrl,
      keeneticUser,
      keeneticPassword,
      serviceUrl,
      devices: [
        {
          mac,
          name: "Primary target",
        },
      ],
    });

    context.response.redirect("/");
  } catch (error) {
    console.error("Gateway initialization failed:", error);

    context.response.status = 500;
    context.response.body = {
      success: false,
      message: "Gateway initialization failed.",
    };
  }
});

router.post("/api/login", async (context) => {
  const body = await context.request.body.form();
  const password = body.get("password")?.toString() ?? "";

  const valid = await verifyGatewayPassword(password);

  if (!valid) {
    context.response.status = 401;
    context.response.body = {
      success: false,
      message: "Invalid credentials.",
    };
    return;
  }

  const session = createSession("gateway-user");

  context.cookies.set("session", session.token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
    path: "/",
  });

  context.response.body = {
    success: true,
    message: "Login successful.",
    expiresAt: session.expiresAt,
  };
});

router.post("/api/logout", (context) => {
  const token = getSessionToken(context);

  if (token) {
    deleteSession(token);
  }

  context.cookies.delete("session", {
    path: "/",
  });

  context.response.body = {
    success: true,
  };
});

const app = new Application();

app.use(async (context, next) => {
  try {
    await next();
  } catch (error) {
    console.error("Unhandled application error:", error);

    context.response.status = 500;
    context.response.body = {
      error: "Internal server error.",
    };
  }
});

app.use(async (context, next) => {
  context.response.headers.set("X-Content-Type-Options", "nosniff");
  context.response.headers.set("X-Frame-Options", "DENY");
  context.response.headers.set("Referrer-Policy", "no-referrer");

  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Wake-on-Demand Gateway listening on port ${PORT}`);

await app.listen({
  port: PORT,
});
