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
