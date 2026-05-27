import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  enqueue,
  getPendingItems,
  updateItem,
  removeItem,
  countPending,
  type SyncItemType,
} from "../db/sync-store.js";
import { syncItem } from "../api/client.js";
import { useAuth } from "./auth.js";

interface SyncContextValue {
  pendingCount: number;
  enqueueItem: (type: SyncItemType, payload: unknown) => Promise<void>;
  syncNow: () => Promise<void>;
}

const SyncCtx = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    const n = await countPending();
    setPendingCount(n);
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  const enqueueItem = useCallback(
    async (type: SyncItemType, payload: unknown) => {
      await enqueue(type, payload);
      await refreshCount();
    },
    [refreshCount],
  );

  const syncNow = useCallback(async () => {
    if (!auth) return;
    const items = await getPendingItems();
    for (const item of items) {
      const updated = { ...item, status: "syncing" as const };
      await updateItem(updated);
      try {
        await syncItem(item.type, item.payload, auth.accessToken);
        await removeItem(item.id);
      } catch (err) {
        const failed = {
          ...updated,
          status: "failed" as const,
          retries: item.retries + 1,
          errorMessage: err instanceof Error ? err.message : String(err),
          // Retry: put back as pending if fewer than 5 retries
          ...(item.retries < 5 && { status: "pending" as const }),
        };
        await updateItem(failed);
      }
    }
    await refreshCount();
  }, [auth, refreshCount]);

  // Auto-sync when online and authenticated
  useEffect(() => {
    if (!auth) return;
    const handler = () => void syncNow();
    window.addEventListener("online", handler);
    if (navigator.onLine) void syncNow();
    return () => window.removeEventListener("online", handler);
  }, [auth, syncNow]);

  return (
    <SyncCtx.Provider value={{ pendingCount, enqueueItem, syncNow }}>
      {children}
    </SyncCtx.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncCtx);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
