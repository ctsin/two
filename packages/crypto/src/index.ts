// E2E encryption using Web Crypto API (available in browser and Cloudflare Workers)
// Key exchange: X25519 ECDH
// Encryption: AES-256-GCM

const subtle = globalThis.crypto.subtle;

// ── Key Generation ──────────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const raw = await subtle.exportKey("spki", publicKey);
  return bufferToBase64(raw);
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToBuffer(base64);
  return subtle.importKey(
    "spki",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const raw = await subtle.exportKey("pkcs8", privateKey);
  return bufferToBase64(raw);
}

export async function importPrivateKey(base64: string): Promise<CryptoKey> {
  const raw = base64ToBuffer(base64);
  return subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
}

// ── Shared Secret Derivation ─────────────────────────────────────────────────

export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

export interface EncryptResult {
  ciphertext: string; // base64
  iv: string; // base64
}

export async function encrypt(
  plaintext: string,
  sharedKey: CryptoKey,
): Promise<EncryptResult> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded,
  );
  return {
    ciphertext: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv),
  };
}

export async function decrypt(
  ciphertext: string,
  iv: string,
  sharedKey: CryptoKey,
): Promise<string> {
  const cipherBuffer = base64ToBuffer(ciphertext);
  const ivBuffer = base64ToBuffer(iv);
  const decrypted = await subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    sharedKey,
    cipherBuffer,
  );
  return new TextDecoder().decode(decrypted);
}

// ── File / Binary Encrypt / Decrypt ──────────────────────────────────────────

export interface EncryptedFile {
  data: ArrayBuffer; // encrypted bytes
  iv: string; // base64
}

export async function encryptFile(
  file: ArrayBuffer,
  sharedKey: CryptoKey,
): Promise<EncryptedFile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, file);
  return { data, iv: bufferToBase64(iv) };
}

export async function decryptFile(
  encryptedData: ArrayBuffer,
  iv: string,
  sharedKey: CryptoKey,
): Promise<ArrayBuffer> {
  const ivBuffer = base64ToBuffer(iv);
  return subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    sharedKey,
    encryptedData,
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

// ── Thumbnail Generation (Browser-only) ──────────────────────────────────────
// Generates a compressed JPEG thumbnail from an image or video File and
// returns the encrypted bytes ready to upload alongside the main file.

const THUMBNAIL_MAX_PX = 320;
const THUMBNAIL_QUALITY = 0.75;

export interface EncryptedThumbnail {
  data: ArrayBuffer; // encrypted thumbnail bytes
  iv: string; // base64-encoded IV
  mimeType: "image/jpeg";
}

/**
 * Generate an encrypted thumbnail for an image or video file.
 * Returns null for unsupported MIME types.
 * Browser-only — requires OffscreenCanvas / createImageBitmap / HTMLVideoElement.
 */
export async function generateEncryptedThumbnail(
  file: File,
  sharedKey: CryptoKey,
): Promise<EncryptedThumbnail | null> {
  let bitmap: ImageBitmap;

  if (file.type.startsWith("image/")) {
    bitmap = await createImageBitmap(file);
  } else if (file.type.startsWith("video/")) {
    bitmap = await captureVideoFrame(file);
  } else {
    return null;
  }

  const { width, height } = scaleDimensions(
    bitmap.width,
    bitmap.height,
    THUMBNAIL_MAX_PX,
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: THUMBNAIL_QUALITY,
  });
  const rawBuffer = await blob.arrayBuffer();

  const { data, iv } = await encryptFile(rawBuffer, sharedKey);
  return { data, iv, mimeType: "image/jpeg" };
}

function scaleDimensions(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function captureVideoFrame(file: File): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.addEventListener("loadeddata", async () => {
      // Seek to 1s or mid-point, whichever is earlier, for a representative frame
      video.currentTime = Math.min(1, video.duration / 2);
    });

    video.addEventListener("seeked", async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const bitmap = await createImageBitmap(video);
        resolve(bitmap);
      } catch (err) {
        reject(err);
      }
    });

    video.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load video for thumbnail"));
    });
  });
}
