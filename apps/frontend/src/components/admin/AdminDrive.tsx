"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { readProblem } from "@/lib/contracts";

const root = "00000000-0000-0000-0000-000000000000";
type Entry = { id: string; parentId: string; name: string; isFolder: boolean; size: number; revision: number; updatedAtUtc: string };
type Listing = { items: Entry[]; folders: Entry[]; total: number; usedBytes: number; capacityBytes: number; maxFileBytes: number };
type Editing = { entry?: Entry; name: string; parentId: string; restore: boolean };
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : value >= 1024 ? `${(value / 1024).toFixed(1)} KB` : `${value} B`;

export function AdminDrive() {
  const [folder, setFolder] = useState(root); const [trash, setTrash] = useState(false);
  const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [data, setData] = useState<Listing | null>(null); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0); const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null); const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/drive?${new URLSearchParams({ parentId: folder, trash: String(trash), query: search, page: String(page) })}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(await readProblem(response, "파일 목록을 불러오지 못했습니다.")); return response.json() as Promise<Listing>; })
      .then(result => { if (!controller.signal.aborted) { setData(result); if (page > Math.max(1, Math.ceil(result.total / 50))) setPage(Math.max(1, Math.ceil(result.total / 50))); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [folder, trash, search, page, refresh]);
  useEffect(() => { if (deleting) dialog.current?.showModal(); else dialog.current?.close(); }, [deleting]);
  function reload() { setLoading(true); setRefresh(value => value + 1); }
  function navigate(id: string, deleted = false) { setFolder(id); setTrash(deleted); setPage(1); setQuery(""); setSearch(""); setEditing(null); setData(null); setError(""); setLoading(true); }
  function folderPath(id: string) {
    const names: string[] = []; const seen = new Set<string>();
    while (id !== root && !seen.has(id)) { seen.add(id); const item = data?.folders.find(entry => entry.id === id); if (!item) break; names.unshift(item.name); id = item.parentId; }
    return "/" + names.join("/");
  }
  const parents: Entry[] = []; let ancestor = folder;
  while (ancestor !== root && !parents.some(item => item.id === ancestor)) { const item = data?.folders.find(entry => entry.id === ancestor); if (!item) break; parents.unshift(item); ancestor = item.parentId; }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(editing.entry ? `/api/admin/drive/${editing.entry.id}${editing.restore ? "/restore" : ""}` : "/api/admin/drive/folders", {
        method: editing.entry && !editing.restore ? "PUT" : "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, parentId: editing.parentId, expectedRevision: editing.entry?.revision ?? 0 }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "저장하지 못했습니다."));
      setEditing(null); setMessage("저장했습니다."); reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장 실패"); reload(); }
    finally { setBusy(false); }
  }
  async function uploadFiles(files: File[]) {
    if (!files.length || busy) return; setBusy(true); setError(""); let done = 0;
    try {
      for (const file of files) {
        if (file.size > (data?.maxFileBytes ?? 25 * 1024 ** 2)) throw new Error(`${file.name}: 파일은 25MB 이하여야 합니다.`);
        setMessage(`${done + 1} / ${files.length} 업로드 중 · ${file.name}`);
        const body = new FormData(); body.append("file", file); body.append("parentId", folder);
        const request = { method: "POST", credentials: "include" as const, body };
        let response = await fetch("/api/admin/drive/files", request);
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const seconds = retryAfter === null ? 60 : Number(retryAfter);
          if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 60) {
            await response.body?.cancel();
            setMessage("요청 한도에 도달해 잠시 대기한 뒤 업로드를 계속합니다.");
            await new Promise(resolve => window.setTimeout(resolve, Math.max(1, seconds) * 1000));
            response = await fetch("/api/admin/drive/files", request);
          }
        }
        if (!response.ok) throw new Error(`${file.name}: ${await readProblem(response, "업로드 실패")}`);
        done++;
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "업로드 실패"); }
    finally { setMessage(`${done}개 파일을 업로드했습니다.`); setBusy(false); if (upload.current) upload.current.value = ""; reload(); }
  }
  async function remove() {
    if (!deleting || busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/drive/${deleting.id}?revision=${deleting.revision}&permanent=${trash}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await readProblem(response, "삭제하지 못했습니다."));
      setMessage(trash ? "영구 삭제했습니다." : "휴지통으로 옮겼습니다."); setDeleting(null); reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "삭제 실패"); setDeleting(null); reload(); }
    finally { setBusy(false); }
  }
  return <section className="admin-drive">
    <div className="admin-section-heading"><h2>관리자 클라우드</h2><button type="button" disabled={busy || loading} onClick={() => { setError(""); reload(); }}>새로고침</button></div>
    <p className="board-notice">관리자 전용 파일 보관함 · 파일당 25MB · 휴지통 포함 5GB</p>
    {data && <div className="drive-usage"><progress aria-label="저장 공간 사용량" value={data.usedBytes} max={data.capacityBytes} /><span>{bytes(data.usedBytes)} / {bytes(data.capacityBytes)}</span></div>}
    <div className="drive-toolbar">
      <button type="button" disabled={busy} aria-pressed={!trash} onClick={() => navigate(root)}>내 파일</button>
      <button type="button" disabled={busy} aria-pressed={trash} onClick={() => navigate(root, true)}>파일 휴지통</button>
      {!trash && <><button type="button" disabled={busy || loading} onClick={() => setEditing({ name: "", parentId: folder, restore: false })}>새 폴더</button>
        <button type="button" disabled={busy || loading} onClick={() => upload.current?.click()}>파일 업로드</button>
        <input ref={upload} type="file" multiple hidden onChange={event => void uploadFiles(Array.from(event.target.files ?? []))} /></>}
    </div>
    {!trash && <nav className="drive-breadcrumbs" aria-label="현재 폴더"><button disabled={busy} onClick={() => navigate(root)}>내 파일</button>{parents.map(item => <span key={item.id}> / <button disabled={busy} onClick={() => navigate(item.id)}>{item.name}</button></span>)}</nav>}
    <form className="board-filters" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(1); setLoading(true); setRefresh(value => value + 1); }}>
      <label className="board-search"><span className="sr-only">파일 이름 검색</span><input type="search" value={query} maxLength={200} placeholder={trash ? "휴지통에서 검색" : "현재 폴더에서 검색"} onChange={event => setQuery(event.target.value)} /></label><button disabled={busy}>검색</button>
    </form>
    {message && <p role="status" className="board-notice">{message}</p>}{error && <p role="alert" className="board-error">{error}</p>}
    {editing && <form className="drive-edit" onSubmit={event => void save(event)}><h3>{editing.restore ? "파일·폴더 복원" : editing.entry ? "이름·위치 변경" : "새 폴더"}</h3>
      <label>이름<input required maxLength={200} value={editing.name} disabled={busy} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
      <label>저장 폴더<select value={editing.parentId} disabled={busy} onChange={event => setEditing({ ...editing, parentId: event.target.value })}><option value={root}>/ 내 파일</option>{data?.folders.filter(item => item.id !== editing.entry?.id).map(item => <option key={item.id} value={item.id}>{folderPath(item.id)}</option>)}</select></label>
      <div className="drive-toolbar"><button disabled={busy} type="submit">{editing.restore ? "복원" : "저장"}</button><button disabled={busy} type="button" onClick={() => setEditing(null)}>취소</button></div>
    </form>}
    {loading ? <p role="status" className="board-notice">파일 목록을 불러오는 중…</p> : data && <>
      <div className="board-table-wrap"><table className="board-table drive-table"><caption className="sr-only">관리자 전용 파일 목록</caption><thead><tr><th>이름</th><th>크기</th><th>수정일</th><th>관리</th></tr></thead><tbody>
        {data.items.map(item => <tr key={item.id}><td className="board-title">{item.isFolder ? <button disabled={busy || trash} onClick={() => navigate(item.id)}>📁 {item.name}</button> : <span>{item.name}</span>}</td><td>{item.isFolder ? "폴더" : bytes(item.size)}</td><td>{new Date(item.updatedAtUtc).toLocaleDateString("ko-KR")}</td><td><div className="drive-row-actions">
          {!trash && !item.isFolder && <a href={`/api/admin/drive/${item.id}/download`}>다운로드</a>}
          <button disabled={busy} onClick={() => setEditing({ entry: item, name: item.name, parentId: trash ? root : item.parentId, restore: trash })}>{trash ? "복원" : "이름·이동"}</button>
          <button disabled={busy} onClick={() => setDeleting(item)}>{trash ? "영구 삭제" : "삭제"}</button>
        </div></td></tr>)}
        {!data.items.length && <tr><td colSpan={4} className="board-empty">{search ? "검색 결과가 없습니다." : trash ? "휴지통이 비어 있습니다." : "폴더가 비어 있습니다."}</td></tr>}
      </tbody></table></div>
      <div className="board-pagination"><button disabled={busy || page === 1} onClick={() => { setPage(page - 1); setLoading(true); }}>이전</button><span>{page} / {Math.max(1, Math.ceil(data.total / 50))} · {data.total}개</span><button disabled={busy || page * 50 >= data.total} onClick={() => { setPage(page + 1); setLoading(true); }}>다음</button></div>
    </>}
    <dialog ref={dialog} className="slide-confirm" aria-labelledby="drive-delete-title" onCancel={event => { if (busy) event.preventDefault(); else setDeleting(null); }}><h2 id="drive-delete-title">{deleting?.name} {trash ? "영구 삭제" : "삭제"}</h2><p>{trash ? "영구 삭제한 파일은 복원할 수 없습니다." : "휴지통으로 이동합니다. 폴더는 비어 있을 때 삭제할 수 있습니다."}</p><button autoFocus disabled={busy} onClick={() => setDeleting(null)}>취소</button><button disabled={busy} onClick={() => void remove()}>{busy ? "처리 중…" : trash ? "영구 삭제" : "휴지통으로 이동"}</button></dialog>
  </section>;
}
