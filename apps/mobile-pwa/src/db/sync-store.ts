import { openDB, type IDBPDatabase } from "idb";

export type SyncItemType = "create_resident" | "create_stand" | "link_occupancy" | "submit_application";
export type SyncItemStatus = "pending" | "syncing" | "failed";

export interface SyncItem {
  id: string;
  type: SyncItemType;
  payload: unknown;
  status: SyncItemStatus;
  retries: number;
  createdAt: number;
  errorMessage?: string;
}

const DB_NAME = "l2l-field";
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("sync_queue")) {
        const store = db.createObjectStore("sync_queue", { keyPath: "id" });
        store.createIndex("status", "status");
      }
    },
  });
  return _db;
}

export async function enqueue(
  type: SyncItemType,
  payload: unknown,
): Promise<SyncItem> {
  const db = await getDb();
  const item: SyncItem = {
    id: crypto.randomUUID(),
    type,
    payload,
    status: "pending",
    retries: 0,
    createdAt: Date.now(),
  };
  await db.put("sync_queue", item);
  return item;
}

export async function getPendingItems(): Promise<SyncItem[]> {
  const db = await getDb();
  return db.getAllFromIndex("sync_queue", "status", "pending");
}

export async function updateItem(item: SyncItem): Promise<void> {
  const db = await getDb();
  await db.put("sync_queue", item);
}

export async function removeItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("sync_queue", id);
}

export async function countPending(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("sync_queue", "status", "pending");
}
