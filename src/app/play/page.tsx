import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Scene } from "@/components/Scene";
import { ControlPanel } from "@/components/ControlPanel";
import { LiveKitSession } from "@/components/LiveKitSession";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PlayPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <Scene />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6">
        <ControlPanel />
      </div>

      <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6">
        <h1 className="text-lg font-semibold text-white">
          S-PAC <span className="text-sky-400">·</span> Play Companion
        </h1>
        <p className="text-xs text-white/50">
          Hi {session.user.name}! three.js + livekit vision agent
        </p>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-3 sm:right-6 sm:top-6">
        <SignOutButton />
        <LiveKitSession />
      </div>
    </main>
  );
}
