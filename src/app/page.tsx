import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Landing page — AI Play Zone.
 * Kid-friendly, parent-trustworthy, shareable on social.
 * No technical jargon, no scary "it sees your kid" language.
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
              <span className="text-xs font-bold">PZ</span>
            </div>
            AI Play Zone
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
                  <Button size="sm">Start free</Button>
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
            Where play comes alive
          </div>

          <h1 className="mb-4 text-5xl font-bold tracking-tight sm:text-6xl">
            AI Play Zone
          </h1>
          <p className="mb-8 max-w-xl text-base text-muted-foreground">
            Magical characters that talk, move, and play with your child.
            They jump, the character jumps. They wave, the character waves.
            A new kind of playtime — active, silly, and screen-free in spirit.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {session ? (
              <Link href="/play">
                <Button size="lg">Play now →</Button>
              </Link>
            ) : (
              <>
                <Link href="/signup">
                  <Button size="lg">Start playing free</Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="ghost">
                    I have an account
                  </Button>
                </Link>
              </>
            )}
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Free to try · $1/month for premium characters · Cancel anytime
          </p>
        </section>

        {/* Bento grid */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Large card */}
          <Card className="md:col-span-2 md:row-span-2 flex flex-col">
            <CardHeader>
              <div className="mb-2 text-4xl">🐰</div>
              <CardTitle className="text-2xl">Characters that play back</CardTitle>
              <CardDescription>Talk, move, and giggle together</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Each character has its own personality and moves. Your child
                talks to them, and they talk back. They wave, and the character
                waves. It's like a friend who lives in the screen — one who
                never gets tired of playing.
              </p>
            </CardContent>
          </Card>

          {/* Tall card */}
          <Card className="md:row-span-2 flex flex-col">
            <CardHeader>
              <div className="mb-2 text-4xl">🎉</div>
              <CardTitle>Arcade games</CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">
                Jump, duck, and dodge in simple motion-powered mini-games.
                No controller needed — just your child's body.
              </p>
            </CardContent>
          </Card>

          {/* Wide card */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="mb-2 text-4xl">🧡</div>
              <CardTitle>Screen time you'll feel good about</CardTitle>
              <CardDescription>Active, not passive</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Instead of watching, your child moves, talks, and laughs.
                Playtime that burns energy and sparks imagination.
              </p>
            </CardContent>
          </Card>

          {/* Single card */}
          <Card>
            <CardHeader>
              <div className="mb-2 text-4xl">🔒</div>
              <CardTitle>Parent-safe</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Email login. No ads. Cancel anytime.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t pt-8 text-center">
          <p className="text-xs text-muted-foreground">
            AI Play Zone · Built with love for little ones.
          </p>
        </footer>
      </main>
    </div>
  );
}
