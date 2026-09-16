"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { readProblem, visibilityLabels, type PostVisibility } from "@/lib/contracts";

type TrashPost = { postNumber: number; title: string; visibility: PostVisibility; deletedAtUtc: string; assetCount: number };
type AuditAsset = { id: string; storageFileName: string; size: number; postNumber: number; inTrash: boolean };
type Audit = { checkedAtUtc: string; fileCount: number; totalBytes: number; registeredCount: number; missing: AuditAsset[]; sizeMismatches: AuditAsset[]; orphanCandidates: { name: string; size: number; modifiedAtUtc: string }[]; recentUnregisteredCount: number };

export function OwnerMaintenance({ tab }: { tab: "trash" | "storage" }) {
  const { user, isLoading } = useAuth();
  const [posts, setPosts] = useState<TrashPost[]>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<TrashPost | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!user?.isOwner) return;
    const controller = new AbortController();
    void fetch(tab === "trash" ? "/api/posts/trash" : "/api/admin/storage-audit", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await readProblem(response, "관리 정보를 불러오지 못했습니다."));
        const value = await response.json();
        if (controller.signal.aborted) return;
        if (tab === "trash") setPosts(value); else setAudit(value);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [user, tab, version]);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);

  async function action(post: TrashPost, permanent: boolean) {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/posts/${post.postNumber}/${permanent ? "permanent" : "restore"}`, { method: permanent ? "DELETE" : "POST", credentials: "include" });
      if (!response.ok) throw new Error(await readProblem(response, "처리하지 못했습니다."));
      setPosts(current => current.filter(item => item.postNumber !== post.postNumber));
      setPending(null); setConfirmation("");
      setMessage(permanent ? "글과 첨부 파일을 영구 삭제했습니다." : "비공개로 복원했습니다. 편집 화면에서 공개 범위를 설정할 수 있습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "요청 실패"); } finally { setBusy(false); }
  }
  if (isLoading) return <p className="p-8">로그인 상태 확인 중…</p>;
  if (!user?.isOwner) return <p className="p-8">Owner만 접근할 수 있습니다. <Link href="/login">로그인</Link></p>;
  return <main className="board-management">
    <h1 className="text-3xl font-bold">{tab === "trash" ? "게시글 휴지통" : "첨부 파일 점검"}</h1>
    <nav className="board-heading-actions my-5"><Link href="/posts/manage">게시글 관리</Link><Link href="/posts/trash">휴지통</Link><Link href="/storage">첨부 파일 점검</Link></nav>
    <p className="my-4">{tab === "trash" ? "휴지통의 글과 첨부 파일은 열람할 수 없습니다. 복원하면 비공개 상태로 돌아옵니다." : "DB 등록 정보와 실제 파일을 비교합니다. 점검은 파일을 변경하거나 삭제하지 않습니다. 최근 1시간 내의 미등록 파일은 업로드 진행 중일 수 있어 별도로 표시합니다."}</p>
    <button type="button" className="border p-2" onClick={() => { setError(""); setVersion(value => value + 1); }}>새로 점검</button>
    {error && <p role="alert" className="board-notice board-error">{error}</p>}{message && <p role="status" className="board-notice">{message}</p>}
    {tab === "trash" ? <div className="board-table-wrap"><table className="board-table"><caption className="sr-only">삭제한 글</caption>
      <thead><tr><th>번호</th><th>제목</th><th>이전 공개 범위</th><th>첨부</th><th>삭제일</th><th>관리</th></tr></thead>
      <tbody>{posts.map(post => <tr key={post.postNumber}><td>{post.postNumber}</td><td>{post.title}</td><td>{visibilityLabels[post.visibility]}</td><td>{post.assetCount}</td><td>{new Date(post.deletedAtUtc).toLocaleDateString("ko-KR")}</td><td>
        <button className="border p-2" type="button" disabled={busy} onClick={() => void action(post, false)}>복원</button>{" "}
        <button className="border p-2" type="button" disabled={busy} onClick={() => { setPending(post); setConfirmation(""); }}>영구 삭제</button>
      </td></tr>)}{!posts.length && <tr><td colSpan={6}>휴지통이 비어 있습니다.</td></tr>}</tbody></table></div>
      : audit && <>
        <p className="board-notice">실제 파일 {audit.fileCount}개 · DB 등록 {audit.registeredCount}개 · {(audit.totalBytes / 1024 / 1024).toFixed(1)}MB · 최근 미등록 {audit.recentUnregisteredCount}개</p>
        {[{ title: "누락된 파일", items: audit.missing }, { title: "크기가 다른 파일", items: audit.sizeMismatches }].map(group => <section key={group.title} className="my-6"><h2 className="font-bold">{group.title} ({group.items.length})</h2><ul>{group.items.map(item => <li key={item.id}>글 #{item.postNumber} {item.inTrash ? "(휴지통)" : ""} · {item.storageFileName}</li>)}</ul></section>)}
        <section><h2 className="font-bold">고아 파일 후보 ({audit.orphanCandidates.length})</h2><ul>{audit.orphanCandidates.map(file => <li key={file.name}>{file.name} · {file.size.toLocaleString()} bytes · {new Date(file.modifiedAtUtc).toLocaleString("ko-KR")}</li>)}</ul></section>
      </>}
    <dialog ref={dialog} className="editor-leave-dialog" aria-labelledby="purge-title" onCancel={() => setPending(null)}>
      <h2 id="purge-title">“{pending?.title}”을 영구 삭제할까요?</h2><p>본문, 첨부 파일, 서버 필기가 삭제되며 복원할 수 없습니다. 글 번호 {pending?.postNumber}를 입력해 주세요.</p>
      {error && <p role="alert">{error}</p>}
      <input aria-label="영구 삭제할 글 번호" className="border p-2" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      <div className="mt-4"><button type="button" disabled={busy} onClick={() => setPending(null)}>취소</button><button type="button" disabled={busy || confirmation !== String(pending?.postNumber)} onClick={() => { if (pending) void action(pending, true); }}>영구 삭제</button></div>
    </dialog>
  </main>;
}
