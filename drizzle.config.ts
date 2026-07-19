import { defineConfig } from "drizzle-kit";

// Drizzle config for Turso (libSQL). Env vars come from your environment.
// Local fallback: file:local.db (no Turso needed for dev).
const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export default defineConfig({
  schema: "./src/db/auth-schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    ...(authToken ? { authToken } : {}),
  },
});
