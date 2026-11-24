import { CORE_SCHEMA, load } from "js-yaml";

export const markdownExtension = /\.(md|mdx)$/i;
export const maxImportFiles = 200;
export const maxImportBytes = 16 * 1024 * 1024;

export type MarkdownImportFile = {
  relativePath: string;
  title: string;
  description: string | null;
  content: string;
  date: string | null;
};

export function markdownParentFolder(relativePath: string) {
  const segments = relativePath.split("/");
  return segments.at(-2)?.trim() ?? "";
}

export function parseMarkdownImport(relativePath: string, source: string): MarkdownImportFile {
  const categoryName = markdownParentFolder(relativePath);
  if (!categoryName || categoryName.length > 80 || relativePath.length > 4096) {
    throw new Error("폴더 이름 또는 파일 경로 길이를 확인해 주세요.");
  }

  let content = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let metadata: Record<string, unknown> = {};
  const opening = /^---[ \t]*\n/.exec(content);
  if (opening) {
    const afterOpening = content.slice(opening[0].length);
    const closing = /^(?:---|\.\.\.)[ \t]*(?:\n|$)/m.exec(afterOpening);
    const header = closing ? afterOpening.slice(0, closing.index) : afterOpening;
    const startsWithMapping = /^(?:[ \t]*(?:#[^\n]*)?\n)*[ \t]*(?:(?:[\w-]+|"[^"\n]+"|'[^'\n]+')[ \t]*:|\{)/.test(header);
    if (closing && (startsWithMapping || !header.trim())) {
      try {
        const value: unknown = load(header, { schema: CORE_SCHEMA });
        if (value != null && (typeof value !== "object" || Array.isArray(value))) {
          throw new Error();
        }
        metadata = (value ?? {}) as Record<string, unknown>;
      } catch {
        throw new Error("파일 상단의 YAML 메타데이터를 읽을 수 없습니다.");
      }
      content = afterOpening.slice(closing.index + closing[0].length);
    } else if (!closing && startsWithMapping) {
      throw new Error("YAML 메타데이터를 닫는 구분선이 없습니다.");
    }
  }

  const title = (typeof metadata.title === "string" && metadata.title.trim())
    || relativePath.slice(relativePath.lastIndexOf("/") + 1).replace(markdownExtension, "").trim();
  const description = typeof metadata.description === "string" ? metadata.description.trim() || null : null;
  const date = typeof metadata.date === "string" ? metadata.date.trim() : "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith("0000-") ? new Date(date) : null;
  const originalDate = parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().startsWith(date) ? date : null;

  if (!title || title.length > 240) throw new Error("제목은 1~240자로 입력해 주세요.");
  if (description && description.length > 500) throw new Error("설명은 500자 이하로 입력해 주세요.");
  if (!content.trim()) throw new Error("본문이 비어 있습니다.");
  if (content.length > 1_000_000) throw new Error("본문이 100만 자를 초과합니다.");

  return { relativePath, title, description, content, date: originalDate };
}
