import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { JungleBlastGame } from "@/components/games/JungleBlastGame";
import { SkyStrikeGame } from "@/components/games/SkyStrikeGame";
import { BoxingBrawlGame } from "@/components/games/BoxingBrawlGame";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Jungle Blast · AI Play Zone" };

const TITLES: Record<string, string> = {
  "jungle-blast": "Jungle Blast",
  "sky-strike": "Sky Strike",
  "boxing-brawl": "Boxing Brawl",
};

/**
 * A single game page — auth-gated. Renders the game client component, which
 * owns the webcam + Phaser lifecycle. Pure shadcn shell.
 */
export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { slug } = await params;
  const title = TITLES[slug];
  if (!title) notFound();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 text-white backdrop-blur supports-[backdrop-filter]:bg-black/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-white">
            <Logo />
          </Link>
          <Link href="/play">
            <Button size="sm" variant="ghost" className="h-9 min-h-9 text-white/70 hover:text-white hover:bg-white/10 sm:h-auto sm:min-h-0">
              <span className="sm:hidden">← Play</span>
              <span className="hidden sm:inline">← Back to Play</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center">
          <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {slug === "sky-strike"
              ? "Motion-controlled — grant camera access, then grab the yoke with both fists."
              : slug === "boxing-brawl"
                ? "Motion-controlled — grant camera access, then throw real punches!"
                : "Motion-controlled — grant camera access, then punch & run."}
          </p>
        </div>
        {slug === "sky-strike" ? <SkyStrikeGame /> : slug === "boxing-brawl" ? <BoxingBrawlGame /> : <JungleBlastGame />}
      </main>
    </div>
  );
}
