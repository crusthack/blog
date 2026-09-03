"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { type PostAsset, readProblem } from "@/lib/contracts";

type PostAssetManagerProps = {
  postNumber: string;
  onInsertMarkdown: (markdown: string) => void;
};

const acceptedExtensions = new Set(["jpg", "jpeg", "png", "pdf"]);
const maxImageFileSize = 10 * 1024 * 1024;
const maxPdfFileSize = 25 * 1024 * 1024;

export function PostAssetManager({ postNumber, onInsertMarkdown }: PostAssetManagerProps) {
  const [assets, setAssets] = useState<PostAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const encodedPostNumber = encodeURIComponent(postNumber);

  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/posts/${encodedPostNumber}/assets`, {
        cache: "no-store",
        credentials: "include",
        signal,
      });
      if (!response.ok) {
        throw new Error(await readProblem(response, "첨부 파일 목록을 불러오지 못했습니다."));
      }
      setAssets((await response.json()) as PostAsset[]);
      setError("");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "첨부 파일 목록을 불러오지 못했습니다.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [encodedPostNumber]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadAssets(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadAssets]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function clearSelectedFile() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setFile(null);
    setName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    setMessage("");

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);

    if (!selected) {
      setFile(null);
      return;
    }

    const extension = selected.name.split(".").pop()?.toLowerCase() ?? "";
    if (!acceptedExtensions.has(extension)) {
      setFile(null);
      event.target.value = "";
      setError("JPG, PNG 또는 PDF 파일만 선택할 수 있습니다.");
      return;
    }

    const maximumSize = extension === "pdf" ? maxPdfFileSize : maxImageFileSize;
    if (selected.size > maximumSize) {
      setFile(null);
      event.target.value = "";
      setError(extension === "pdf" ? "PDF는 25MB 이하여야 합니다." : "이미지는 10MB 이하여야 합니다.");
      return;
    }

    setFile(selected);
    setName(selected.name.replace(/\.[^.]+$/, ""));
    if (extension !== "pdf") {
      const nextPreviewUrl = URL.createObjectURL(selected);
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !name.trim() || activeAction) return;

    setActiveAction("upload");
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("name", name.trim());
      const response = await fetch(`/api/posts/${encodedPostNumber}/assets`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) {
        throw new Error(await readProblem(response, "첨부 파일을 업로드하지 못했습니다."));
      }
      clearSelectedFile();
      setMessage("첨부 파일을 업로드했습니다.");
      await loadAssets();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "첨부 파일을 업로드하지 못했습니다.");
    } finally {
      setActiveAction(null);
    }
  }

  async function renameAsset(asset: PostAsset) {
    if (activeAction) return;
    const nextName = window.prompt("새 첨부 파일 이름", asset.name)?.trim();
    if (!nextName || nextName === asset.name) return;

    setActiveAction(asset.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/posts/${encodedPostNumber}/assets/${encodeURIComponent(asset.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        },
      );
      if (!response.ok) {
        throw new Error(await readProblem(response, "첨부 파일 이름을 변경하지 못했습니다."));
      }
      setMessage("첨부 파일 이름을 변경했습니다.");
      await loadAssets();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "첨부 파일 이름을 변경하지 못했습니다.");
    } finally {
      setActiveAction(null);
    }
  }

  async function deleteAsset(asset: PostAsset) {
    if (activeAction || !window.confirm(`'${asset.name}${asset.extension}' 파일을 삭제할까요?`)) return;

    setActiveAction(asset.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/posts/${encodedPostNumber}/assets/${encodeURIComponent(asset.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(await readProblem(response, "첨부 파일을 삭제하지 못했습니다."));
      }
      setMessage("첨부 파일을 삭제했습니다.");
      await loadAssets();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "첨부 파일을 삭제하지 못했습니다.");
    } finally {
      setActiveAction(null);
    }
  }

  async function copyMarkdown(asset: PostAsset) {
    try {
      await navigator.clipboard.writeText(markdownForAsset(asset));
      setError("");
      setMessage("Markdown 문법을 복사했습니다.");
    } catch {
      setMessage("");
      setError("클립보드에 복사하지 못했습니다.");
    }
  }

  function insertMarkdown(asset: PostAsset) {
    onInsertMarkdown(markdownForAsset(asset));
    setError("");
    setMessage("현재 커서 위치에 Markdown 문법을 삽입했습니다.");
  }

  return (
    <section data-ui="panel" className="min-w-0 bg-white p-5 sm:p-6 dark:bg-[#252525]">
      <div className="mb-5">
        <p className="text-sm font-black tracking-[0.16em] text-emerald-600">POST ASSETS</p>
        <h2 className="mt-2 text-2xl font-black">이미지·PDF 첨부</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          JPG·PNG는 10MB, PDF는 25MB까지 올리고 본문의 현재 커서 위치에 Markdown으로 삽입할 수 있습니다.
        </p>
      </div>

      {error ? (
        <p data-ui="notice" className="mb-4 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p data-ui="notice" className="mb-4 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" role="status">
          {message}
        </p>
      ) : null}

      <form className="grid gap-4 border border-gray-200 p-4 dark:border-gray-700" onSubmit={upload}>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">파일</span>
          <input
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            className="block w-full text-sm file:mr-3 file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-bold dark:file:bg-gray-700 dark:file:text-gray-100"
            disabled={activeAction !== null}
            onChange={selectFile}
            ref={fileInputRef}
            type="file"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold">표시 이름</span>
          <input
            data-ui="input"
            className="w-full border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-600"
            disabled={activeAction !== null}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            placeholder="본문과 파일 목록에 표시할 이름"
            required
            value={name}
          />
        </label>

        {file ? (
          <div className="flex min-w-0 items-center gap-4 border border-dashed border-gray-300 p-3 dark:border-gray-600">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${name || file.name} 업로드 미리보기`}
                className="h-20 w-28 shrink-0 object-contain"
                decoding="async"
                referrerPolicy="no-referrer"
                src={previewUrl}
              />
            ) : (
              <span className="flex h-20 w-28 shrink-0 items-center justify-center bg-red-50 font-black text-red-700 dark:bg-red-950/40 dark:text-red-300">
                PDF
              </span>
            )}
            <div className="min-w-0">
              <strong className="block truncate">{file.name}</strong>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.size)}</span>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            data-ui="action"
            className="bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!file || !name.trim() || activeAction !== null}
            type="submit"
          >
            {activeAction === "upload" ? "업로드 중..." : "첨부 업로드"}
          </button>
          {file ? (
            <button
              data-ui="action"
              className="border border-gray-300 px-4 py-2.5 text-sm font-bold transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
              disabled={activeAction !== null}
              onClick={clearSelectedFile}
              type="button"
            >
              선택 취소
            </button>
          ) : null}
        </div>
      </form>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">업로드된 파일</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">{assets.length}개</span>
        </div>
        {isLoading ? (
          <p className="border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            첨부 파일을 불러오고 있습니다.
          </p>
        ) : assets.length === 0 ? (
          <p className="border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            아직 업로드된 파일이 없습니다.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.map((asset) => {
              const assetUrl = safeMediaUrl(asset.url);
              const isPdf = isPdfAsset(asset);
              const isWorking = activeAction === asset.id;
              return (
                <article className="min-w-0 overflow-hidden border border-gray-200 dark:border-gray-700" key={asset.id}>
                  {assetUrl && !isPdf ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={asset.name}
                      className="h-36 w-full bg-gray-50 object-contain dark:bg-gray-900"
                      decoding="async"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={assetUrl}
                    />
                  ) : (
                    <div className="flex h-36 items-center justify-center bg-gray-50 dark:bg-gray-900">
                      <span className="font-black text-red-700 dark:text-red-300">{isPdf ? "PDF" : "미리보기 없음"}</span>
                    </div>
                  )}
                  <div className="p-4">
                    <strong className="block truncate" title={`${asset.name}${asset.extension}`}>
                      {asset.name}{asset.extension}
                    </strong>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{formatBytes(asset.size)}</span>
                    {assetUrl ? (
                      <a
                        className="mt-2 inline-block text-xs font-bold text-emerald-600 underline"
                        href={assetUrl}
                        referrerPolicy="no-referrer"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        새 탭에서 열기
                      </a>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className={smallButtonClass} disabled={isWorking || activeAction !== null} onClick={() => insertMarkdown(asset)} type="button">
                        본문에 삽입
                      </button>
                      <button className={smallButtonClass} disabled={isWorking || activeAction !== null} onClick={() => void copyMarkdown(asset)} type="button">
                        Markdown 복사
                      </button>
                      <button className={smallButtonClass} disabled={isWorking || activeAction !== null} onClick={() => void renameAsset(asset)} type="button">
                        이름 변경
                      </button>
                      <button
                        className="border border-red-300 px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                        disabled={isWorking || activeAction !== null}
                        onClick={() => void deleteAsset(asset)}
                        type="button"
                      >
                        {isWorking ? "처리 중..." : "삭제"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const smallButtonClass = "border border-gray-300 px-2.5 py-1.5 text-xs font-bold transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50 dark:border-gray-600 dark:hover:border-emerald-500 dark:hover:text-emerald-300";

function markdownForAsset(asset: PostAsset) {
  const source = isPdfAsset(asset) ? withPdfFormat(asset.url) : asset.url;
  const escapedName = asset.name.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
  const escapedSource = source.replaceAll("<", "%3C").replaceAll(">", "%3E");
  return `![${escapedName}](<${escapedSource}>)`;
}

function withPdfFormat(url: string) {
  if (/[?&]format=pdf(?:&|$)/i.test(url)) return url;
  const hashIndex = url.indexOf("#");
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  return `${base}${base.includes("?") ? "&" : "?"}format=pdf${hash}`;
}

function isPdfAsset(asset: PostAsset) {
  return asset.contentType === "application/pdf" || asset.extension.toLowerCase() === ".pdf";
}

function safeMediaUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, "https://blog.invalid");
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
