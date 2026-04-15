import { cn } from "../lib/utils";
import { MediaPreview } from "./MediaPreview";
import type { DecryptedMessage } from "../store/messagesSlice";

interface Props {
  message: DecryptedMessage;
  isMine: boolean;
  sharedKey: CryptoKey | null;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, isMine, sharedKey }: Props) {
  const hasMedia =
    (message.type === "image" ||
      message.type === "video" ||
      message.type === "file") &&
    message.mediaKey;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 max-w-[70%]",
        isMine ? "ml-auto items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "rounded-2xl px-4 py-2 text-sm break-words",
          isMine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
          message.pending && "opacity-60",
          hasMedia && "p-2",
        )}
      >
        {message.type === "text" && <p>{message.content}</p>}
        {hasMedia && sharedKey && (
          <MediaPreview message={message} sharedKey={sharedKey} />
        )}
      </div>
      <span className="text-[11px] text-muted-foreground px-1">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}
