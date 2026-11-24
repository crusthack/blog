import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Never forward a browser session or use administrator credentials for export.
export function createReader(origin, { interval = 650, fetchImpl = fetch } = {}) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('PAGES_SOURCE_URL must be an HTTP(S) origin without credentials or a path.');
  }
  let nextRequest = 0;
  return async function read(path, binary = false) {
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith('/api/')) throw new Error('Invalid export API URL.');
    await delay(Math.max(0, nextRequest - Date.now()));
    nextRequest = Date.now() + interval;
    const response = await fetchImpl(url, {
      redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(60000),
      headers: { Accept: binary ? '*/*' : 'application/json' },
    });
    if (!response.ok) throw new Error(`Source returned ${response.status}: ${url.pathname}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
}

export function publicPost(post) {
  return post.visibility === 'Public' && post.categoryIsHidden !== true;
}

export async function collectSnapshot(read) {
  const categories = (await read('/api/categories')).filter(item => item.isVisible === true)
    .map(({ postCount, ...category }) => category).sort((a, b) => a.id.localeCompare(b.id));
  const summaries = [];
  let expectedTotal;
  for (let page = 1; ; page++) {
    const result = await read(`/api/posts/directory?visibility=Public&sort=updated&direction=asc&page=${page}`);
    if (!Number.isInteger(result.total) || !Array.isArray(result.items) || result.page !== page || result.pageSize !== 20) throw new Error('Invalid directory response.');
    expectedTotal ??= result.total;
    if (expectedTotal !== result.total) throw new Error('Post list changed during export; retry next run.');
    summaries.push(...result.items);
    if (summaries.length >= expectedTotal) break;
    if (!result.items.length || page >= 100000) throw new Error('Incomplete directory response.');
  }
  if (new Set(summaries.map(post => post.postNumber)).size !== expectedTotal || summaries.length !== expectedTotal) throw new Error('Unstable post pagination.');
  const posts = [];
  for (const summary of summaries) {
    if (!publicPost(summary)) throw new Error('Non-public post returned by public filter.');
    const post = await read(`/api/posts/${summary.postNumber}`);
    if (!publicPost(post) || post.postNumber !== summary.postNumber || post.updatedAtUtc !== summary.updatedAtUtc || post.revision !== summary.revision) throw new Error('Post changed during export.');
    if (post.categoryId && !categories.some(category => category.id === post.categoryId)) throw new Error('Missing public category.');
    const assets = await read(`/api/posts/${post.postNumber}/assets/downloads`);
    if (!Array.isArray(assets)) throw new Error('Invalid attachment response.');
    posts.push({ ...post, priority: summary.priority, assets: assets.sort((a, b) => a.id.localeCompare(b.id)) });
  }
  posts.sort((a, b) => a.postNumber - b.postNumber);
  const pages = {};
  for (const page of ['home', 'about']) pages[page] = await read(`/api/site-pages/${page}`);
  return { categories, posts, pages };
}

export function assertStable(before, after) {
  if (canonical(before) !== canonical(after)) throw new Error('Content changed during export. Existing Pages deployment is preserved; retry next run.');
}

export function basePath(value = '') {
  if (value === '' || value === '/') return '';
  if (!/^\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*\/?$/.test(value) || value.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid Pages base path.');
  return value.replace(/\/$/, '');
}

export function postPath(post) {
  return `/posts/${encodeURIComponent(post.categorySlug || 'uncategorized')}/${post.postNumber}/`;
}
