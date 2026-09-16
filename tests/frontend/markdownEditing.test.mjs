import test from 'node:test';
import assert from 'node:assert/strict';
import { insertMarkdown, markdownTools } from '../../apps/frontend/src/lib/markdownEditing.ts';

test('inline formatting preserves the selected text and surrounding content', () => {
  const result = insertMarkdown('앞 선택 뒤', 2, 4, markdownTools.find(t => t.label === '굵게'));
  assert.equal(result.content, '앞 **선택** 뒤');
  assert.equal(result.content.slice(result.selectionStart, result.selectionEnd), '선택');
});
test('block insertion separates fences from surrounding paragraphs', () => {
  const tool = markdownTools.find(t => t.label === '코드');
  assert.equal(insertMarkdown('앞뒤', 1, 1, tool).content, '앞\n\n```text\ncode\n```\n\n뒤');
  assert.equal(insertMarkdown('', 0, 0, tool).content, '```text\ncode\n```');
  assert.equal(insertMarkdown('앞\n\n뒤', 3, 3, tool).content, '앞\n\n```text\ncode\n```\n\n뒤');
});
