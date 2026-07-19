# AI Play Mates — Architecture Summary

> A digital play companion for kids under 7. An AI vision agent (Gemini Live) sees the kid through their webcam and drives an on-screen 3D figure via LiveKit RPC. The figure is data-driven — adding a new character means dropping a GLB + manifest, no code changes.

## High-level flow

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js 16 + react-three-fiber)                   │
│   - Character picker (pre-session) → controller.setCharacter│
│   - three.js scene renders the active character              │
│   - LiveKit session (webcam + mic)                          │
│   - One RPC method spac_action → controller.trigger(action) │
│   - Character LOCKED while session is live                   │
└─────────────────────────────────────────────────────────────┘
       ▲                              ▲
       │ /api/token (mints + dispatches)│ audio/video tracks
       │                              │
┌──────┴──────────────────────────────┴──────────────────────┐
│  Python vision agent (LiveKit Agents + Gemini Live Vision) │
│   - Reads characterId from room metadata                    │
│   - Fetches manifest from /api/characters?id=X              │
│   - Registers one @function_tool per manifest action         │
│   - Tool calls → perform_rpc → browser → figure moves       │
│   - Sees kid (video_input=True), speaks back (audio)        │
└─────────────────────────────────────────────────────────────┘
```

## The core modules (deep-module view)

### 1. Character Manifest (data, not code)
**Location:** `public/characters/<id>/manifest.json`

```json
{
  "id": "creature",
  "label": "Creature",
  "modelType": "glb" | "vrm" | "primitive",
  "modelPath": "/characters/creature/model.glb",
  "baseY": 0,
  "actions": [
    { "name": "attack", "label": "Attack", "description": "...", "durationMs": 1200, "clip": "Attack" },
    ...
  ]
}
```

- `public/characters/index.json` lists all character ids.
- `/api/characters` (GET) serves the index + individual manifests to the agent.
- **Adding a character = drop a folder + edit index.json.** No code changes for `glb` type.
- `modelPath` is a public URL today (filesystem); swap to CDN/blob later by changing the path string.

### 2. ActionController (`src/lib/actions.ts`)
**Interface (deep):** `trigger(name)`, `setCharacter(manifest)`, `setSpeaking(on)`, `walk(dir)`, `getState()`, `subscribe(fn)`, `setSessionLive(bool)`.

**Implementation:** A singleton state machine. Holds the active character manifest, current action, position, walk interpolation, lipsync state. Emits to subscribers on state change. All figure components read `getState()` every frame via `useFrame` — **zero React re-renders during animation**.

Key invariants:
- `trigger(name)` validates against the active character's `actions[]` — unknown names no-op.
- `setCharacter()` is rejected while `sessionLive === true`.
- Walk commits final position on completion; finite actions auto-return to idle.

### 3. Figure components (`src/components/*Figure.tsx`)
Each reads `controller.getState()` in `useFrame` and applies motion. The `Figure.tsx` dispatcher picks the component based on `manifest.modelType`:

| `modelType` | Component | How it moves |
|---|---|---|
| `glb` | `CreatureFigure` | `useAnimations` + `AnimationMixer`, plays clips by name from `action.clip` |
| `vrm` | `VrmFigure` | `VRMLoaderPlugin` + `@pixiv/three-vrm`, procedural bone rotation |
| `primitive` | `BunnyFigure` | Procedural mesh-group transforms (no external model) |

All three implement: camera-facing yaw, walk position interpolation, lipsync (via controller mouth state).

### 4. LiveKitSession (`src/components/LiveKitSession.tsx`)
Uses `@livekit/components-react`'s `<LiveKitRoom>` + `<RoomAudioRenderer>` (built-in track subscription + audio playback). Registers **one** RPC method `spac_action` that dispatches to `controller.trigger()`. Passes `characterId` in the token request so the agent knows which manifest to load. Locks the character on connect (`controller.setSessionLive(true)`).

### 5. Token route (`src/app/api/token/route.ts`)
Mints a LiveKit token with `RoomConfiguration.agents` to dispatch the Python agent. Stores `characterId` in room metadata + agent dispatch metadata so the agent can read it.

### 6. Python agent (`agent/agent.py`)
Gemini Live Vision (`gemini-3.1-flash-live-preview`, `voice=Puck`, `proactivity`/`affective_dialog`). At session start:
1. Reads `characterId` from job/room metadata.
2. Fetches the manifest from `SPAC_APP_URL/api/characters?id=X`.
3. Builds one `@function_tool` per manifest action dynamically (`function_tool(name=..., description=...)`).
4. Instructions list the available actions; tells the model only these are valid.
5. Tool calls → `perform_rpc("spac_action", {action: name})` → browser.

### 7. ControlPanel (`src/components/ControlPanel.tsx`)
Fetches all manifests, shows character picker (locked during session), renders action buttons + walk D-pad from the active manifest, lipsync test toggle.

## The RPC bridge (the one custom seam)

```
Agent tool call
  → room.local_participant.perform_rpc(method="spac_action", payload={"action": "jump"})
  → LiveKit room transport
  → browser room.localParticipant.registerRpcMethod("spac_action", handler)
  → handler: controller.trigger(JSON.parse(payload).action)
  → figure's useFrame picks up state change → animates
```

One method, N tool wrappers. Matches LiveKit's "Forwarding to the frontend" pattern.

## Lipsync

`controller.getMouth()` returns 0..1. While `speaking` is on, it auto-oscillates (sum-of-sines) — looks in sync with any speech, no phoneme analysis. Each figure component eases its mouth/jaw toward this value:
- Bunny: scales a mouth sphere mesh
- Creature: (no jaw bone — lipsync is a no-op visually; could add a morph target)
- VRM Avatar: drives `expressionManager.setValue("a", level)` (VRM 0.x vowel preset)

Later: wire LiveKit agent audio amplitude → `controller.setMouth(level)` for true sync.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19, Tailwind 4 |
| 3D | three.js 0.185, @react-three/fiber 9, @react-three/drei 10 |
| VRM | @pixiv/three-vrm 3.5 |
| Realtime | @livekit/components-react 2.9, livekit-client 2.20 |
| Token mint | livekit-server-sdk 2.17 |
| Agent | Python 3.13, livekit-agents 1.6, livekit-plugins-google, httpx |
| Deps | pnpm (frontend), uv (agent) |

## File map

```
s-pac/
├── public/
│   └── characters/
│       ├── index.json              # character id list
│       ├── creature/{manifest.json, model.glb}
│       ├── avatar/{manifest.json, model.vrm}
│       └── bunny/manifest.json     # primitive, no model file
├── src/
│   ├── lib/
│   │   ├── actions.ts              # ActionController (the deep module)
│   │   ├── characters.ts           # manifest types + fetchers
│   │   └── useActionState.ts       # useSyncExternalStore hook
│   ├── components/
│   │   ├── Figure.tsx              # dispatcher: modelType → component
│   │   ├── CreatureFigure.tsx      # glb: useAnimations
│   │   ├── VrmFigure.tsx           # vrm: VRMLoaderPlugin + bones
│   │   ├── BunnyFigure.tsx         # primitive: mesh groups
│   │   ├── Scene.tsx               # Canvas + lights + ground
│   │   ├── ControlPanel.tsx        # character picker + action buttons
│   │   └── LiveKitSession.tsx      # room connect + RPC bridge
│   └── app/
│       ├── page.tsx                # layout
│       ├── api/
│       │   ├── token/route.ts      # LiveKit token + agent dispatch
│       │   └── characters/route.ts # manifest API for agent
│       └── ...
├── agent/
│   ├── agent.py                    # Gemini Live Vision + dynamic tools
│   ├── pyproject.toml              # uv project
│   └── .env.local                  # LIVEKIT_*, GOOGLE_API_KEY, SPAC_APP_URL
└── .env.local                      # LIVEKIT_URL/KEY/SECRET
```

## Running

```bash
# Frontend (Herdr pane "s-pac dev")
cd ~/projects/atlas/s-pac && pnpm dev

# Agent (Herdr pane "s-pac agent")
cd ~/projects/atlas/s-pac/agent && uv run python agent.py dev
```

Open http://localhost:3000, pick a character, click "start call".

## Known issues / TODO

- **VRM Avatar walk not visually moving** — controller state changes correctly (`pos.z: 0→2` confirmed) but the figure's root doesn't update. Likely `scene.userData.vrm` is the wrong read location; VRM attaches to the GLTF root's `userData`, not `scene.userData`. (Being fixed.)
- **End-call button visibility** — the "end" button is inside `ConnectedBadge` which renders within `<LiveKitRoom>`; may be getting clipped. Needs a stable positioned wrapper.
- **Creature lipsync** — no jaw morph; mouth doesn't move. Could add a blendshape or scale a proxy mesh.
- **Latency** — Gemini Realtime round-trip (India South region) + AEC warmup (3s) + process spawn cold start. Mitigate: warm workers, closer region, lower-latency model.
- **CDN for models** — `modelPath` is filesystem today; swap to Vercel Blob / S3 / Arweave later.

## Conventions

- **TypeScript strict** — `pnpm tsc --noEmit` must pass before yielding.
- **Deep modules** — the controller is the one deep module; figure components are thin adapters at the rendering seam.
- **Data over code** — characters are manifests, not hardcoded classes. New character = new folder.
- **No fake mappings** — if a character doesn't have a "jump" clip, it doesn't expose a "jump" action. Honest tool semantics.
- **One RPC method** — `spac_action` with `{action}` payload. All tool calls funnel through it.
```
```

## How to pick up where you left off

1. Read this file.
2. Read `src/lib/actions.ts` (the controller — the deep module).
3. Read one manifest (`public/characters/creature/manifest.json`).
4. Read `agent/agent.py` for the agent side.
5. Check the two Herdr panes (`s-pac dev`, `s-pac agent`) — both should be running.
6. The "Known issues" section above is the current TODO.
