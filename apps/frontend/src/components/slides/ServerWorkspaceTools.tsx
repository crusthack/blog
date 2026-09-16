"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Workspace } from "@/lib/slides";
import { workspaceKey } from "@/lib/slideStorage";
import { readProblem } from "@/lib/contracts";

type RemoteWorkspace = { revision: number; savedAt: string; workspace: Workspace };

export function ServerWorkspaceTools({ postNumber, source, mode, userId, workspace, onLoad, disabled }: {
  postNumber: number; source: string; mode: string; userId: string | null; workspace: Workspace; onLoad: (workspace: Workspace) => void; disabled: boolean;
}) {
  const [scope, setScope] = useState<{ sourceHash: string; mode: string } | null>(null);
  const [remote, setRemote] = useState<RemoteWorkspace | null>(null);
  const [checked, setChecked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"save" | "load" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const currentWorkspace = useRef(workspace);
  useEffect(() => { currentWorkspace.current = workspace; }, [workspace]);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const key = JSON.parse(await workspaceKey(postNumber, userId, source, mode));
        const nextScope = { sourceHash: key[4] as string, mode };
        const response = await fetch(`/api/posts/${postNumber}/slide-workspace?${new URLSearchParams(nextScope)}`, { cache: "no-store", credentials: "include", signal: controller.signal });
        if (!response.ok) throw new Error(await readProblem(response, "서버 작업을 확인하지 못했습니다."));
        const record = response.status === 204 ? null : await response.json() as RemoteWorkspace;
        if (controller.signal.aborted) return;
        setScope(nextScope); setRemote(record); setChecked(true);
      } catch (reason) { if (!controller.signal.aborted) setNotice(reason instanceof Error ? reason.message : "서버 연결 실패"); }
    })();
    return () => controller.abort();
  }, [postNumber, source, mode, userId, refresh]);
  useEffect(() => { if (confirm) dialog.current?.showModal(); else dialog.current?.close(); }, [confirm]);

  async function execute(action: "save" | "load") {
    if (!scope || busyRef.current) return;
    busyRef.current = true; setBusy(true); setConfirm(null); setNotice("");
    const startingWorkspace = workspace;
    try {
      const endpoint = `/api/posts/${postNumber}/slide-workspace`;
      const response = action === "save" ? await fetch(endpoint, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scope, workspace, expectedRevision: remote?.revision ?? 0 }),
      }) : await fetch(`${endpoint}?${new URLSearchParams(scope)}`, { cache: "no-store", credentials: "include" });
      if (!response.ok) {
        const problem = await readProblem(response, "서버 작업을 처리하지 못했습니다.");
        if (response.status === 409) {
          const latest = await fetch(`${endpoint}?${new URLSearchParams(scope)}`, { cache: "no-store", credentials: "include" });
          if (latest.ok) setRemote(latest.status === 204 ? null : await latest.json());
        }
        throw new Error(problem);
      }
      if (response.status === 204) { setRemote(null); setNotice("서버에 저장한 작업이 없습니다."); return; }
      const record = await response.json() as RemoteWorkspace;
      setRemote(record);
      if (action === "load") {
        if (currentWorkspace.current !== startingWorkspace) throw new Error("불러오는 동안 필기가 변경되어 현재 작업을 유지했습니다. 다시 불러오기를 눌러 주세요.");
        onLoad(record.workspace);
      }
      setNotice(action === "save" ? "서버에 저장했습니다. 다른 기기에서 불러올 수 있습니다." : "서버 작업을 불러왔습니다. 브라우저에도 보관하려면 작업 저장을 눌러 주세요.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "서버 연결 실패. 브라우저 작업은 유지됩니다."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  if (!userId) return <div className="slide-server-status">기기 간 동기화는 로그인 후 사용할 수 있습니다.</div>;
  return <div className="slide-server-tools">
    <button type="button" disabled={!checked || disabled || busy} onClick={() => remote ? setConfirm("save") : void execute("save")}>서버에 저장</button>
    <button type="button" disabled={!remote || disabled || busy} onClick={() => setConfirm("load")}>서버에서 불러오기</button>
    {!checked && notice && <button type="button" onClick={() => { setNotice(""); setRefresh(value => value + 1); }}>연결 재시도</button>}
    <Link href="/workspaces" target="_blank" rel="noopener noreferrer">서버 저장 관리</Link>
    <span role="status">{busy ? "서버 처리 중…" : notice || (remote ? `서버 저장 ${new Date(remote.savedAt).toLocaleString("ko-KR")}` : checked ? "서버 저장 내역 없음" : "서버 확인 중…")}</span>
    <dialog ref={dialog} className="slide-confirm" aria-labelledby="server-confirm-title" onCancel={() => setConfirm(null)}>
      <h2 id="server-confirm-title">{confirm === "save" ? "서버의 필기를 현재 작업으로 덮어쓸까요?" : "현재 화면의 필기를 서버 작업으로 바꿀까요?"}</h2>
      <p>본문은 변경되지 않습니다. 브라우저에 저장한 작업은 그대로 유지됩니다.</p>
      <button type="button" autoFocus onClick={() => setConfirm(null)}>취소</button>
      <button type="button" onClick={() => { if (confirm) void execute(confirm); }}>확인</button>
    </dialog>
  </div>;
}
