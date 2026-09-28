"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { readProblem } from "@/lib/contracts";
import type { HomeContent } from "@/lib/homeContent";

type Props = { page: "home" | "about"; defaults: HomeContent; content: HomeContent; revision: string; available: boolean; overridden: boolean };
export function SitePageDocument(props: Props) {
  const { user } = useAuth();
  const [content, setContent] = useState(props.content);
  const [draft, setDraft] = useState(props.content);
  const [revision, setRevision] = useState(props.revision);
  const [overridden, setOverridden] = useState(props.overridden);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(content);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href);
      if (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search) return;
      if (!window.confirm("저장하지 않은 수정이 있습니다. 페이지를 떠날까요?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", followLink, true); };
  }, [dirty]);

  async function save(reset = false) {
    if (reset && !window.confirm("웹에서 저장한 내용을 해제하고 코드 기본값으로 되돌릴까요?")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/site-pages/${props.page}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, content: reset ? null : draft }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "저장하지 못했습니다."));
      const saved = await response.json() as { revision: string; content: HomeContent | null };
      const next = saved.content ?? props.defaults;
      setRevision(saved.revision); setOverridden(saved.content !== null); setContent(next); setDraft(next); setEditing(false);
      document.title = next.title;
      setMessage(reset ? "코드 기본값으로 복원했습니다." : "저장했습니다. 공개 페이지에 바로 반영됩니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <article className="legacy-home-document post-view" data-view="post">
    {user?.isOwner && <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
      <button data-ui="action" className="border px-4 py-2" disabled={busy || !props.available} onClick={() => {
        if (editing && dirty && !window.confirm("저장하지 않은 수정을 취소할까요?")) return;
        setDraft(content); setEditing(!editing); setMessage("");
      }}>{editing ? "수정 취소" : "수정"}</button>
      {!props.available && <p role="alert">저장 서버에 연결하지 못했습니다. 기본 내용을 표시합니다. 수정하려면 새로고침해 주세요.</p>}
    </div>}
    {message && <p role="status" className="mb-4">{message}</p>}
    {editing && user?.isOwner ? <form className="mb-8 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="text-sm text-gray-500">저장하면 즉시 공개됩니다. 자동 저장하지 않습니다.</p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">제목<input data-ui="input" className="block w-full p-2" required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="block">설명<input data-ui="input" className="block w-full p-2" maxLength={500} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        <label className="block">날짜 (선택)<input data-ui="input" className="block p-2" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
        <label className="block">본문 (Markdown)<textarea data-ui="input" className="block min-h-80 w-full p-3 font-mono" maxLength={50000} value={draft.markdown} onChange={e => setDraft({ ...draft, markdown: e.target.value })} /></label>
        <div className="flex flex-wrap gap-3"><button data-ui="action" className="bg-emerald-700 px-4 py-2 text-white" type="submit">{busy ? "저장 중…" : "저장"}</button>
          <button data-ui="action" className="border px-4 py-2" type="button" onClick={() => { setDraft(props.defaults); setMessage("코드 기본값을 불러왔습니다. 저장 전까지 반영되지 않습니다."); }}>코드 기본값 불러오기</button>
          {overridden && <button data-ui="action" className="border px-4 py-2" type="button" onClick={() => void save(true)}>코드 기본값으로 복원</button>}</div>
      </fieldset>
      <h2 className="border-t pt-4 font-bold">미리보기</h2>
    </form> : null}
    <header className="legacy-document-header"><h1>{editing ? draft.title : content.title}</h1>
      {(editing ? draft.date : content.date) && <time dateTime={editing ? draft.date : content.date}>{editing ? draft.date : content.date}</time>}
      <p>{editing ? draft.description : content.description}</p></header>
    <div className="post-view-body"><div className="post-view-markdown"><MarkdownContent source={editing ? draft.markdown : content.markdown} /></div></div>
  </article>;
}
