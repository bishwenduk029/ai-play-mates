import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Serves character manifests to the Python agent (and anything else that can't
 * hit static files through CORS for some reason).
 *
 *   GET /api/characters          -> index of character ids
 *   GET /api/characters?id=X     -> full manifesto for character X
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const root = path.join(process.cwd(), "public", "characters");

  try {
    if (!id) {
      const raw = await readFile(path.join(root, "index.json"), "utf8");
      return NextResponse.json(JSON.parse(raw));
    }
    // Basic path-traversal guard: only allow simple ids.
    if (!/^[a-z0-9_-]+$/i.test(id)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }
    const raw = await readFile(path.join(root, id, "manifest.json"), "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
