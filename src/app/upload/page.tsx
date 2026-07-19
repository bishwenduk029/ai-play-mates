import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { CharacterUploader } from "@/components/CharacterUploader";
import { Button } from "@/components/ui/button";

/**
 * Character upload page — auth-gated. Pure shadcn black/white theme, no custom
 * styling. Mirrors the signup/login page shell for consistency.
 */
export default async function UploadPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-xs font-bold">APM</span>
          </div>
          AI Play Mates
        </Link>
        <CharacterUploader />
        <div className="flex justify-center">
          <Link href="/play">
            <Button variant="ghost" size="sm">
              ← Back to play
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
