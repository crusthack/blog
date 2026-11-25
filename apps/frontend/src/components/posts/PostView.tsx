"use client";
import { PostArticle } from "./PostArticle";

import { categoriesUpdatedEvent } from "@/lib/uiEvents";
import { PostDiscussion } from "./PostDiscussion";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BlogFrame } from "@/components/BlogFrame";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { useAuth } from "@/components/auth/AuthProvider";
import { type PostDetail, readProblem, visibilityLabels } from "@/lib/contracts";
import { PostAttachments } from "./PostAttachments";
import { postPath } from "@/lib/postPaths";
import { getMarkdownHeadings } from "@/lib/markdownHeadings";
import { PostToc } from "@/components/posts/PostToc";
import dynamic from "next/dynamic";

const SlideWorkspace = dynamic(() => import("@/components/slides/SlideWorkspace"), { loading: () => <p className="p-10">슬라이드를 준비하고 있습니다.</p> });

export function PostView({ postNumber, slideMode = false }: { postNumber: string; slideMode?: boolean }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <main className="p-10">글을 불러오고 있습니다.</main>;
  return <PostContent key={`${postNumber}:${user?.id ?? "visitor"}:${slideMode}`} postNumber={postNumber} slideMode={slideMode} />;
}

function PostContent({ postNumber, slideMode }: { postNumber: string; slideMode: boolean }) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");
  const [lockedTitle, setLockedTitle] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [reload, setReload] = useState(0);
  const headings = useMemo(() => post ? getMarkdownHeadings(post.content) : [], [post]);

  useEffect(() => {
    if (isAuthLoading) return;
    const controller = new AbortController();
    function normalizePostPath(data: { postNumber: number; categorySlug: string | null }) {
      if (controller.signal.aborted) return;
      const path = postPath(data) + (slideMode ? "/slides" : "");
      if (window.location.pathname !== path) {
        router.replace(`${path}${window.location.search}${window.location.hash}`, { scroll: false });
      }
    }
    void fetch(`/api/posts/${postNumber}`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) {
          const locked = await response.json();
          if (locked.requiresAccessCode) {
            normalizePostPath(locked);
            setLockedTitle(locked.title);
            return null;
          }
          throw new Error("이 글을 열람할 수 없습니다.");
        }
        if (!response.ok) throw new Error(await readProblem(response, "글을 찾지 못했습니다."));
        const detail = (await response.json()) as PostDetail;
        if (controller.signal.aborted) return null;
        normalizePostPath(detail);
        setLockedTitle(null);
        return detail;
      })
      .then(setPost)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "글을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [isAuthLoading, postNumber, reload, router, slideMode]);

  async function deletePost() {
    if (!post || deleting || !window.confirm(`“${post.title}” 글을 휴지통으로 옮길까요? 글과 첨부 파일은 보관됩니다.`)) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`/api/posts/${post.postNumber}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error(await readProblem(response, "글을 삭제하지 못했습니다."));
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      router.replace("/posts");
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "글을 삭제하지 못했습니다.");
      setDeleting(false);
    }
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUnlocking(true);
    setUnlockError("");
    try {
      const response = await fetch(`/api/posts/${postNumber}/unlock`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode }),
      });
      if (response.status === 429) throw new Error("시도 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.");
      if (!response.ok) throw new Error(await readProblem(response, "글을 열지 못했습니다."));
      setAccessCode("");
      setReload((value) => value + 1);
    } catch (reason) {
      setUnlockError(reason instanceof Error ? reason.message : "글을 열지 못했습니다.");
    } finally {
      setIsUnlocking(false);
    }
  }

  if (error) {
    return (
      <BlogFrame rightSidebar={null}>
        <p data-ui="notice" className="border-red-500 bg-red-50 p-5 text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>
      </BlogFrame>
    );
  }
  if (lockedTitle !== null) {
    return (
      <BlogFrame rightSidebar={<p>접근 코드를 입력하면 본문 목차가 표시됩니다.</p>}>
        <section className="post-view p-8 md:p-12">
          <h1 className="text-3xl font-bold">{lockedTitle}</h1>
          <p className="mt-2 text-sm">공개 범위 · {visibilityLabels.CodeProtected}</p>
          <p className="mt-4">접근 코드를 입력하면 본문과 첨부 파일을 12시간 동안 볼 수 있습니다.</p>
          <form onSubmit={unlock} className="mt-6 max-w-md space-y-4">
            <label className="block font-bold">접근 코드
              <input type="password" autoComplete="off" required minLength={4} maxLength={128}
                className="mt-2 block w-full border border-gray-400 bg-transparent p-3"
                value={accessCode} onChange={(event) => setAccessCode(event.target.value)} />
            </label>
            {unlockError ? <p role="alert" className="text-red-600">{unlockError}</p> : null}
            <button data-ui="action" type="submit" disabled={isUnlocking}
              className="bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">
              {isUnlocking ? "확인 중..." : "글 열기"}
            </button>
          </form>
        </section>
      </BlogFrame>
    );
  }
  if (!post) {
    return (
      <BlogFrame rightSidebar={null}>
        <p className="min-h-[50vh] text-gray-500">글을 불러오고 있습니다.</p>
      </BlogFrame>
    );
  }

  if (slideMode) return <SlideWorkspace post={post} userId={user?.id ?? null} />;

  return (
    <BlogFrame rightSidebar={<PostToc headings={headings} />}>
      <PostArticle post={post}
        actions={<>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
            <Link href={`${postPath(post)}/slides`} className="post-slide-link">슬라이드로 보기</Link>
            {post.canEdit ? (
              <>
              <Link
                data-ui="action"
                className="bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700"
                href={`/write/${post.postNumber}`}
              >
                수정
              </Link>
              <button type="button" data-ui="action" className="border border-red-400 px-4 py-2 text-sm text-red-600 disabled:opacity-50" disabled={deleting} onClick={() => void deletePost()}>{deleting ? "삭제 중…" : "삭제"}</button>
              </>
            ) : null}
          </div>
          {deleteError && <p role="alert" className="mb-4 text-red-600">{deleteError}</p>}
        </>}
        attachments={<PostAttachments key={`${post.postNumber}:${user?.id ?? "visitor"}`} postNumber={post.postNumber} isOwner={Boolean(user?.isOwner)} />}
        discussion={<PostDiscussion key={`${post.postNumber}:${user?.id ?? "visitor"}`} postNumber={post.postNumber} />}
      >
        <MarkdownContent source={post.content} />
      </PostArticle>
    </BlogFrame>
  );
}
