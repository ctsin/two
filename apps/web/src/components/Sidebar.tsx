import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../hooks/store";
import {
  fetchConversations,
  setCurrentConversation,
} from "../store/conversationsSlice";
import { logout } from "../store/authSlice";
import { clearSharedKeyCache } from "../lib/sharedKeyCache";
import { cn } from "../lib/utils";
import { MessageSquare, LogOut } from "lucide-react";

export function Sidebar() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { items, currentId, status } = useAppSelector((s) => s.conversations);

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

  return (
    <aside className="w-72 flex-none flex flex-col border-r border-border bg-background">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <span className="font-semibold text-foreground">Two</span>
      </div>

      {/* Conversation list */}
      <nav className="flex-1 overflow-y-auto py-2">
        {status === "loading" && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            Loading…
          </p>
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
