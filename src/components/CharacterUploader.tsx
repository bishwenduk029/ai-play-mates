"use client";

import { useRef, useState } from "react";
import {
  inspectModelBrowser,
  type BrowserInspectResult,
} from "@/lib/glb-browser";
import { inspectFbxBrowser } from "@/lib/fbx-browser";
import type { CharacterManifest } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type UploadModelType = "glb" | "vrm" | "vrm-fbx";
type Source = "file" | "url";

interface ClipChoice {
  /** Clip name (GLB/FBX) or null (VRM procedural sentinel). */
  clip: string | null;
  label: string;
  selected: boolean;
}

/**
 * Character uploader — creates a character from user-supplied model assets.
 *
 * Two input sources:
 *   - file: local GLB / VRM / (VRM+FBX) files (multipart upload).
 *   - url:  remote URLs (JSON). The manifest stores the URL directly
 *           (`reference: true`) so the runtime fetches it — no local copy,
 *           no deploy bloat. The browser fetches the URL client-side only to
 *           inspect clips before submitting.
 *
 * Three model types:
 *   - glb:     a single GLB (clips discovered from the GLB).
 *   - vrm:     a single VRM (procedural idle + walk, no clips needed).
 *   - vrm-fbx: a VRM model + a separate FBX animation file (clips discovered
 *              from the FBX, retargeted onto the VRM at runtime).
 *
 * The resulting manifest's `actions[]` is the single source of truth shared by
 * the figure renderers and the Python agent's tool set, so the kid's voice can
 * drive exactly the clips the uploaded body can play.
 *
 * Pure shadcn black/white theme — no custom colors. Thin UI adapter over the
 * inspector modules (glb-browser, fbx-browser) and the create route.
 */
export function CharacterUploader({
  onCreated,
  className,
  ...props
}: {
  onCreated?: (character: CharacterManifest) => void;
} & React.ComponentProps<"div">) {
  const [source, setSource] = useState<Source>("file");
  const [modelType, setModelType] = useState<UploadModelType>("glb");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [fbxFile, setFbxFile] = useState<File | null>(null);
  const [modelUrl, setModelUrl] = useState("");
  const [fbxUrl, setFbxUrl] = useState("");
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [baseY, setBaseY] = useState("0");

  const [clips, setClips] = useState<ClipChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const modelInput = useRef<HTMLInputElement>(null);
  const fbxInput = useRef<HTMLInputElement>(null);

  function resetClips() {
    setClips([]);
    setError(null);
  }

  // --- File source inspection ---
  async function onModelPicked(file: File | null) {
    setModelFile(file);
    resetClips();
    if (!file) return;
    try {
      applyInspect(await inspectModelBrowser(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function onFbxPicked(file: File | null) {
    setFbxFile(file);
    setError(null);
    if (!file) return;
    try {
      const result = await inspectFbxBrowser(file);
      setClips(result.clips.map((name) => ({ clip: name, label: name, selected: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // --- URL source inspection (fetch client-side, then inspect in-browser) ---
  async function onModelUrlEntered() {
    resetClips();
    if (!modelUrl.trim()) return;
    try {
      const res = await fetch(modelUrl);
      if (!res.ok) throw new Error(`fetch ${modelUrl} -> ${res.status}`);
      applyInspect(await inspectModelBrowser(await res.arrayBuffer()));
    } catch (e) {
      setError(
        `Could not inspect URL (CORS or network?): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  async function onFbxUrlEntered() {
    setError(null);
    if (!fbxUrl.trim()) return;
    try {
      const res = await fetch(fbxUrl);
      if (!res.ok) throw new Error(`fetch ${fbxUrl} -> ${res.status}`);
      const result = await inspectFbxBrowser(await res.arrayBuffer());
      setClips(result.clips.map((name) => ({ clip: name, label: name, selected: true })));
    } catch (e) {
      setError(
        `Could not inspect FBX URL (CORS or network?): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  function applyInspect(result: BrowserInspectResult) {
    if (result.modelType === "vrm" && result.clips.every((c) => c.clip === null)) {
      setClips([{ clip: null, label: "Idle + Walk (procedural)", selected: true }]);
    } else {
      setClips(
        result.clips.map((c) => ({ clip: c.clip, label: c.clip ?? "procedural", selected: true })),
      );
    }
  }

  function toggleClip(i: number) {
    setClips((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, selected: !c.selected } : c)),
    );
  }

  function reset() {
    setModelType("glb");
    setModelFile(null);
    setFbxFile(null);
    setModelUrl("");
    setFbxUrl("");
    setId("");
    setLabel("");
    setBaseY("0");
    setClips([]);
    setError(null);
    setOk(null);
    if (modelInput.current) modelInput.current.value = "";
    if (fbxInput.current) fbxInput.current.value = "";
  }

  function resolveSelectedClips(): Array<string | null> | null {
    if (modelType === "vrm") {
      return clips.filter((c) => c.selected).map((c) => c.clip);
    }
    const sel = clips
      .filter((c) => c.selected && c.clip !== null)
      .map((c) => c.clip as string);
    return sel.length === 0 ? null : sel;
  }

  async function submitFile() {
    if (!modelFile) return setError("Pick a model file.");
    if (modelType === "vrm-fbx" && !fbxFile) return setError("vrm-fbx requires an FBX file.");
    const selectedClips = resolveSelectedClips();
    if (selectedClips === null) return setError("Select at least one clip.");

    const fd = new FormData();
    fd.append("file", modelFile);
    if (fbxFile) fd.append("fbxFile", fbxFile);
    fd.append("id", id);
    fd.append("label", label);
    fd.append("modelType", modelType);
    fd.append("baseY", baseY);
    fd.append("selectedClips", JSON.stringify(selectedClips));
    return postForm(fd);
  }

  async function submitUrl() {
    if (!modelUrl.trim()) return setError("Enter a model URL.");
    if (modelType === "vrm-fbx" && !fbxUrl.trim())
      return setError("vrm-fbx requires an FBX URL.");
    const selectedClips = resolveSelectedClips();
    if (selectedClips === null) return setError("Select at least one clip.");

    return postJson({
      id,
      label,
      modelType,
      modelUrl: modelUrl.trim(),
      fbxUrl: fbxUrl.trim() || undefined,
      selectedClips: modelType === "vrm" ? undefined : (selectedClips as string[]),
      baseY: baseY ? Number(baseY) : undefined,
      reference: true,
    });
  }

  async function submit() {
    setError(null);
    setOk(null);
    if (!id || !label) return setError("id and label are required.");
    if (!/^[a-z0-9_-]+$/i.test(id))
      return setError("id must be alphanumeric / dash / underscore.");
    setBusy(true);
    try {
      if (source === "file") await submitFile();
      else await submitUrl();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function postForm(fd: FormData) {
    const res = await fetch("/api/characters/create", { method: "POST", body: fd });
    return consume(res);
  }
  async function postJson(body: Record<string, unknown>) {
    const res = await fetch("/api/characters/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return consume(res);
  }
  async function consume(res: Response) {
    const data = (await res.json()) as { character?: CharacterManifest; error?: string };
    if (!res.ok || !data.character) {
      setError(data.error ?? `create failed (${res.status})`);
      return;
    }
    setOk(`Created "${data.character.label}". Pick it on the play screen to use it.`);
    onCreated?.(data.character);
    reset();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Upload a character</CardTitle>
          <CardDescription>
            Bring your own rigged model. The manifest&apos;s actions become the
            agent&apos;s tools — so the voice can drive exactly what the body can play.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Source toggle */}
            <Field orientation="horizontal">
              <FieldLabel>Source</FieldLabel>
              <div className="flex gap-2">
                {(["file", "url"] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={source === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSource(s);
                      resetClips();
                    }}
                  >
                    {s === "file" ? "File" : "Remote URL"}
                  </Button>
                ))}
              </div>
            </Field>

            {/* Model type */}
            <Field orientation="horizontal">
              <FieldLabel>Model type</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {(["glb", "vrm", "vrm-fbx"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={modelType === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setModelType(t);
                      resetClips();
                      setFbxFile(null);
                      setFbxUrl("");
                      if (fbxInput.current) fbxInput.current.value = "";
                    }}
                  >
                    {t === "vrm-fbx" ? "VRM + FBX" : t.toUpperCase()}
                  </Button>
                ))}
              </div>
            </Field>

            {/* Model input — file or URL */}
            {source === "file" ? (
              <Field>
                <FieldLabel htmlFor="model-file">
                  {modelType === "glb" ? "GLB file" : "VRM file"}
                </FieldLabel>
                <Input
                  ref={modelInput}
                  id="model-file"
                  type="file"
                  accept={modelType === "glb" ? ".glb,model/gltf-binary" : ".vrm"}
                  onChange={(e) => onModelPicked(e.target.files?.[0] ?? null)}
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="model-url">
                  {modelType === "glb" ? "GLB URL" : "VRM URL"}
                </FieldLabel>
                <Input
                  id="model-url"
                  type="url"
                  placeholder="https://cdn.example.com/hero.glb"
                  value={modelUrl}
                  onChange={(e) => setModelUrl(e.target.value)}
                  onBlur={onModelUrlEntered}
                />
                <FieldDescription>
                  The manifest stores the URL directly — the runtime streams the
                  model from there (host must allow CORS). No local copy.
                </FieldDescription>
              </Field>
            )}

            {/* FBX input (vrm-fbx only) */}
            {modelType === "vrm-fbx" &&
              (source === "file" ? (
                <Field>
                  <FieldLabel htmlFor="fbx-file">FBX animation file</FieldLabel>
                  <Input
                    ref={fbxInput}
                    id="fbx-file"
                    type="file"
                    accept=".fbx"
                    onChange={(e) => onFbxPicked(e.target.files?.[0] ?? null)}
                  />
                </Field>
              ) : (
                <Field>
                  <FieldLabel htmlFor="fbx-url">FBX animation URL</FieldLabel>
                  <Input
                    id="fbx-url"
                    type="url"
                    placeholder="https://cdn.example.com/animations.fbx"
                    value={fbxUrl}
                    onChange={(e) => setFbxUrl(e.target.value)}
                    onBlur={onFbxUrlEntered}
                  />
                </Field>
              ))}

            {/* id + label + baseY */}
            <Field orientation="horizontal" className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="char-id">id</FieldLabel>
                <Input
                  id="char-id"
                  placeholder="hero"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="char-label">Label</FieldLabel>
                <Input
                  id="char-label"
                  placeholder="Hero"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
            </Field>
            <Field>
              <FieldLabel htmlFor="char-basey">baseY</FieldLabel>
              <Input
                id="char-basey"
                placeholder="0"
                value={baseY}
                onChange={(e) => setBaseY(e.target.value)}
              />
              <FieldDescription>Root Y offset so feet rest on the ground.</FieldDescription>
            </Field>

            {/* Clips checklist */}
            {clips.length > 0 && (
              <Field>
                <FieldLabel>Clips</FieldLabel>
                <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-3">
                  <FieldDescription className="mb-1">
                    {clips.filter((c) => c.selected).length}/{clips.length} selected
                  </FieldDescription>
                  {clips.map((c, i) => (
                    <label key={i} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleClip(i)}
                        className="size-4"
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </Field>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {ok && <p className="text-sm text-emerald-600 dark:text-emerald-400">{ok}</p>}

            <Field>
              <Button type="button" disabled={busy} onClick={submit}>
                {busy ? "Creating…" : "Create character"}
              </Button>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
