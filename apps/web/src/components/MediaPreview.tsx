import { useState, useEffect, useCallback } from "react";
import { useAppSelector } from "../hooks/store";
import { apiFetch } from "../lib/api";
import { decryptFile } from "@two/crypto";
import { Download, FileText, Image as ImageIcon, Video } from "lucide-react";
import type { DecryptedMessage } from "../store/messagesSlice";

interface Props {
  message: DecryptedMessage;
  sharedKey: CryptoKey;
}

type State = "idle" | "loading" | "ready" | "error";

export function MediaPreview({ message, sharedKey }: Props) {
  const token = useAppSelector((s) => s.auth.token);
  const [state, setState] = useState<State>("idle");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [, setMimeType] = useState<string>("application/octet-stream");

  const load = useCallback(async () => {
    if (!message.mediaKey || !token) return;
    setState("loading");
    try {
      const res = await apiFetch(`/api/media/${message.mediaKey}`, token);
      if (!res.ok) throw new Error("Download failed");
      const iv = res.headers.get("X-Encrypted-IV");
      if (!iv) throw new Error("Missing IV header");
      const contentType =
        res.headers.get("X-Original-Content-Type") ??
        "application/octet-stream";
      setMimeType(contentType);
      const encrypted = await res.arrayBuffer();
      const decrypted = await decryptFile(encrypted, iv, sharedKey);
      const blob = new Blob([decrypted], { type: contentType });
      setObjectUrl(URL.createObjectURL(blob));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [message.mediaKey, token, sharedKey]);

  // Auto-load images and videos; require click for files
  useEffect(() => {
    if (message.type === "image" || message.type === "video") {
      load();
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.mediaKey]);

  function triggerDownload() {
    if (objectUrl) {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = message.mediaKey ?? "file";
      a.click();
    } else {
      load().then(() => {
        // objectUrl will be set after load; user can click again
      });
    }
  }

  if (message.type === "image") {
    if (state === "loading") {
      return (
        <div className="h-40 w-56 rounded-lg bg-muted animate-pulse flex items-center justify-center">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      );
    }
    if (state === "ready" && objectUrl) {
      return (
        <img
          src={objectUrl}
          alt="attachment"
          className="max-h-64 max-w-xs rounded-lg object-cover"
        />
      );
    }
    if (state === "error") {
      return (
        <span className="text-xs text-destructive">Image failed to load</span>
      );
    }
  }

  if (message.type === "video") {
    if (state === "loading") {
      return (
        <div className="h-40 w-56 rounded-lg bg-muted animate-pulse flex items-center justify-center">
          <Video className="h-6 w-6 text-muted-foreground" />
        </div>
      );
    }
    if (state === "ready" && objectUrl) {
      return (
        <video
          src={objectUrl}
          controls
          className="max-h-64 max-w-xs rounded-lg"
        />
      );
    }
    if (state === "error") {
      return (
        <span className="text-xs text-destructive">Video failed to load</span>
      );
    }
  }

  // File type
  return (
    <button
      onClick={triggerDownload}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-accent transition-colors text-sm"
    >
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="truncate max-w-[180px]">
        {state === "loading" ? "Downloading…" : (message.mediaKey ?? "File")}
      </span>
      <Download className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}
