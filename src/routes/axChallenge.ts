import type { Hono } from "hono";

export function registerAxChallengeRoute(app: Hono) {
  app.get("/api/ax/challenge", async (c) => {
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return c.json({ ok: false, error: "OPENAI_API_KEY not set" }, 400);
    }

    try {
      const res = await fetch(
        "https://api-beta.daydreams.systems/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-5",
            messages: [{ role: "user", content: "ping" }],
            stream: false,
          }),
        }
      );

      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {}

      return c.json({
        ok: true,
        status: res.status,
        body,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });
}

