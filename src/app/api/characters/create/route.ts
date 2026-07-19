import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { buildManifest, parseGlbClips } from "@/lib/glb-inspect";

/**
 * POST /api/characters/create
 *
 * Two modes:
 *
 * 1. Multipart upload (preferred from the creation UI):
 *    formData: file (GLB), id, label, description?, baseY?, selectedClips (JSON array)
 *
 * 2. JSON body with filesystem path (for scripting / CLI):
 *    { id, label, glbPath, selectedClips?, description?, baseY? }
 *
 * - Parses the GLB to discover clips (validates selectedClips).
 * - Copies the GLB to public/characters/<id>/model.glb.
 * - Writes manifest.json with one action per selected clip.
 * - Adds id to public/characters/index.json.
 */

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // --- Multipart upload mode ---
  if (contentType.includes("multipart/form-data")) {
    return handleMultipartUpload(req);
  }

  // --- JSON + filesystem path mode ---
  return handleJsonPath(req);
}

async function handleMultipartUpload(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const id = formData.get("id") as string | null;
  const label = formData.get("label") as string | null;
  const description = (formData.get("description") as string | null) ?? undefined;
  const baseYStr = formData.get("baseY") as string | null;
  const selectedClipsStr = formData.get("selectedClips") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!id || !label) {
    return NextResponse.json({ error: "id and label are required" }, { status: 400 });
  }
  if (!/^[a-z0-9_-]+$/i.test(id)) {
    return NextResponse.json(
      { error: "id must be alphanumeric/dash/underscore" },
      { status: 400 },
    );
  }

  // Save to temp, parse clips, then move to public/.
  const tempPath = path.join(tmpdir(), `spac-${id}-${Date.now()}.glb`);
  const bytes = await file.arrayBuffer();
  await writeFile(tempPath, Buffer.from(bytes));

  let allClips: string[];
  try {
    allClips = await parseGlbClips(tempPath);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
  if (allClips.length === 0) {
    return NextResponse.json(
      { error: "GLB has no animation clips" },
      { status: 422 },
    );
  }

  let selectedClips: string[] = [];
  if (selectedClipsStr) {
    try {
      selectedClips = JSON.parse(selectedClipsStr) as string[];
    } catch {
      return NextResponse.json(
        { error: "selectedClips must be a JSON array string" },
        { status: 400 },
      );
    }
  }
  const finalSelected =
    selectedClips.length > 0
      ? selectedClips.filter((c) => allClips.includes(c))
      : allClips;

  return writeCharacter({
    id,
    label,
    description: description ?? `Character "${label}"`,
    baseY: baseYStr ? Number(baseYStr) : 0,
    glbSourcePath: tempPath,
    selectedClips: finalSelected,
    allClips,
    cleanupTemp: true,
  });
}

async function handleJsonPath(req: NextRequest) {
  let body: {
    id: string;
    label: string;
    glbPath: string;
    selectedClips?: string[];
    description?: string;
    baseY?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { id, label, glbPath, description, baseY } = body;
  const selectedClips = body.selectedClips ?? [];

  if (!id || !label || !glbPath) {
    return NextResponse.json(
      { error: "id, label, and glbPath are required" },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9_-]+$/i.test(id)) {
    return NextResponse.json(
      { error: "id must be alphanumeric/dash/underscore" },
      { status: 400 },
    );
  }
  try {
    await access(glbPath);
  } catch {
    return NextResponse.json(
      { error: `glb file not found at ${glbPath}` },
      { status: 404 },
    );
  }

  let allClips: string[];
  try {
    allClips = await parseGlbClips(glbPath);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
  if (allClips.length === 0) {
    return NextResponse.json(
      { error: "GLB has no animation clips" },
      { status: 422 },
    );
  }

  const finalSelected =
    selectedClips.length > 0
      ? selectedClips.filter((c) => allClips.includes(c))
      : allClips;

  return writeCharacter({
    id,
    label,
    description: description ?? `Character "${label}"`,
    baseY: baseY ?? 0,
    glbSourcePath: glbPath,
    selectedClips: finalSelected,
    allClips,
    cleanupTemp: false,
  });
}

async function writeCharacter(opts: {
  id: string;
  label: string;
  description: string;
  baseY: number;
  glbSourcePath: string;
  selectedClips: string[];
  allClips: string[];
  cleanupTemp: boolean;
}) {
  const { id, label, description, baseY, glbSourcePath, selectedClips, allClips, cleanupTemp } = opts;

  const manifest = buildManifest({
    id,
    label,
    description,
    baseY,
    selectedClips,
    allClips,
  });

  const charsRoot = path.join(process.cwd(), "public", "characters");
  const charDir = path.join(charsRoot, id);

  try {
    await mkdir(charDir, { recursive: true });
    await copyFile(glbSourcePath, path.join(charDir, "model.glb"));
    await writeFile(
      path.join(charDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  await addToIndex(charsRoot, id);

  if (cleanupTemp) {
    await import("node:fs/promises").then((fs) => fs.unlink(glbSourcePath).catch(() => {}));
  }

  return NextResponse.json({
    ok: true,
    character: manifest,
    discoveredClips: allClips,
    selectedClips,
  });
}

async function addToIndex(charsRoot: string, id: string): Promise<void> {
  const indexPath = path.join(charsRoot, "index.json");
  let index: { characters: string[] };
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch {
    index = { characters: [] };
  }
  if (!index.characters.includes(id)) {
    index.characters.push(id);
    await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
  }
}
