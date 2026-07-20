import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Games · AI Play Zone" };

const GAMES = [
  {
    slug: "jungle-blast",
    title: "Jungle Blast",
    description:
      "Auto-walk through the jungle. Punch the air to blast charging animals. Your body is the controller — no remote needed.",
    emoji: "🌴",
    tag: "MediaPipe Pose",
  },
] as const;

/**
 * Games hub — auth-gated. Lists playable games. Pure shadcn theme.
 */
export default async function GamesHubPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-xs font-bold">PZ</span>
            </div>
            AI Play Zone
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/play">
              <Button size="sm" variant="ghost">Play</Button>
            </Link>
            <Link href="/upload">
              <Button size="sm" variant="ghost">Upload</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        <section className="mb-10">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">Games</h1>
          <p className="text-base text-muted-foreground">
            Motion-controlled arcade games. Your kid&apos;s jumping, punching,
            and running drive the action — captured live via webcam.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {GAMES.map((g) => (
            <Card key={g.slug} className="flex flex-col">
              <CardHeader>
                <div className="mb-2 text-4xl">{g.emoji}</div>
                <CardTitle className="text-2xl">{g.title}</CardTitle>
                <CardDescription>{g.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Link href={`/games/${g.slug}`}>
                  <Button>Play {g.title} →</Button>
                </Link>
                <p className="mt-3 text-xs text-muted-foreground">{g.tag}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
