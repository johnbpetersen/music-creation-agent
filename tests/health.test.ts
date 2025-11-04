import { describe, expect, it } from "bun:test";
import { app } from "../src/agent";

describe("health endpoint", () => {
  it("reports configured status in fallback mode", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/health")
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(["fallback", "live"]).toContain(body.services.daydreamsAx.mode);
    expect(body.services.daydreamsAx.ready).toBe(true);
    expect(body.services.elevenLabs.mode).toBe("placeholder");
    expect(body.services.elevenLabs.ready).toBe(true);
  });
});
