import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertStable, basePath, canonical, collectSnapshot, createReader, publicPost } from '../../scripts/pages/snapshot.mjs';
import { buildPages, previousManifest } from '../../scripts/pages/build.mjs';

const origin = 'https://source.example';
const assetId = '01234567-89ab-cdef-0123-456789abcdef';
const assetUrl = `/api/posts/7/assets/${assetId}`;
function fixture() {
  const category = { id: 'category', name: '네트워크', slug: 'network', isVisible: true, parentId: null, sortOrder: 0, postCount: 1 };
  const post = { postNumber: 7, title: 'TCP <script>alert(1)</script>', description: '테스트 & 문서', categoryId: category.id,
    categoryName: category.name, categorySlug: category.slug, visibility: 'Public', categoryIsHidden: false, revision: 3, priority: 5,
    createdAtUtc: '2026-11-20T00:00:00Z', updatedAtUtc: '2026-11-24T00:00:00Z',
    content: `# TCP\n\n[소개](/about)\n\n[글](/posts/7)\n\n![첨부](${assetUrl})\n\n[위험](javascript:alert(1))\n\n<script>alert(2)</script>\n\n|A|B|\n|-|-|\n|1|2|` };
  const bytes = Buffer.from('attachment');
  const asset = { id: assetId, url: assetUrl, name: '첨부', extension: '.txt', size: bytes.length, updatedAtUtc: post.updatedAtUtc };
  const data = {
    '/api/categories': [category],
    '/api/site-settings/external-links': [],
    '/api/posts/directory?visibility=Public&sort=updated&direction=asc&page=1': { total: 1, page: 1, pageSize: 20, items: [post] },
    '/api/posts/7': post,
    '/api/posts/7/assets/downloads': [asset],
    '/api/site-pages/home': { revision: '', content: null },
    '/api/site-pages/about': { revision: 'a', content: { title: '소개', description: '', markdown: '웹에서 저장한 소개입니다.' } },
  };
  return { data, post, asset, bytes, read: async (url, binary) => binary ? Buffer.from(bytes) : structuredClone(data[url]) };
}
async function build(f, options = {}) {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'blog-pages-test-'));
  const result = await buildPages({ origin, pagesUrl: 'https://user.github.io/blog', outputDirectory, read: f.read, ...options });
  return { result, outputDirectory };
}

test('exports standalone HTML, copied attachments, project base paths and safe Markdown', async () => {
  const f = fixture();
  const { result, outputDirectory } = await build(f);
  assert.equal(result.changed, true);
  assert.equal(result.latestPostUpdatedAtUtc, f.post.updatedAtUtc);
  const view = JSON.parse(await readFile(path.join(outputDirectory,'posts/network/7/view.json')));
  const shared = JSON.parse(await readFile(path.join(outputDirectory,'shared.json')));
  assert.equal(view.post.content, f.post.content);
  assert.equal(shared.links['/about'], '/blog/about/');
  assert.equal(shared.links['/posts/7'], '/blog/posts/network/7/');
  assert.equal(view.assets[0].url, '/blog/static/assets/7/' + assetId + '.txt');
  assert.equal(shared.posts[0].content, undefined);
  assert.deepEqual(await readFile(path.join(outputDirectory, `static/assets/7/${assetId}.txt`)), f.bytes);
  assert.match(await readFile(path.join(outputDirectory, 'about/view.json'), 'utf8'), /웹에서 저장한 소개/);
  assert.match(await readFile(path.join(outputDirectory, 'sitemap.xml'), 'utf8'), /https:\/\/user.github.io\/blog\/posts\/network\/7\//);
  assert.equal((await readdir(outputDirectory)).includes('.nojekyll'), true);
});

test('compares with last deployed manifest, skips identical snapshots and detects changed content', async () => {
  const f = fixture();
  const first = await build(f);
  const same = await build(f, { previous: first.result });
  assert.equal(same.result.changed, false);
  f.post.content += '\n새 내용';
  const changed = await build(f, { previous: first.result });
  assert.equal(changed.result.changed, true);
  assert.notEqual(changed.result.fingerprint, first.result.fingerprint);
});

test('asset rename, deletion and page overrides trigger a new snapshot without post date changes', async () => {
  const f = fixture();
  const first = await build(f);
  f.asset.name = '이름 변경';
  assert.equal((await build(f, { previous: first.result })).result.changed, true);
  f.data['/api/posts/7/assets/downloads'] = [];
  assert.equal((await build(f, { previous: first.result })).result.changed, true);
  f.data['/api/site-pages/about'].content.markdown += '\n소개 수정';
  assert.equal((await build(f, { previous: first.result })).result.changed, true);
});

test('removing a public post removes its HTML from a new export', async () => {
  const f = fixture();
  const first = await build(f);
  const directory = f.data['/api/posts/directory?visibility=Public&sort=updated&direction=asc&page=1'];
  directory.total = 0;
  directory.items = [];
  const next = await build(f, { previous: first.result });
  assert.equal(next.result.changed, true);
  assert.equal(next.result.postCount, 0);
  await assert.rejects(readFile(path.join(next.outputDirectory, 'posts/network/7/view.json')), { code: 'ENOENT' });
});

test('refuses partial exports, private/code-protected/hidden posts, and inconsistent pagination', async () => {
  for (const fields of [{ visibility: 'Private' }, { visibility: 'CodeProtected' }, { categoryIsHidden: true }]) {
    assert.equal(publicPost({ visibility: 'Public', ...fields }), false);
    const f = fixture();
    Object.assign(f.post, fields);
    await assert.rejects(collectSnapshot(f.read), /Non-public/);
  }
  const f = fixture();
  f.data['/api/posts/directory?visibility=Public&sort=updated&direction=asc&page=1'].total = 2;
  f.data['/api/posts/directory?visibility=Public&sort=updated&direction=asc&page=2'] = { total: 1, page: 2, pageSize: 20, items: [] };
  await assert.rejects(collectSnapshot(f.read), /changed during export/);
});

test('aborts if source changes while copying attachments, preserving the deployed version', async () => {
  const f = fixture();
  const read = f.read;
  f.read = async (url, binary) => {
    const result = await read(url, binary);
    if (binary) { f.post.revision++; f.post.content += '\n수집 도중 수정'; }
    return result;
  };
  await assert.rejects(build(f), /Content changed during export/);
  assert.throws(() => assertStable({ a: 1 }, { a: 2 }), /changed/);
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
});

test('rejects mismatched attachment sizes and external asset URLs', async () => {
  const f = fixture();
  f.asset.size++;
  await assert.rejects(build(f), /size changed/);
  f.asset.url = 'https://untrusted.example/file.txt';
  await assert.rejects(build(f), /Invalid attachment URL/);
});

test('reader sends no cookies, refuses redirects and fails on errors', async () => {
  const calls = [];
  const read = createReader(origin, { interval: 0, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response('{}', { status: 200 });
  } });
  await read('/api/categories');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal('Cookie' in calls[0].options.headers, false);
  await assert.rejects(read('https://other.example/api/posts'), /Invalid export/);
  assert.throws(() => createReader('https://user:password@source.example'), /without credentials/);
  const failed = createReader(origin, { interval: 0, fetchImpl: async () => new Response('', { status: 503 }) });
  await assert.rejects(failed('/api/posts'), /503/);
});

test('only a missing previous manifest is treated as first deployment', async () => {
  assert.equal(await previousManifest(origin, async () => new Response('', { status: 404 })), null);
  await assert.rejects(previousManifest(origin, async () => new Response('', { status: 503 })), /503/);
  await assert.rejects(previousManifest(origin, async () => Response.json({})), /Invalid previous/);
});

test('supports root and project Pages URLs and rejects path traversal', async () => {
  assert.equal(basePath('/'), '');
  assert.equal(basePath('/blog/'), '/blog');
  assert.throws(() => basePath('/../blog'), /Invalid/);
  const { outputDirectory } = await build(fixture(), { pagesUrl: 'https://user.github.io/' });
  assert.equal(JSON.parse(await readFile(path.join(outputDirectory,'shared.json'))).links['/posts/7'], '/posts/network/7/');
});
