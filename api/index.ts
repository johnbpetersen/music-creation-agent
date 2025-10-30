// api/index.ts
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { app as agentApp } from "../src/agent";

// Re-wrap the agent app so Vercel detects a Hono entrypoint.
const app = new Hono().route("/", agentApp);

export const config = { runtime: "nodejs20.x" };

export default handle(app);
