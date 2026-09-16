"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { type Category, type PostSummary, readProblem, visibilityLabels } from "@/lib/contracts";
import { categoriesUpdatedEvent } from "@/lib/uiEvents";
import { postPath } from "@/lib/postPaths";

type Props = { categorySlug?: string; manage?: boolean; mine?: boolean; bookmarked?: boolean };
const pageSize = 20;

export function PostList({ categorySlug, manage = false, mine = false, bookmarked = false }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if ((manage || mine || bookmarked) && !isLoading && !user) router.replace("/login");
  }, [manage, mine, bookmarked, isLoading, user, router]);
  if (isLoading || ((manage || mine || bookmarked) && !user)) {
    return <p className="board-notice" role="status">{isLoading ? "글 목록을 준비하고 있습니다." : "로그인이 필요합니다."}</p>;
  }
  return <PostDirectory key={`${categorySlug ?? "all"}:${manage}:${user?.id ?? "visitor"}`}
    categorySlug={categorySlug} manage={manage} mine={mine || (manage && !user?.isOwner)} bookmarked={bookmarked} isOwner={Boolean(user?.isOwner)} canWrite={Boolean(user)} />;
}

function PostDirectory({ categorySlug, manage, mine, bookmarked, isOwner, canWrite }: Props & { isOwner: boolean; canWrite: boolean }) {
  const [total, setTotal] = useState(0);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [visibility, setVisibility] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [postResponse, categoryResponse] = await Promise.all([
          fetch(`/api/posts/directory?${new URLSearchParams({ page: String(page), query: search, sort, ...(categorySlug || categoryId ? { category: categorySlug || categoryId } : {}), ...(visibility ? { visibility } : {}), ...(mine ? { mine: "true" } : {}), ...(bookmarked ? { bookmarked: "true" } : {}) })}`, { cache: "no-store", credentials: "include", signal: controller.signal }),
          fetch("/api/categories", { cache: "no-store", credentials: "include", signal: controller.signal }),
        ]);
        if (!postResponse.ok) throw new Error(await readProblem(postResponse, "글 목록을 불러오지 못했습니다."));
        if (!categoryResponse.ok) throw new Error(await readProblem(categoryResponse, "카테고리를 불러오지 못했습니다."));
        const [loadedPosts, loadedCategories] = await Promise.all([
          postResponse.json() as Promise<{ items: PostSummary[]; total: number }>, categoryResponse.json() as Promise<Category[]>,
        ]);
        if (controller.signal.aborted) return;
        if (page > Math.max(1, Math.ceil(loadedPosts.total / pageSize))) {
          setPage(Math.max(1, Math.ceil(loadedPosts.total / pageSize)));
        }
        setPosts(loadedPosts.items); setTotal(loadedPosts.total); setLoadError("");
        setCategories(loadedCategories);
      } catch (reason) {
        if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reload, page, search, sort, categorySlug, categoryId, visibility, mine, bookmarked]);

  const activeCategory = categories.find((category) => category.slug === categorySlug);
  const missingCategory = Boolean(categorySlug && !isLoading && !loadError && !activeCategory);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = page;
  const visiblePosts = posts;
  const firstPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstPage + index);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  async function deletePost(post: PostSummary) {
    if (deleting !== null || !window.confirm(`“${post.title}” 글을 휴지통으로 옮길까요? 글과 첨부 파일은 보관되며 복원할 수 있습니다.`)) return;
    setDeleting(post.postNumber);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(`/api/posts/${post.postNumber}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await readProblem(response, "글을 삭제하지 못했습니다."));
      setPosts((previous) => previous.filter((item) => item.postNumber !== post.postNumber));
      setReload(value => value + 1);
      setMessage(`“${post.title}” 글을 휴지통으로 옮겼습니다.`);
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "글을 삭제하지 못했습니다.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="post-board" aria-label={manage ? "전체 게시글 관리" : "게시글 목록"}>
      <header className="board-heading">
        <div>
          <h1>{manage ? (isOwner ? "게시글 전체 관리" : "내 글 관리") : bookmarked ? "북마크" : mine ? "내 글" : categorySlug ? activeCategory?.name ?? "카테고리" : "전체 글"}</h1>
          <p>{manage ? "공개·비공개·코드 보호 글을 검색하고 관리합니다." : activeCategory?.description ?? "최신 글부터 순서대로 확인하세요."}</p>
        </div>
        <div className="board-heading-actions">
          {manage && isOwner ? <><Link href="/posts/trash">휴지통</Link><Link href="/storage">첨부 파일 점검</Link></> : null}
          {categorySlug || manage ? <Link href="/posts">전체 글 보기</Link> : null}
          {canWrite ? <Link className="board-primary" href="/write">글쓰기</Link> : null}
        </div>
      </header>
      <form className="board-filters" role="search" onSubmit={submitSearch}>
        {!categorySlug ? <label><span className="sr-only">카테고리 필터</span>
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}>
            <option value="">전체 카테고리</option><option value="uncategorized">미분류</option>
            {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}{!category.isVisible ? " (숨김)" : ""}</option>)}
          </select>
        </label> : null}
        {manage ? <label><span className="sr-only">공개 범위 필터</span>
          <select value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1); }}>
            <option value="">모든 공개 범위</option>
            {Object.entries(visibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label> : null}
        <label><span className="sr-only">글 정렬</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="newest">최신 글순</option><option value="oldest">오래된 글순</option>
            <option value="updated">최근 수정순</option><option value="title">제목순</option>
          </select>
        </label>
        <label className="board-search"><span className="sr-only">제목과 설명 검색</span>
          <input type="search" placeholder="제목·설명 검색" value={searchInput} maxLength={120} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        <button type="submit">검색</button>
        {search || categoryId || visibility || sort !== "newest" ? <button type="button" onClick={() => {
          setSearch(""); setSearchInput(""); setCategoryId(""); setVisibility(""); setPage(1); setSort("newest");
        }}>초기화</button> : null}
      </form>
      {actionError ? <p className="board-notice board-error" role="alert">{actionError}</p> : null}
      {message ? <p className="board-notice" role="status">{message}</p> : null}
      {isLoading ? <p className="board-notice" role="status">글 목록을 불러오고 있습니다.</p>
        : loadError ? <div className="board-notice board-error" role="alert">{loadError} <button type="button" onClick={() => {
          setLoadError(""); setIsLoading(true); setReload((value) => value + 1);
        }}>다시 시도</button></div>
        : missingCategory ? <p className="board-notice" role="alert">존재하지 않는 카테고리입니다.</p>
        : <>
          <div className="board-summary"><span>총 <strong>{total}</strong>개</span><span>{currentPage} / {pageCount} 페이지</span></div>
          <div className="board-table-wrap">
            <table className={`board-table${manage ? " board-table-manage" : ""}`}>
              <caption className="sr-only">{manage ? "게시글 전체 관리 목록" : "게시글 목록"}</caption>
              <thead><tr>
                <th scope="col" className="board-number">번호</th><th scope="col" className="board-category">분류</th>
                <th scope="col" className="board-title">제목</th><th scope="col">작성자</th><th scope="col" className="board-visibility">공개 범위</th>
                <th scope="col" className="board-date">{manage ? "수정일" : "작성일"}</th>
                {manage ? <th scope="col" className="board-actions">관리</th> : null}
              </tr></thead>
              <tbody>
                {visiblePosts.map((post) => <tr key={post.postNumber}>
                  <td className="board-number">{post.postNumber}</td>
                  <td className="board-category"><span title={post.categoryName ?? "미분류"}>{post.categoryName ?? "미분류"}</span></td>
                  <td className="board-title"><Link href={postPath(post)} title={post.title}>{post.title}</Link></td><td>{post.authorName}</td>
                  <td className="board-visibility"><span data-visibility={post.visibility}>{visibilityLabels[post.visibility]}</span></td>
                  <td className="board-date"><time dateTime={manage ? post.updatedAtUtc : post.publishedAtUtc ?? post.updatedAtUtc}>
                    {formatDate(manage ? post.updatedAtUtc : post.publishedAtUtc ?? post.updatedAtUtc)}
                  </time></td>
                  {manage ? <td className="board-actions"><div>
                    <Link href={`/write/${post.postNumber}`} aria-label={`${post.title} 편집`}>편집</Link>
                    <button type="button" disabled={deleting !== null} aria-label={`${post.title} 삭제`}
                      onClick={() => void deletePost(post)}>{deleting === post.postNumber ? "삭제 중" : "삭제"}</button>
                  </div></td> : null}
                </tr>)}
                {visiblePosts.length === 0 ? <tr><td colSpan={manage ? 7 : 6} className="board-empty">
                  {search || categoryId || visibility ? "조건에 맞는 글이 없습니다." : "등록된 글이 없습니다."}
                </td></tr> : null}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? <nav className="board-pagination" aria-label="게시글 페이지">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(1)}>처음</button>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button>
            {pageNumbers.map((number) => <button key={number} type="button" aria-label={`${number}페이지`}
              aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>)}
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>다음</button>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(pageCount)}>마지막</button>
          </nav> : null}
        </>}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
}
