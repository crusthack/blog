"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { readProblem, type Category, type PostSummary, visibilityLabels } from "@/lib/contracts";
import { usefulSiteLinks } from "@/lib/siteLinks";

export function BlogFrame({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthLoading) return;

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError("");

      void Promise.all([
        fetchCollection<Category>(
          "/api/categories",
          "카테고리를 불러오지 못했습니다.",
          controller.signal,
        ),
        fetchCollection<PostSummary>(
          "/api/posts",
          "글 목록을 불러오지 못했습니다.",
          controller.signal,
        ),
      ])
        .then(([nextCategories, nextPosts]) => {
          if (!active) return;
          setCategories(nextCategories);
          setPosts(nextPosts);
        })
        .catch((reason: unknown) => {
          if (!active || isAbortError(reason)) return;
          setError(reason instanceof Error ? reason.message : "블로그 목록을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isAuthLoading, user]);

  const recentPosts = useMemo(
    () => [...posts].sort(compareNewest).slice(0, 4),
    [posts],
  );
  const projectPosts = useMemo(() => {
    const projectCategory = categories.find(
      (category) => category.name === "프로젝트" || category.slug.toLowerCase() === "project",
    );

    return [...posts]
      .filter(
        (post) =>
          (projectCategory !== undefined && post.categoryId === projectCategory.id) ||
          post.categoryName === "프로젝트",
      )
      .sort(compareNewest)
      .slice(0, 5);
  }, [categories, posts]);

  return (
    <main className="legacy-blog-frame">
      <div className="legacy-blog-main">{children}</div>

      <aside className="legacy-blog-sidebar legacy-blog-sidebar-left" aria-label="블로그 탐색">
        <section>
          <h2>최근 글 보기</h2>
          <PostLinks posts={recentPosts} emptyMessage="작성된 글이 없습니다." isLoading={isLoading} />
        </section>

        <section>
          <h2>카테고리 목록</h2>
          {isLoading ? (
            <p>불러오는 중…</p>
          ) : categories.length > 0 ? (
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={`/categories/${category.slug}`}>
                    <span>{category.name}</span>{" "}
                    <span aria-label={`${category.postCount}개의 글`}>({category.postCount})</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>카테고리가 없습니다.</p>
          )}
        </section>

        {error ? <p role="alert">{error}</p> : null}
      </aside>

      <aside className="legacy-blog-sidebar legacy-blog-sidebar-right" aria-label="프로젝트와 참고 링크">
        <section>
          <h2>최근 프로젝트</h2>
          <PostLinks posts={projectPosts} emptyMessage="프로젝트 글이 없습니다." isLoading={isLoading} />
        </section>

        <section>
          <h2>유용한 사이트</h2>
          <ul>
            {usefulSiteLinks.map((link) => (
              <li key={link.url}>
                <a
                  aria-label={`${link.name} (새 탭)`}
                  href={link.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </main>
  );
}

function PostLinks({
  posts,
  emptyMessage,
  isLoading,
}: {
  posts: PostSummary[];
  emptyMessage: string;
  isLoading: boolean;
}) {
  if (isLoading) return <p>불러오는 중…</p>;
  if (posts.length === 0) return <p>{emptyMessage}</p>;

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.postNumber}>
          <Link href={`/posts/${post.postNumber}`} title={post.title}>
            {post.title}
            {post.visibility !== "Public" ? ` · ${visibilityLabels[post.visibility]}` : ""}
          </Link>
          <time dateTime={post.publishedAtUtc ?? post.updatedAtUtc}>
            {formatDate(post.publishedAtUtc ?? post.updatedAtUtc)}
          </time>
        </li>
      ))}
    </ul>
  );
}

async function fetchCollection<T>(url: string, fallback: string, signal: AbortSignal) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error(await readProblem(response, fallback));
  return (await response.json()) as T[];
}

function compareNewest(left: PostSummary, right: PostSummary) {
  return getTimestamp(right) - getTimestamp(left);
}

function getTimestamp(post: PostSummary) {
  return new Date(post.publishedAtUtc ?? post.updatedAtUtc).getTime();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function isAbortError(reason: unknown) {
  return reason instanceof DOMException && reason.name === "AbortError";
}
