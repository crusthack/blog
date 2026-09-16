export const markdownTools = [
  { label: "H2", before: "## ", after: "", placeholder: "소제목", block: true },
  { label: "굵게", before: "**", after: "**", placeholder: "텍스트" },
  { label: "기울임", before: "*", after: "*", placeholder: "텍스트" },
  { label: "링크", before: "[", after: "](https://example.com)", placeholder: "링크 이름" },
  { label: "이미지", before: "![", after: "](https://example.com/image.png)", placeholder: "이미지 설명" },
  { label: "목록", before: "- ", after: "", placeholder: "항목", block: true },
  { label: "체크리스트", before: "- [ ] ", after: "", placeholder: "할 일", block: true },
  { label: "코드", before: "```text\n", after: "\n```", placeholder: "code", block: true },
  { label: "인용", before: "> ", after: "", placeholder: "인용", block: true },
  { label: "표", before: "", after: "", placeholder: "| 제목 | 내용 |\n| --- | --- |\n| 항목 | 설명 |", block: true },
] as const;

export function insertMarkdown(source: string, start: number, end: number,
  tool: { before: string; after: string; placeholder: string; block?: boolean }) {
  const selected = source.slice(start, end) || tool.placeholder;
  const leading = tool.block && start > 0 && !source.slice(0, start).endsWith("\n\n") ? (source[start - 1] === "\n" ? "\n" : "\n\n") : "";
  const trailing = tool.block && end < source.length && !source.slice(end).startsWith("\n\n") ? (source[end] === "\n" ? "\n" : "\n\n") : "";
  const selectionStart = start + leading.length + tool.before.length;
  return { content: source.slice(0, start) + leading + tool.before + selected + tool.after + trailing + source.slice(end),
    selectionStart, selectionEnd: selectionStart + selected.length };
}
