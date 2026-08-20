import { Application, Router } from "@oak/oak";

const PORT = Number(Deno.env.get("PORT") ?? "6910");

const router = new Router();

router.get("/", (context) => {
  context.response.headers.set("Content-Type", "text/html; charset=utf-8");

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
  <p>Gateway is running.</p>
</body>
</html>
`;
});

router.get("/api/status", (context) => {
  context.response.body = {
    service: "wake-on-demand-gateway",
    status: "ok",
    timestamp: new Date().toISOString(),
  };
});

const app = new Application();

app.use(async (context, next) => {
  try {
    await next();
  } catch (error) {
    console.error(error);

    context.response.status = 500;
    context.response.body = {
      error: "Internal server error",
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
