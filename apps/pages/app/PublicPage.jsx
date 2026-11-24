"use client";
import { PublishedContext } from "@/components/PublishedContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogFrame } from "@/components/BlogFrame";
import { PostList } from "@/components/posts/PostList";
import { PostView } from "@/components/posts/PostView";
import { SitePageDocument } from "@/components/SitePageDocument";
import LiveComments from "./LiveComments";

export default function PublicPage({ shared, view }) {
  const snapshot = { ...shared, post: view.post, assets: view.assets || [] };
  return <PublishedContext.Provider value={snapshot}><AuthProvider>
    <SiteHeader />
    {view.post ? <><PostView postNumber={String(view.post.postNumber)} />
      <LiveComments origin={shared.origin} number={view.post.postNumber} /></> :
      <BlogFrame>{view.content ? <SitePageDocument page={view.page} content={view.content} defaults={view.content}
        revision="" available={false} overridden={false} /> : <PostList categorySlug={view.categorySlug} />}</BlogFrame>}
    <SiteFooter origin={shared.origin} />
  </AuthProvider></PublishedContext.Provider>;
}
