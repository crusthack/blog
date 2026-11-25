import type { MarkdownHeading } from "./markdownHeadings";

export function getVisibleHeadings(headings: MarkdownHeading[], activeId: string): MarkdownHeading[] {
  const byId = new Map(headings.map((heading) => [heading.id, heading]));
  const activePath = new Set<string>();
  let current: MarkdownHeading | undefined = byId.get(activeId) ?? headings[0];
  while (current) {
    activePath.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return headings.filter((heading) => heading.parentId === null || activePath.has(heading.id)
    || activePath.has(heading.parentId));
}
