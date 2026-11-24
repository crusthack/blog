import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { appendFile, cp, mkdtemp, rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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
  for (const entry of await readdir(path.join(root,'apps/pages'), {recursive:true,withFileTypes:true})) {
    if (entry.isFile()) files.push(path.relative(root,path.join(entry.parentPath,entry.name)));
  }
  const generator = [];
  for (const name of files) generator.push([name, digest((await readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n'))]);
  const fingerprint = digest(canonical({ schema: 1, origin, pagesUrl: destination.href, snapshot, assets, generator, sourceVersion: process.env.PAGES_SOURCE_VERSION || null }));
  // A second complete anonymous read detects changed content, deletion, visibility,
  // pagination, category moves, page overrides and attachment metadata changes.
  assertStable(snapshot, await collectSnapshot(read));
  if (previous?.fingerprint === fingerprint) return { changed: false, fingerprint, postCount: snapshot.posts.length };
  const renderer = createRenderer({ snapshot, origin, base, assetPaths });
  const pageFile = route => path.join(decodeURIComponent(route), 'view.json');
  for (const page of ['home', 'about']) {
    const content = snapshot.pages[page].content || await defaultPage(page);
    await emit(page === 'home' ? 'view.json' : 'about/view.json', renderer.layout(content.title, content.description,
      `<article class="content-markdown markdown-body">${renderer.markdown(content.markdown)}</article>${page === 'home' ? `<h2>최근 공개 글</h2>${renderer.list([...snapshot.posts].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc)).slice(0, 10))}` : ''}`));
  }
  await emit('posts/view.json', renderer.layout('전체 글', '공개 게시글 목록', renderer.list(snapshot.posts)));
  for (const category of snapshot.categories) {
    if (!category.slug || ['.', '..'].includes(category.slug) || /[\\/]/.test(category.slug)) throw new Error('Unsafe category slug.');
    const children = snapshot.categories.filter(item => item.parentId === category.id);
    const links = children.map(child => `<li><a href="${base}/categories/${encodeURIComponent(child.slug)}/">${escapeHtml(child.name)}</a></li>`).join('');
    await emit(pageFile(`categories/${encodeURIComponent(category.slug)}/`), renderer.layout(category.name, category.description,
      `<p>${escapeHtml(category.description)}</p>${children.length ? `<ul>${links}</ul>` : ''}${renderer.list(snapshot.posts.filter(post => post.categoryId === category.id))}`));
  }
  for (const post of snapshot.posts) await emit(pageFile(postPath(post).slice(1)), renderer.article(post));
  await emit('404.html', renderer.layout('페이지를 찾을 수 없습니다', '', `<p><a href="${base}/posts/">전체 글 보기</a></p>`));
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
  const stage = await mkdtemp(path.join(os.tmpdir(),'pages-source-'));
  const project = await mkdtemp(path.join(root,'.pages-build-'));
  let result;
  try {
    result = await buildPages({ origin, pagesUrl, previous, outputDirectory: stage });
    if (result.changed) {
      await cp(path.join(root,'apps/pages'), project, {recursive:true});
      const data = path.join(project,'data');
      await mkdir(data);
      const routes = [];
      for (const entry of await readdir(stage,{recursive:true,withFileTypes:true})) {
        if (!entry.isFile()) continue;
        const source = path.join(entry.parentPath,entry.name);
        const relative = path.relative(stage,source);
        if (entry.name === 'view.json') {
          const name = routes.length + '.json';
          const route = '/' + relative.split(path.sep).slice(0,-1).map(encodeURIComponent).map(segment => segment + '/').join('');
          routes.push({route,name});
          await cp(source,path.join(data,name));
        } else if (entry.name !== '404.html') {
          await cp(source,path.join(project,'public',relative));
        }
      }
      await writeFile(path.join(data,'routes.json'),JSON.stringify(routes));
      execFileSync(process.execPath,[createRequire(import.meta.url).resolve('next/dist/bin/next'),'build','--webpack'], {
        cwd:project, stdio:'inherit', env:{...process.env,PAGES_BASE_PATH:basePath(new URL(pagesUrl).pathname)}
      });
      const dest = process.env.PAGES_OUTPUT_DIR || path.join(root,'out/pages');
      await mkdir(dest,{recursive:true});
      if ((await readdir(dest)).length) throw new Error('Pages output must be empty.');
      await cp(path.join(project,'out'),dest,{recursive:true});
    }
  } finally {
    await rm(project,{recursive:true,force:true});
    await rm(stage,{recursive:true,force:true});
  }
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${result.changed}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### GitHub Pages\n\n${result.changed ? 'New static snapshot ready for deployment.' : 'No changes since the last deployment. Deployment skipped.'}\n\nPublic posts: ${result.postCount}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

