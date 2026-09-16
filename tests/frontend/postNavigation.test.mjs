import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { getMarkdownHeadings, remarkHeadingIds } from '../../apps/frontend/src/lib/markdownHeadings.ts';
import { postPath } from '../../apps/frontend/src/lib/postPaths.ts';

test('category paths work for existing posts, moved posts, and uncategorized posts', () => {
  assert.equal(postPath({ postNumber: 12, categorySlug: 'computer-science' }), '/posts/computer-science/12');
  assert.equal(postPath({ postNumber: 12, categorySlug: 'projects' }), '/posts/projects/12');
  assert.equal(postPath({ postNumber: 12, categorySlug: null }), '/posts/uncategorized/12');
  assert.equal(postPath({ postNumber: 12, categorySlug: '한글' }), '/posts/%ED%95%9C%EA%B8%80/12');
});

test('outline handles Korean, formatting, setext, duplicates, and excludes fenced code', () => {
  const source = '# 시작\n\n## **사용법**과 `코드`\n\n## 시작\n\n## 시작-1\n\n```md\n# 가짜 제목\n```\n\n다음 단계\n---\n\n### [링크](https://example.com)\n';
  const headings = getMarkdownHeadings(source);
  assert.deepEqual(headings.map(({ title }) => title), ['시작', '사용법과 코드', '시작', '시작-1', '다음 단계', '링크']);
  assert.deepEqual(headings.map(({ depth }) => depth), [1, 2, 2, 2, 2, 3]);
  assert.equal(new Set(headings.map(({ id }) => id)).size, headings.length);
  const renderer = unified().use(remarkParse).use(remarkHeadingIds);
  const tree = renderer.runSync(renderer.parse(source));
  assert.deepEqual(tree.children.filter(node => node.type === 'heading').map(node => node.data.hProperties.id), headings.map(({ id }) => id));
});

test('no headings and punctuation-only headings are supported', () => {
  assert.deepEqual(getMarkdownHeadings('A paragraph with `inline code`.'), []);
  assert.deepEqual(getMarkdownHeadings('# !!!\n\n# ???').map(({ id }) => id), ['heading-section', 'heading-section-1']);
});
