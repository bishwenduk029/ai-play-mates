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

---

# Games (motion-controlled arcade)

A separate subsystem from AI Play Mates: short, kid-friendly arcade games whose
controller is the kid's body via webcam + MediaPipe. Games live under
`src/app/games`, `src/components/games`, and `src/lib/games`. Each game is a
standalone Phaser 4 scene; motion input is a per-game React hook. Auth-gated
like the rest of the app.

## Architecture (the deep module is the shared host)

The one piece every game reuses is **`src/components/games/PhaserGame.tsx`** — the
shared ancestor. It owns:

- the `Phaser.Game` lifecycle (dynamic client-only import, create on mount,
  destroy on unmount),
- the container element (id = `config.parent`),
- a **fullscreen / expand toggle** (browser Fullscreen API on the container;
  Phaser `Scale.FIT` rescales the canvas to fill the screen),
- no per-frame React re-renders during play.

This is the "pull the common parts up into one component" seam: fullscreen,
lifecycle, and the container are defined once; every game inherits them by
rendering through `<PhaserGame>`. Do **not** re-implement these per game.

```
  React host (per game)            shared host               Phaser scene (per game)
  ─────────────────────            ──────────               ──────────────────────
  use<Gesture> hook  ─┐                                     scene.ts (pure Phaser)
                      │  push flight/pose state              reads game.registry
  <PhaserGame> ───────┼─▶ PhaserGame.tsx                     each update() frame
   config + onReady   │   (lifecycle + fullscreen)           draws the game
                      └─▶ game.registry.set("flight",..)   (no React re-renders)
```

## Motion input hooks (MediaPipe tasks-vision)

Each game has its own hook under `src/lib/games/` that wraps a MediaPipe
landmarker. The invariant across all hooks: **the keyboard/touch input loop is
ALWAYS active; the camera augments but never gates play.** If the camera or
MediaPipe CDN fails (mobile, strict networks), the game still responds to keys.

| Game | Hook | MediaPipe model | What it detects |
|---|---|---|---|
| Jungle Blast | `usePosePunch.ts` | `PoseLandmarker` | kick / jump / run (legs + hips) |
| Sky Strike | `useFlightYoke.ts` | `GestureRecognizer` | two fists (yoke) → bank / climb / thumb-fire |

GestureRecognizer gives canned gestures out of the box (`Closed_Fist`,
`Thumb_Up`, `Thumb_Down`, `Open_Palm`, …) plus 21 hand landmarks, so Sky Strike
needs no custom gesture training.

### Calibration gating (Sky Strike)

`useFlightYoke` requires a deliberate handshake before play: both hands must
be closed fists to "grab the yoke", which captures a baseline hand position.
Once aligned, steering stays live while ≥1 hand is visible; if both hands
vanish for >1s it disengages and re-calibrates. The React host renders a
hands-overlay (✋→✊) from the hook's `handsSeen`/`fistsClosed`/`aligned`
telemetry until alignment completes.

### Fire is a deliberate pump, not a flicker

Fire triggers on a **sustained thumb gesture (≥90ms) then release** — a
deliberate "up and down". A moving fist flickers through `Thumb_Up` for <1
frame, so the min-hold filters accidental fire during banking. Both thumb-up
and thumb-down work; both require the release.

## Sky Strike — fighter-pilot POV (2D faked perspective)

`src/lib/games/sky-strike/scene.ts`. Pure 2D — no 3D, no external art:

- **Rolling/pitching horizon**: a `Container` (terrain strip + clouds + sun)
  rotates around the horizon centre on bank and translates down on climb.
- **Procedural enemies**: a `generateTexture` plane sprite spawns small at the
  horizon and scales up as it approaches; each has a **contrail** streak back to
  the horizon for visibility. Reaching the cockpit = lose a life.
- **Firing**: auto-hits the nearest bandit in range (no aiming) — so there is
  no crosshair. Muzzle flash + explosion bursts.
- **Sound**: synthesized live with WebAudio (square-wave laser, low-pass noise
  explosion). **No asset files → royalty-free by construction.** To swap in real
  SFX, drop files in `public/games/sky-strike/` and load them in `preload()`.
- Keyboard fallback: ←/→ = bank, ↑ = climb, Space = fire.

## How to add a new game (checklist)

1. **Scene**: `src/lib/games/<slug>/scene.ts` — export a `Phaser.Scene` subclass
   and a `<SLUG>_CONFIG: Phaser.Types.Core.GameConfig`. Read input from
   `game.registry.get("<inputKey>")` each `update()`.
2. **Motion hook** (if motion-controlled): `src/lib/games/use<Name>.ts` following
   `usePosePunch` / `useFlightYoke` — keyboard/touch always active, camera
   augments, expose a `get*()` ref + `setTouch()`.
3. **React host**: `src/components/games/<Game>.tsx` — uses `use<Hook>` +
   `<PhaserGame>` (inherits lifecycle + fullscreen). Push hook state into
   `game.registry` each frame via a `requestAnimationFrame` loop.
4. **Register**:
   - `/play` hub (`src/app/play/page.tsx`) — add a card linking to
     `/games/<slug>`.
   - `/games` hub (`src/app/games/page.tsx`) — add to the `GAMES` array.
   - slug page (`src/app/games/[slug]/page.tsx`) — add to `TITLES` and render
     your host for that slug.
5. **Assets** (optional): `public/games/<slug>/`. Prefer Kenney CC0 packs
   (`assets/kenney_*`); confirm license before adding non-CC0 assets. Royalty-
   free SFX can be synthesized in-scene with WebAudio (see Sky Strike) to avoid
   any asset dependency.
6. **Quality gates**: `pnpm tsc --noEmit` and `pnpm lint` must pass.

## Games file map

```
src/
├── app/games/
│   ├── page.tsx                  # /games hub (GAMES array)
│   └── [slug]/page.tsx            # renders the right host per slug (TITLES)
├── app/play/page.tsx             # /play hub — game cards live here too
├── components/games/
│   ├── PhaserGame.tsx            # SHARED host: lifecycle + fullscreen (all games)
│   ├── JungleBlastGame.tsx
│   └── SkyStrikeGame.tsx
└── lib/games/
    ├── usePosePunch.ts           # PoseLandmarker (Jungle Blast)
    ├── useFlightYoke.ts          # GestureRecognizer (Sky Strike)
    ├── jungle-blast/scene.ts
    └── sky-strike/scene.ts
public/games/<slug>/              # per-game static assets (sprites, sfx)
assets/kenney_*/                  # Kenney CC0 source packs
```

## Games conventions

- **One shared host** — `PhaserGame` owns lifecycle + fullscreen + container.
  Never duplicate these in a game component.
- **Hooks never gate play on the camera** — keyboard/touch always work; the
  camera augments. Surface a `error` string when the camera fails.
- **No per-frame React re-renders** — push hook state into `game.registry` via
  rAF; the scene reads it in `update()`.
- **Pure-Phaser scenes** — no React inside a scene. The host is a thin adapter.
- **Procedural first, assets second** — draw shapes / synthesize audio in-scene
  so a game ships with zero asset deps; add Kenney CC0 art to make it pretty.
- **Confirm licenses** — only CC0 / verified royalty-free assets; never pay or
  pull unclear-license assets without checking with the user.
