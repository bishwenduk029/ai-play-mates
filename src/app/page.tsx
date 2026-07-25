import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { SubscriptionButton } from "@/components/SubscriptionButton";

/**
 * Landing page — AI Play Zone.
 * "The Netflix for AI games." Cinematic dark theme (matches the app-wide
 * dark theme via theme tokens — no hardcoded colors). Pitch only: hero,
 * how it works, one-tile pricing. Games themselves live on /play.
 */
export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="#pricing">
              <Button size="sm" variant="ghost">
                Pricing
              </Button>
            </Link>
            {session ? (
              <Link href="/play">
                <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400">
                  Play →
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button size="sm" variant="ghost">
                    Sign in
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400">
                    Start free
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        {/* Hero */}
        <section className="relative mb-16 px-1 py-16 sm:mb-24 sm:py-24">
          {/* glow backdrop */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
          >
            <div className="absolute left-1/2 top-[-20%] h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[120px]" />
            <div className="absolute right-[-10%] top-[10%] h-[320px] w-[320px] rounded-full bg-indigo-500/10 blur-[100px]" />
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              New games every Saturday
            </div>

            <h1 className="mb-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl sm:leading-tight">
              Arcade games your body controls
            </h1>
            <p className="mb-8 max-w-xl text-base text-muted-foreground sm:text-lg">
              No controller, no app — just a webcam. Punch, run, and fly through
              motion-powered games, and meet AI play-mates that talk and move
              back.
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row">
              {session ? (
                <>
                  <SubscriptionButton size="lg" />
                  <Link href="/play">
                    <Button size="lg" className="bg-emerald-500 text-black hover:bg-emerald-400">
                      Play now →
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup">
                    <Button size="lg" className="bg-emerald-500 text-black hover:bg-emerald-400">
                      Start playing free
                    </Button>
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
              Free to try · $1/month · Cancel anytime
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mb-16 sm:mb-24">
          <h2 className="mb-6 px-1 text-xl font-semibold tracking-tight sm:text-2xl">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { n: "1", t: "Open the site", d: "No app to install. It runs in the browser." },
              { n: "2", t: "Allow camera", d: "One tap. The webcam turns motion into play." },
              { n: "3", t: "Play with your body", d: "Jump, punch, fly — your kid is the controller." },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-xl border bg-card p-5"
              >
                <div className="mb-3 flex size-8 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-black">
                  {s.n}
                </div>
                <div className="mb-1 font-semibold">{s.t}</div>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mb-16 scroll-mt-20 sm:mb-24">
          <div className="flex flex-col items-center text-center">
            <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
              One simple price
            </h2>
            <p className="mb-8 text-base text-muted-foreground">
              Everything unlocked. No ads, no in-app purchases.
            </p>
            <div className="w-full max-w-sm rounded-2xl border bg-card p-6">
              <div className="mb-1 text-4xl font-bold sm:text-5xl">
                $1<span className="text-xl font-normal text-muted-foreground">/month</span>
              </div>
              <p className="mb-6 text-sm text-muted-foreground">
                Everything unlocked · Free to try
              </p>
              <ul className="mb-6 space-y-2 text-left text-sm text-foreground/80">
                <li>✓ Every game and every character</li>
                <li>✓ New games every Saturday</li>
                <li>✓ No ads, no extra charges</li>
                <li>✓ Cancel anytime</li>
              </ul>
              {session ? (
                <SubscriptionButton size="lg" />
              ) : (
                <Link href="/signup">
                  <Button size="lg" className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
                    Start free →
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <p>AI Play Zone · Built with love for little ones.</p>
        </div>
      </footer>
    </div>
  );
}
