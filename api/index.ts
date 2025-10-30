// api/index.ts
import { handle } from "hono/vercel";
import { app } from "../src/agent";

// Use Node runtime (safer if libs need Node APIs)
export const config = {
  runtime: "nodejs20.x",
};

export default handle(app);