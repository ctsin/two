import { useState, useEffect } from "react";
import { importPublicKey, deriveSharedKey } from "@two/crypto";
import { apiFetch } from "../lib/api";
import { getCachedSharedKey, setCachedSharedKey } from "../lib/sharedKeyCache";
import { getPrivateKey } from "../lib/keystore";
import { useAppSelector } from "./store";

export interface SharedKeyResult {
  key: CryptoKey | null;
  /** True when the other user hasn't registered their public key yet. */
  keyMissing: boolean;
}

/**
 * Derives (or returns from cache) the AES-GCM shared key for a conversation
 * with `otherUserId`. Returns null while the key is being derived.
 */
export function useSharedKey(otherUserId: string | null): SharedKeyResult {
  const token = useAppSelector((s) => s.auth.token);
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(() =>
    otherUserId ? (getCachedSharedKey(otherUserId) ?? null) : null,
  );
  const [keyMissing, setKeyMissing] = useState(false);

  useEffect(() => {
    if (!otherUserId || !token) return;

    const cached = getCachedSharedKey(otherUserId);
    if (cached) {
      setSharedKey(cached);
      setKeyMissing(false);
      return;
    }

    let cancelled = false;
    (async () => {
      // Fetch other user's public key
      const res = await apiFetch(`/api/users/${otherUserId}/public-key`, token);
      if (cancelled) return;
      if (!res.ok) {
        if (res.status === 404) setKeyMissing(true);
        return;
      }
      const data = (await res.json()) as { publicKey: string | null };
      if (!data.publicKey || cancelled) {
        setKeyMissing(true);
        return;
      }

      const theirPublic = await importPublicKey(data.publicKey);
      const myPrivate = await getPrivateKey();
      if (!myPrivate || cancelled) return;

      const key = await deriveSharedKey(myPrivate, theirPublic);
      if (!cancelled) {
        setCachedSharedKey(otherUserId, key);
        setSharedKey(key);
        setKeyMissing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [otherUserId, token]);

  return { key: sharedKey, keyMissing };
}
