import { usefulSiteLinks } from '../../apps/frontend/src/lib/siteLinks.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getMarkdownHeadings, remarkHeadingIds } from '../../apps/frontend/src/lib/markdownHeadings.ts';
import { postPath } from './snapshot.mjs';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function createRenderer({ snapshot, origin, base, assetPaths }) {
  const local = path => `${base}${path}`;
  function transform(value) {
    const safe = defaultUrlTransform(value);
    if (!safe || safe.startsWith('#')) return safe;
    let url;
    try { url = new URL(safe, origin); } catch { return ''; }
    if (url.origin !== origin) return safe;
    const asset = assetPaths.get(url.pathname);
    if (asset) return local(asset) + url.search + url.hash;
    const match = url.pathname.match(/^\/posts\/(?:[^/]+\/)?(\d+)\/?$/);
    if (match) {
      const post = snapshot.posts.find(item => String(item.postNumber) === match[1]);
      return post ? local(postPath(post)) + url.hash : url.href;
    }
    const category = url.pathname.match(/^\/categories\/([^/]+)\/?$/);
    if (category && snapshot.categories.some(item => encodeURIComponent(item.slug) === category[1])) return local(`/categories/${category[1]}/`) + url.hash;
    if (['/', '/about', '/about/', '/posts', '/posts/'].includes(url.pathname)) return local(url.pathname.replace(/\/?$/, '/')) + url.hash;
    // Dynamic-only routes remain links to the source site.
    return url.href;
  }
  function markdown(source) {
    return renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm, remarkHeadingIds], urlTransform: transform }, source || ''));
  }
  function list(posts) {
    const sorted = [...posts].sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.createdAtUtc.localeCompare(a.createdAtUtc) || b.postNumber - a.postNumber);
    return `<ul class="post-list">${sorted.map(post => `<li><span class="category">${escapeHtml(post.categoryName || '미분류')}</span><div><a href="${local(postPath(post))}">${escapeHtml(post.title)}</a><p>${escapeHtml(post.description)}</p></div><time datetime="${escapeHtml(post.updatedAtUtc)}">${escapeHtml(post.updatedAtUtc.slice(0, 10))}</time></li>`).join('')}</ul>`;
  }
  function layout(title, description, body, toc = '') {
    const counts = new Map();
    for (const post of snapshot.posts) counts.set(post.categoryId, (counts.get(post.categoryId) || 0) + 1);
    const categories = [...snapshot.categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));
    function tree(parentId = null, visited = new Set()) {
      return `<ul>${categories.filter(item => (item.parentId || null) === parentId && !visited.has(item.id)).map(item => `<li><a href="${local(`/categories/${encodeURIComponent(item.slug)}/`)}">${escapeHtml(item.name)} <small>${counts.get(item.id) || 0}</small></a>${tree(item.id, new Set([...visited, item.id]))}</li>`).join('')}</ul>`;
    }
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · 개발자 블로그</title><meta name="description" content="${escapeHtml(description)}"><link rel="stylesheet" href="${local('/static/site.css')}"></head><body><a class="skip" href="#main">본문 바로가기</a><header class="site-nav"><nav class="pages-nav"><a class="pages-brand" href="${local('/')}"><img src="https://avatars.githubusercontent.com/u/161662653?v=4" alt="">Crusthack</a><a href="${local('/about/')}">개발자소개</a><a href="${local('/posts/')}">전체 글</a><a href="${escapeHtml(origin)}/login">로그인</a></nav></header>
<main id="main" class="legacy-blog-frame${toc ? ' legacy-blog-frame-post' : ''}">
<div class="legacy-blog-main"><header class="legacy-document-header"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></header><div class="post-view-body"><div class="post-view-markdown">${body}</div></div></div>
<aside class="legacy-blog-sidebar legacy-blog-sidebar-left"><section><h2>최근 글 보기</h2><a href="${local('/posts/')}">전체 글 보기</a><ul>${[...snapshot.posts].sort((a,b)=>b.createdAtUtc.localeCompare(a.createdAtUtc)).slice(0,4).map(p=>`<li><a href="${local(postPath(p))}">${escapeHtml(p.title)}</a></li>`).join('')}</ul></section><section><h2>카테고리 목록</h2>${tree()}</section></aside>
<aside class="legacy-blog-sidebar legacy-blog-sidebar-right">${toc || `<section><h2>최근 프로젝트</h2>${snapshot.posts.some(p=>p.categoryName==='프로젝트') ? list(snapshot.posts.filter(p=>p.categoryName==='프로젝트').slice(-5)) : '<p>프로젝트 글이 없습니다.</p>'}</section><section><h2>유용한 사이트</h2><ul>${usefulSiteLinks.map(link=>`<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.name)}</a></li>`).join('')}</ul></section>`}</aside></main>
<footer class="pages-footer"><a href="${escapeHtml(origin)}">운영 블로그</a> · <a href="${escapeHtml(origin)}/write">새 글</a> · <a href="${escapeHtml(origin)}/admin">관리</a></footer></body></html>`;
  }
  function article(post) {
    const headings = getMarkdownHeadings(post.content);
    const toc = headings.length ? `<details class="toc" open><summary>목차</summary><ol>${headings.map(heading => `<li data-depth="${heading.depth}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.title)}</a></li>`).join('')}</ol></details>` : '';
    const attachments = post.assets.length ? `<section class="attachments"><h2>첨부 파일</h2><ul>${post.assets.map(asset => {
      const target = assetPaths.get(new URL(asset.url, origin).pathname);
      return `<li><a href="${local(target)}" download>${escapeHtml(asset.name + asset.extension)}</a> <small>${escapeHtml(asset.size)} bytes</small></li>`;
    }).join('')}</ul></section>` : '';
    return layout(post.title, post.description, `<p class="meta">${escapeHtml(post.categoryName || '미분류')} · 수정 <time datetime="${escapeHtml(post.updatedAtUtc)}">${escapeHtml(post.updatedAtUtc.slice(0, 10))}</time></p><article class="content-markdown markdown-body">${markdown(post.content)}</article>${attachments}<p><a href="${escapeHtml(origin + postPath(post))}">운영 블로그에서 보기</a></p>`, toc);
  }
  return { layout, list, markdown, article };
}
