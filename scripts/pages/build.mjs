import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSON_SCHEMA, load } from 'js-yaml';
import { assertStable, basePath, canonical, collectSnapshot, createReader, digest, postPath } from './snapshot.mjs';
import { createRenderer, escapeHtml } from './render.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function defaultPage(name) {
  const source = (await readFile(path.join(root, 'apps/frontend/content', `${name}.md`), 'utf8')).replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const fields = match ? load(match[1], { schema: JSON_SCHEMA }) : {};
  return { title: fields.title || '개발자 블로그', description: fields.description || '', date: fields.date || '', markdown: source.slice(match?.[0].length || 0).trim() };
}

export async function previousManifest(url, fetchImpl = fetch) {
  const response = await fetchImpl(`${url.replace(/\/$/, '')}/static-manifest.json`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Previous Pages manifest returned ${response.status}.`);
  const manifest = await response.json();
  if (!/^[a-f0-9]{64}$/.test(manifest.fingerprint)) throw new Error('Invalid previous Pages manifest.');
  return manifest;
}

export async function buildPages({ origin, pagesUrl, outputDirectory = path.join(root, 'out/pages'), read = createReader(origin), previous = null }) {
  origin = new URL(origin).origin;
  const destination = new URL(pagesUrl);
  if (!['https:', 'http:'].includes(destination.protocol) || destination.search || destination.hash || destination.username || destination.password) throw new Error('Invalid PAGES_URL.');
  const base = basePath(decodeURIComponent(destination.pathname));
  await mkdir(outputDirectory, { recursive: true });
  if ((await readdir(outputDirectory)).length) throw new Error('Output directory must be empty to avoid publishing stale files.');
  const snapshot = await collectSnapshot(read);
  const assetPaths = new Map();
  const assets = [];
  let totalBytes = 0;
  async function emit(relative, content) {
    const target = path.join(outputDirectory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  for (const post of snapshot.posts) {
    for (const asset of post.assets) {
      const url = new URL(asset.url, origin);
      if (url.origin !== origin || url.pathname !== `/api/posts/${post.postNumber}/assets/${asset.id}` || !/^[a-f0-9-]{36}$/i.test(asset.id) || !/^\.[a-z0-9]{1,8}$/.test(asset.extension)) throw new Error('Invalid attachment URL or filename.');
      const bytes = await read(url.pathname, true);
      if (bytes.length !== asset.size) throw new Error('Attachment size changed during export.');
      totalBytes += bytes.length;
      if (totalBytes > 900 * 1024 * 1024) throw new Error('Attachments exceed the 900 MiB export budget.');
      const target = `/static/assets/${post.postNumber}/${asset.id}${asset.extension}`;
      await emit(target.slice(1), bytes);
      assetPaths.set(url.pathname, target);
      assets.push({ path: target, hash: digest(bytes) });
    }
  }
  const files = ['package-lock.json', 'apps/frontend/content/home.md', 'apps/frontend/content/about.md', 'apps/frontend/src/lib/markdownHeadings.ts', 'apps/frontend/src/lib/siteLinks.ts',
    ...['globals','slides','community','admin'].map(name => `apps/frontend/src/app/${name}.css`),
    ...(await readdir(path.join(root, 'scripts/pages'))).sort().map(name => `scripts/pages/${name}`)];
  const generator = [];
  for (const name of files) generator.push([name, digest((await readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n'))]);
  const fingerprint = digest(canonical({ schema: 1, origin, pagesUrl: destination.href, snapshot, assets, generator, sourceVersion: process.env.PAGES_SOURCE_VERSION || null }));
  // A second complete anonymous read detects changed content, deletion, visibility,
  // pagination, category moves, page overrides and attachment metadata changes.
  assertStable(snapshot, await collectSnapshot(read));
  if (previous?.fingerprint === fingerprint) return { changed: false, fingerprint, postCount: snapshot.posts.length };
  const renderer = createRenderer({ snapshot, origin, base, assetPaths });
  const pageFile = route => path.join(decodeURIComponent(route), 'index.html');
  for (const page of ['home', 'about']) {
    const content = snapshot.pages[page].content || await defaultPage(page);
    await emit(page === 'home' ? 'index.html' : 'about/index.html', renderer.layout(content.title, content.description,
      `<article class="content-markdown markdown-body">${renderer.markdown(content.markdown)}</article>${page === 'home' ? `<h2>최근 공개 글</h2>${renderer.list([...snapshot.posts].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc)).slice(0, 10))}` : ''}`));
  }
  await emit('posts/index.html', renderer.layout('전체 글', '공개 게시글 목록', renderer.list(snapshot.posts)));
  for (const category of snapshot.categories) {
    if (!category.slug || ['.', '..'].includes(category.slug) || /[\\/]/.test(category.slug)) throw new Error('Unsafe category slug.');
    const children = snapshot.categories.filter(item => item.parentId === category.id);
    const links = children.map(child => `<li><a href="${base}/categories/${encodeURIComponent(child.slug)}/">${escapeHtml(child.name)}</a></li>`).join('');
    await emit(pageFile(`categories/${encodeURIComponent(category.slug)}/`), renderer.layout(category.name, category.description,
      `<p>${escapeHtml(category.description)}</p>${children.length ? `<ul>${links}</ul>` : ''}${renderer.list(snapshot.posts.filter(post => post.categoryId === category.id))}`));
  }
  for (const post of snapshot.posts) await emit(pageFile(postPath(post).slice(1)), renderer.article(post));
  await emit('404.html', renderer.layout('페이지를 찾을 수 없습니다', '', `<p><a href="${base}/posts/">전체 글 보기</a></p>`));
  const from = path.join(root, 'apps/frontend/src/app/globals.css');
  const shared = await postcss([tailwind({ base: path.join(root, 'apps/frontend') })]).process(await readFile(from, 'utf8'), { from });
  await emit('static/site.css', shared.css + '\n' + await readFile(path.join(root, 'scripts/pages/site.css'), 'utf8'));
  await emit('.nojekyll', '');
  const routes = ['/', '/posts/', '/about/', ...snapshot.categories.map(category => `/categories/${encodeURIComponent(category.slug)}/`), ...snapshot.posts.map(postPath)];
  await emit('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>${escapeHtml(destination.origin + base + route)}</loc></url>`).join('')}</urlset>`);
  await emit('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${destination.origin}${base}/sitemap.xml\n`);
  const manifest = { schema: 1, fingerprint, sourceVersion: process.env.PAGES_SOURCE_VERSION || null,
    publicIds: snapshot.posts.flatMap(post => [`p:${post.postNumber}`, ...post.assets.map(asset => `a:${asset.id.toLowerCase()}`)]), postCount: snapshot.posts.length,
    latestPostUpdatedAtUtc: snapshot.posts.map(post => post.updatedAtUtc).sort().at(-1) || null };
  await emit('static-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return { changed: true, ...manifest };
}

async function main() {
  const origin = process.env.PAGES_SOURCE_URL;
  const pagesUrl = process.env.PAGES_URL;
  if (!origin || !pagesUrl) throw new Error('PAGES_SOURCE_URL and PAGES_URL are required.');
  const previous = process.env.PAGES_FORCE === 'true' ? null : await previousManifest(pagesUrl);
  const result = await buildPages({ origin, pagesUrl, previous });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### GitHub Pages\n\n${result.changed ? 'New static snapshot ready for deployment.' : 'No changes since the last deployment. Deployment skipped.'}\n\nPublic posts: ${result.postCount}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
