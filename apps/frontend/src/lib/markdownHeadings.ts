import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";

export type MarkdownHeading = { id: string; title: string; depth: number };

function assignHeadings(tree: Root): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const usedIds = new Set<string>();
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
      headings.push({ id, title: title || "제목 없는 항목", depth: node.depth });
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
