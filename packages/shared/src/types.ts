// Mirrors the DB schema as plain TypeScript types for use in both API and web

export type MessageType = "text" | "image" | "video" | "file";

export interface User {
  id: string;
  phone: string;
  displayName: string;
  publicKey: string | null;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  participantAId: string;
  participantBId: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  encryptedContent: string;
  mediaKey: string | null;
  iv: string;
  createdAt: Date;
}

// WebSocket message envelope sent over the wire
export interface WsIncomingMessage {
  type: "message";
  conversationId: string;
  payload: {
    id: string;
    messageType: MessageType;
    encryptedContent: string;
    mediaKey?: string;
    iv: string;
  };
}

export interface WsOutgoingMessage {
  type: "message" | "ack" | "error";
  message?: Message;
  messageId?: string;
  error?: string;
}
