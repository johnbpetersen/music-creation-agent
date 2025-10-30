// api/index.ts
import { Hono } from "hono";
import { app as agentApp } from "../src/agent";

const app = new Hono();

// Delegate everything to the agent-kit app.
app.route("/", agentApp);

export const config = { runtime: "nodejs20.x" };

export default app;
