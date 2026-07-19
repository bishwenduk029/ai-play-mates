"use client";

import { useRef, useState } from "react";
import {
  inspectModelBrowser,
  type BrowserInspectResult,
} from "@/lib/glb-browser";
import { inspectFbxBrowser } from "@/lib/fbx-browser";
import type { CharacterManifest } from "@/lib/characters";

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
 * Thin UI adapter over the inspector modules (glb-browser, fbx-browser) and
 * the /api/characters/create route.
 */
export function CharacterUploader({
  onCreated,
}: {
  onCreated?: (character: CharacterManifest) => void;
}) {
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
    setOk(`Created "${data.character.label}". Pick it below to play.`);
    onCreated?.(data.character);
    reset();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] uppercase tracking-widest text-white/40">
        Upload character
      </p>

      {/* Source toggle */}
      <div className="flex gap-1">
        {(["file", "url"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSource(s);
              resetClips();
            }}
            className={[
              "rounded-md px-2 py-1 text-[11px] font-medium transition",
              source === s ? "bg-white/20 text-white" : "bg-white/5 text-white/60 hover:bg-white/10",
            ].join(" ")}
          >
            {s === "file" ? "File" : "Remote URL"}
          </button>
        ))}
      </div>

      {/* Model type */}
      <div className="flex flex-wrap gap-1">
        {(["glb", "vrm", "vrm-fbx"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setModelType(t);
              resetClips();
              setFbxFile(null);
              setFbxUrl("");
              if (fbxInput.current) fbxInput.current.value = "";
            }}
            className={[
              "rounded-md px-2 py-1 text-[11px] font-medium transition",
              modelType === t
                ? "bg-sky-400 text-slate-900"
                : "bg-white/5 text-white/70 hover:bg-white/10",
            ].join(" ")}
          >
            {t === "vrm-fbx" ? "VRM + FBX" : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Model input — file or URL */}
      <div className="flex flex-col gap-1 text-[11px] text-white/60">
        {source === "file" ? (
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0">{modelType === "glb" ? "GLB" : "VRM"}</span>
            <input
              ref={modelInput}
              type="file"
              accept={modelType === "glb" ? ".glb,model/gltf-binary" : ".vrm"}
              onChange={(e) => onModelPicked(e.target.files?.[0] ?? null)}
              className="text-[10px] text-white/50 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-0.5 file:text-[10px] file:text-white/80"
            />
          </label>
        ) : (
          <label className="flex items-center gap-2">
            <span className="w-14 shrink-0">{modelType === "glb" ? "GLB" : "VRM"} URL</span>
            <input
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              onBlur={onModelUrlEntered}
              placeholder="https://cdn.example.com/hero.glb"
              className="flex-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/80 outline-none placeholder:text-white/30"
            />
          </label>
        )}

        {modelType === "vrm-fbx" &&
          (source === "file" ? (
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0">FBX</span>
              <input
                ref={fbxInput}
                type="file"
                accept=".fbx"
                onChange={(e) => onFbxPicked(e.target.files?.[0] ?? null)}
                className="text-[10px] text-white/50 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-0.5 file:text-[10px] file:text-white/80"
              />
            </label>
          ) : (
            <label className="flex items-center gap-2">
              <span className="w-14 shrink-0">FBX URL</span>
              <input
                value={fbxUrl}
                onChange={(e) => setFbxUrl(e.target.value)}
                onBlur={onFbxUrlEntered}
                placeholder="https://cdn.example.com/animations.fbx"
                className="flex-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/80 outline-none placeholder:text-white/30"
              />
            </label>
          ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="id (e.g. hero)"
          className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/80 outline-none placeholder:text-white/30"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label (e.g. Hero)"
          className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/80 outline-none placeholder:text-white/30"
        />
      </div>
      <input
        value={baseY}
        onChange={(e) => setBaseY(e.target.value)}
        placeholder="baseY (default 0)"
        className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/80 outline-none placeholder:text-white/30"
      />

      {clips.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-black/20 p-2">
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Clips ({clips.filter((c) => c.selected).length}/{clips.length})
          </p>
          {clips.map((c, i) => (
            <label key={i} className="flex items-center gap-2 text-[11px] text-white/70">
              <input
                type="checkbox"
                checked={c.selected}
                onChange={() => toggleClip(i)}
                className="h-3 w-3"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      )}

      {source === "url" && (
        <p className="text-[9px] leading-tight text-white/30">
          The manifest stores the URL directly — the runtime streams the model
          from there (host must allow CORS). No local copy.
        </p>
      )}
      {error && <p className="text-[10px] text-rose-300/90">{error}</p>}
      {ok && <p className="text-[10px] text-emerald-300/90">{ok}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="rounded-md bg-emerald-400 px-3 py-1.5 text-[11px] font-medium text-slate-900 transition hover:bg-emerald-300 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create character"}
      </button>
    </div>
  );
}
