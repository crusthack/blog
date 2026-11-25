"use client";

import { useState } from "react";

export default function LiveComments({ origin, number }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function read(page) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(origin + "/api/posts/" + number + "/community?page=" + page,
        { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch {
      setError("댓글을 불러오지 못했습니다. 운영 블로그에서 확인할 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }
  return <section><button disabled={busy} onClick={() => read(result?.page || 1)}>
    {busy ? "조회 중…" : result ? "댓글 새로고침" : "댓글 보기"}</button>
    <p role="status">{error}</p>
    {result && <><h2>댓글 {result.total}개</h2><ul>{result.items.map(item => <li key={item.id}>
      <strong>{item.authorName}</strong> <span>{item.isDeleted ? "삭제된 댓글입니다." : item.content}</span></li>)}</ul>
      {result.page > 1 && <button disabled={busy} onClick={() => read(result.page-1)}>이전</button>}
      {result.page * 30 < result.total && <button disabled={busy} onClick={() => read(result.page+1)}>다음</button>}</>}
    </section>;
}
