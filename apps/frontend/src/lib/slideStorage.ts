import type { Workspace } from "./slides";

export type StoredWorkspace = { key: string; revision: number; savedAt: string; workspace: Workspace };
export const MAX_WORKSPACE_BYTES = 5 * 1024 * 1024;

export async function workspaceKey(postNumber: number, userId: string | null, source: string, mode: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return JSON.stringify(["v1", userId ?? "visitor", postNumber, mode, fingerprint]);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("blog-slide-workspaces", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspaces", { keyPath: "key" });
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("다른 탭을 닫고 다시 시도해 주세요."));
  });
}

export async function loadWorkspace(key: string): Promise<StoredWorkspace | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("workspaces", "readonly");
      const request = transaction.objectStore("workspaces").get(key);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function saveWorkspace(key: string, workspace: Workspace, revision: number): Promise<StoredWorkspace> {
  if (new Blob([JSON.stringify(workspace)]).size > MAX_WORKSPACE_BYTES) throw new Error("작업 공간이 5MB를 넘었습니다. 불필요한 메모나 그림을 줄여 주세요.");
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("workspaces", "readwrite");
      const store = transaction.objectStore("workspaces");
      const request = store.get(key);
      let conflict = false;
      const stored = { key, workspace, revision: revision + 1, savedAt: new Date().toISOString() };
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== revision) { conflict = true; transaction.abort(); return; }
        store.put(stored);
      };
      transaction.oncomplete = () => resolve(stored);
      transaction.onabort = () => reject(conflict ? new Error("다른 탭에서 저장한 작업이 있습니다. 현재 탭을 닫기 전에 필요한 메모를 옮긴 뒤 다시 열어 주세요.") : transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
