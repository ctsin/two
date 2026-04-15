import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import conversationsReducer from "./conversationsSlice";
import messagesReducer from "./messagesSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    conversations: conversationsReducer,
    messages: messagesReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // CryptoKey objects passed through thunk args are not serializable; that's fine
        ignoredActionPaths: ["meta.arg.sharedKey"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
