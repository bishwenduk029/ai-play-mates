import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Scene } from "@/components/Scene";
import { ControlPanel } from "@/components/ControlPanel";
import { DevControlPanel } from "@/components/DevControlPanel";
import { LiveKitSession } from "@/components/LiveKitSession";
import { SignOutButton } from "@/components/SignOutButton";
import { CharacterInit } from "@/components/CharacterInit";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default async function MatePage({
  params,
  searchParams,
}: {
  params: Promise<{ characterId: string }>;
  searchParams: Promise<{ dev?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { characterId } = await params;
  const { dev } = await searchParams;
  const showDevPanel = dev === "1";

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="scene-backdrop relative h-screen w-screen overflow-hidden">
      <Scene />

      {/* Initialize the controller with the selected character */}
      <CharacterInit characterId={characterId} />

      {/* Minimal character picker at bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6">
        {showDevPanel ? <DevControlPanel /> : <ControlPanel />}
      </div>

      {/* Top bar: back to hub + title + sign out + livekit */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Link
            href="/play"
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1.5 text-sm text-foreground backdrop-blur hover:bg-card"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-lg font-semibold">
              <span className="scene-accent">·</span> {characterId}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SignOutButton />
          <LiveKitSession />
        </div>
      </div>
    </main>
  );
}
