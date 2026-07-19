import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Landing page — public home page with header + bento grid.
 * Default shadcn light theme. All styling via shadcn tokens.
 */
export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-xs font-bold">APM</span>
            </div>
            AI Play Mates
          </Link>
          <nav className="flex items-center gap-2">
            {session ? (
              <Link href="/play">
                <Button size="sm">Play →</Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button size="sm" variant="ghost">Sign in</Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        {/* Hero */}
        <section className="mb-20 flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs text-muted-foreground">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            AI-powered play companion for kids
          </div>

          <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
            AI Play Mates
          </h1>
          <p className="mb-2 text-xl text-muted-foreground">
            AI Play Mates for kids
          </p>
          <p className="mb-8 max-w-xl text-base text-muted-foreground">
            An AI companion that sees your child, talks to them, and brings a 3D
            character to life through play. Jump, wave, dance — together.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {session ? (
              <Link href="/play">
                <Button size="lg">Play now →</Button>
              </Link>
            ) : (
              <>
                <Link href="/signup">
                  <Button size="lg">Get started free</Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="ghost">
                    I have an account
                  </Button>
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Bento grid */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Large card — spans 2 cols, 2 rows on desktop */}
          <Card className="md:col-span-2 md:row-span-2 flex flex-col">
            <CardHeader>
              <div className="mb-2 text-4xl">👀</div>
              <CardTitle className="text-2xl">Sees your kid</CardTitle>
              <CardDescription>Live webcam vision powered by Gemini</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                The AI agent watches your child through their webcam and reacts
                in real time. Wave, and it waves back. Jump, and it jumps. The
                companion responds to what it sees — no controllers needed.
              </p>
            </CardContent>
          </Card>

          {/* Tall card — spans 2 rows */}
          <Card className="md:row-span-2 flex flex-col">
            <CardHeader>
              <div className="mb-2 text-4xl">🎙️</div>
              <CardTitle>Voice + motion</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                The agent talks to your child and drives the 3D figure through
                natural, playful conversation.
              </p>
            </CardContent>
          </Card>

          {/* Wide card — spans 2 cols */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="mb-2 text-4xl">🐰</div>
              <CardTitle>3D characters with real moves</CardTitle>
              <CardDescription>Bunny, creature, and more</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Each character has its own action set — jump, wave, dance,
                attack, roar. Upload your own rigged GLB to create new characters.
              </p>
            </CardContent>
          </Card>

          {/* Single card */}
          <Card>
            <CardHeader>
              <div className="mb-2 text-4xl">🔒</div>
              <CardTitle>Safe &amp; simple</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Email login, no data leaves your device.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t pt-8 text-center">
          <p className="text-xs text-muted-foreground">
            Built with Next.js, three.js, LiveKit, and Gemini Live.
          </p>
        </footer>
      </main>
    </div>
  );
}
