"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export function SiteHeader() {
  const { user, isLoading, logout } = useAuth();

  return (
    <header className="site-header">
      <Link className="brand" href="/">Crusthack</Link>
      <nav className="site-nav" aria-label="주요 메뉴">
        {user?.isOwner ? <Link href="/write">새 글</Link> : null}
        {!isLoading && !user ? <Link href="/login">Owner 로그인</Link> : null}
        {user ? (
          <button className="text-button" type="button" onClick={() => void logout()}>
            {user.username} · 로그아웃
          </button>
        ) : null}
      </nav>
    </header>
  );
}
