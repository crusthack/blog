import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import PublicPage from "../PublicPage";
import shared from "../../data/shared.json";
import routes from '../../data/routes.json';

export const dynamicParams = false;
const routeFiles = new Map(routes.map(({ route, name }) => [route, name]));
const categoriesById = new Map(shared.categories.map(category => [category.id, category]));
const postsByCategory = new Map(shared.categories.map(category => [category.slug, []]));

for (const post of shared.posts) {
  const visited = new Set();
  let category = categoriesById.get(post.categoryId);
  while (category && !visited.has(category.id)) {
    visited.add(category.id);
    postsByCategory.get(category.slug).push(post);
    category = categoriesById.get(category.parentId);
  }
}

export function generateStaticParams() {
  return routes.map(({ route }) => ({ segments: route.split('/').filter(Boolean).map(decodeURIComponent) }));
}

const readView = cache(async route => {
  const name = routeFiles.get(route);
  return JSON.parse(await readFile(path.join(process.cwd(), 'data', name), 'utf8'));
});

async function view(params) {
  const { segments = [] } = await params;
  const route = '/' + segments.map(encodeURIComponent).join('/') + (segments.length ? '/' : '');
  return readView(route);
}

export async function generateMetadata({ params }) {
  const { title, description } = await view(params);
  return { title, description };
}

export default async function Page({ params }) {
  const { segments = [] } = await params;
  const page = await view(params);
  const posts = page.categorySlug ? postsByCategory.get(page.categorySlug) ?? []
    : segments.length === 1 && segments[0] === "posts" ? shared.posts : [];
  return <PublicPage shared={shared} view={page} posts={posts} />;
}
