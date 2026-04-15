import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { apiFetch } from "../lib/api";
import { decrypt } from "@two/crypto";
import { cacheMessages, getCachedMessages } from "../lib/messageCache";
import type { RootState } from "./index";
import type { MessageType } from "@two/shared/types";

export interface DecryptedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  mediaKey: string | null;
  iv: string;
  createdAt: string;
  pending?: boolean;
}

interface MessagesState {
  byConversation: Record<string, DecryptedMessage[]>;
  status: Record<string, "idle" | "loading" | "loaded">;
  cursor: Record<string, string | null>;
}

const initialState: MessagesState = {
  byConversation: {},
  status: {},
  cursor: {},
};

interface RawMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  encryptedContent: string;
  mediaKey: string | null;
  iv: string;
  createdAt: string;
}

export const loadMessages = createAsyncThunk(
  "messages/load",
  async (
    {
      conversationId,
      sharedKey,
    }: { conversationId: string; sharedKey: CryptoKey },
    { getState },
  ) => {
    // Try IndexedDB cache first
    const cached = await getCachedMessages(conversationId);
    if (cached.length > 0) {
      return { conversationId, messages: cached, fromCache: true };
    }

    const { auth } = getState() as RootState;
    const res = await apiFetch(
      `/api/conversations/${conversationId}/messages`,
      auth.token,
    );
    if (!res.ok) throw new Error("Failed to load messages");
    const data = (await res.json()) as { messages: RawMessage[] };

    const decrypted: DecryptedMessage[] = await Promise.all(
      data.messages.map(async (m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        type: m.type,
        content:
          m.type === "text"
            ? await decrypt(m.encryptedContent, m.iv, sharedKey)
            : "",
        mediaKey: m.mediaKey,
        iv: m.iv,
        createdAt: m.createdAt,
      })),
    );

    await cacheMessages(decrypted);
    return { conversationId, messages: decrypted, fromCache: false };
  },
);

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    addMessage(state, action: PayloadAction<DecryptedMessage>) {
      const { conversationId } = action.payload;
      if (!state.byConversation[conversationId]) {
        state.byConversation[conversationId] = [];
      }
      // Avoid duplicates (e.g. if we receive our own message back)
      const exists = state.byConversation[conversationId].some(
        (m) => m.id === action.payload.id,
      );
      if (!exists) {
        state.byConversation[conversationId].push(action.payload);
      } else {
        // Confirm optimistic message
        const idx = state.byConversation[conversationId].findIndex(
          (m) => m.id === action.payload.id,
        );
        state.byConversation[conversationId][idx] = action.payload;
      }
    },
    addOptimisticMessage(state, action: PayloadAction<DecryptedMessage>) {
      const { conversationId } = action.payload;
      if (!state.byConversation[conversationId]) {
        state.byConversation[conversationId] = [];
      }
      state.byConversation[conversationId].push(action.payload);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(loadMessages.pending, (state, action) => {
        const { conversationId } = action.meta.arg;
        state.status[conversationId] = "loading";
      })
      .addCase(loadMessages.fulfilled, (state, action) => {
        const { conversationId, messages } = action.payload;
        state.status[conversationId] = "loaded";
        state.byConversation[conversationId] = messages;
      })
      .addCase(loadMessages.rejected, (state, action) => {
        const { conversationId } = action.meta.arg;
        state.status[conversationId] = "idle";
      });
  },
});

export const { addMessage, addOptimisticMessage } = messagesSlice.actions;
export default messagesSlice.reducer;
