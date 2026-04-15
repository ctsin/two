import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import type { Env } from "../index";

const mediaRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

mediaRoute.use("*", authMiddleware);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ── POST /api/media/upload ────────────────────────────────────────────────────
// Body: multipart/form-data  { file: <encrypted binary>, iv: <base64> }
// Client encrypts the file with encryptFile() before sending.
// Returns: { media_key: string }
mediaRoute.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  const iv = body["iv"];

  if (!(file instanceof File)) {
    return c.json({ error: "file is required" }, 400);
  }
  if (typeof iv !== "string" || !iv) {
    return c.json({ error: "iv is required" }, 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: "File exceeds 100 MB limit" }, 413);
  }

  const key = crypto.randomUUID();
  const buffer = await file.arrayBuffer();

  await c.env.MEDIA.put(key, buffer, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: {
      uploadedBy: c.get("userId"),
      originalType: file.type || "application/octet-stream",
      iv,
    },
  });

  return c.json({ media_key: key }, 201);
});

// ── POST /api/media/presign ──────────────────────────────────────────────────
// Generates a presigned R2 PUT URL for direct large-file uploads (near 100 MB).
// Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY bindings.
// Body: { size: number, iv: string }
// Returns: { media_key: string, upload_url: string, expires_in: number }
const presignSchema = z.object({
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  iv: z.string().min(1),
});

mediaRoute.post("/presign", zValidator("json", presignSchema), async (c) => {
  if (
    !c.env.R2_ACCOUNT_ID ||
    !c.env.R2_ACCESS_KEY_ID ||
    !c.env.R2_SECRET_ACCESS_KEY
  ) {
    return c.json({ error: "Presigned uploads not configured" }, 503);
  }

  const { iv } = c.req.valid("json");
  const key = crypto.randomUUID();
  const expiresIn = 3600; // 1 hour

  const uploadUrl = await signR2PutUrl({
    accountId: c.env.R2_ACCOUNT_ID,
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    bucket: "two-media",
    key,
    expiresIn,
    uploadedBy: c.get("userId"),
    iv,
  });

  return c.json({
    media_key: key,
    upload_url: uploadUrl,
    expires_in: expiresIn,
  });
});

// ── GET /api/media/:key ───────────────────────────────────────────────────────
// Returns the encrypted binary blob. IV is in the X-Encrypted-IV response header.
// Client decrypts with decryptFile(buffer, ivHeader, sharedKey).
mediaRoute.get("/:key", async (c) => {
  const key = c.req.param("key");

  // Basic key format check to avoid unexpected object paths
  if (!/^[0-9a-f-]{36}$/.test(key)) {
    return c.json({ error: "Invalid key" }, 400);
  }

  const object = await c.env.MEDIA.get(key);
  if (!object) {
    return c.json({ error: "Not found" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Length", object.size.toString());
  headers.set("Cache-Control", "private, max-age=86400");

  const iv = object.customMetadata?.iv;
  if (iv) {
    headers.set("X-Encrypted-IV", iv);
  }

  return new Response(object.body, { headers });
});

export default mediaRoute;

// ── AWS Signature V4 helpers for R2 presigned PUT ────────────────────────────
// Uses Web Crypto (available in both browser and Workers).

interface SignR2PutUrlOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  expiresIn: number;
  uploadedBy: string;
  iv: string;
}

async function signR2PutUrl(opts: SignR2PutUrlOptions): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey, bucket, key, expiresIn } =
    opts;

  const host = `${bucket}.${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";

  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timestamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const signedHeaders = "host";

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": timestamp,
    "X-Amz-Expires": expiresIn.toString(),
    "X-Amz-Meta-Iv": opts.iv,
    "X-Amz-Meta-Uploaded-By": opts.uploadedBy,
    "X-Amz-SignedHeaders": signedHeaders,
  });

  // Sort is required for canonical query string
  queryParams.sort();

  const canonicalUri = `/${encodeURIComponent(key)}`;
  const canonicalQueryString = queryParams.toString();
  const canonicalHeaders = `host:${host}\n`;

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmacSha256Raw(
    new TextEncoder().encode(`AWS4${secretAccessKey}`),
    datestamp,
  );
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  const kSigning = await hmacSha256Raw(kService, "aws4_request");

  const signature = await hmacSha256Hex(kSigning, stringToSign);
  queryParams.set("X-Amz-Signature", signature);
  queryParams.sort();

  return `https://${host}/${key}?${queryParams.toString()}`;
}

async function sha256hex(message: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  return hexEncode(buf);
}

async function hmacSha256Raw(
  key: ArrayBuffer | Uint8Array,
  message: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );
}

async function hmacSha256Hex(
  key: ArrayBuffer | Uint8Array,
  message: string,
): Promise<string> {
  return hexEncode(await hmacSha256Raw(key, message));
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
