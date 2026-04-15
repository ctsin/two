/**
 * Keystore: persists the user's ECDH private key in IndexedDB.
 * The private key never leaves the device — it is stored as a non-extractable
 * CryptoKey so the browser engine won't let JS serialize it to the network.
 */
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "two-keystore";
const DB_VERSION = 1;
const STORE = "keys";
const PRIVATE_KEY_ID = "private-key";
const PUBLIC_KEY_ID = "public-key";

type KeystoreSchema = {
  keys: {
    key: string;
    value: CryptoKey;
  };
};

async function db(): Promise<IDBPDatabase<KeystoreSchema>> {
  return openDB<KeystoreSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    },
  });
}

/** Save both halves of a freshly-generated key pair. */
export async function saveKeyPair(pair: CryptoKeyPair): Promise<void> {
  const idb = await db();
  const tx = idb.transaction(STORE, "readwrite");
  await Promise.all([
    tx.store.put(pair.privateKey, PRIVATE_KEY_ID),
    tx.store.put(pair.publicKey, PUBLIC_KEY_ID),
    tx.done,
  ]);
}

/** Retrieve the stored private key, or null if not yet generated. */
export async function getPrivateKey(): Promise<CryptoKey | null> {
  const idb = await db();
  return (await idb.get(STORE, PRIVATE_KEY_ID)) ?? null;
}

/** Retrieve the stored public key, or null if not yet generated. */
export async function getPublicKey(): Promise<CryptoKey | null> {
  const idb = await db();
  return (await idb.get(STORE, PUBLIC_KEY_ID)) ?? null;
}

/** True if a key pair has already been generated for this device. */
export async function hasKeyPair(): Promise<boolean> {
  const key = await getPrivateKey();
  return key !== null;
}

/** Remove the stored key pair (e.g. on account reset). */
export async function clearKeyPair(): Promise<void> {
  const idb = await db();
  const tx = idb.transaction(STORE, "readwrite");
  await Promise.all([
    tx.store.delete(PRIVATE_KEY_ID),
    tx.store.delete(PUBLIC_KEY_ID),
    tx.done,
  ]);
}
