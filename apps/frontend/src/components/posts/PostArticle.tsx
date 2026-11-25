import Link from "next/link";
import type { ReactNode } from "react";
import { type PostDetail, effectivePostVisibility, visibilityLabels } from "@/lib/contracts";
import { PostReadingActions } from "./PostReadingActions";

type ArticlePost = Omit<PostDetail, "content">;
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul",
});

export function PostArticle({ post, actions, attachments, discussion, children }: {
  post: ArticlePost;
  actions: ReactNode;
  attachments: ReactNode;
  discussion: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      className="post-view min-h-screen w-full rounded-2xl border border-gray-200 px-4 py-8 shadow-sm dark:border-gray-700 md:p-12"
      data-view="post"
    >
      <header className="mb-8 border-b border-gray-200 pb-7 dark:border-gray-700">
        {actions}
        {post.categoryName && post.categorySlug && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold">
            <Link href={`/categories/${encodeURIComponent(post.categorySlug)}`} className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {post.categoryName}
            </Link>
          </div>
        )}
        <h1 id="post-title" tabIndex={-1} className="text-[clamp(2.375rem,4vw,3.5rem)] leading-tight font-black tracking-tight">{post.title}</h1>
        {post.description ? (
          <p className="mt-4 text-xl leading-relaxed md:text-2xl text-gray-600 dark:text-gray-300">{post.description}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-base text-gray-500">
          <span>공개 범위 · {visibilityLabels[effectivePostVisibility(post)]}{post.categoryIsHidden && " (카테고리 숨김)"}</span>
          {post.authorName && <span>작성자 {post.authorName}</span>}
          <time dateTime={post.createdAtUtc}>작성 {dateFormatter.format(new Date(post.createdAtUtc))}</time>
          <time dateTime={post.updatedAtUtc}>수정 {dateFormatter.format(new Date(post.updatedAtUtc))}</time>
        </div>
        {attachments}
      </header>
      <div className="post-view-body">
        <div className="post-view-markdown rounded-md py-4 md:p-6">
          {children}
        </div>
      </div>
      <PostReadingActions categorySlug={post.categorySlug} />
      {discussion}
    </article>
  );
}
