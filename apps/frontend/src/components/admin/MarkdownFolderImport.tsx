import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { readProblem } from "@/lib/contracts";
import { markdownExtension, markdownParentFolder, maxImportBytes, maxImportFiles, parseMarkdownImport, type MarkdownImportFile } from "@/lib/markdownImport";
import { categoriesUpdatedEvent } from "@/lib/uiEvents";

type ImportResult = {
  relativePath: string;
  postNumber: number;
  skipped: boolean;
};

type PreviewRow = {
  path: string;
  file?: MarkdownImportFile;
  error?: string;
  selected?: boolean;
  result?: ImportResult;
};

export function MarkdownFolderImport() {
  const folderInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [visibility, setVisibility] = useState<"Private" | "Public">("Private");
  const [busy, setBusy] = useState<"reading" | "uploading" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = rows.filter(row => row.file && !row.result);
  const selectedCount = pending.filter(row => row.selected).length;

  async function readFolder(files: File[]) {
    if (!files.length) return;
    setBusy("reading");
    setVisibility("Private");
    setRows([]);
    setError("");
    setMessage("");
    const candidates = files.filter(file => markdownExtension.test(file.name))
      .sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, "ko"));

    try {
      if (!candidates.length) {
        setError("선택한 폴더에 .md 또는 .mdx 파일이 없습니다.");
        return;
      }
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const preview: PreviewRow[] = [];
      for (const candidate of candidates) {
        const path = candidate.webkitRelativePath;
        try {
          if (candidate.size > 4 * 1024 * 1024) throw new Error("파일이 4 MiB를 초과합니다.");
          let source: string;
          try {
            source = decoder.decode(await candidate.arrayBuffer());
          } catch {
            throw new Error("UTF-8 텍스트 파일을 읽을 수 없습니다.");
          }
          preview.push({ path, file: parseMarkdownImport(path, source), selected: true });
        } catch (reason) {
          preview.push({ path, error: reason instanceof Error ? reason.message : "파일을 읽을 수 없습니다." });
        }
      }
      setRows(preview);
    } finally {
      setBusy(null);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || selectedCount === 0 || selectedCount > maxImportFiles) return;
    setError("");
    setMessage("");
    const files = pending.filter(row => row.selected).map(row => row.file);
    const body = JSON.stringify({ files, visibility });
    if (new Blob([body]).size > maxImportBytes) {
      setError("업로드 요청이 16 MiB를 초과합니다. 파일을 나누어 선택해 주세요.");
      return;
    }

    setBusy("uploading");
    try {
      const response = await fetch("/api/posts/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!response.ok) throw new Error(await readProblem(response, "Markdown 글을 가져오지 못했습니다."));
      const results = await response.json() as ImportResult[];
      const byPath = new Map(results.map(result => [result.relativePath, result]));
      const skipped = results.filter(result => result.skipped).length;
      setRows(current => current.map(row => {
        const result = byPath.get(row.path);
        return result ? { ...row, result, selected: false } : row;
      }));
      setMessage(`가져온 글 ${results.length - skipped}개 · 중복으로 건너뛴 글 ${skipped}개`);
      if (results.length > skipped) window.dispatchEvent(new Event(categoriesUpdatedEvent));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Markdown 글을 가져오지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2>Markdown 폴더 업로드</h2>
      <p className="mt-2 text-sm">하위 폴더의 .md와 .mdx를 읽습니다. 각 파일의 바로 위 폴더 이름으로 카테고리를 지정하고, 없으면 새로 만듭니다.</p>
      <p className="mt-1 text-sm">이미지는 별도로 첨부해야 합니다. MDX의 JSX와 전용 문법은 가져온 뒤 Markdown으로 편집할 수 있습니다.</p>
      <form onSubmit={upload} className="mt-4">
        <fieldset disabled={busy !== null}>
          <div className="board-filters">
            <button type="button" onClick={() => folderInput.current?.click()}>폴더 선택</button>
            {rows.length > 0 && <span className="text-sm">{rows[0].path.split("/")[0]} · Markdown {rows.length}개</span>}
            <input
              ref={folderInput}
              type="file"
              multiple
              {...{ webkitdirectory: "" }}
              hidden
              onChange={event => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                void readFolder(files);
              }}
            />
          </div>
          {rows.length > 0 && (
            <>
              <div className="board-filters">
                <label>
                  새 카테고리와 글의 공개 범위{" "}
                  <select value={visibility} onChange={event => setVisibility(event.target.value === "Public" ? "Public" : "Private")}>
                    <option value="Private">비공개</option>
                    <option value="Public">공개</option>
                  </select>
                </label>
                <button type="button" disabled={pending.length === 0} onClick={() => {
                  const select = selectedCount !== pending.length;
                  setRows(current => current.map(row => row.file && !row.result ? { ...row, selected: select } : row));
                }}>
                  {pending.length > 0 && selectedCount === pending.length ? "전체 해제" : "전체 선택"}
                </button>
                <button className="board-primary" type="submit" disabled={selectedCount === 0 || selectedCount > maxImportFiles}>
                  {busy === "uploading" ? "가져오는 중…" : `선택한 글 ${selectedCount}개 가져오기`}
                </button>
              </div>
              {selectedCount > maxImportFiles && <p className="board-notice">한 번에 최대 {maxImportFiles}개까지 가져올 수 있습니다.</p>}
              <ul className="divide-y divide-current/15">
                {rows.map(row => (
                  <li key={row.path} className="flex items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      aria-label={row.path}
                      checked={Boolean(row.selected)}
                      disabled={!row.file || Boolean(row.result)}
                      onChange={event => {
                        const selected = event.target.checked;
                        setRows(current => current.map(item => item.path === row.path ? { ...item, selected } : item));
                      }}
                    />
                    <div className="min-w-0 wrap-anywhere">
                      <p className="font-medium">{row.file?.title ?? row.path}</p>
                      <p className="text-sm">{markdownParentFolder(row.path)} · {row.path}</p>
                      {row.error && <p className="board-error text-sm">{row.error}</p>}
                      {row.result && (
                        row.result.skipped ? <p className="text-sm">중복 글 · 건너뜀</p>
                          : <Link className="text-sm underline" href={`/write/${row.result.postNumber}`}>가져온 글 편집</Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
        {busy === "reading" && <p className="board-notice" role="status">폴더에서 Markdown 파일을 읽는 중…</p>}
        {error && <p className="board-notice board-error" role="alert">{error}</p>}
        {message && <p className="board-notice" role="status">{message}</p>}
      </form>
    </section>
  );
}
