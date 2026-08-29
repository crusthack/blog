"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { type PostSummary, readProblem } from "@/lib/contracts";

export function PostList() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/posts", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readProblem(response, "글 목록을 불러오지 못했습니다."));
      setPosts((await response.json()) as PostSummary[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "글 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [isAuthLoading, load, user]);

  if (isLoading || isAuthLoading) return <p className="muted">글 목록을 불러오고 있습니다.</p>;
  if (error) return <p className="notice notice-error">{error}</p>;
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <p>아직 작성된 글이 없습니다.</p>
        {user?.isOwner ? <Link className="primary-link" href="/write">첫 글 작성하기</Link> : null}
      </div>
    );
  }

  return (
    <div className="post-list">
      {posts.map((post) => (
        <article className="post-card" key={post.postNumber}>
          <div className="post-meta">
            <span>{new Date(post.updatedAtUtc).toLocaleDateString("ko-KR")}</span>
            {post.status === "Draft" ? <span className="draft-badge">초안</span> : null}
          </div>
          <h2><Link href={`/posts/${post.postNumber}`}>{post.title}</Link></h2>
          {post.description ? <p>{post.description}</p> : null}
          {user?.isOwner ? <Link className="edit-link" href={`/write/${post.postNumber}`}>편집</Link> : null}
        </article>
      ))}
    </div>
  );
}
