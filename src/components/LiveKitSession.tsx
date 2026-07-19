"use client";

import { useEffect, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
} from "@livekit/components-react";
import { controller } from "@/lib/actions";

/**
 * Minimal LiveKit session wrapper.
 *
 * - Connects the kid's browser to a LiveKit room (mic + camera).
 * - Registers one RPC method spac_action that dispatches to controller.trigger.
 * - Locks character switching while the session is live.
 * - Passes the active characterId in the token request so the agent can load
 *   that character's manifest and register matching tools.
 */
export function LiveKitSession() {
  const [token, setToken] = useState<{
    token: string;
    url: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    setErr(null);
    const characterId = controller.getState().characterId;
    if (!characterId) {
      setErr("Pick a character first.");
      return;
    }
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ characterId }),
    });
    if (!res.ok) throw new Error(`token route ${res.status}`);
    setToken((await res.json()) as { token: string; url: string });
    controller.setSessionLive(true);
  }

  function disconnect() {
    setToken(null);
    controller.setSessionLive(false);
  }

  if (token) {
    return (
      <LiveKitRoom
        token={token.token}
        serverUrl={token.url}
        connect
        audio
        video
        onDisconnected={() => {
          setToken(null);
          controller.setSessionLive(false);
        }}
      >
        <RoomAudioRenderer />
        <RpcBridge />
        <ConnectedBadge onEnd={disconnect} />
      </LiveKitRoom>
    );
  }

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1">
      <button
        onClick={() => connect().catch((e) => setErr(String(e)))}
        className="rounded-full bg-sky-400 px-4 py-1.5 text-sm font-medium text-slate-900 transition hover:bg-sky-300"
      >
        start call
      </button>
      {err && (
        <p className="max-w-[14rem] text-right text-[10px] leading-tight text-rose-300/80">
          {err}
        </p>
      )}
    </div>
  );
}

/** Registers the single spac_action RPC method on the room. */
function RpcBridge() {
  const room = useRoomContext();
  useEffect(() => {
    room.localParticipant.registerRpcMethod("spac_action", async (data) => {
      try {
        const { action } = JSON.parse(data.payload ?? "{}") as {
          action?: string;
        };
        if (typeof action === "string") {
          // Character is locked during a live session — only actions of the
          // active character are valid.
          controller.trigger(action);
        }
        return "ok";
      } catch {
        return "error";
      }
    });
    return () => room.localParticipant.unregisterRpcMethod?.("spac_action");
  }, [room]);
  return null;
}

function ConnectedBadge({ onEnd }: { onEnd: () => void }) {
  const room = useRoomContext();
  useEffect(() => {
    void room.localParticipant.setMicrophoneEnabled(true);
    void room.localParticipant.setCameraEnabled(true);
  }, [room]);
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-md">
      <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
      <span className="text-xs text-white/80">live</span>
      <button
        onClick={() => onEnd()}
        className="text-xs text-white/60 transition hover:text-white"
      >
        end
      </button>
    </div>
  );
}
