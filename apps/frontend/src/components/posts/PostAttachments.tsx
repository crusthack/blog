"use client";
import { usePublished } from "@/components/PublishedContext";

import { useEffect, useState } from "react";
import { type PostAsset, readProblem } from "@/lib/contracts";
import { PostAssetManager } from "./PostAssetManager";

export function PostAttachments({ postNumber, isOwner }: { postNumber: number; isOwner: boolean }) {
  const published = usePublished();
  const [assets, setAssets] = useState<PostAsset[]>(published?.assets ?? []);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (published) return;
    const controller = new AbortController();
    void fetch(`/api/posts/${postNumber}/assets/downloads`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await readProblem(response, "첨부 파일 목록을 불러오지 못했습니다."));
        return response.json() as Promise<PostAsset[]>;
      })
      .then(items => { if (!controller.signal.aborted) { setAssets(items); setError(""); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "첨부 파일 조회 실패"); });
    const refresh = () => setReload(value => value + 1);
    window.addEventListener("post-assets-updated", refresh);
    return () => { controller.abort(); window.removeEventListener("post-assets-updated", refresh); };
  }, [postNumber, reload, published]);

  if (!isOwner && assets.length === 0 && !error) return null;
  return <section aria-label="첨부 파일" className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/60">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">첨부 파일{assets.length > 0 ? ` (${assets.length})` : ""}</h2>
      {isOwner && <button type="button" className="border border-gray-400 px-3 py-1.5" onClick={() => setManaging(!managing)}>{managing ? "첨부 관리 닫기" : "파일 첨부·관리"}</button>}
    </div>
    {error && <p role="alert" className="mt-2">{error} <button type="button" className="underline" onClick={() => setReload(value => value + 1)}>다시 시도</button></p>}
    <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
      {assets.map(asset => <li key={asset.id}>
        <a className="flex items-center justify-between gap-3 py-2 underline-offset-4 hover:underline" href={`${asset.url}?download=1`} download={`${asset.name}${asset.extension}`}>
          <span className="min-w-0 break-all">{asset.name}{asset.extension}</span>
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{asset.size < 1024 ? `${asset.size} B` : asset.size < 1024 * 1024 ? `${(asset.size / 1024).toFixed(1)} KB` : `${(asset.size / 1024 / 1024).toFixed(1)} MB`} · 다운로드 ↓</span>
        </a>
      </li>)}
    </ul>
    {managing && isOwner && <div className="mt-4"><PostAssetManager postNumber={String(postNumber)} /></div>}
  </section>;
}
