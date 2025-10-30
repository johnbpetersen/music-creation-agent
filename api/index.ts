// api/index.ts
import { app } from "../src/agent";

// Vercel expects a default export (Hono app/handler). No Bun.serve here.
export default app;