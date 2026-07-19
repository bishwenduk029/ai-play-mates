import { NextRequest, NextResponse } from "next/server";
import { access } from "node:fs/promises";
import { inspectGlb } from "@/lib/glb-inspect";

/**
 * POST /api/characters/inspect
 *
 * Body: { glbPath: string }
 *
 * Returns the discovered animation clips + suggested roles, without writing
 * anything to disk. The UI shows these as a checklist so the user can pick
 * which clips to expose as actions before creating the character.
 */
export async function POST(req: NextRequest) {
  let body: { glbPath?: string };
  try {
    body = (await req.json()) as { glbPath?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { glbPath } = body;
  if (!glbPath) {
    return NextResponse.json({ error: "glbPath is required" }, { status: 400 });
  }

  try {
    await access(glbPath);
  } catch {
    return NextResponse.json(
      { error: `glb file not found at ${glbPath}` },
      { status: 404 },
    );
  }

  try {
    const result = await inspectGlb(glbPath);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
