import { AccessToken, RoomConfiguration } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * Mints a LiveKit token and dispatches the Python vision agent into the room.
 *
 * Request body: { room?, name?, characterId? }
 * The characterId is stored in room metadata so the agent can load the matching
 * character manifesto and register the right tools.
 */
export async function POST(req: NextRequest) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json(
      { error: "LiveKit env vars not configured. See .env.local.example." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    room?: string;
    name?: string;
    characterId?: string;
  };
  const room = body.room ?? `spac-${Math.random().toString(36).slice(2, 8)}`;
  const identity = body.name ?? `kid-${Math.random().toString(36).slice(2, 8)}`;
  const characterId = body.characterId ?? "creature";

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  // Dispatch the Python vision agent. Metadata carries characterId so the
  // agent knows which manifesto / tool set to load for this session.
  at.roomConfig = new RoomConfiguration({
    agents: [
      {
        agentName: "spac",
        metadata: JSON.stringify({ characterId }),
      },
    ],
    metadata: JSON.stringify({ characterId }),
  });
  const token = await at.toJwt();

  return NextResponse.json({ token, room, url: LIVEKIT_URL, characterId });
}
