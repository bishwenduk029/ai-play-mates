<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Play Zone — Engineering Guide

> A platform where **AI and games intersect into amazing experiences at low cost**. Motion-controlled arcade games a kid plays with their body via webcam. New games ship regularly — **1–2 new games every Saturday**. Your objective is to build this amazing web project so that it goes viral and becomes a self earning engine.

Read this file, then `ARCHITECTURE.md`, before writing any code.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + Tailwind 4 + shadcn (Base UI).
- **Games**: **Phaser 4** engine, pure scenes; motion input via **MediaPipe `@mediapipe/tasks-vision`**.
- **AI Play Mates** (separate subsystem): three.js + react-three-fiber + LiveKit + Gemini Live Vision. See `ARCHITECTURE.md`.
- **Auth**: Better Auth. **DB**: Drizzle ORM → remote **Turso** (libsql). **Payments**: Dodo Payments.
- Deps: `pnpm`. Agent: Python (`uv`) under `agent/`.

## Before you write code

1. **`ARCHITECTURE.md`** — two subsystems: *AI Play Mates* and *Games (motion-controlled arcade)*. The Games section has the add-a-game checklist, the shared-host pattern, and per-game notes.
2. **Next.js is not the one you know** (block above) — read `node_modules/next/dist/docs/` for the API you're about to use.
3. Existing games are the reference: `src/lib/games/jungle-blast/scene.ts` + `usePosePunch.ts`, and `src/lib/games/sky-strike/scene.ts` + `useFlightYoke.ts`. Match their style.

## Building a motion-controlled game

- **Engine is Phaser 4.** Each game = a pure `Phaser.Scene` (+ a `*_CONFIG`) in `src/lib/games/<slug>/scene.ts`. No React inside a scene.
- **The shared host `src/components/games/PhaserGame.tsx` is the deep module.** It owns the Phaser lifecycle, the container, and a **fullscreen/expand toggle**. Every game renders through `<PhaserGame>` — **never re-implement lifecycle or fullscreen per game** (this is the "pull common parts up" seam).
- **Gesture hook** in `src/lib/games/use<Name>.ts` wraps a MediaPipe landmarker. Hard invariants:
  - The **keyboard/touch input loop is ALWAYS active**; the camera augments but never gates play. If the camera/CDN fails, the game still responds to keys.
  - Use **deliberate gestures** to avoid false positives (e.g. fire on a sustained thumb-then-release, not a 1-frame flicker) — moving fists must not trigger fire.
  - Calibration gating (e.g. both fists = "grab the yoke") is fine; auto-align when the camera is off/failed.
- **Data flow**: hook → React state → `game.registry.set("<key>", ...)` each `requestAnimationFrame`; the scene reads it in `update()`. **No per-frame React re-renders.**
- **Register** a new game in two places: the `/play` hub (`src/app/play/page.tsx`) and the slug page (`src/app/games/[slug]/page.tsx` `TITLES` + render the host). Full checklist in `ARCHITECTURE.md`. (There is no `/games` hub — `/play` is the only hub.)

## Assets & sound

- **Kenney CC0 packs** live in `assets/kenney_*` (e.g. `kenney_platformer-characters`). License is CC0 — use freely, attribution optional. Check `License.txt` in each pack. The user calls these "kennel assets".
- **Need more art/sound?** Use the **`ego-browser` skill** (`.agents/skills/ego-browser/SKILL.md`) to browse sources like Kenney.nl.
  - **Confirm royalty-free status with the user BEFORE downloading anything. Never pay anywhere. Never pull unclear-license assets.**
- **Prefer procedural first**: draw shapes with Phaser Graphics + `generateTexture`, and synthesize SFX live with WebAudio (see Sky Strike's `playLaser`/`playExplosion`). Zero asset files = royalty-free by construction and faster to ship.
- Per-game static assets go in `public/games/<slug>/`.

## Sub-agents & delegation

Sub-agents run as **opencode sessions in Herdr panes** (`.agents/skills/herdr/SKILL.md`), with the model pinned per task difficulty. **Only these two models — never openrouter, never pi:**

| Task difficulty | Model | Launch command | Use for |
|---|---|---|---|
| Simple / mechanical | `opencode-go/glm-5.2` | `opencode --model opencode-go/glm-5.2` | Localized edits: tweak one scene, redraw a texture, adjust copy, responsive class pass |
| Hard / very hard | `opencode-go/kimi-k3` | `opencode --model opencode-go/kimi-k3` | Design patterns, reusable/deep modules (e.g. the `PhaserGame` shared host), new game architecture, refactors across files |

### Delegation workflow (proven)

1. **Split work into disjoint file sets** — each sub-agent must own files no other agent (or you) will touch, so parallel edits never conflict.
2. Split a pane per agent (wide pane → `--direction right`, else `down`), keep the user's focus:
   ```bash
   herdr pane split --current --direction right --no-focus --cwd "$(pwd)"
   herdr pane rename <paneId> "<task>-agent"
   herdr pane run <paneId> "opencode --model opencode-go/glm-5.2"   # or kimi-k3
   ```
3. Wait for the TUI to open (`herdr wait agent-status <paneId> --status idle`), then submit the task with `herdr pane run <paneId> "<prompt>"`.
4. **Prompts must be fully self-contained** (fresh context): exact file paths, current behavior, numbered implementation steps, and constraints — *edit ONLY these files, no git, no `pnpm dev`/`install`/`tsc`/`lint`* (the orchestrator runs the quality gates).
5. Wait for `working` → `idle`/`done`, read the transcript (`herdr pane read <paneId> --source recent-unwrapped --lines 80`), then **verify every diff yourself** and run `pnpm tsc --noEmit` + `pnpm lint` yourself.

### Gotchas

- **glm-5.2 stalls after reading**: it sometimes reads the target file, prints "let me design the changes…", and goes idle without editing. Nudge it: `herdr pane run <paneId> "Continue — make the edits now, then reply with a summary."`
- **Prefer doing small single-file edits yourself** — delegate only when work is genuinely parallel and independent (the user prefers fewer sub-agents).
- To let the user test, start a **dev server in its own Herdr pane** (see Dev workflow) rather than running it inline.

## Dev workflow

- `pnpm dev` → Next 16 (Turbopack) on http://localhost:3000. Routes are **auth-gated** — log in to see `/play` and `/games`.
- Start a dev pane for the user:
  ```bash
  herdr pane split --current --direction right --no-focus --cwd "$(pwd)"
  herdr pane rename <paneId> "dev"
  herdr pane run <paneId> "pnpm dev"
  ```
- **Turbopack panic-loop** (`FATAL: ... Next.js package not found`, repeating): the `.next` cache is corrupt. Stop the pane (Ctrl-C), `rm -rf .next`, restart. Not an env or code issue.
- **`/api/... 500 — no such table: ...`**: the remote Turso DB is missing a migration. Ask the user before running `pnpm db:push` (it mutates the DB). This is unrelated to games.

## Git & identity

- **Do NOT `git commit` or `git push` unless the user explicitly asks.** Work on a feature branch; leave changes uncommitted for the user to review.
- Git is configured with the **personal Gmail** identity. **Never use the office/Pega identity.** If `git config user.email` shows a Pega/corporate address, stop and ask before doing anything.
- The root `AGENTS.md` (`/Users/kundb/projects/AGENTS.md`) covers the `bd` issue-tracking workflow and session-completion rules — follow them when the user asks to land work.

## Quality gates (must pass before yielding)

- `pnpm tsc --noEmit` — TypeScript strict, zero errors.
- `pnpm lint` — zero new errors. **Ignore pre-existing parse errors under `.agents/skills/**`** (third-party skill files, not ours). Clean up any warning you introduced.

## Design patterns we use (Gang of Four, grounded in this repo)

- **Facade** — `PhaserGame` hides the Phaser lifecycle + the browser Fullscreen API behind one component. New games get lifecycle + fullscreen by composing it, not by calling Phaser/Fullscreen directly.
- **Strategy** — each game's gesture hook (`usePosePunch`, `useFlightYoke`) is an interchangeable input strategy plugged into the same host. Adding a game = adding a strategy, not editing the host.
- **Hollywood principle / Inversion of control** — the host calls the game back via `onReady(game)`; games push state via `game.registry`; the scene reads it in `update()`. "Don't call us, we'll call you" — no per-frame React re-renders, no scene→React coupling.
- **Template Method (as a convention)** — the add-a-game checklist is the fixed skeleton (scene → hook → host → register); each game fills in the slots. Same shape every time.
- **Composite** — Phaser `Container` composes the rolling horizon (terrain strip + clouds + sun) into one transformable node.
- **Adapter** — game/figure components are thin adapters at the rendering seam; the deep logic lives in the controller/hook, not the component.

Principle: **one deep module per seam, thin adapters everywhere else.** Prefer composition over inheritance; keep scenes and hosts thin.

## Matt Pocock engineering skills

A full engineering-skills suite is installed in `.agents/skills/`. **Load the relevant `SKILL.md` before using one.** `ask-matt` is the router — ask it which skill fits a situation.

- **Plan / spec / tickets**: `to-spec` (conversation → spec), `to-tickets` (plan → tracer-bullet tickets), `to-questionnaire` (decision → a questionnaire for someone else), `wayfinder` (huge multi-session work → a shared map of decision tickets), `request-refactor-plan` (refactor → tiny-commit plan).
- **Triage / QA**: `triage` (move issues through triage roles), `qa` (conversational bug reports → filed issues), `diagnosing-bugs` (diagnosis loop for hard bugs / perf regressions).
- **Design / architecture**: `codebase-design` (deep-module vocabulary), `design-an-interface` (multiple radically different interface designs), `improve-codebase-architecture` (deepening opportunities → report), `domain-modeling` + `ubiquitous-language` (domain terms / glossary), `setup-ts-deep-modules` (dependency-cruiser so packages are deep modules).
- **Build / test**: `tdd` (red-green-refactor), `implement` (work from a spec/tickets), `prototype` (throwaway prototype to sanity-check a design), `code-review` (Standards + Spec review since a commit).
- **TypeScript hygiene**: `migrate-to-shoehorn` (replace `as` assertions with `@total-typescript/shoehorn`), `setup-pre-commit` (Husky + lint-staged + typecheck + tests).
- **Grilling (stress-test thinking)**: `grilling`, `grill-me`, `grill-with-docs` (grill + writes ADRs/glossary), `batch-grill-me`, `loop-me`.
- **Writing**: `writing-fragments` → `writing-beats` → `writing-shape` (mine → assemble → shape), `edit-article`, `writing-great-skills` (reference for authoring skills).
- **Handoff / session**: `handoff` (compact conversation → handoff doc), `claude-handoff` (hand off to a fresh background agent).
- **Setup**: `setup-matt-pocock-skills` — run **once** to wire the suite's issue-tracker / triage-label / domain-doc integration into `AGENTS.md` + `docs/agents/`. **Not yet run for this repo** (no `## Agent skills` block, no `docs/agents/`). This repo tracks work with **`bd` (beads)**, not GitHub — when running it, configure the issue tracker as "other" and point it at `bd`.

## Skills to load when relevant

- `.agents/skills/ego-browser/SKILL.md` — finding assets/sounds (royalty-free, no-pay rule above).
- `.agents/skills/herdr/SKILL.md` — panes, sub-agents, dev-server panes (glm-5.2 only).
- `.agents/skills/shadcn/SKILL.md` — shadcn/Base UI components.
- `.agents/skills/threejs-*/SKILL.md` — three.js (only for the AI Play Mates 3D subsystem).
- `.agents/skills/better-auth-*`, `dodo-*`, `create-auth` — auth/payments work.
- The Matt Pocock skills above for design/plan/test/review work.
