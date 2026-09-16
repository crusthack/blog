"use client";
import { categoriesUpdatedEvent } from "@/lib/uiEvents";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { readProblem } from "@/lib/contracts";
import { postPath } from "@/lib/postPaths";
type Row = { id: string; userName?: string; isSuspended?: boolean; isOwner?: boolean; expiresAtUtc?: string; title?: string; postNumber?: number; categorySlug?: string; commentId?: string; content?: string; reason?: string; resolution?: string; action?: string; target?: string; actorId?: string; createdAtUtc: string };
const tabs = { reports: "신고 관리", members: "회원 관리", audit: "감사 기록", invites: "초대 관리" } as const;
export type CommunityTab = keyof typeof tabs;
export default function CommunityManagement() {
  const { user, isLoading } = useAuth(); const [tab, setTab] = useState<CommunityTab>("reports"); const [page, setPage] = useState(1); const [resolved, setResolved] = useState(false);
  if (isLoading) return <p className="p-8">로그인 확인 중…</p>;
  if (!user?.isOwner) return <p className="p-8">운영자만 접근할 수 있습니다. <Link href="/login">로그인</Link></p>;
  return <main className="community-admin"><h1 className="text-3xl font-bold">커뮤니티 운영</h1><nav aria-label="커뮤니티 운영 메뉴">{Object.entries(tabs).map(([key, title]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key as CommunityTab); setPage(1); }}>{title}</button>)}<Link href="/posts/manage">게시글 관리</Link></nav>
    {tab === "reports" && <label><input type="checkbox" checked={resolved} onChange={event => { setResolved(event.target.checked); setPage(1); }} /> 처리한 신고 보기</label>}
    <CommunityPanel key={`${tab}:${page}:${resolved}`} tab={tab} page={page} resolved={resolved} onPage={setPage} />
  </main>;
}
export function CommunityPanel({ tab, page, resolved, onPage }: { tab: CommunityTab; page: number; resolved: boolean; onPage: (page: number) => void }) {
  const [rows, setRows] = useState<Row[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [reload, setReload] = useState(0);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [invite, setInvite] = useState<{ code: string; expiresAtUtc: string } | null>(null);
  const [pending, setPending] = useState<Row | null>(null); const [resolution, setResolution] = useState(""); const [hide, setHide] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/community/${tab}?page=${page}&resolved=${resolved}`, { credentials: "include", cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await readProblem(response, "운영 정보를 불러오지 못했습니다."));
      const result = await response.json(); if (!controller.signal.aborted) { setRows(result.items); setTotal(result.total); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, page, resolved, reload]);
  useEffect(() => { if (pending) dialog.current?.showModal(); else dialog.current?.close(); }, [pending]);
  async function mutate(path: string, body?: object, method?: string) {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/community/${path}`, { method: method ?? (body ? "PUT" : "POST"), credentials: "include", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) throw new Error(await readProblem(response, "처리하지 못했습니다."));
      if (path.startsWith("reports/")) window.dispatchEvent(new Event(categoriesUpdatedEvent));
      if (path === "invites") { setInvite(await response.json()); setReload(value => value + 1); } else { setPending(null); setMessage("처리했습니다."); setReload(value => value + 1); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "요청 실패"); } finally { setBusy(false); }
  }
  return <>
    {tab === "invites" && <div className="my-5"><button disabled={busy} onClick={() => void mutate("invites")}>일회용 초대 코드 발급</button>{invite && <p className="board-notice"><code>{invite.code}</code><br />만료: {new Date(invite.expiresAtUtc).toLocaleString("ko-KR")} · 코드는 이 화면에서만 확인할 수 있습니다.</p>}</div>}
    {error && <p role="alert" className="board-notice board-error">{error} <button onClick={() => { setError(""); setReload(value => value + 1); }}>다시 조회</button></p>}{message && <p role="status">{message}</p>}
    {loading ? <p role="status">불러오는 중…</p> : <div className="board-table-wrap"><table className="board-table"><caption className="sr-only">{tabs[tab]}</caption><thead><tr><th>{tab === "invites" ? "초대 ID" : tab === "members" ? "사용자명" : tab === "reports" ? "신고 대상" : "작업"}</th><th>상세</th><th>일시</th><th>관리</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td>{tab === "invites" ? row.id : tab === "members" ? row.userName : tab === "audit" ? row.action : <Link href={`${postPath({ postNumber: row.postNumber!, categorySlug: row.categorySlug ?? null })}${row.commentId ? `#comment-${row.commentId}` : ""}`}>{row.title}{row.commentId ? " · 댓글" : " · 게시글"}</Link>}</td>
        <td className="max-w-lg whitespace-pre-wrap break-words">{tab === "invites" ? "미사용 · 만료 전 회수 가능" : tab === "members" ? row.isOwner ? "운영자" : row.isSuspended ? "정지" : "활동 중" : tab === "audit" ? `${row.target}\n실행자: ${row.actorId}` : <>{row.reason}{row.content && <details><summary>신고 댓글 확인</summary>{row.content}</details>}{row.resolution && <p>처리: {row.resolution}</p>}</>}</td><td>{new Date(row.expiresAtUtc ?? row.createdAtUtc).toLocaleString("ko-KR")}</td><td>{tab !== "audit" && !row.isOwner && !(tab === "reports" && resolved) && <button disabled={busy} onClick={() => { setPending(row); setResolution(""); setHide(false); setError(""); }}>{tab === "invites" ? "회수" : tab === "members" ? row.isOwner ? "운영자" : row.isSuspended ? "정지 해제" : "정지" : "처리"}</button>}</td></tr>)}
      {!rows.length && <tr><td colSpan={4}>내역이 없습니다.</td></tr>}
    </tbody></table></div>}
    <nav className="board-pagination" aria-label="운영 목록 페이지"><button disabled={page <= 1} onClick={() => onPage(page - 1)}>이전</button><span>{page} / {Math.max(1, Math.ceil(total / 30))} · {total}개</span><button disabled={page * 30 >= total} onClick={() => onPage(page + 1)}>다음</button></nav>
    <dialog ref={dialog} className="editor-leave-dialog" aria-labelledby={dialogTitleId} onCancel={() => setPending(null)}><h2 id={dialogTitleId}>{tab === "invites" ? "초대 코드를 회수할까요?" : tab === "members" ? `${pending?.userName} 계정 ${pending?.isSuspended ? "정지 해제" : "정지"}` : "신고 처리"}</h2>
      {tab === "reports" ? <><label>처리 사유<textarea rows={4} maxLength={1000} value={resolution} onChange={event => setResolution(event.target.value)} /></label><label><input type="checkbox" checked={hide} onChange={event => setHide(event.target.checked)} /> {pending?.commentId ? "댓글 내용 삭제" : "게시글을 휴지통으로 이동"}</label></> : <p>{tab === "invites" ? "회수한 코드로는 가입할 수 없습니다." : "정지된 계정의 로그인과 기존 로그인 세션 요청을 차단합니다."}</p>}
      {error && <p role="alert">{error}</p>}<button disabled={busy} onClick={() => setPending(null)}>취소</button><button disabled={busy || (tab === "reports" && resolution.trim().length < 3)} onClick={() => { if (pending && tab === "invites") { void mutate(`invites/${pending.id}`, undefined, "DELETE"); return; } if (pending) void mutate(tab === "reports" ? `reports/${pending.id}` : `members/${pending.id}/suspension`, tab === "reports" ? { resolution, hideContent: hide } : { suspended: !pending.isSuspended }); }}>확인</button>
    </dialog>
  </>;
}
