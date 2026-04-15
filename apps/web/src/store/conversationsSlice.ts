import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { apiFetch } from "../lib/api";
import type { RootState } from "./index";

export interface ConversationItem {
  id: string;
  otherUserId: string;
  otherDisplayName: string;
  otherPhone: string;
  participantAId: string;
  participantBId: string;
  createdAt: string;
}

interface ConversationsState {
  items: ConversationItem[];
  currentId: string | null;
  status: "idle" | "loading" | "loaded" | "error";
}

const initialState: ConversationsState = {
  items: [],
  currentId: null,
  status: "idle",
};

export const fetchConversations = createAsyncThunk(
  "conversations/fetch",
  async (_, { getState }) => {
    const { auth } = getState() as RootState;
    const res = await apiFetch("/api/conversations", auth.token);
    if (!res.ok) throw new Error("Failed to fetch conversations");
    const data = (await res.json()) as { conversations: ConversationItem[] };
    return data.conversations;
  },
);

export const createConversation = createAsyncThunk(
  "conversations/create",
  async (otherUserId: string, { getState }) => {
    const { auth } = getState() as RootState;
    const res = await apiFetch("/api/conversations", auth.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherUserId }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const data = (await res.json()) as { conversation: ConversationItem };
    return data.conversation;
  },
);

const conversationsSlice = createSlice({
  name: "conversations",
  initialState,
  reducers: {
    setCurrentConversation(state, action: PayloadAction<string | null>) {
      state.currentId = action.payload;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.status = "loaded";
        state.items = action.payload;
      })
      .addCase(fetchConversations.rejected, (state) => {
        state.status = "error";
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        const conv = action.payload;
        // Add to list only if not already present
        if (!state.items.find((c) => c.id === conv.id)) {
          state.items.unshift(conv);
        }
        state.currentId = conv.id;
      });
  },
});

export const { setCurrentConversation } = conversationsSlice.actions;
export default conversationsSlice.reducer;
