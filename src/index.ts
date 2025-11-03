import { app } from "./agent";
import { getChainConfig } from "./config/chain";
import { env } from "./config/env";
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

const chainConfig = getChainConfig(env);

const server = Bun.serve({
  port: env.PORT,
  async fetch(req) {
    const proto =
      req.headers.get("x-forwarded-proto") ??
      (env.API_BASE_URL?.startsWith("https") ? "https" : "http");
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
    const url = new URL(req.url);

    if (url.pathname === "/ui/config.json") {
      const body = JSON.stringify({
        network: chainConfig.network,
        chainId: chainConfig.chainId,
        chainIdHex: `0x${chainConfig.chainId.toString(16)}`,
        chainLabel: chainConfig.chainLabel,
        rpcUrl: chainConfig.rpcUrl,
        explorerUrl: chainConfig.explorerUrl,
        usdcAddress: chainConfig.usdcAddress,
        facilitatorUrl: env.FACILITATOR_URL,
        payTo:
          (env.PAY_TO as `0x${string}` | undefined) ??
          "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
      });
      return new Response(body, { headers: { "content-type": "application/json" } });
    }

    const uiResponse = await maybeServeUi(req);
    if (uiResponse) return uiResponse;

    url.protocol = `${proto}:`;
    url.host = host;
    const patched = new Request(url.toString(), req);
    return app.fetch(patched);
  },
});

const origin = env.API_BASE_URL
  ? env.API_BASE_URL.replace(/\/$/, "")
  : `http://${server.hostname}:${server.port}`;

console.log(`🚀 Agent ready at ${origin}/.well-known/agent.json`);
