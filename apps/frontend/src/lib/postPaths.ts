export function postPath(post: { postNumber: number | string; categorySlug: string | null }) {
  return `/posts/${encodeURIComponent(post.categorySlug ?? "uncategorized")}/${encodeURIComponent(post.postNumber)}`;
}
