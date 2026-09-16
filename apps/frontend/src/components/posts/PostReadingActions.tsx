"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function PostReadingActions({ categorySlug }: { categorySlug: string | null }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copyLink() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage("현재 본문 위치의 링크를 복사했습니다.");
      timer.current = setTimeout(() => setMessage(""), 2500);
    } catch { setMessage("복사하지 못했습니다. 주소창의 링크를 복사해 주세요."); }
  }
  return <footer className="post-reading-actions">
    <nav aria-label="글 읽기 도구">
      <Link href={categorySlug ? `/categories/${encodeURIComponent(categorySlug)}` : "/posts"}>목록으로</Link>
      <button type="button" onClick={() => void copyLink()}>링크 복사</button>
      <button type="button" onClick={() => window.print()}>인쇄 / PDF</button>
      <a href="#post-title">맨 위로</a>
    </nav>
    <p role="status">{message}</p>
  </footer>;
}
