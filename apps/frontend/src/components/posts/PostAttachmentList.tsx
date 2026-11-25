import type { ReactNode } from "react";
import type { PostAsset } from "@/lib/contracts";

export function PostAttachmentList({ assets, actions, notice, children }: {
  assets: PostAsset[]; actions?: ReactNode; notice?: ReactNode; children?: ReactNode;
}) {
  if (!assets.length && !actions && !notice) return null;
  return <section aria-label="첨부 파일" className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/60">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">첨부 파일{assets.length > 0 ? ` (${assets.length})` : ""}</h2>
      {actions}
    </div>
    {notice}
    <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700">
      {assets.map(asset => <li key={asset.id}>
        <a className="flex items-center justify-between gap-3 py-2 underline-offset-4 hover:underline" href={`${asset.url}?download=1`} download={`${asset.name}${asset.extension}`}>
          <span className="min-w-0 break-all">{asset.name}{asset.extension}</span>
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{asset.size < 1024 ? `${asset.size} B` : asset.size < 1024 * 1024 ? `${(asset.size / 1024).toFixed(1)} KB` : `${(asset.size / 1024 / 1024).toFixed(1)} MB`} · 다운로드 ↓</span>
        </a>
      </li>)}
    </ul>
    {children}
  </section>;
}
