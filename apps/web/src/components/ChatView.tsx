import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../hooks/store";
import { loadMessages } from "../store/messagesSlice";
import { useWebSocket } from "../hooks/useWebSocket";
import { useSharedKey } from "../hooks/useSharedKey";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { Lock } from "lucide-react";

interface Props {
  conversationId: string;
}

export function ChatView({ conversationId }: Props) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const conversation = useAppSelector((s) =>
    s.conversations.items.find((c) => c.id === conversationId),
  );
  const messages = useAppSelector(
    (s) => s.messages.byConversation[conversationId] ?? [],
  );
  const msgStatus = useAppSelector(
    (s) => s.messages.status[conversationId] ?? "idle",
  );

  const sharedKey = useSharedKey(conversation?.otherUserId ?? null);
  const { sendMessage } = useWebSocket(conversationId, sharedKey);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history once shared key is ready
  useEffect(() => {
    if (sharedKey && msgStatus === "idle") {
      dispatch(loadMessages({ conversationId, sharedKey }));
    }
  }, [sharedKey, conversationId, msgStatus, dispatch]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const otherName =
    conversation?.otherDisplayName || conversation?.otherPhone || "…";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
            {otherName[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{otherName}</p>
            <p className="text-xs text-muted-foreground">
              {conversation?.otherPhone}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title="End-to-end encrypted"
        >
          <Lock className="h-3 w-3" />
          E2E
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {msgStatus === "loading" && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Loading messages…
          </p>
        )}
        {!sharedKey && msgStatus !== "loading" && (
          <p className="text-center text-sm text-muted-foreground py-8">
            Establishing secure channel…
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderId === userId}
            sharedKey={sharedKey}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        conversationId={conversationId}
        sharedKey={sharedKey}
        onSend={sendMessage}
      />
    </div>
  );
}
