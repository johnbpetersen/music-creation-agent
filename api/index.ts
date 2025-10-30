// api/index.ts
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { app as agentApp } from "../src/agent.js";

const app = new Hono();

app.all("*", (c) => {
  const rawReq = c.req.raw;
  const url = rawReq.url.startsWith("http")
    ? rawReq.url
    : `${c.req.header("x-forwarded-proto") ?? "https"}://${c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost"}${rawReq.url}`;

  const patchedRequest = new Request(url, rawReq);
  return agentApp.fetch(patchedRequest, c.env);
});

export const config = { runtime: "nodejs" };

export default handle(app);
