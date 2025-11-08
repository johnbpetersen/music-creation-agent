import { config } from "dotenv";

config();

const baseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8787";

type FetchResult<T = unknown> = {
  ok: boolean;
  status: number;
  body: T | string | null;
};

async function fetchJson<T = unknown>(path: string): Promise<FetchResult<T>> {
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    let body: T | string | null = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: (error as Error)?.message ?? String(error),
    };
  }
}

async function main() {
  console.log(`[daydreams-check] using base URL ${baseUrl}`);

  const health = await fetchJson("/api/health");
  if (!health.ok) {
    console.error(
      `[daydreams-check] health check failed (${health.status}):`,
      health.body
    );
  } else {
    console.log("[daydreams-check] /api/health", JSON.stringify(health.body, null, 2));
  }

  const ax = await fetchJson("/api/ax/challenge");
  if (!ax.ok) {
    console.error(
      `[daydreams-check] ax challenge failed (${ax.status}):`,
      ax.body
    );
  } else {
    console.log("[daydreams-check] /api/ax/challenge", JSON.stringify(ax.body, null, 2));
  }
}

main().catch((error) => {
  console.error("[daydreams-check] unexpected error:", error);
  process.exit(1);
});
