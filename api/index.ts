// api/index.ts
import { handle } from "hono/vercel";
import { app } from "../src/agent";

// Use Node runtime on Vercel; Bun.serve is for local dev only
export const config = { runtime: "nodejs20.x" };

export default handle(app);