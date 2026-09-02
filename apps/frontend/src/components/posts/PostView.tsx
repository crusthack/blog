"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { useAuth } from "@/components/auth/AuthProvider";
import { type PostDetail, readProblem } from "@/lib/contracts";

export function PostView({ postNumber }: { postNumber: string }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthLoading) return;
    const controller = new AbortController();
    void fetch(`/api/posts/${postNumber}`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readProblem(response, "글을 찾지 못했습니다."));
        return (await response.json()) as PostDetail;
      })
      .then(setPost)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "글을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [isAuthLoading, postNumber]);

  if (error) return <main className="content-shell"><p className="notice notice-error">{error}</p></main>;
  if (!post) return <main className="content-shell"><p className="muted">글을 불러오고 있습니다.</p></main>;

  const readingMinutes = Math.max(1, Math.ceil(post.content.trim().split(/\s+/).length / 250));

  return (
    <main className="content-shell">
      <article className="post-detail">
        <div className="post-meta">
          <span>{new Date(post.updatedAtUtc).toLocaleDateString("ko-KR")}</span>
          {post.categoryName ? <span>{post.categoryName}</span> : null}
          <span>약 {readingMinutes}분</span>
          {post.status === "Draft" ? <span className="draft-badge">초안</span> : null}
          {user?.isOwner ? <Link href={`/write/${post.postNumber}`}>편집</Link> : null}
        </div>
        <h1>{post.title}</h1>
        {post.description ? <p className="lead">{post.description}</p> : null}
        <div className="article-divider" aria-hidden="true"><span>Read</span></div>
        <MarkdownContent source={post.content} />
      </article>
    </main>
  );
}
