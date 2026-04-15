import { useEffect, useRef, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "./store";
import { addMessage } from "../store/messagesSlice";
import { decrypt } from "@two/crypto";
import { cacheMessages } from "../lib/messageCache";
import { API_BASE } from "../lib/api";
import type { WsOutgoingMessage, WsIncomingMessage } from "@two/shared/types";

const MAX_BACKOFF_MS = 30_000;

export function useWebSocket(
  conversationId: string | null,
  sharedKey: CryptoKey | null,
) {
  const token = useAppSelector((s) => s.auth.token);
  const dispatch = useAppDispatch();
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (!conversationId || !token || !sharedKey || unmountedRef.current) return;

    const wsBase = API_BASE.replace(/^http/, "ws");
    const url = `${wsBase}/api/conversations/${conversationId}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = 1000; // reset backoff on successful connect
    };

    ws.onmessage = async (event: MessageEvent<string>) => {
      let msg: WsOutgoingMessage;
      try {
        msg = JSON.parse(event.data) as WsOutgoingMessage;
      } catch {
        return;
      }

      if (msg.type === "message" && msg.message) {
        const raw = msg.message;
        let content = "";
        if (raw.type === "text") {
          try {
            content = await decrypt(raw.encryptedContent, raw.iv, sharedKey);
          } catch {
            content = "[decryption failed]";
          }
        }
        const decrypted = {
          id: raw.id,
          conversationId: raw.conversationId,
          senderId: raw.senderId,
          type: raw.type,
          content,
          mediaKey: raw.mediaKey,
          iv: raw.iv,
          createdAt:
            raw.createdAt instanceof Date
              ? raw.createdAt.toISOString()
              : String(raw.createdAt),
        };
        dispatch(addMessage(decrypted));
        cacheMessages([decrypted]);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [conversationId, token, sharedKey, dispatch]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendMessage = useCallback((payload: WsIncomingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { sendMessage };
}
