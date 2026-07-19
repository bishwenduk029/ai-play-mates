import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/auth-schema";

// SQLite file — zero server, zero setup. Swap to Postgres for production by
// changing the Database connection + drizzle provider.
const sqlite = new Database("./sqlite.db");
export const db = drizzle(sqlite, { schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { ...schema },
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Allow any localhost port in dev so port changes (3000/3001/...) don't
  // break the origin check. Remove in production.
  trustedOrigins: process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3001"]
    : undefined,
  plugins: [nextCookies()], // required for server actions to set cookies
});
