import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { splitSlides, withBlankSlides, removeBlank, workspaceHistory, emptyWorkspace } from '../../apps/frontend/src/lib/slides.ts';
import { slideCommand } from '../../apps/frontend/src/lib/slideShortcuts.ts';
import { workspaceKey, saveWorkspace, loadWorkspace, MAX_WORKSPACE_BYTES } from '../../apps/frontend/src/lib/slideStorage.ts';

test('slide splitting preserves fenced code, tables, setext headings and link definitions', () => {
  const source = '# 시작\n\n설명\n\n## 코드\n\n```md\n---\n# 코드 속 제목\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n---\n\n마지막\n===\n\n[참고][ref]\n\n[ref]: https://example.com';
  const manual = splitSlides(source, '제목', 'manual');
  assert.equal(manual.length, 3);
  assert.match(manual[1].source, /```md\n---\n# 코드 속 제목\n```/);
  assert.match(manual[1].source, /\| 1 \| 2 \|/);
  assert.match(manual[2].source, /마지막\n===/);
  assert.match(manual[2].source, /\[ref\]: https:\/\/example.com/);
  assert.ok(splitSlides(source, '제목').some(slide => slide.title === '코드'));
  assert.equal(splitSlides('', '빈 글').length, 1);
  const tilde = splitSlides('~~~md\n---\n~~~\n\n---\n\n다음', '제목', 'manual');
  assert.equal(tilde.length, 3);
});

test('blank slide removal retains nested notes and undo restores the removed annotations', () => {
  const base = splitSlides('# 원문', '제목');
  const workspace = { annotations: { n1: { strokes: [], memos: [{ text: '메모' }] } }, blanks: [{ id: 'n1', after: 'title' }, { id: 'n2', after: 'n1' }] };
  assert.deepEqual(withBlankSlides(base, workspace).map(s => s.id), ['title', 'n1', 'n2', 'body-1']);
  const next = removeBlank(workspace, 'n1');
  assert.deepEqual(withBlankSlides(base, next).map(s => s.id), ['title', 'n2', 'body-1']);
  const changed = workspaceHistory({ past: [], present: workspace, future: [] }, { type: 'change', next });
  const undone = workspaceHistory(changed, { type: 'undo' });
  assert.deepEqual(undone.present, workspace);
  assert.deepEqual(workspaceHistory(undone, { type: 'redo' }).present, next);
});

test('shortcuts preserve typing, composition, browser shortcuts and drawing-specific behavior', () => {
  assert.equal(slideCommand({ key: 'm', typing: true }, false), null);
  assert.equal(slideCommand({ key: 's', ctrlKey: true, typing: true }, false), 'save');
  assert.equal(slideCommand({ key: 'z', ctrlKey: true, typing: true }, false), null);
  assert.equal(slideCommand({ key: 'z', metaKey: true, shiftKey: true }, false), 'redo');
  assert.equal(slideCommand({ key: 'ArrowRight' }, true), 'color-next');
  assert.equal(slideCommand({ key: 'PageDown' }, true), 'next');
  assert.equal(slideCommand({ key: ' ' }, true), null);
  assert.equal(slideCommand({ key: '6' }, true), 'color-5');
  assert.equal(slideCommand({ key: 'f', ctrlKey: true }, false), null);
  assert.equal(slideCommand({ key: 'd', isComposing: true }, false), null);
});

test('workspace remains unchanged until explicit save; stores independent snapshots', async () => {
  const key = await workspaceKey(7, 'owner', '본문', 'auto');
  assert.equal(await loadWorkspace(key), null);
  const workspace = emptyWorkspace();
  workspace.annotations.title = {
    strokes: [{ id: 'stroke-1', color: '#ef4444', size: 4, points: [{ x: 12, y: 18 }, { x: 22, y: 30 }] }],
    memos: [{ id: 'memo-1', text: '저장된 메모', x: 100, y: 200, width: 300, height: 180, collapsed: true }],
  };
  workspace.blanks.push({ id: 'note-test', after: 'title' });
  assert.equal(await loadWorkspace(key), null);
  const stored = await saveWorkspace(key, workspace, 0);
  assert.equal(stored.revision, 1);
  assert.deepEqual((await loadWorkspace(key)).workspace.annotations, workspace.annotations);
  workspace.blanks.push({ id: 'unsaved', after: 'title' });
  assert.equal((await loadWorkspace(key)).workspace.blanks.length, 1);
  await saveWorkspace(key, workspace, 1);
  assert.equal((await loadWorkspace(key)).workspace.blanks.length, 2);
  for (const alternate of [await workspaceKey(8, 'owner', '본문', 'auto'), await workspaceKey(7, null, '본문', 'auto'),
    await workspaceKey(7, 'other', '본문', 'auto'), await workspaceKey(7, 'owner', '수정한 본문', 'auto'), await workspaceKey(7, 'owner', '본문', 'manual')]) {
    assert.notEqual(alternate, key);
    assert.equal(await loadWorkspace(alternate), null);
  }
});

test('concurrent saves reject stale tabs and enforce storage size limits', async () => {
  const key = await workspaceKey(99, 'owner', '본문', 'auto');
  const results = await Promise.allSettled([saveWorkspace(key, emptyWorkspace(), 0), saveWorkspace(key, emptyWorkspace(), 0)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  await assert.rejects(saveWorkspace(key, emptyWorkspace(), 0), /다른 탭/);
  await assert.rejects(saveWorkspace('too-large', { annotations: {}, blanks: [], padding: 'x'.repeat(MAX_WORKSPACE_BYTES) }, 0), /5MB/);
});
