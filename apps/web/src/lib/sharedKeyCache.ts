/** In-memory cache of derived AES-GCM shared keys, keyed by the other user's ID. */
const cache = new Map<string, CryptoKey>();

export function getCachedSharedKey(otherUserId: string): CryptoKey | undefined {
  return cache.get(otherUserId);
}

export function setCachedSharedKey(otherUserId: string, key: CryptoKey): void {
  cache.set(otherUserId, key);
}

export function clearSharedKeyCache(): void {
  cache.clear();
}
