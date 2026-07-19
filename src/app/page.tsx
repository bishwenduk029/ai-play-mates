import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// Root route: authenticated users go to /play, others to /landing.
export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? "/play" : "/landing");
}
