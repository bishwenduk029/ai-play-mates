"""AI Play Mates vision agent — manifesto-driven.

At session start the agent:
  1. Reads characterId from the job/room metadata (set by /api/token).
  2. Fetches that character's manifesto from the Next.js app
     (GET /api/characters?id=<id>).
  3. Registers one @function_tool per action in the manifesto.
  4. Instructs Gemini with the available action list.

Run:
    cd agent
    cp .env.local.example .env.local   # LIVEKIT_*, GOOGLE_API_KEY, SPAC_APP_URL
    uv sync
    uv run python agent.py dev
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from google.genai import types
from livekit.agents import (
    Agent,
    AgentSession,
    AgentServer,
    JobContext,
    RunContext,
    cli,
    function_tool,
    get_job_context,
    room_io,
)
from livekit.plugins import google

load_dotenv(".env.local")

logger = logging.getLogger("spac-agent")
logger.setLevel(logging.INFO)

server = AgentServer()
AGENT_NAME = "spac"
# Next.js app base URL used to fetch character manifests.
SPAC_APP_URL = os.getenv("SPAC_APP_URL", "http://localhost:3000").rstrip("/")


async def _send_action(action: str) -> str:
    """Forward one action name to the browser figure via LiveKit RPC.

    The browser registers a single RPC method spac_action whose payload is
    {"action": "<name>"}. The browser calls controller.trigger(name), which
    only accepts actions from the session's locked character manifesto.
    """
    room = get_job_context().room
    remote = list(room.remote_participants.values())
    if not remote:
        return "no-kid"
    kid = remote[0]
    try:
        resp = await room.local_participant.perform_rpc(
            destination_identity=kid.identity,
            method="spac_action",
            payload=json.dumps({"action": action}),
            response_timeout=5.0,
        )
        return resp
    except Exception as e:  # noqa: BLE001
        logger.warning("rpc %s failed: %s", action, e)
        return "error"


def _character_id_from_job(ctx: JobContext) -> str:
    """Pull characterId from job metadata, falling back to room metadata."""
    # Job metadata is what agent dispatch receives from RoomConfiguration.agents[].metadata
    for raw in (getattr(ctx.job, "metadata", None), getattr(ctx.room, "metadata", None)):
        if not raw:
            continue
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(data, dict) and data.get("characterId"):
                return str(data["characterId"])
        except Exception:  # noqa: BLE001
            continue
    return "creature"


async def _fetch_manifest(character_id: str) -> dict[str, Any]:
    url = f"{SPAC_APP_URL}/api/characters?id={character_id}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.json()


def _build_instructions(manifest: dict[str, Any]) -> str:
    label = manifest.get("label", "companion")
    desc = manifest.get("description", "")
    actions = manifest.get("actions", [])
    lines = [
        f"You are AI Play Mates, currently embodied as {label}. {desc}",
        "You can see the kid through their webcam and hear them through their microphone.",
        "Your job is to keep a child under 7 entertained by reacting to what they do",
        "and moving your on-screen figure body in response.",
        "",
        "You control the figure through your tools. Use them often — the figure IS you,",
        "and a still figure is no fun. Available actions for THIS session:",
        "",
    ]
    for a in actions:
        name = a.get("name", "")
        description = a.get("description", "")
        lines.append(f"- {name}: {description}")
    lines += [
        "",
        "Mirror the kid when you can (wave if they wave, jump if they jump).",
        "Walk around to explore. Be warm, use simple short words a toddler",
        "understands, and proactively initiate play when the kid goes quiet.",
        "Only call tools listed above — they are the only ones this body supports.",
    ]
    return "\n".join(lines)


def _make_action_tool(name: str, description: str):
    """Build one function_tool bound to an action name from the manifesto."""

    @function_tool(name=name, description=description)
    async def _tool(ctx: RunContext) -> str:
        del ctx
        return await _send_action(name)

    return _tool


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    character_id = _character_id_from_job(ctx)
    logger.info("session characterId=%s", character_id)

    try:
        manifest = await _fetch_manifest(character_id)
    except Exception as e:  # noqa: BLE001
        logger.error("failed to fetch manifesto for %s: %s", character_id, e)
        # Hard fallback so a missing manifesto doesn't kill the session.
        manifest = {
            "id": character_id,
            "label": character_id,
            "description": "Play companion.",
            "actions": [
                {"name": "idle", "description": "Rest calmly."},
            ],
        }

    actions = manifest.get("actions") or []
    tools = [
        _make_action_tool(a["name"], a.get("description") or a["name"])
        for a in actions
        if a.get("name")
    ]
    instructions = _build_instructions(manifest)
    logger.info(
        "registered %d tools for character %s: %s",
        len(tools),
        character_id,
        [a.get("name") for a in actions],
    )

    agent = Agent(instructions=instructions, tools=tools)

    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model="gemini-3.1-flash-live-preview",
            thinking_config=types.ThinkingConfig(
                include_thoughts=False,
            ),
            voice="Puck",
        ),
    )

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(video_input=True),
    )
    await ctx.connect()
    await session.generate_reply()


if __name__ == "__main__":
    cli.run_app(server)
