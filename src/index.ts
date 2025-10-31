import { app } from "./agent";
import { join } from "path";

const uiRoot = join(import.meta.dir, "../public/ui");

async function maybeServeUi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname === "/ui" || url.pathname === "/ui/") {
    const file = Bun.file(join(uiRoot, "index.html"));
    if (await file.exists()) {
      return new Response(file, { headers: { "content-type": "text/html" } });
    }
    return new Response("UI missing", { status: 404 });
  }

  if (url.pathname.startsWith("/ui/")) {
    const relative = url.pathname.replace(/^\/ui\//, "");
    const candidate = Bun.file(join(uiRoot, relative));
    if (await candidate.exists()) {
      return new Response(candidate);
    }
  }
  return null;
}

const port = Number(process.env.PORT ?? 8787);

const server = Bun.serve({
  port,
  async fetch(req) {
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (process.env.API_BASE_URL?.startsWith("https") ? "https" : "http");
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
    const url = new URL(req.url);

    const uiResponse = await maybeServeUi(req);
    if (uiResponse) return uiResponse;

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
