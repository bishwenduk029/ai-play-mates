import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Unified /play hub — Netflix-style grid of activity categories.
 * Mobile-friendly, shadcn theme.
 *
 * Categories:
 *   1. Move & Play Games — real-time body-controlled arcade games
 *   2. Interactive Play Mates — AI companion characters that talk + move
 */
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Hi {session.user.name}
            </span>
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

        {/* Category 1: Move & Play Games */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Move &amp; Play Games</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Jump, duck, and dodge — your body is the controller.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Link href="/games/jungle-blast">
              <Card className="group cursor-pointer overflow-hidden transition hover:ring-2 hover:ring-primary">
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-green-600 to-green-800 text-4xl">
                  🌴
                </div>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">Jungle Blast</CardTitle>
                </CardHeader>
              </Card>
            </Link>
            {/* Placeholder for future games */}
            <Card className="flex aspect-[4/3] items-center justify-center border-dashed opacity-50">
              <CardContent className="p-3 text-center">
                <span className="text-2xl">🎮</span>
                <p className="mt-1 text-xs text-muted-foreground">More soon</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Category 2: Interactive Play Mates */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Interactive Play Mates</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Characters that talk, move, and play with your child.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Link href={`/mates/creature${showDevPanel ? "?dev=1" : ""}`}>
              <Card className="group cursor-pointer overflow-hidden transition hover:ring-2 hover:ring-primary">
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-amber-600 to-amber-800 text-4xl">
                  🐊
                </div>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">Creature</CardTitle>
                </CardHeader>
              </Card>
            </Link>
            <Link href={`/mates/bunny${showDevPanel ? "?dev=1" : ""}`}>
              <Card className="group cursor-pointer overflow-hidden transition hover:ring-2 hover:ring-primary">
                <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-pink-400 to-pink-600 text-4xl">
                  🐰
                </div>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">Bunny</CardTitle>
                </CardHeader>
              </Card>
            </Link>
            <Card className="flex aspect-[4/3] items-center justify-center border-dashed opacity-50">
              <CardContent className="p-3 text-center">
                <span className="text-2xl">✨</span>
                <p className="mt-1 text-xs text-muted-foreground">More soon</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
