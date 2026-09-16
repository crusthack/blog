import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";

export type MarkdownHeading = { id: string; title: string; depth: number; parentId: string | null };

function assignHeadings(tree: Root): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const usedIds = new Set<string>();
  const parents: MarkdownHeading[] = [];
  function walk(node: Root | RootContent) {
    if (node.type === "heading") {
      const title = toString(node);
      const slug = title.normalize("NFKC").toLowerCase().trim()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, "-") || "section";
      const base = `heading-${slug}`;
      let id = base;
      for (let suffix = 1; usedIds.has(id); suffix++) id = `${base}-${suffix}`;
      usedIds.add(id);
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id, tabIndex: -1 } };
      while (parents.length && parents[parents.length - 1].depth >= node.depth) parents.pop();
      const heading = { id, title: title || "제목 없는 항목", depth: node.depth, parentId: parents.at(-1)?.id ?? null };
      headings.push(heading);
      parents.push(heading);
    }
    if ("children" in node) {
      for (const child of node.children) walk(child as RootContent);
    }
  }
  walk(tree);
  return headings;
}

export function remarkHeadingIds() {
  return (tree: Root) => { assignHeadings(tree); };
}

const parser = unified().use(remarkParse).use(remarkGfm);

export function getMarkdownHeadings(source: string): MarkdownHeading[] {
  return assignHeadings(parser.parse(source));
}

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
