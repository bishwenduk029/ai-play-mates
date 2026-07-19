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
  plugins: [nextCookies()], // required for server actions to set cookies
});
