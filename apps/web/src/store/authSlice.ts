import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiFetch } from "../lib/api";

const STORAGE_KEY = "two_auth";

export interface AuthUser {
  id: string;
  phone: string;
  displayName: string;
}

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  status: "idle" | "loading" | "error";
  error: string | null;
}

function loadFromStorage(): Pick<AuthState, "user" | "token"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const stored: StoredAuth = JSON.parse(raw);
    return { user: stored.user, token: stored.token };
  } catch {
    return { user: null, token: null };
  }
}

const { user: storedUser, token: storedToken } = loadFromStorage();

const initialState: AuthState = {
  user: storedUser,
  token: storedToken,
  status: "idle",
  error: null,
};

export const login = createAsyncThunk(
  "auth/login",
  async (phone: string, { rejectWithValue }) => {
    const res = await apiFetch("/auth/login", null, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      return rejectWithValue(
        (err as { error: string }).error ?? "Login failed",
      );
    }
    return res.json() as Promise<{ token: string; user: AuthUser }>;
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      localStorage.removeItem(STORAGE_KEY);
    },
  },
  extraReducers(builder) {
    builder
      .addCase(login.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = "idle";
        state.user = action.payload.user;
        state.token = action.payload.token;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            token: action.payload.token,
            user: action.payload.user,
          }),
        );
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "error";
        state.error = (action.payload as string) ?? "Login failed";
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
