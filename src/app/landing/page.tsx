import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";

/**
 * Landing page — simple, public. Shows what S-PAC is, with a CTA to sign in
 * or play (if already authenticated).
 */
export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-950/40 via-slate-950 to-slate-950" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/70">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
          AI-powered play companion for kids
        </div>

        {/* Headline */}
        <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
          S-PAC
        </h1>
        <p className="mb-2 text-xl text-sky-300/90">
          Smart Play AI Companion
        </p>
        <p className="mb-8 max-w-xl text-base text-white/60">
          An AI companion that sees your child, talks to them, and brings a 3D
          character to life through play. Jump, wave, dance — together.
        </p>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          {session ? (
            <Link href="/play">
              <Button
                size="lg"
                className="bg-sky-500 text-slate-900 hover:bg-sky-400"
              >
                Play now →
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/signup">
                <Button
                  size="lg"
                  className="bg-sky-500 text-slate-900 hover:bg-sky-400"
                >
                  Get started free
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-white/70 hover:text-white"
                >
                  I have an account
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Feature bullets */}
        <div className="mt-16 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-2 text-2xl">👀</div>
            <h3 className="mb-1 font-semibold">Sees your kid</h3>
            <p className="text-sm text-white/50">
              Live webcam vision — the agent watches and reacts in real time.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-2 text-2xl">🐰</div>
            <h3 className="mb-1 font-semibold">3D characters</h3>
            <p className="text-sm text-white/50">
              A bunny, a creature, and more — each with its own moves.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="mb-2 text-2xl">🎙️</div>
            <h3 className="mb-1 font-semibold">Voice + motion</h3>
            <p className="text-sm text-white/50">
              The agent talks and drives the figure through natural play.
            </p>
          </div>
        </div>

        <p className="mt-12 text-xs text-white/30">
          Built with Next.js, three.js, LiveKit, and Gemini Live.
        </p>
      </div>
    </main>
  );
}
