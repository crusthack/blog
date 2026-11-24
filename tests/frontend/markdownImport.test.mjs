import assert from "node:assert/strict";
import test from "node:test";
import { markdownParentFolder, parseMarkdownImport } from "../../apps/frontend/src/lib/markdownImport.ts";

test("imports legacy YAML metadata and keeps the Markdown body", () => {
  const path = "posts/Theory/Network/TCP.mdx";
  const file = parseMarkdownImport(path, [
    "\uFEFF---",
    "title: 'TCP: 연결과 해제'",
    "description: >-",
    "  연결과",
    "  해제",
    "date: 2026-02-25",
    "manualSlides: true",
    "---",
    "# TCP",
    "---",
    "## 연결",
  ].join("\r\n"));

  assert.equal(markdownParentFolder(path), "Network");
  assert.deepEqual(file, {
    relativePath: path,
    title: "TCP: 연결과 해제",
    description: "연결과 해제",
    date: "2026-02-25",
    content: "# TCP\n---\n## 연결",
  });
});

test("uses the selected folder for a root-level file and falls back to its filename", () => {
  assert.equal(markdownParentFolder("문서/Example.MD"), "문서");
  assert.equal(parseMarkdownImport("문서/Example.MD", "# Body").title, "Example");
  assert.equal(parseMarkdownImport("문서/Example.MD", "---\ndate: 2026-02-30\n---\nBody").date, null);
  assert.throws(() => parseMarkdownImport("문서/Empty.md", "---\ntitle: Empty\n---\n"), /본문이 비어/);
  assert.throws(() => parseMarkdownImport("문서/Broken.md", "---\ntitle: [broken\n---\nBody"), /YAML/);
});

test("preserves leading Markdown thematic breaks when there is no YAML mapping", () => {
  const content = "---\n\n# Heading\n\nParagraph\n\n---\n";
  assert.equal(parseMarkdownImport("posts/Rules.md", content).content, content);
});
