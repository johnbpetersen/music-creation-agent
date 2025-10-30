// api/index.ts
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { app as agentApp } from "../src/agent";

const app = new Hono().route("/", agentApp as any);

export const config = { runtime: "nodejs" };

export default handle(app);
