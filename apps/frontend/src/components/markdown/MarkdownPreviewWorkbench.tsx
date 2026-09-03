"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { MarkdownContent } from "@/components/posts/MarkdownContent";

const MAX_SOURCE_LENGTH = 500_000;
const PREVIEW_DELAY_MS = 250;
const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown|mdx)$/i;

const SAMPLE_MARKDOWN = `---
title: "Markdown 미리보기"
date: "2026-09-03"
description: "저장하지 않고 Markdown 렌더링 결과를 확인하는 예시입니다."
---

# Markdown을 바로 확인해 보세요

왼쪽 원문을 수정하면 오른쪽 미리보기가 자동으로 갱신됩니다.

## 지원 예시

- **굵은 글씨**와 *기울임 글씨*
- [링크](https://github.com/crusthack/blog)
- 표, 체크리스트, 코드 블록을 포함한 GFM 문법

| 항목 | 상태 |
| --- | --- |
| 로컬 파일 | 브라우저에서만 읽음 |
| 서버 저장 | 하지 않음 |

\`\`\`ts
const message = "실행되지 않고 코드로만 표시됩니다.";
\`\`\`
`;

type PreviewDocument = {
  title: string;
  date: string;
  description: string;
  content: string;
};

function stripScalarQuotes(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseMarkdownDocument(source: string, fileName: string): PreviewDocument {
  const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatter: Record<string, string> = {};
  let content = source;

  if (frontmatterMatch) {
    for (const line of frontmatterMatch[1].split(/\r?\n/)) {
      const scalarMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!scalarMatch) continue;
      frontmatter[scalarMatch[1]] = stripScalarQuotes(scalarMatch[2]);
    }
    content = source.slice(frontmatterMatch[0].length);
  }

  const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fileTitle = fileName.replace(MARKDOWN_FILE_PATTERN, "").trim();

  return {
    title: frontmatter.title?.trim() || firstHeading || fileTitle || "Markdown 미리보기",
    date: frontmatter.date?.trim() || "",
    description: frontmatter.description?.trim() || "",
    content,
  };
}

function isMarkdownFile(file: File) {
  return MARKDOWN_FILE_PATTERN.test(file.name);
}

export function MarkdownPreviewWorkbench() {
  const [source, setSource] = useState(SAMPLE_MARKDOWN);
  const [previewSource, setPreviewSource] = useState(SAMPLE_MARKDOWN);
  const [fileName, setFileName] = useState("sample.md");
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreviewSource(source);
    }, PREVIEW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [source]);

  const sourceLengthError =
    source.length > MAX_SOURCE_LENGTH
      ? `Markdown 원문은 최대 ${MAX_SOURCE_LENGTH.toLocaleString("ko-KR")}자까지 미리볼 수 있습니다.`
      : "";
  const error = fileError || sourceLengthError;
  const preview = useMemo(
    () =>
      previewSource.trim() && !error
        ? parseMarkdownDocument(previewSource, fileName)
        : null,
    [error, fileName, previewSource],
  );
  const isUpdating = !error && source !== previewSource;

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (!isMarkdownFile(file)) {
      setFileError(".md, .markdown 또는 .mdx 파일을 선택해 주세요.");
      return;
    }

    try {
      const nextSource = await file.text();
      if (nextSource.length > MAX_SOURCE_LENGTH) {
        setFileError(
          `Markdown 원문은 최대 ${MAX_SOURCE_LENGTH.toLocaleString("ko-KR")}자까지 미리볼 수 있습니다.`,
        );
        return;
      }

      setFileError("");
      setFileName(file.name);
      setSource(nextSource);
    } catch {
      setFileError("파일을 읽지 못했습니다. 다른 Markdown 파일로 다시 시도해 주세요.");
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const markdownFile = Array.from(event.dataTransfer.files).find(isMarkdownFile);
    void loadFile(markdownFile ?? event.dataTransfer.files[0]);
  }

  function loadSample() {
    setFileError("");
    setFileName("sample.md");
    setSource(SAMPLE_MARKDOWN);
  }

  function clearSource() {
    setFileError("");
    setFileName("");
    setSource("");
  }

  return (
    <main
      className="min-h-[calc(100vh-4rem)] px-4 py-8"
      data-ui-page="operational"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <section
            aria-label="Markdown 파일 불러오기"
            className={`border bg-white p-4 shadow-sm transition dark:bg-[#252525] ${
              isDragging
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800"
                : "border-gray-200 dark:border-gray-700"
            }`}
            data-ui="panel"
          >
            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100">
              Markdown 임시 미리보기
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              파일을 서버에 업로드하거나 내용을 저장하지 않습니다. MDX JavaScript와 Raw HTML은 실행하지 않습니다.
            </p>

            <div
              className={`mt-4 flex min-h-28 items-center justify-center border border-dashed px-4 py-6 text-center text-sm transition ${
                isDragging
                  ? "border-blue-500 bg-white text-blue-700 dark:bg-gray-900 dark:text-blue-300"
                  : "border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"
              }`}
            >
              Markdown 파일을 이 페이지에 끌어놓거나 아래에서 선택하세요.
            </div>

            <label className="mt-4 block">
              <span className="sr-only">Markdown 파일 선택</span>
              <input
                accept=".md,.markdown,.mdx,text/markdown,text/x-markdown"
                className="block w-full text-sm text-gray-700 file:mr-3 file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-2 file:text-sm file:font-bold hover:file:bg-gray-100 dark:text-gray-300 dark:file:border-gray-600 dark:file:bg-gray-900 dark:hover:file:bg-gray-800"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  void loadFile(file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="border border-gray-300 bg-white px-3 py-2 text-sm font-bold transition hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:bg-gray-900 dark:hover:text-emerald-300"
                data-ui="action"
                onClick={loadSample}
                type="button"
              >
                예시 불러오기
              </button>
              <button
                className="border border-gray-300 bg-white px-3 py-2 text-sm font-bold transition hover:border-red-400 hover:text-red-700 dark:border-gray-600 dark:bg-gray-900 dark:hover:text-red-300"
                data-ui="action"
                onClick={clearSource}
                type="button"
              >
                비우기
              </button>
            </div>

            {fileName ? (
              <p className="mt-3 break-all font-mono text-xs text-gray-500 dark:text-gray-400">
                {fileName}
              </p>
            ) : null}
            <div aria-live="polite" className="mt-2 min-h-5 text-sm">
              {isUpdating ? (
                <p className="font-bold text-blue-600 dark:text-blue-300">미리보기 갱신 중…</p>
              ) : null}
            </div>
            {error ? (
              <p
                className="mt-2 border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </section>

          <section
            className="border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-[#252525]"
            data-ui="panel"
          >
            <label className="block" htmlFor="markdown-source">
              <span className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-gray-800 dark:text-gray-200">
                <span>Markdown 원문</span>
                <span className="font-mono text-xs font-normal text-gray-500 dark:text-gray-400">
                  {source.length.toLocaleString("ko-KR")} / {MAX_SOURCE_LENGTH.toLocaleString("ko-KR")}
                </span>
              </span>
              <textarea
                className="h-[52vh] min-h-80 w-full resize-y border border-gray-300 bg-gray-50 p-3 font-mono text-sm leading-relaxed text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-400"
                data-ui="input"
                id="markdown-source"
                onChange={(event) => {
                  setFileError("");
                  if (!fileName) setFileName("draft.md");
                  setSource(event.target.value);
                }}
                placeholder="# 제목\n\nMarkdown을 붙여넣거나 직접 작성하세요."
                spellCheck={false}
                value={source}
              />
            </label>
          </section>
        </aside>

        <section aria-label="Markdown 렌더링 미리보기" className="min-w-0">
          {preview ? (
            <article
              className="post-view min-h-[60vh] w-full border border-gray-200 p-4 shadow-sm dark:border-gray-700 sm:p-7"
              data-view="post"
            >
              <p className="mb-5 text-sm font-black tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                MARKDOWN PREVIEW
              </p>
              <header className="mb-8 border-b border-gray-300 pb-6 dark:border-gray-700">
                <h2 className="text-3xl font-black leading-tight sm:text-4xl">{preview.title}</h2>
                {preview.date ? (
                  <time className="mt-3 block text-sm text-gray-500">{preview.date}</time>
                ) : null}
                {preview.description ? (
                  <p className="post-view-muted mt-3 max-w-prose text-lg leading-relaxed">
                    {preview.description}
                  </p>
                ) : null}
              </header>
              <div className="post-view-body">
                <div className="post-view-markdown p-1 sm:p-3">
                  <MarkdownContent source={preview.content} />
                </div>
              </div>
            </article>
          ) : (
            <div
              className="flex min-h-[60vh] items-center justify-center border border-dashed border-gray-300 bg-white px-6 text-center text-gray-500 dark:border-gray-700 dark:bg-[#252525] dark:text-gray-400"
              data-ui="panel"
            >
              {error
                ? "원문 오류를 해결하면 미리보기가 표시됩니다."
                : "Markdown을 입력하거나 파일을 선택하면 미리보기가 표시됩니다."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
