import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks/store";
import {
  fetchConversations,
  setCurrentConversation,
  createConversation,
} from "../store/conversationsSlice";
import { logout } from "../store/authSlice";
import { clearSharedKeyCache } from "../lib/sharedKeyCache";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { MessageSquare, LogOut, Plus, X } from "lucide-react";

export function Sidebar() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const { items, currentId, status } = useAppSelector((s) => s.conversations);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [newChatLoading, setNewChatLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  function handleSelect(id: string) {
    dispatch(setCurrentConversation(id));
  }

  function handleLogout() {
    clearSharedKeyCache();
    dispatch(logout());
  }

  async function handleNewChat(e: React.FormEvent) {
    e.preventDefault();
    const match = phoneInput.trim().match(/^#?(\d{7,20})$/);
    if (!match) {
      setNewChatError("Enter a phone number, e.g. #1234567890");
      return;
    }
    const phone = `+${match[1]}`;
    setNewChatLoading(true);
    setNewChatError(null);
    try {
      const res = await apiFetch(
        `/api/users?phone=${encodeURIComponent(phone)}`,
        token,
      );
      if (!res.ok) {
        setNewChatError("User not found");
        return;
      }
      const { user: found } = (await res.json()) as {
        user: { id: string; displayName: string; phone: string };
      };
      await dispatch(createConversation(found.id)).unwrap();
      setNewChatOpen(false);
      setPhoneInput("");
    } catch {
      setNewChatError("Could not start conversation");
    } finally {
      setNewChatLoading(false);
    }
  }

  return (
    <aside className="w-72 flex-none flex flex-col border-r border-border bg-background">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <span className="font-semibold text-foreground flex-1">Two</span>
        <button
          onClick={() => {
            setNewChatOpen((v) => !v);
            setPhoneInput("");
            setNewChatError(null);
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={newChatOpen ? "Cancel new chat" : "New chat"}
        >
          {newChatOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* New chat form */}
      {newChatOpen && (
        <form
          onSubmit={handleNewChat}
          className="px-4 py-3 border-b border-border flex flex-col gap-2"
        >
          <input
            autoFocus
            type="text"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              setNewChatError(null);
            }}
            placeholder="#1234567890"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {newChatError && (
            <p className="text-xs text-destructive">{newChatError}</p>
          )}
          <button
            type="submit"
            disabled={newChatLoading}
            className="w-full rounded-md bg-primary text-primary-foreground text-sm py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {newChatLoading ? "Starting…" : "Start Chat"}
          </button>
        </form>
      )}

      {/* Conversation list */}
      <nav className="flex-1 overflow-y-auto py-2">
        {status === "loading" && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            Loading…
          </p>
        )}
        {status === "error" && (
          <div className="px-4 py-6 flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground text-center">
              Could not load conversations.
            </p>
            <button
              onClick={() => dispatch(fetchConversations())}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {status === "loaded" && items.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No conversations yet.
          </p>
        )}
        {items.map((conv) => (
          <button
            key={conv.id}
            onClick={() => handleSelect(conv.id)}
            className={cn(
              "w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-accent transition-colors",
              currentId === conv.id && "bg-accent",
            )}
          >
            <span className="text-sm font-medium text-foreground truncate">
              {conv.otherDisplayName || conv.otherPhone}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {conv.otherPhone}
            </span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {user?.displayName || user?.phone}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {user?.phone}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
