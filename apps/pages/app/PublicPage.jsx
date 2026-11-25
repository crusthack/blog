import { PublishedProvider } from "@/components/PublishedContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogFrame } from "@/components/BlogFrame";
import { PostList } from "@/components/posts/PostList";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { PostArticle } from "@/components/posts/PostArticle";
import { PostAttachmentList } from "@/components/posts/PostAttachmentList";
import { PostToc } from "@/components/posts/PostToc";
import { SitePageArticle } from "@/components/SitePageArticle";
import { getMarkdownHeadings } from "@/lib/markdownHeadings";
import { postPath } from "@/lib/postPaths";
import InteractivePage from "./InteractivePage";
import LiveComments from "./LiveComments";

export default function PublicPage({ shared, view, posts }) {
  const interactive = view.page === "game" || view.page === "markdown";
  const snapshot = {
    appOrigin: shared.appOrigin,
    links: { "/markdown": shared.links["/markdown"], "/game": shared.links["/game"] },
    categories: shared.categories,
    posts,
    sidebarPosts: interactive ? [] : shared.sidebarPosts,
    usefulLinks: shared.usefulLinks,
    externalLinks: shared.externalLinks,
    ...(view.page === "markdown" ? { markdownLinks: { origin: shared.origin, appOrigin: shared.appOrigin, links: shared.links } } : {}),
  };

  let content;
  if (interactive) {
    content = <InteractivePage page={view.page} />;
  } else if (view.post) {
    const { content: markdown, ...post } = view.post;
    content = <BlogFrame rightSidebar={<PostToc headings={getMarkdownHeadings(markdown)} />}>
      <PostArticle post={post}
        actions={<div className="mb-4 flex flex-wrap items-center justify-end gap-2 text-xs font-bold">
          <a href={shared.appOrigin + postPath(post) + "/slides"} className="post-slide-link">슬라이드로 보기</a>
        </div>}
        attachments={<PostAttachmentList assets={view.assets} />}
        discussion={<LiveComments origin={shared.appOrigin} number={post.postNumber} />}
      >
        <MarkdownContent source={markdown} published={shared} />
      </PostArticle>
    </BlogFrame>;
  } else {
    content = <BlogFrame>{view.content
      ? <SitePageArticle content={view.content}><MarkdownContent source={view.content.markdown} published={shared} /></SitePageArticle>
      : <PostList categorySlug={view.categorySlug} />}
    </BlogFrame>;
  }

  return <PublishedProvider value={snapshot}><AuthProvider>
    <SiteHeader />
    {content}
    <SiteFooter origin={shared.appOrigin} />
  </AuthProvider></PublishedProvider>;
}
