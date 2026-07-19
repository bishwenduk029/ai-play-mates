import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Scene } from "@/components/Scene";
import { ControlPanel } from "@/components/ControlPanel";
import { DevControlPanel } from "@/components/DevControlPanel";
import { LiveKitSession } from "@/components/LiveKitSession";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ dev?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { dev } = await searchParams;
  const showDevPanel = dev === "1";

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="scene-backdrop relative h-screen w-screen overflow-hidden">
      <Scene />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6">
        {showDevPanel ? <DevControlPanel /> : <ControlPanel />}
      </div>

      <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6">
        <h1 className="text-lg font-semibold">
          AI Play Mates <span className="scene-accent">·</span> Play Companion
        </h1>
        <p className="scene-overlay-muted text-xs">
          Hi {session.user.name}!
        </p>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-3 sm:right-6 sm:top-6">
        <SignOutButton />
        <LiveKitSession />
      </div>
    </main>
  );
}
