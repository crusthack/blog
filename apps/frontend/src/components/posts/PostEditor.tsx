"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { PostAssetManager } from "@/components/posts/PostAssetManager";
import { postPath } from "@/lib/postPaths";
import { type Category, type PostDetail, type PostVisibility, readProblem, visibilityLabels } from "@/lib/contracts";

const initialContent = "# 새 글\n\nMarkdown으로 내용을 작성하세요.";

export function PostEditor({ postNumber }: { postNumber?: string }) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(initialContent);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>("Public");
  const [accessCode, setAccessCode] = useState("");
  const [hasAccessCode, setHasAccessCode] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(postNumber));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user?.isOwner) {
      router.replace("/login");
      return;
    }
    if (!postNumber) return;

    const controller = new AbortController();
    void fetch(`/api/posts/${postNumber}`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readProblem(response, "글을 불러오지 못했습니다."));
        return (await response.json()) as PostDetail;
      })
      .then((post) => {
        setTitle(post.title);
        setDescription(post.description ?? "");
        setContent(post.content);
        setCategoryId(post.categoryId ?? "");
        setVisibility(post.visibility);
        setHasAccessCode(post.visibility === "CodeProtected");
        setAccessCode("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "글을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [isAuthLoading, postNumber, router, user]);

  useEffect(() => {
    if (!user?.isOwner) return;
    const controller = new AbortController();
    void fetch("/api/categories", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readProblem(response, "카테고리를 불러오지 못했습니다."));
        return (await response.json()) as Category[];
      })
      .then(setCategories)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError"))
          setError(reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(postNumber ? `/api/posts/${postNumber}` : "/api/posts", {
        method: postNumber ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description, content, categoryId: categoryId || null, visibility,
          accessCode: visibility === "CodeProtected" && accessCode ? accessCode : null,
        }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "글을 저장하지 못했습니다."));
      const saved = (await response.json()) as PostDetail;
      router.push(postPath(saved));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "글을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function insertMarkdown(before: string, after = "", placeholder = "텍스트") {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    setContent(`${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`);
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function insertAssetMarkdown(markdown: string) {
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? content.length;
    const end = editor?.selectionEnd ?? start;
    const contentBefore = content.slice(0, start);
    const contentAfter = content.slice(end);
    const leadingBreak = contentBefore.length === 0 || contentBefore.endsWith("\n\n")
      ? ""
      : contentBefore.endsWith("\n") ? "\n" : "\n\n";
    const trailingBreak = contentAfter.length === 0 || contentAfter.startsWith("\n\n")
      ? ""
      : contentAfter.startsWith("\n") ? "\n" : "\n\n";
    const inserted = `${leadingBreak}${markdown}${trailingBreak}`;

    setContent(`${contentBefore}${inserted}${contentAfter}`);
    window.requestAnimationFrame(() => {
      if (!editor) return;
      const nextCursor = start + leadingBreak.length + markdown.length;
      editor.focus();
      editor.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function deletePost() {
    if (!postNumber || isSaving || isDeleting) return;
    if (!window.confirm("이 글을 완전히 삭제할까요? 삭제한 글은 복구할 수 없습니다.")) return;

    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(postNumber)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readProblem(response, "글을 삭제하지 못했습니다."));
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "글을 삭제하지 못했습니다.");
      setIsDeleting(false);
    }
  }

  if (isAuthLoading || isLoading) {
    return <main className="mx-auto max-w-7xl p-10 text-gray-500 dark:text-gray-400">편집기를 준비하고 있습니다.</main>;
  }
  if (!user?.isOwner) return null;

  return (
    <main data-ui-page="admin" className="mx-auto min-h-[80vh] w-full max-w-[1600px] px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black tracking-[0.16em] text-emerald-600">MARKDOWN EDITOR</p>
          <h1 className="mt-2 text-3xl font-black">{postNumber ? "글 편집" : "새 글 작성"}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            작성 화면과 미리보기를 함께 확인하며 글을 완성합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {postNumber ? (
            <button
              data-ui="action"
              className="border border-red-300 px-5 py-3 font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
              disabled={isSaving || isDeleting}
              onClick={() => void deletePost()}
              type="button"
            >
              {isDeleting ? "삭제 중..." : "글 삭제"}
            </button>
          ) : null}
          <button
            data-ui="action"
            className="bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            form="post-editor"
            disabled={isSaving || isDeleting}
          >
            {isSaving ? "저장 중..." : postNumber ? "수정 저장" : visibility === "Private" ? "비공개로 저장" : "게시하기"}
          </button>
        </div>
      </header>

      {error ? (
        <p data-ui="notice" className="mb-6 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <form
            data-ui="panel"
            id="post-editor"
            className="min-w-0 space-y-5 bg-white p-5 sm:p-6 dark:bg-[#252525]"
            onSubmit={handleSubmit}
          >
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-bold">공개 범위</legend>
            <div className="flex flex-wrap gap-4">
              {(Object.keys(visibilityLabels) as PostVisibility[]).map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="visibility" value={value} checked={visibility === value}
                    onChange={() => setVisibility(value)} />
                  {visibilityLabels[value]}
                </label>
              ))}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {visibility === "Public" ? "누구나 글과 첨부 파일을 볼 수 있습니다."
                : visibility === "Private" ? "로그인한 Owner만 볼 수 있으며 목록과 검색에서 숨깁니다."
                : "제목·설명은 공개되며 본문과 첨부 파일은 코드 입력 후 열립니다."}
            </p>
            {visibility === "CodeProtected" ? (
              <label className="block text-sm font-bold">
                접근 코드
                <input data-ui="input" type="password" autoComplete="new-password"
                  className="mt-2 block w-full border border-gray-300 bg-transparent px-4 py-3"
                  value={accessCode} onChange={(event) => setAccessCode(event.target.value)}
                  minLength={4} maxLength={128} required={!hasAccessCode}
                  placeholder={hasAccessCode ? "비워 두면 기존 코드 유지" : "4~128자 코드 입력"} />
                <span className="mt-2 block font-normal text-gray-500 dark:text-gray-400">
                  {hasAccessCode ? "새 코드를 저장하면 이전 코드와 기존 열람 권한이 무효화됩니다." : "방문자에게 전달할 코드를 지정하세요."}
                </span>
              </label>
            ) : null}
          </fieldset>
          <div className="grid gap-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-bold">제목</span>
            <input
              data-ui="input"
              className="w-full border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-600"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={240}
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">설명</span>
            <input
              data-ui="input"
              className="w-full border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-600"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">카테고리</span>
            <select
              data-ui="input"
              className="w-full border border-gray-300 bg-transparent px-4 py-3 dark:border-gray-600"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">분류 없음</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">Markdown 본문</span>
            <span
              className="mb-3 block border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
              role="toolbar"
              aria-label="Markdown 서식"
            >
              <span className="flex flex-wrap gap-2">
                <button data-ui="action" className="border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" type="button" onClick={() => insertMarkdown("## ", "", "소제목")}>H2</button>
                <button data-ui="action" className="border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" type="button" onClick={() => insertMarkdown("**", "**")}>굵게</button>
                <button data-ui="action" className="border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" type="button" onClick={() => insertMarkdown("[", "](https://)", "링크 이름")}>링크</button>
                <button data-ui="action" className="border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" type="button" onClick={() => insertMarkdown("- ", "", "목록")}>목록</button>
                <button data-ui="action" className="border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" type="button" onClick={() => insertMarkdown("```\n", "\n```", "code")}>코드</button>
                <button data-ui="action" className="border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" type="button" onClick={() => insertMarkdown("> ", "", "인용")}>인용</button>
              </span>
            </span>
            <textarea
              data-ui="input"
              ref={editorRef}
              className="min-h-[520px] w-full resize-y border border-gray-300 bg-transparent px-4 py-3 font-mono text-sm leading-6 dark:border-gray-600"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
              spellCheck={false}
            />
          </label>
          </form>

          {postNumber ? (
            <PostAssetManager postNumber={postNumber} onInsertMarkdown={insertAssetMarkdown} />
          ) : (
            <section data-ui="panel" className="bg-white p-5 sm:p-6 dark:bg-[#252525]">
              <p className="text-sm font-black tracking-[0.16em] text-emerald-600">POST ASSETS</p>
              <h2 className="mt-2 text-2xl font-black">이미지·PDF 첨부</h2>
              <p data-ui="notice" className="mt-4 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                첨부 파일은 글을 먼저 저장한 뒤 편집 화면에서 추가할 수 있습니다.
              </p>
            </section>
          )}
        </div>

        <section data-ui="panel" className="post-view min-h-[500px] min-w-0 overflow-auto bg-white p-5 sm:p-7 dark:bg-[#252525] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
          <p className="mb-5 text-sm font-black tracking-[0.16em] text-emerald-600">MARKDOWN PREVIEW</p>
          <header className="mb-6 border-b border-gray-200 pb-6 dark:border-gray-700">
            {categories.find((category) => category.id === categoryId) ? (
              <p className="mb-2 text-sm font-bold text-emerald-600">
                {categories.find((category) => category.id === categoryId)?.name}
              </p>
            ) : null}
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">{title || "제목 미리보기"}</h1>
            {description ? <p className="mt-3 leading-7 text-gray-600 dark:text-gray-300">{description}</p> : null}
          </header>
          <div className="post-view-body">
            <div className="post-view-markdown rounded-md p-1 sm:p-3">
              <MarkdownContent source={content} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
