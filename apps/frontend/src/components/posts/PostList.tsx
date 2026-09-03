"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { type Category, type PostSummary, readProblem } from "@/lib/contracts";

export function PostList({ categorySlug }: { categorySlug?: string }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const activeCategory = useMemo(
    () => categories.find((category) => category.slug === categorySlug),
    [categories, categorySlug],
  );

  const loadCategories = useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error(await readProblem(response, "카테고리를 불러오지 못했습니다."));
    setCategories((await response.json()) as Category[]);
    setCategoriesLoaded(true);
  }, []);

  const loadPosts = useCallback(async (categoryId?: string) => {
    const params = new URLSearchParams();
    if (categoryId) params.set("categoryId", categoryId);
    if (searchQuery) params.set("query", searchQuery);
    const response = await fetch(`/api/posts${params.size ? `?${params}` : ""}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) throw new Error(await readProblem(response, "글 목록을 불러오지 못했습니다."));
    setPosts((await response.json()) as PostSummary[]);
  }, [searchQuery]);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError("");
      void loadCategories()
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다.");
            setIsLoading(false);
          }
        })
        .finally(() => { if (!cancelled && !categorySlug) setIsLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isAuthLoading, loadCategories, categorySlug, user]);

  useEffect(() => {
    if (isAuthLoading || !categoriesLoaded) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (categorySlug && !activeCategory) {
        setError("존재하지 않는 카테고리입니다.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError("");
      void loadPosts(activeCategory?.id)
        .catch((reason: unknown) => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : "글 목록을 불러오지 못했습니다.");
        })
        .finally(() => { if (!cancelled) setIsLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeCategory, categoriesLoaded, categorySlug, isAuthLoading, loadPosts, user]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  const status = isLoading || isAuthLoading
    ? "글 목록을 불러오고 있습니다."
    : error;

  return (
    <div>
      {!categorySlug ? (
        <section className="border-y border-gray-200 py-14 dark:border-gray-700">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black tracking-[0.18em] text-emerald-600">CATEGORIES</p>
              <h2 className="mt-2 text-3xl font-black">카테고리 탐색</h2>
            </div>
            <span className="text-sm font-bold text-gray-500">전체 {categories.length}개</span>
          </div>
          {categories.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              {categories.map((category) => (
                <Link
                  data-ui="panel-accent"
                  className="group flex items-center justify-between gap-5 bg-white p-6 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:bg-[#252525]"
                  href={`/categories/${category.slug}`}
                  key={category.id}
                >
                  <div>
                    <h3 className="text-2xl font-black transition group-hover:text-emerald-600">{category.name}</h3>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                      {category.description ?? "이 카테고리의 포스트를 살펴봅니다."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-xs font-black text-gray-400">{category.postCount}</span>
                    <span className="text-2xl text-emerald-600">→</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState>공개된 카테고리가 없습니다.</EmptyState>
          )}
        </section>
      ) : (
        <header className="mb-10 border-b border-gray-200 pb-8 dark:border-gray-700">
          <p className="text-sm font-black tracking-[0.18em] text-emerald-600">CATEGORY</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">
                {activeCategory?.name ?? "카테고리"}
              </h1>
              {activeCategory?.description ? (
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-gray-500 dark:text-gray-300">
                  {activeCategory.description}
                </p>
              ) : null}
            </div>
            <Link className="font-bold text-emerald-600 hover:text-emerald-700" href="/">전체 글 보기 →</Link>
          </div>
        </header>
      )}

      <section className={categorySlug ? "pb-14" : "py-14"}>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-black tracking-[0.18em] text-emerald-600">
              {categorySlug ? "POSTS" : "RECENT POSTS"}
            </p>
            <h2 className="mt-2 text-3xl font-black">
              {categorySlug ? `${activeCategory?.name ?? "카테고리"}의 글` : "최근 글 보기"}
            </h2>
          </div>
          <p className="text-sm text-gray-500">총 {posts.length}개의 글</p>
        </div>

        <form className="mb-7 flex flex-col gap-2 sm:flex-row" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="post-search">글 검색</label>
          <input
            data-ui="input"
            className="min-w-0 flex-1 px-4 py-3"
            id="post-search"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="제목과 설명에서 검색"
            type="search"
            value={searchInput}
          />
          <button data-ui="action" className="bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-700" type="submit">
            검색
          </button>
          {searchQuery ? (
            <button
              data-ui="action"
              className="border border-gray-300 bg-white px-5 py-3 font-bold transition hover:bg-gray-100 dark:border-gray-600 dark:bg-[#292929] dark:hover:bg-gray-700"
              onClick={() => { setSearchInput(""); setSearchQuery(""); }}
              type="button"
            >
              초기화
            </button>
          ) : null}
        </form>

        {status ? (
          <p data-ui="notice" className={error ? "border-red-500 bg-red-50 p-4 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "p-4 text-gray-500"}>
            {status}
          </p>
        ) : null}
        {!isLoading && !isAuthLoading && !error && posts.length === 0 ? (
          <div data-ui="panel" className="border-dashed p-10 text-center text-gray-500">
            <p>{searchQuery ? "검색 결과가 없습니다." : "아직 작성된 글이 없습니다."}</p>
            {user?.isOwner ? (
              <Link className="mt-4 inline-block font-bold text-emerald-600 hover:text-emerald-700" href="/write">
                첫 글 작성하기 →
              </Link>
            ) : null}
          </div>
        ) : null}
        {!isLoading && !error && posts.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            {posts.map((post) => (
              <article
                data-ui="panel"
                className="group flex min-h-56 flex-col bg-white p-6 transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-md dark:bg-[#252525]"
                key={post.postNumber}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {post.categoryName ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {post.categoryName}
                      </span>
                    ) : null}
                    {post.status === "Draft" ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">초안</span>
                    ) : null}
                  </div>
                  <time className="text-gray-500" dateTime={post.updatedAtUtc}>{formatDate(post.updatedAtUtc)}</time>
                </div>
                <h3 className="text-2xl font-black transition group-hover:text-emerald-600">
                  <Link href={`/posts/${post.postNumber}`}>{post.title}</Link>
                </h3>
                {post.description ? (
                  <p className="mt-3 line-clamp-3 leading-relaxed text-gray-600 dark:text-gray-300">{post.description}</p>
                ) : null}
                <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                  <Link className="font-bold text-emerald-600" href={`/posts/${post.postNumber}`}>글 읽기 →</Link>
                  {user?.isOwner ? (
                    <Link className="text-sm font-bold text-gray-500 hover:text-emerald-600" href={`/write/${post.postNumber}`}>편집</Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p data-ui="panel" className="border-dashed p-10 text-center text-gray-500">
      {children}
    </p>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
