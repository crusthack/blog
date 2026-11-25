"use client";
import { usePublished } from "@/components/PublishedContext";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCategories } from "@/components/categories/CategoriesProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { readProblem, type PostSummary } from "@/lib/contracts";
import { SidebarCategories } from "@/components/categories/SidebarCategories";
import { usefulLinksUpdatedEvent } from "@/lib/uiEvents";
import { defaultUsefulLinks, type ExternalLink } from "@/lib/siteLinks";
import { postPath } from "@/lib/postPaths";

export function BlogFrame({ children, rightSidebar }: { children: ReactNode; rightSidebar?: ReactNode }) {
  const published = usePublished();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { categories, error: categoryError, isLoading: isCategoriesLoading } = useCategories();
  const projectCategory = categories.find(category => category.name === "프로젝트" || category.slug.toLowerCase() === "project");
  const projectSlug = projectCategory?.slug;
  const [posts, setPosts] = useState<PostSummary[]>(published?.sidebarPosts ?? []);
  const [isLoading, setIsLoading] = useState(!published);
  const [error, setError] = useState("");
  const [usefulLinks, setUsefulLinks] = useState<ExternalLink[]>(published?.usefulLinks ?? defaultUsefulLinks);
  useEffect(() => {
    if (published || rightSidebar !== undefined) return;
    const controller = new AbortController();
    const refresh = () => {
      void fetchCollection<ExternalLink>("/api/site-settings/useful-links", "유용한 사이트를 불러오지 못했습니다.", controller.signal)
        .then(setUsefulLinks)
        .catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    };
    refresh();
    window.addEventListener(usefulLinksUpdatedEvent, refresh);
    return () => {
      controller.abort();
      window.removeEventListener(usefulLinksUpdatedEvent, refresh);
    };
  }, [published, rightSidebar]);

  useEffect(() => {
    if (published || isAuthLoading || isCategoriesLoading) return;

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError("");

      const recent = fetchCollection<PostSummary>("/api/posts/directory?sort=newest", "글 목록을 불러오지 못했습니다.", controller.signal);
      const projects = projectSlug
        ? fetchCollection<PostSummary>(`/api/posts/directory?sort=newest&category=${encodeURIComponent(projectSlug)}`, "프로젝트를 불러오지 못했습니다.", controller.signal)
        : Promise.resolve([]);
      void Promise.all([recent, projects])
        .then(([recentItems, projectItems]) => {
          if (!active) return;
          setPosts([...new Map([...recentItems, ...projectItems].map(post => [post.postNumber, post])).values()]);
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
  }, [isAuthLoading, isCategoriesLoading, user, published, projectSlug]);

  const recentPosts = useMemo(
    () => [...posts].sort(compareNewest).slice(0, 4),
    [posts],
  );
  const projectPosts = useMemo(() => {
    return [...posts]
      .filter(
        (post) =>
          (projectCategory !== undefined && post.categoryId === projectCategory.id) ||
          post.categoryName === "프로젝트",
      )
      .sort(compareNewest)
      .slice(0, 5);
  }, [projectCategory, posts]);

  return (
    <main className={`legacy-blog-frame${rightSidebar !== undefined ? " legacy-blog-frame-post" : ""}`}>
      <div className="legacy-blog-main">{children}</div>

      <aside className="legacy-blog-sidebar legacy-blog-sidebar-left" aria-label="블로그 탐색">
        <section>
          <h2>최근 글 보기</h2>
          <Link className="text-sm underline" href="/posts">전체 글 보기</Link>
          <PostLinks posts={recentPosts} emptyMessage="작성된 글이 없습니다." isLoading={isLoading} />
        </section>

        <section>
          <h2>카테고리 목록</h2>
          {isCategoriesLoading ? (
            <p>불러오는 중…</p>
          ) : categories.length > 0 ? (
            <SidebarCategories categories={categories} />
          ) : (
            <p>카테고리가 없습니다.</p>
          )}
        </section>

        {error || categoryError ? <p role="alert">{error || categoryError}</p> : null}
      </aside>

      <aside className="legacy-blog-sidebar legacy-blog-sidebar-right" aria-label={rightSidebar !== undefined ? "포스트 탐색" : "프로젝트와 참고 링크"}>
        {rightSidebar !== undefined ? rightSidebar : <>
        <section>
          <h2>최근 프로젝트</h2>
          <PostLinks posts={projectPosts} emptyMessage="프로젝트 글이 없습니다." isLoading={isLoading} />
        </section>

        <section>
          <h2>유용한 사이트</h2>
          <ul>
            {usefulLinks.map((link, index) => (
              <li key={index}>
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
        </>}
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
          <Link href={postPath(post)} title={post.title}>
            {post.title}
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
  const result = await response.json() as T[] | { items: T[] };
  return Array.isArray(result) ? result : result.items;
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
