/**
 * Message cache: persists decrypted messages to IndexedDB so the chat history
 * survives page refreshes without re-fetching + re-decrypting from the server.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { DecryptedMessage } from "../store/messagesSlice";

const DB_NAME = "two-messages";
const DB_VERSION = 1;
const STORE = "messages";

type MessageCacheSchema = {
  messages: {
    key: string; // `${conversationId}:${messageId}`
    value: DecryptedMessage;
    indexes: { conversationId: string };
  };
};

async function db(): Promise<IDBPDatabase<MessageCacheSchema>> {
  return openDB<MessageCacheSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE);
        store.createIndex("conversationId", "conversationId");
      }
    },
  });
}

export async function cacheMessages(msgs: DecryptedMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const idb = await db();
  const tx = idb.transaction(STORE, "readwrite");
  await Promise.all([
    ...msgs.map((m) => tx.store.put(m, `${m.conversationId}:${m.id}`)),
    tx.done,
  ]);
}

export async function getCachedMessages(
  conversationId: string,
): Promise<DecryptedMessage[]> {
  const idb = await db();
  const msgs = await idb.getAllFromIndex(
    STORE,
    "conversationId",
    conversationId,
  );
  return msgs.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export async function clearConversationCache(
  conversationId: string,
): Promise<void> {
  const idb = await db();
  const tx = idb.transaction(STORE, "readwrite");
  const keys = await tx.store
    .index("conversationId")
    .getAllKeys(conversationId);
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}
