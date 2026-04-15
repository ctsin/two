import { drizzle } from "drizzle-orm/d1";
import { messages } from "@two/shared/schema";
import type {
  WsIncomingMessage,
  WsOutgoingMessage,
  Message,
} from "@two/shared/types";
import type { Env } from "../index";

export class ChatRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const conversationId = url.searchParams.get("conversationId");

    if (!userId || !conversationId) {
      return new Response("Missing userId or conversationId", { status: 400 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept with hibernation; tag the socket with userId so we can identify senders
    this.state.acceptWebSocket(server, [userId, conversationId]);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const tags = this.state.getTags(ws);
    const userId = tags[0];
    const conversationId = tags[1];

    if (!userId || !conversationId) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Unauthenticated",
        } satisfies WsOutgoingMessage),
      );
      return;
    }

    let incoming: WsIncomingMessage;
    try {
      incoming = JSON.parse(
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message),
      );
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Invalid JSON",
        } satisfies WsOutgoingMessage),
      );
      return;
    }

    if (incoming.type !== "message") {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Unknown message type",
        } satisfies WsOutgoingMessage),
      );
      return;
    }

    const { id, messageType, encryptedContent, mediaKey, iv } =
      incoming.payload;
    const now = new Date();

    const db = drizzle(this.env.DB);
    try {
      await db.insert(messages).values({
        id,
        conversationId,
        senderId: userId,
        type: messageType,
        encryptedContent,
        mediaKey: mediaKey ?? null,
        iv,
        createdAt: now,
      });
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to persist message",
        } satisfies WsOutgoingMessage),
      );
      return;
    }

    // Broadcast persisted message to all connected clients (including sender)
    const outgoing: WsOutgoingMessage = {
      type: "message",
      message: {
        id,
        conversationId,
        senderId: userId,
        type: messageType,
        encryptedContent,
        mediaKey: mediaKey ?? null,
        iv,
        createdAt: now,
      } satisfies Message,
    };
    const payload = JSON.stringify(outgoing);

    for (const peer of this.state.getWebSockets()) {
      try {
        peer.send(payload);
      } catch {
        // Peer may be closing; ignore
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "WebSocket error");
  }
}
