"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { readProblem } from "@/lib/contracts";

type Entry = { id: string; mode: string; savedAtUtc: string; revision: number; title?: string; postNumber?: number };
export default function WorkspaceManagement() {
  const { user, isLoading } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void fetch("/api/me/slide-workspaces", { cache: "no-store", credentials: "include", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await readProblem(response, "저장 내역을 불러오지 못했습니다."));
      const data = await response.json(); if (!controller.signal.aborted) setEntries(data);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [user]);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);
  async function remove() {
    if (!pending || busy) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/me/slide-workspaces/${pending.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await readProblem(response, "삭제하지 못했습니다."));
      setEntries(items => items.filter(item => item.id !== pending.id)); setPending(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "삭제 실패"); } finally { setBusy(false); }
  }
  if (isLoading) return <p className="p-8">로그인 확인 중…</p>;
  if (!user) return <p className="p-8"><Link href="/login">로그인</Link> 후 서버 저장 내역을 관리할 수 있습니다.</p>;
  return <main className="board-management"><h1 className="text-3xl font-bold">내 슬라이드 서버 저장</h1><p className="my-4">내 계정에 저장한 필기만 표시합니다. 삭제해도 원문과 브라우저에 저장한 필기는 유지됩니다.</p>
    {error && <p role="alert">{error}</p>}<div className="board-table-wrap"><table className="board-table"><thead><tr><th>글</th><th>분할</th><th>저장일</th><th>관리</th></tr></thead><tbody>
      {entries.map(entry => <tr key={entry.id}><td>{entry.title ?? "열람할 수 없는 글"}{entry.postNumber ? ` (#${entry.postNumber})` : ""}</td><td>{entry.mode === "auto" ? "자동" : "수동"}</td><td>{new Date(entry.savedAtUtc).toLocaleString("ko-KR")}</td><td><button type="button" onClick={() => setPending(entry)}>서버 필기 삭제</button></td></tr>)}
      {!entries.length && <tr><td colSpan={4}>서버 저장 내역이 없습니다.</td></tr>}</tbody></table></div>
    <dialog ref={dialog} className="editor-leave-dialog" aria-labelledby="workspace-delete-title" onCancel={() => setPending(null)}><h2 id="workspace-delete-title">서버에 저장한 필기를 삭제할까요?</h2><p>서버 필기는 복구할 수 없습니다.</p>{error && <p role="alert">{error}</p>}<button type="button" disabled={busy} onClick={() => setPending(null)}>취소</button><button type="button" disabled={busy} onClick={() => void remove()}>삭제</button></dialog>
  </main>;
}
