import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/auth-schema";

// Turso (libSQL/SQLite over network) — works locally AND on Vercel.
// Env vars: TURSO_DATABASE_URL (libsql://...), TURSO_AUTH_TOKEN.
// For local dev without Turso, falls back to a local file.
const client =
  process.env.TURSO_DATABASE_URL
    ? createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
    : createClient({ url: "file:local.db" });

export const db = drizzle(client, { schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { ...schema },
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3001"]
    : undefined,
  plugins: [nextCookies()],
});
