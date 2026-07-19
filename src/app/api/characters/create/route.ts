import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { buildManifest, parseModel, parseModelBuffer } from "@/lib/glb-inspect";
import type { ModelType } from "@/lib/characters";

/**
 * POST /api/characters/create
 *
 * Creates a character from an uploaded model + (optionally) an animation file.
 * The resulting manifest's `actions[]` is the single source of truth that
 * drives BOTH the figure renderers and the Python agent's tool set.
 *
 * Three input modes:
 *
 * 1. Multipart upload (browser UI): file (GLB|VRM), fbxFile? (FBX), id, label,
 *    modelType, selectedClips (JSON).
 * 2. Remote URL (JSON): { modelUrl, fbxUrl?, modelType, selectedClips?, id,
 *    label, reference? }. The server fetches the bytes to inspect clips
 *    (GLB/VRM). FBX clips must be client-discovered (passed in selectedClips).
 *    `reference: true` (default) stores the remote URL directly in the manifest
 *    (no local copy — runtime fetches the URL); `reference: false` copies the
 *    fetched bytes into public/characters/<id>/.
 * 3. Filesystem path (JSON, CLI): { glbPath, selectedClips?, ... } — GLB only.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleMultipartUpload(req);
  }

  // JSON body: dispatch by which field is present.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.modelUrl === "string") {
    return handleRemoteUrl(body as Parameters<typeof handleRemoteUrl>[0]);
  }
  return handleJsonPath(
    body as Parameters<typeof handleJsonPath>[0],
  );
}

const ID_RE = /^[a-z0-9_-]+$/i;

async function handleMultipartUpload(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const fbxFile = formData.get("fbxFile");
  const id = formData.get("id") as string | null;
  const label = formData.get("label") as string | null;
  const description = (formData.get("description") as string | null) ?? undefined;
  const baseYStr = formData.get("baseY") as string | null;
  const modelTypeStr = (formData.get("modelType") as string | null) ?? "glb";
  const selectedClipsStr = formData.get("selectedClips") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!id || !label) {
    return NextResponse.json({ error: "id and label are required" }, { status: 400 });
  }
  if (!ID_RE.test(id)) {
    return NextResponse.json(
      { error: "id must be alphanumeric/dash/underscore" },
      { status: 400 },
    );
  }
  if (modelTypeStr !== "glb" && modelTypeStr !== "vrm" && modelTypeStr !== "vrm-fbx") {
    return NextResponse.json(
      { error: `modelType must be glb | vrm | vrm-fbx (got "${modelTypeStr}")` },
      { status: 400 },
    );
  }
  const modelType: ModelType = modelTypeStr;
  if (modelType === "vrm-fbx" && !(fbxFile instanceof File)) {
    return NextResponse.json(
      { error: "fbxFile is required for modelType=vrm-fbx" },
      { status: 400 },
    );
  }

  const baseY = baseYStr ? Number(baseYStr) : 0;

  // Save the model to a temp file so parseModel can read it.
  const modelExt = modelType === "glb" ? "glb" : "vrm";
  const tempModelPath = path.join(tmpdir(), `spac-${id}-${Date.now()}.${modelExt}`);
  await writeFile(tempModelPath, Buffer.from(await file.arrayBuffer()));

  // Save the FBX (if any) — no server-side parse; clips arrive in selectedClips.
  let tempFbxPath: string | null = null;
  if (fbxFile instanceof File) {
    tempFbxPath = path.join(tmpdir(), `spac-${id}-${Date.now()}.fbx`);
    await writeFile(tempFbxPath, Buffer.from(await fbxFile.arrayBuffer()));
  }

  // Determine the model's clips + VRM-ness (validates the uploaded model).
  let isVrm = false;
  let modelClips: string[] = [];
  try {
    const parsed = await parseModel(tempModelPath);
    isVrm = parsed.isVrm;
    modelClips = parsed.clips;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }

  // Cross-check modelType against what the file actually is.
  if (modelType === "glb" && isVrm) {
    return NextResponse.json(
      { error: "modelType=glb but the uploaded file is a VRM" },
      { status: 422 },
    );
  }
  if (modelType !== "glb" && !isVrm) {
    return NextResponse.json(
      { error: `modelType=${modelType} requires a VRM file` },
      { status: 422 },
    );
  }

  // Resolve selectedClips for the manifest.
  let selectedClips: Array<string | null>;
  if (modelType === "vrm") {
    // Procedural: one null sentinel drives idle + walk.
    selectedClips = [null];
  } else if (modelType === "vrm-fbx") {
    // Clips come from the FBX (client-discovered). Validate presence.
    let fbxClips: string[] = [];
    if (selectedClipsStr) {
      try {
        fbxClips = JSON.parse(selectedClipsStr) as string[];
      } catch {
        return NextResponse.json(
          { error: "selectedClips must be a JSON array string" },
          { status: 400 },
        );
      }
    }
    if (fbxClips.length === 0) {
      return NextResponse.json(
        { error: "vrm-fbx requires selectedClips (FBX clip names)" },
        { status: 400 },
      );
    }
    selectedClips = fbxClips;
  } else {
    // glb: clips discovered server-side from the GLB.
    if (modelClips.length === 0) {
      return NextResponse.json(
        { error: "GLB has no animation clips" },
        { status: 422 },
      );
    }
    let chosen: string[] = [];
    if (selectedClipsStr) {
      try {
        chosen = JSON.parse(selectedClipsStr) as string[];
      } catch {
        return NextResponse.json(
          { error: "selectedClips must be a JSON array string" },
          { status: 400 },
        );
      }
    }
    selectedClips = chosen.length > 0 ? chosen.filter((c) => modelClips.includes(c)) : modelClips;
  }

  const allClips =
    modelType === "vrm-fbx"
      ? (selectedClips.filter((c): c is string => c !== null))
      : modelType === "vrm"
        ? [null]
        : modelClips;

  return writeCharacter({
    id,
    label,
    description: description ?? `Character "${label}"`,
    baseY,
    modelType,
    modelSourcePath: tempModelPath,
    fbxSourcePath: tempFbxPath,
    selectedClips,
    allClips,
    cleanupTemp: true,
  });
}

async function handleJsonPath(body: {
  id: string;
  label: string;
  glbPath: string;
  selectedClips?: string[];
  description?: string;
  baseY?: number;
}) {
  const { id, label, glbPath, description, baseY } = body;
  const selectedClips = body.selectedClips ?? [];

  if (!id || !label || !glbPath) {
    return NextResponse.json(
      { error: "id, label, and glbPath are required" },
      { status: 400 },
    );
  }
  if (!ID_RE.test(id)) {
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

  let modelClips: string[];
  try {
    const parsed = await parseModel(glbPath);
    if (parsed.isVrm) {
      return NextResponse.json(
        { error: "JSON path mode is GLB-only; use multipart for VRM/vrm-fbx" },
        { status: 422 },
      );
    }
    modelClips = parsed.clips;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
  if (modelClips.length === 0) {
    return NextResponse.json(
      { error: "GLB has no animation clips" },
      { status: 422 },
    );
  }

  const finalSelected =
    selectedClips.length > 0
      ? selectedClips.filter((c) => modelClips.includes(c))
      : modelClips;

  return writeCharacter({
    id,
    label,
    description: description ?? `Character "${label}"`,
    baseY: baseY ?? 0,
    modelType: "glb",
    modelSourcePath: glbPath,
    fbxSourcePath: null,
    selectedClips: finalSelected,
    allClips: modelClips,
    cleanupTemp: false,
  });
}

/** Fetch a remote URL to a Node Buffer (server-side, no CORS). */
async function fetchToBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Remote-URL create path. The manifest's `modelPath`/`animationPath` are URL
 * strings, so a remote URL can be stored directly (`reference: true`, the
 * default) — the runtime figure components fetch it like any static asset.
 * `reference: false` copies the fetched bytes into public/characters/<id>/.
 *
 * Clip discovery:
 *   - glb/vrm: server fetches + parseModelBuffer (pure glTF JSON parse).
 *   - vrm-fbx: the FBX clips must be supplied in `selectedClips` (the browser
 *     uploader discovers them client-side via fbx-browser.ts; a CLI caller
 *     supplies them explicitly).
 */
async function handleRemoteUrl(body: {
  id: string;
  label: string;
  modelUrl: string;
  fbxUrl?: string;
  modelType?: string;
  selectedClips?: string[];
  description?: string;
  baseY?: number;
  reference?: boolean;
}) {
  const id = body.id;
  const label = body.label;
  const modelUrl = body.modelUrl;
  const fbxUrl = body.fbxUrl;
  const modelTypeStr = body.modelType ?? "glb";
  const reference = body.reference !== false; // default true

  if (!id || !label || !modelUrl) {
    return NextResponse.json(
      { error: "id, label, and modelUrl are required" },
      { status: 400 },
    );
  }
  if (!ID_RE.test(id)) {
    return NextResponse.json(
      { error: "id must be alphanumeric/dash/underscore" },
      { status: 400 },
    );
  }
  if (modelTypeStr !== "glb" && modelTypeStr !== "vrm" && modelTypeStr !== "vrm-fbx") {
    return NextResponse.json(
      { error: `modelType must be glb | vrm | vrm-fbx (got "${modelTypeStr}")` },
      { status: 400 },
    );
  }
  const modelType: ModelType = modelTypeStr;
  if (modelType === "vrm-fbx" && !fbxUrl) {
    return NextResponse.json(
      { error: "fbxUrl is required for modelType=vrm-fbx" },
      { status: 400 },
    );
  }

  // Fetch + inspect the model (validates it + discovers GLB/VRM clips).
  let modelBuffer: Buffer;
  let isVrm = false;
  let modelClips: string[] = [];
  try {
    modelBuffer = await fetchToBuffer(modelUrl);
    const parsed = parseModelBuffer(modelBuffer);
    isVrm = parsed.isVrm;
    modelClips = parsed.clips;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
  if (modelType === "glb" && isVrm) {
    return NextResponse.json(
      { error: "modelType=glb but the URL is a VRM" },
      { status: 422 },
    );
  }
  if (modelType !== "glb" && !isVrm) {
    return NextResponse.json(
      { error: `modelType=${modelType} requires a VRM URL` },
      { status: 422 },
    );
  }

  // Resolve selectedClips for the manifest.
  let selectedClips: Array<string | null>;
  if (modelType === "vrm") {
    selectedClips = [null];
  } else if (modelType === "vrm-fbx") {
    const fbxClips = body.selectedClips ?? [];
    if (fbxClips.length === 0) {
      return NextResponse.json(
        { error: "vrm-fbx requires selectedClips (FBX clip names)" },
        { status: 400 },
      );
    }
    selectedClips = fbxClips;
  } else {
    if (modelClips.length === 0) {
      return NextResponse.json(
        { error: "GLB has no animation clips" },
        { status: 422 },
      );
    }
    const chosen = body.selectedClips ?? [];
    selectedClips =
      chosen.length > 0 ? chosen.filter((c) => modelClips.includes(c)) : modelClips;
  }

  const allClips =
    modelType === "vrm-fbx"
      ? selectedClips.filter((c): c is string => c !== null)
      : modelType === "vrm"
        ? [null]
        : modelClips;

  // Storage: reference (store URL) or copy (save fetched bytes locally).
  const charsRoot = path.join(process.cwd(), "public", "characters");
  const charDir = path.join(charsRoot, id);

  let modelSourcePath: string | null = null;
  let fbxSourcePath: string | null = null;

  if (!reference) {
    try {
      await mkdir(charDir, { recursive: true });
      const modelExt = modelType === "glb" ? "model.glb" : "model.vrm";
      modelSourcePath = path.join(charDir, modelExt);
      await writeFile(modelSourcePath, modelBuffer);
      if (modelType === "vrm-fbx" && fbxUrl) {
        const fbxBuffer = await fetchToBuffer(fbxUrl);
        fbxSourcePath = path.join(charDir, "animations.fbx");
        await writeFile(fbxSourcePath, fbxBuffer);
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  return writeCharacter({
    id,
    label,
    description: body.description ?? `Character "${label}"`,
    baseY: body.baseY ?? 0,
    modelType,
    modelSourcePath, // null when referencing the remote URL
    fbxSourcePath,
    // When referencing, the manifest stores the remote URLs as the paths.
    referenceModelUrl: reference ? modelUrl : undefined,
    referenceFbxUrl: reference && fbxUrl ? fbxUrl : undefined,
    selectedClips,
    allClips,
    cleanupTemp: false,
  });
}

async function writeCharacter(opts: {
  id: string;
  label: string;
  description: string;
  baseY: number;
  modelType: ModelType;
  modelSourcePath: string | null;
  fbxSourcePath: string | null;
  /** When set, store this remote URL as modelPath instead of copying. */
  referenceModelUrl?: string;
  /** When set, store this remote URL as animationPath instead of copying. */
  referenceFbxUrl?: string;
  selectedClips: Array<string | null>;
  allClips: Array<string | null>;
  cleanupTemp: boolean;
}) {
  const {
    id,
    label,
    description,
    baseY,
    modelType,
    modelSourcePath,
    fbxSourcePath,
    referenceModelUrl,
    referenceFbxUrl,
    selectedClips,
    allClips,
    cleanupTemp,
  } = opts;

  const manifest = buildManifest({
    id,
    label,
    description,
    baseY,
    modelType,
    selectedClips,
    allClips,
  });

  // Reference mode: point the manifest at the remote URLs instead of a local copy.
  if (referenceModelUrl) manifest.modelPath = referenceModelUrl;
  if (referenceFbxUrl) manifest.animationPath = referenceFbxUrl;

  const charsRoot = path.join(process.cwd(), "public", "characters");
  const charDir = path.join(charsRoot, id);

  try {
    await mkdir(charDir, { recursive: true });
    if (modelSourcePath) {
      const modelExt = modelType === "glb" ? "model.glb" : "model.vrm";
      await copyFile(modelSourcePath, path.join(charDir, modelExt));
    }
    if (modelType === "vrm-fbx" && fbxSourcePath) {
      await copyFile(fbxSourcePath, path.join(charDir, "animations.fbx"));
    }
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
    const fs = await import("node:fs/promises");
    if (modelSourcePath) await fs.unlink(modelSourcePath).catch(() => {});
    if (fbxSourcePath) await fs.unlink(fbxSourcePath).catch(() => {});
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
