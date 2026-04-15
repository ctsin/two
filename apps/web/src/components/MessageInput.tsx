import { useState, useRef, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { encrypt, encryptFile } from "@two/crypto";
import { apiFetch } from "../lib/api";
import { useAppDispatch, useAppSelector } from "../hooks/store";
import { addOptimisticMessage } from "../store/messagesSlice";
import { Paperclip, Send } from "lucide-react";
import type { WsIncomingMessage, MessageType } from "@two/shared/types";

interface Props {
  conversationId: string;
  sharedKey: CryptoKey | null;
  onSend: (msg: WsIncomingMessage) => void;
}

const LARGE_FILE_THRESHOLD = 80 * 1024 * 1024; // 80 MB — use presign above this

export function MessageInput({ conversationId, sharedKey, onSend }: Props) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !sharedKey) return;
    setText("");

    const { ciphertext, iv } = await encrypt(trimmed, sharedKey);
    const id = uuidv4();
    const msg: WsIncomingMessage = {
      type: "message",
      conversationId,
      payload: {
        id,
        messageType: "text",
        encryptedContent: ciphertext,
        iv,
      },
    };
    // Optimistic UI
    dispatch(
      addOptimisticMessage({
        id,
        conversationId,
        senderId: userId,
        type: "text",
        content: trimmed,
        mediaKey: null,
        iv,
        createdAt: new Date().toISOString(),
        pending: true,
      }),
    );
    onSend(msg);
  }, [text, sharedKey, conversationId, userId, dispatch, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKey || !token) return;
    e.target.value = "";
    setUploading(true);

    try {
      const buf = await file.arrayBuffer();
      const { data: encData, iv } = await encryptFile(buf, sharedKey);

      let mediaKey: string;

      if (file.size >= LARGE_FILE_THRESHOLD) {
        // Presigned upload
        const presignRes = await apiFetch("/api/media/presign", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size: file.size, iv }),
        });
        if (!presignRes.ok) throw new Error("Presign failed");
        const { media_key, upload_url } = (await presignRes.json()) as {
          media_key: string;
          upload_url: string;
        };
        await fetch(upload_url, { method: "PUT", body: encData });
        mediaKey = media_key;
      } else {
        const form = new FormData();
        form.append(
          "file",
          new Blob([encData], { type: "application/octet-stream" }),
          "encrypted",
        );
        form.append("iv", iv);
        const uploadRes = await apiFetch("/api/media/upload", token, {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const { media_key } = (await uploadRes.json()) as { media_key: string };
        mediaKey = media_key;
      }

      const type: MessageType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "file";
      const id = uuidv4();
      const msg: WsIncomingMessage = {
        type: "message",
        conversationId,
        payload: {
          id,
          messageType: type,
          encryptedContent: "",
          mediaKey,
          iv,
        },
      };
      dispatch(
        addOptimisticMessage({
          id,
          conversationId,
          senderId: userId,
          type,
          content: "",
          mediaKey,
          iv,
          createdAt: new Date().toISOString(),
          pending: true,
        }),
      );
      onSend(msg);
    } catch (err) {
      console.error("Upload error", err);
    } finally {
      setUploading(false);
    }
  };

  const disabled = !sharedKey || uploading;

  return (
    <div className="px-4 py-3 border-t border-border flex items-end gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
        aria-label="Attach file"
      >
        <Paperclip className="h-5 w-5" />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="image/*,video/*,*/*"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={sharedKey ? "Message" : "Establishing secure channel…"}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 max-h-32 overflow-y-auto"
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      <button
        type="button"
        onClick={sendText}
        disabled={disabled || !text.trim()}
        className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        aria-label="Send"
      >
        <Send className="h-5 w-5" />
      </button>
    </div>
  );
}
