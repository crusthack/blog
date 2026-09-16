"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { type Category, type PostSummary, readProblem, visibilityLabels } from "@/lib/contracts";
import { categoriesUpdatedEvent } from "@/lib/uiEvents";
import { postPath } from "@/lib/postPaths";

type Props = { categorySlug?: string; manage?: boolean; mine?: boolean; bookmarked?: boolean; embedded?: boolean };
const pageSize = 20;

export function PostList({ categorySlug, manage = false, mine = false, bookmarked = false, embedded = false }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if ((manage || mine || bookmarked) && !isLoading && !user) router.replace("/login");
  }, [manage, mine, bookmarked, isLoading, user, router]);
  if (isLoading || ((manage || mine || bookmarked) && !user)) {
    return <p className="board-notice" role="status">{isLoading ? "글 목록을 준비하고 있습니다." : "로그인이 필요합니다."}</p>;
  }
  return <PostDirectory key={`${categorySlug ?? "all"}:${manage}:${user?.id ?? "visitor"}`}
    categorySlug={categorySlug} manage={manage} embedded={embedded} mine={mine || (manage && !user?.isOwner)} bookmarked={bookmarked} isOwner={Boolean(user?.isOwner)} canWrite={Boolean(user)} />;
}

function PostDirectory({ categorySlug, manage, mine, bookmarked, embedded, isOwner, canWrite }: Props & { isOwner: boolean; canWrite: boolean }) {
  const Heading = embedded ? "h2" : "h1";
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
  const [direction, setDirection] = useState("desc");
  const [sort, setSort] = useState("priority");
  const [priorities, setPriorities] = useState<Record<number, string>>({});
  const [savingPriority, setSavingPriority] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [postResponse, categoryResponse] = await Promise.all([
          fetch(`/api/posts/directory?${new URLSearchParams({ page: String(page), query: search, sort, direction, ...(categorySlug || categoryId ? { category: categorySlug || categoryId } : {}), ...(visibility ? { visibility } : {}), ...(mine ? { mine: "true" } : {}), ...(bookmarked ? { bookmarked: "true" } : {}) })}`, { cache: "no-store", credentials: "include", signal: controller.signal }),
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
  }, [reload, page, search, sort, direction, categorySlug, categoryId, visibility, mine, bookmarked]);

  useEffect(() => {
    const refresh = () => setReload(value => value + 1);
    window.addEventListener(categoriesUpdatedEvent, refresh);
    return () => window.removeEventListener(categoriesUpdatedEvent, refresh);
  }, []);

  const activeCategory = categories.find((category) => category.slug === categorySlug);
  const missingCategory = Boolean(categorySlug && !isLoading && !loadError && !activeCategory);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = page;
  const showUpdated = sort === "updated" || (manage && sort !== "created");
  const dateOf = (post: PostSummary) => showUpdated ? post.updatedAtUtc : post.createdAtUtc ?? post.publishedAtUtc ?? post.updatedAtUtc;
  const visiblePosts = posts;
  const firstPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstPage + index);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  async function savePriority(event: FormEvent<HTMLFormElement>, post: PostSummary) {
    event.preventDefault();
    if (savingPriority !== null || deleting !== null) return;
    const priority = Number(priorities[post.postNumber] ?? post.priority ?? 0);
    if (!Number.isInteger(priority) || priority < 0 || priority > 10000) return;
    setSavingPriority(post.postNumber); setActionError(""); setMessage("");
    try {
      const response = await fetch(`/api/posts/${post.postNumber}/priority`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority, expectedRevision: post.revision }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "우선순위를 저장하지 못했습니다."));
      setPriorities(values => { const next = { ...values }; delete next[post.postNumber]; return next; });
      setMessage(`“${post.title}” 우선순위를 저장했습니다.`);
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "우선순위를 저장하지 못했습니다.");
      setReload(value => value + 1);
    } finally { setSavingPriority(null); }
  }

  async function deletePost(post: PostSummary) {
    if (deleting !== null || savingPriority !== null || !window.confirm(`“${post.title}” 글을 휴지통으로 옮길까요? 글과 첨부 파일은 보관되며 복원할 수 있습니다.`)) return;
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
          <Heading>{manage ? (isOwner ? "게시글 전체 관리" : "내 글 관리") : bookmarked ? "북마크" : mine ? "내 글" : categorySlug ? activeCategory?.name ?? "카테고리" : "전체 글"}</Heading>
          <p>{manage ? "공개·비공개·코드 보호 글을 검색하고 관리합니다." : activeCategory?.description ?? "우선순위가 높은 글부터, 같은 순위에서는 최신 글부터 표시합니다."}</p>
        </div>
        <div className="board-heading-actions">
          {manage && isOwner ? <><Link href={embedded ? "#trash" : "/posts/trash"}>휴지통</Link><Link href={embedded ? "#storage" : "/storage"}>첨부 파일 점검</Link></> : null}
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
          <select value={sort} onChange={(event) => { setSort(event.target.value); setDirection(event.target.value === "title" ? "asc" : "desc"); setPage(1); }}>
            <option value="priority">우선순위</option><option value="created">작성일</option>
            <option value="updated">수정일</option><option value="title">제목</option>
          </select>
        </label>
        <label><span className="sr-only">정렬 방향</span>
          <select value={direction} onChange={event => { setDirection(event.target.value); setPage(1); }}>
            <option value="desc">내림차순{sort === "priority" ? " (높은 순)" : sort === "title" ? " (역순)" : " (최신 순)"}</option>
            <option value="asc">오름차순{sort === "priority" ? " (낮은 순)" : sort === "title" ? " (가나다순)" : " (오래된 순)"}</option>
          </select>
        </label>
        <label className="board-search"><span className="sr-only">제목과 설명 검색</span>
          <input type="search" placeholder="제목·설명 검색" value={searchInput} maxLength={120} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
        <button type="submit">검색</button>
        {search || categoryId || visibility || sort !== "priority" || direction !== "desc" ? <button type="button" onClick={() => {
          setSearch(""); setSearchInput(""); setCategoryId(""); setVisibility(""); setPage(1); setSort("priority"); setDirection("desc");
        }}>초기화</button> : null}
      </form>
      {manage && isOwner ? <p className="board-notice">우선순위는 0~10,000이며 숫자가 클수록 먼저 표시됩니다. 같은 순위는 최신 글순입니다. 값을 바꾼 뒤 저장해 주세요.</p> : null}
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
                <th scope="col" className="board-date">{showUpdated ? "수정일" : "작성일"}</th>
                {manage && isOwner ? <th scope="col" className="board-priority">우선순위</th> : null}
                {manage ? <th scope="col" className="board-actions">관리</th> : null}
              </tr></thead>
              <tbody>
                {visiblePosts.map((post) => <tr key={post.postNumber}>
                  <td className="board-number">{post.postNumber}</td>
                  <td className="board-category"><span title={post.categoryName ?? "미분류"}>{post.categoryName ?? "미분류"}</span></td>
                  <td className="board-title"><Link href={postPath(post)} title={post.title}>{post.title}</Link></td><td>{post.authorName}</td>
                  <td className="board-visibility"><span data-visibility={post.visibility}>{visibilityLabels[post.visibility]}</span></td>
                  <td className="board-date"><time dateTime={dateOf(post)}>
                    {formatDate(dateOf(post))}
                  </time></td>
                  {manage && isOwner ? <td className="board-priority"><form onSubmit={event => void savePriority(event, post)}>
                    <input type="number" min={0} max={10000} step={1} required aria-label={`${post.title} 우선순위`}
                      value={priorities[post.postNumber] ?? post.priority ?? 0} disabled={savingPriority !== null || deleting !== null}
                      onChange={event => setPriorities(values => ({ ...values, [post.postNumber]: event.target.value }))} />
                    <button type="submit" disabled={savingPriority !== null || deleting !== null || Number(priorities[post.postNumber] ?? post.priority ?? 0) === (post.priority ?? 0)}
                      aria-label={`${post.title} 우선순위 저장`}>{savingPriority === post.postNumber ? "저장 중" : "저장"}</button>
                  </form></td> : null}
                  {manage ? <td className="board-actions"><div>
                    <Link href={`/write/${post.postNumber}`} aria-label={`${post.title} 수정`}>수정</Link>
                    <button type="button" disabled={deleting !== null || savingPriority !== null} aria-label={`${post.title} 삭제`}
                      onClick={() => void deletePost(post)}>{deleting === post.postNumber ? "삭제 중" : "삭제"}</button>
                  </div></td> : null}
                </tr>)}
                {visiblePosts.length === 0 ? <tr><td colSpan={manage ? (isOwner ? 8 : 7) : 6} className="board-empty">
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
