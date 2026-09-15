"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { BlogFrame } from "@/components/BlogFrame";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { useAuth } from "@/components/auth/AuthProvider";
import { type PostDetail, readProblem, visibilityLabels } from "@/lib/contracts";

export function PostView({ postNumber }: { postNumber: string }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <main className="p-10">글을 불러오고 있습니다.</main>;
  return <PostContent key={`${postNumber}:${user?.id ?? "visitor"}`} postNumber={postNumber} />;
}

function PostContent({ postNumber }: { postNumber: string }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState("");
  const [lockedTitle, setLockedTitle] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (isAuthLoading) return;
    const controller = new AbortController();
    void fetch(`/api/posts/${postNumber}`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) {
          const locked = await response.json();
          if (locked.requiresAccessCode) {
            setLockedTitle(locked.title);
            return null;
          }
          throw new Error("이 글을 열람할 수 없습니다.");
        }
        if (!response.ok) throw new Error(await readProblem(response, "글을 찾지 못했습니다."));
        setLockedTitle(null);
        return (await response.json()) as PostDetail;
      })
      .then(setPost)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "글을 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [isAuthLoading, postNumber, reload]);

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
      <BlogFrame>
        <p data-ui="notice" className="border-red-500 bg-red-50 p-5 text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>
      </BlogFrame>
    );
  }
  if (lockedTitle !== null) {
    return (
      <BlogFrame>
        <section className="post-view p-8 md:p-12">
          <h1 className="text-3xl font-bold">{lockedTitle}</h1>
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
      <BlogFrame>
        <p className="min-h-[50vh] text-gray-500">글을 불러오고 있습니다.</p>
      </BlogFrame>
    );
  }

  const readingMinutes = Math.max(1, Math.ceil(post.content.trim().split(/\s+/).length / 250));

  return (
    <BlogFrame>
      <article
        className="post-view min-h-screen w-full rounded-2xl border border-gray-200 p-8 shadow-sm dark:border-gray-700 md:p-12"
        data-view="post"
      >
        <header className="mb-8 border-b border-gray-200 pb-7 dark:border-gray-700">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span>{visibilityLabels[post.visibility]}</span>
            {post.categoryName ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {post.categoryName}
              </span>
            ) : null}
            <span className="text-gray-500">약 {readingMinutes}분</span>
            {user?.isOwner ? (
              <Link
                data-ui="action"
                className="ml-auto bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700"
                href={`/write/${post.postNumber}`}
              >
                편집
              </Link>
            ) : null}
          </div>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">{post.title}</h1>
          {post.description ? (
            <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-300">{post.description}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-gray-500">
            <time dateTime={post.createdAtUtc}>작성 {formatDate(post.createdAtUtc)}</time>
            <time dateTime={post.updatedAtUtc}>수정 {formatDate(post.updatedAtUtc)}</time>
          </div>
        </header>
        <div className="post-view-body">
          <div className="post-view-markdown rounded-md p-6">
            <MarkdownContent source={post.content} />
          </div>
        </div>
      </article>
    </BlogFrame>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
