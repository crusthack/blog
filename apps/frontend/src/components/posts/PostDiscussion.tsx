"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MarkdownContent } from "./MarkdownContent";
import { readProblem } from "@/lib/contracts";

type Comment = { id: string; parentId: string | null; authorId: string; authorName: string; content: string; revision: number; isDeleted: boolean; createdAtUtc: string };
type Discussion = { items: Comment[]; total: number; bookmarked: boolean };
export function PostDiscussion({ postNumber }: { postNumber: number }) {
  const { user } = useAuth();
  const [data, setData] = useState<Discussion | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [reply, setReply] = useState<Comment | null>(null);
  const [edit, setEdit] = useState<Comment | null>(null);
  const [report, setReport] = useState<{ commentId?: string } | null>(null);
  const [reason, setReason] = useState("");
  const [remove, setRemove] = useState<Comment | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const endpoint = `/api/posts/${postNumber}/community`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${endpoint}?page=${page}`, { credentials: "include", cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await readProblem(response, "댓글을 불러오지 못했습니다."));
      const result = await response.json(); if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [endpoint, page, reload]);
  useEffect(() => { if (report || remove) dialog.current?.showModal(); else dialog.current?.close(); }, [report, remove]);
  async function mutate(path: string, method: string, body?: object) {
    const response = await fetch(`${endpoint}${path}`, { method, credentials: "include", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(await readProblem(response, "처리하지 못했습니다."));
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { await action(); setReload(value => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "요청 실패"); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await mutate(edit ? `/comments/${edit.id}` : "/comments", edit ? "PUT" : "POST", { content, parentId: reply?.id, expectedRevision: edit?.revision });
      setContent(""); setEdit(null); setReply(null); setPreview(false); setMessage(edit ? "댓글을 수정했습니다." : "댓글을 등록했습니다.");
      if (!edit) setPage(Math.floor((data?.total ?? 0) / 30) + 1);
    });
  }
  return <section className="community-discussion" aria-label="댓글과 참여">
    <header className="board-heading"><h2>댓글 {data?.total ?? 0}</h2><div className="board-heading-actions">
      {user ? <><button type="button" disabled={busy || !data} aria-pressed={data?.bookmarked ?? false} onClick={() => void run(async () => { await mutate("/bookmark", data?.bookmarked ? "DELETE" : "PUT"); })}>{data?.bookmarked ? "북마크 해제" : "북마크"}</button><button type="button" onClick={() => { setReport({}); setReason(""); setError(""); }}>게시글 신고</button></> : <Link href="/login">로그인하여 참여</Link>}
    </div></header>
    {error && <p className="board-notice board-error" role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>다시 조회</button></p>}
    {message && <p className="board-notice" role="status">{message}</p>}
    {!data && !error && <p role="status">댓글을 불러오고 있습니다.</p>}
    {data?.items.map(comment => <article key={comment.id} id={`comment-${comment.id}`} className={`community-comment${comment.parentId ? " community-reply" : ""}`}>
      <header><strong>{comment.authorName}</strong> <time dateTime={comment.createdAtUtc}>{new Date(comment.createdAtUtc).toLocaleString("ko-KR")}</time>{comment.parentId && <span> · 답글</span>}</header>
      {comment.isDeleted ? <p className="my-4 text-gray-500">삭제된 댓글입니다.</p> : <><MarkdownContent headingIds={false} source={comment.content} />
        {user && <div className="community-actions">
          {!comment.parentId && <button type="button" onClick={() => { setReply(comment); setEdit(null); setContent(""); }}>답글</button>}
          {user.id === comment.authorId && <button type="button" onClick={() => { setEdit(comment); setReply(null); setContent(comment.content); }}>수정</button>}
          {(user.id === comment.authorId || user.isOwner) && <button type="button" onClick={() => { setRemove(comment); setError(""); }}>삭제</button>}
          <button type="button" onClick={() => { setReport({ commentId: comment.id }); setReason(""); setError(""); }}>신고</button>
        </div>}
      </>}
    </article>)}
    {data && !data.items.length && <p className="my-5">첫 댓글을 남겨 주세요.</p>}
    {data && data.total > 30 && <nav className="board-pagination" aria-label="댓글 페이지"><button disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)}>이전</button><span>{page} / {Math.ceil(data.total / 30)}</span><button disabled={page * 30 >= data.total || busy} onClick={() => setPage(value => value + 1)}>다음</button></nav>}
    {user && <form onSubmit={submit} className="community-form">
      <label htmlFor="comment-content">{edit ? "댓글 수정" : reply ? `${reply.authorName}님에게 답글` : "마크다운 댓글"}</label>
      {(reply || edit) && <button type="button" onClick={() => { setReply(null); setEdit(null); setContent(""); }}>취소</button>}
      <textarea disabled={busy} id="comment-content" value={content} maxLength={10000} required rows={5} onChange={event => setContent(event.target.value)} placeholder="마크다운으로 의견을 남겨 주세요." />
      <div className="community-actions"><button type="button" aria-pressed={preview} onClick={() => setPreview(value => !value)}>미리보기</button><button type="submit" disabled={busy || !content.trim()}>{busy ? "처리 중…" : edit ? "수정 저장" : "댓글 등록"}</button><span>{content.length.toLocaleString()} / 10,000</span></div>
      {preview && <div className="community-preview"><MarkdownContent headingIds={false} source={content} /></div>}
    </form>}
    <dialog ref={dialog} className="editor-leave-dialog" aria-labelledby="community-dialog-title" onCancel={() => { setReport(null); setRemove(null); }}>
      <h2 id="community-dialog-title">{report ? "신고 접수" : "댓글을 삭제할까요?"}</h2>
      {report ? <><label htmlFor="report-reason">신고 사유 (5자 이상)</label><textarea id="report-reason" value={reason} maxLength={1000} rows={4} onChange={event => setReason(event.target.value)} /></> : <p>댓글 내용은 삭제되며 답글은 유지됩니다.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => { setReport(null); setRemove(null); }}>취소</button>
      <button type="button" disabled={busy || Boolean(report && reason.trim().length < 5)} onClick={() => void run(async () => {
        if (report) { await mutate("/reports", "POST", { ...report, reason }); setMessage("신고를 접수했습니다."); }
        else if (remove) await mutate(`/comments/${remove.id}`, "DELETE");
        setReport(null); setRemove(null);
      })}>{report ? "신고 제출" : "삭제"}</button>
    </dialog>
  </section>;
}
