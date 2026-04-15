import { useState, useEffect } from "react";
import { importPublicKey, deriveSharedKey } from "@two/crypto";
import { apiFetch } from "../lib/api";
import { getCachedSharedKey, setCachedSharedKey } from "../lib/sharedKeyCache";
import { getPrivateKey } from "../lib/keystore";
import { useAppSelector } from "./store";

/**
 * Derives (or returns from cache) the AES-GCM shared key for a conversation
 * with `otherUserId`. Returns null while the key is being derived.
 */
export function useSharedKey(otherUserId: string | null): CryptoKey | null {
  const token = useAppSelector((s) => s.auth.token);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(() =>
    otherUserId ? (getCachedSharedKey(otherUserId) ?? null) : null,
  );

  useEffect(() => {
    if (!otherUserId || !token) return;

    const cached = getCachedSharedKey(otherUserId);
    if (cached) {
      setSharedKey(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      // Fetch other user's public key
      const res = await apiFetch(`/api/users/${otherUserId}/public-key`, token);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { publicKey: string | null };
      if (!data.publicKey || cancelled) return;

      const theirPublic = await importPublicKey(data.publicKey);
      const myPrivate = await getPrivateKey();
      if (!myPrivate || cancelled) return;

      const key = await deriveSharedKey(myPrivate, theirPublic);
      if (!cancelled) {
        setCachedSharedKey(otherUserId, key);
        setSharedKey(key);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [otherUserId, token]);

  return sharedKey;
}
