"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { type Category, type PostDetail, readProblem } from "@/lib/contracts";

const initialContent = "# 새 글\n\nMarkdown으로 내용을 작성하세요.";

export function PostEditor({ postNumber }: { postNumber?: string }) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(initialContent);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [publish, setPublish] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(postNumber));
  const [isSaving, setIsSaving] = useState(false);
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
        setPublish(post.status === "Published");
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
        body: JSON.stringify({ title, description, content, categoryId: categoryId || null, publish }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "글을 저장하지 못했습니다."));
      const saved = (await response.json()) as PostDetail;
      router.push(`/posts/${saved.postNumber}`);
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

  if (isAuthLoading || isLoading) return <main className="content-shell"><p className="muted">편집기를 준비하고 있습니다.</p></main>;
  if (!user?.isOwner) return null;

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Markdown editor</p>
          <h1>{postNumber ? "글 편집" : "새 글 작성"}</h1>
        </div>
        <button className="primary-button save-button" type="submit" form="post-editor" disabled={isSaving}>
          {isSaving ? "저장 중..." : publish ? "게시글 저장" : "초안 저장"}
        </button>
      </header>

      {error ? <p className="notice notice-error">{error}</p> : null}

      <div className="editor-grid">
        <form id="post-editor" className="editor-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>제목</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required />
          </label>
          <label className="field">
            <span>설명</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          </label>
          <label className="field">
            <span>카테고리</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">분류 없음</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Markdown 본문</span>
            <span className="editor-toolbar" role="toolbar" aria-label="Markdown 서식">
              <button type="button" onClick={() => insertMarkdown("## ", "", "소제목")}>H2</button>
              <button type="button" onClick={() => insertMarkdown("**", "**")}>굵게</button>
              <button type="button" onClick={() => insertMarkdown("[", "](https://)", "링크 이름")}>링크</button>
              <button type="button" onClick={() => insertMarkdown("- ", "", "목록")}>목록</button>
              <button type="button" onClick={() => insertMarkdown("```\n", "\n```", "code")}>코드</button>
              <button type="button" onClick={() => insertMarkdown("> ", "", "인용")}>인용</button>
            </span>
            <textarea ref={editorRef} className="markdown-editor" value={content} onChange={(event) => setContent(event.target.value)} required spellCheck={false} />
          </label>
          <label className="publish-control">
            <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
            공개 게시
          </label>
        </form>

        <section className="preview-panel">
          <p className="eyebrow">Preview</p>
          {categories.find((category) => category.id === categoryId) ? <p className="category-kicker">{categories.find((category) => category.id === categoryId)?.name}</p> : null}
          <h1>{title || "제목 미리보기"}</h1>
          {description ? <p className="lead">{description}</p> : null}
          <MarkdownContent source={content} />
        </section>
      </div>
    </main>
  );
}
