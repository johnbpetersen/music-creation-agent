import { app } from "./agent";

const port = Number(process.env.PORT ?? 8787);

const server = Bun.serve({
  port,
  fetch(req) {
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (process.env.API_BASE_URL?.startsWith("https") ? "https" : "http");
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
    const url = new URL(req.url);
    url.protocol = `${proto}:`;
    url.host = host;
    const patched = new Request(url.toString(), req);
    return app.fetch(patched);
  },
});

const origin = process.env.API_BASE_URL
  ? process.env.API_BASE_URL.replace(/\/$/, "")
  : `http://${server.hostname}:${server.port}`;

console.log(`🚀 Agent ready at ${origin}/.well-known/agent.json`);
