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
          if (!cancelled) setError(reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다.");
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

  return (
    <div className="archive-layout">
      <aside className="category-rail" aria-label="카테고리">
        <p className="rail-title">분류</p>
        <Link className={!categorySlug ? "active" : ""} href="/">전체 <span>↗</span></Link>
        {categories.map((category) => (
          <Link className={category.slug === categorySlug ? "active" : ""} href={`/categories/${category.slug}`} key={category.id}>
            {category.name}<small>{category.postCount}</small>
          </Link>
        ))}
      </aside>

      <div className="archive-content">
        {activeCategory ? (
          <header className="category-intro">
            <p className="eyebrow">Category</p>
            <h2>{activeCategory.name}</h2>
            {activeCategory.description ? <p>{activeCategory.description}</p> : null}
          </header>
        ) : null}
        <form className="search-form" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="post-search">글 검색</label>
          <input id="post-search" type="search" placeholder="제목과 설명에서 검색" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          <button type="submit">검색</button>
          {searchQuery ? <button className="search-reset" type="button" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>초기화</button> : null}
        </form>

        {isLoading || isAuthLoading ? <p className="muted">글 목록을 불러오고 있습니다.</p> : null}
        {error ? <p className="notice notice-error">{error}</p> : null}
        {!isLoading && !error && posts.length === 0 ? (
          <div className="empty-state">
            <p>{searchQuery ? "검색 결과가 없습니다." : "아직 작성된 글이 없습니다."}</p>
            {user?.isOwner ? <Link className="primary-link" href="/write">첫 글 작성하기</Link> : null}
          </div>
        ) : null}
        {!isLoading && !error && posts.length > 0 ? (
          <div className="post-list">
            {posts.map((post, index) => (
              <article className="post-card" key={post.postNumber}>
                <span className="post-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="post-card-body">
                  <div className="post-meta">
                    <span>{new Date(post.updatedAtUtc).toLocaleDateString("ko-KR")}</span>
                    {post.categoryName ? <span>{post.categoryName}</span> : null}
                    {post.status === "Draft" ? <span className="draft-badge">초안</span> : null}
                  </div>
                  <h2><Link href={`/posts/${post.postNumber}`}>{post.title}</Link></h2>
                  {post.description ? <p>{post.description}</p> : null}
                  {user?.isOwner ? <Link className="edit-link" href={`/write/${post.postNumber}`}>편집</Link> : null}
                </div>
                <Link className="post-arrow" aria-label={`${post.title} 읽기`} href={`/posts/${post.postNumber}`}>↗</Link>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
