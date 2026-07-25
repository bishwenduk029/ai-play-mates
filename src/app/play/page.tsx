import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { SubscriptionButton } from "@/components/SubscriptionButton";

/**
 * Unified /play hub — Netflix-style rows of cinematic tiles.
 * Mobile-friendly, dark theme.
 *
 * Rows:
 *   1. Move & Play Games — real-time body-controlled arcade games
 *   2. Interactive Play Mates — AI companion characters that talk + move
 */

interface Tile {
  href: string;
  title: string;
  sub: string;
  emoji: string;
  gradient: string;
}

const GAMES: Tile[] = [
  {
    href: "/games/jungle-blast",
    title: "Jungle Blast",
    sub: "Punch charging animals",
    emoji: "🌴",
    gradient: "from-green-600 to-green-900",
  },
  {
    href: "/games/sky-strike",
    title: "Sky Strike",
    sub: "Fist-yoke dogfighting",
    emoji: "✈️",
    gradient: "from-sky-700 to-indigo-950",
  },
  {
    href: "/games/boxing-brawl",
    title: "Boxing Brawl",
    sub: "Real punches vs a zombie",
    emoji: "🥊",
    gradient: "from-red-800 to-zinc-950",
  },
];

export default async function PlayHubPage({
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

  const MATES: Tile[] = [
    {
      href: `/mates/creature${showDevPanel ? "?dev=1" : ""}`,
      title: "Creature",
      sub: "Talks and moves with you",
      emoji: "🐊",
      gradient: "from-amber-600 to-amber-900",
    },
    {
      href: `/mates/bunny${showDevPanel ? "?dev=1" : ""}`,
      title: "Bunny",
      sub: "Your bouncy play-mate",
      emoji: "🐰",
      gradient: "from-pink-500 to-pink-800",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden max-w-20 truncate text-sm text-muted-foreground sm:inline">
              Hi {session.user.name}
            </span>
            <SubscriptionButton size="sm" />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Play Zone</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Pick an activity and start playing.
        </p>

        {/* Row 1: Move & Play Games */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Move &amp; Play Games</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Jump, duck, and dodge — your body is the controller.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {GAMES.map((t) => (
              <NetflixTile key={t.href} tile={t} />
            ))}
            <MoreSoonTile emoji="🎮" label="New game Saturday" />
          </div>
        </section>

        {/* Row 2: Interactive Play Mates */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Interactive Play Mates</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Characters that talk, move, and play with your child.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {MATES.map((t) => (
              <NetflixTile key={t.href} tile={t} />
            ))}
            <MoreSoonTile emoji="✨" label="More soon" />
          </div>
        </section>
      </main>
    </div>
  );
}

/** Cinematic 16:9 tile — gradient art, big emoji, title over a bottom scrim. */
function NetflixTile({ tile }: { tile: Tile }) {
  return (
    <Link
      href={tile.href}
      className={`group relative block aspect-video overflow-hidden rounded-xl bg-gradient-to-br ${tile.gradient} ring-foreground/10 transition duration-200 hover:z-10 hover:scale-[1.04] hover:shadow-2xl hover:shadow-black/60 hover:ring-2 hover:ring-emerald-500/80`}
    >
      <span className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-lg transition duration-200 group-hover:scale-110">
        {tile.emoji}
      </span>
      {/* bottom scrim for title legibility */}
      <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 p-3">
        <span className="block text-sm font-semibold text-white">
          {tile.title}
        </span>
        <span className="block text-xs text-white/60">{tile.sub}</span>
      </span>
    </Link>
  );
}

/** Dashed placeholder tile matching the Netflix tile shape. */
function MoreSoonTile({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-dashed border-foreground/15 bg-foreground/[0.02] text-center">
      <span className="text-2xl opacity-40">{emoji}</span>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
