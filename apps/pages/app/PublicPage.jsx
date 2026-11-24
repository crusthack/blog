"use client";
import { PublishedContext } from "@/components/PublishedContext";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BlogFrame } from "@/components/BlogFrame";
import { PostList } from "@/components/posts/PostList";
import { PostView } from "@/components/posts/PostView";
import { SitePageDocument } from "@/components/SitePageDocument";
import dynamic from "next/dynamic";
import LiveComments from "./LiveComments";

const GameArcade = dynamic(() => import("@/components/games/GameArcade"));
const MarkdownPreview = dynamic(() => import("@/components/markdown/MarkdownPreviewWorkbench").then(module => module.MarkdownPreviewWorkbench));

export default function PublicPage({ shared, view }) {
  const snapshot = { ...shared, post: view.post, assets: view.assets || [] };
  return <PublishedContext.Provider value={snapshot}><AuthProvider>
    <SiteHeader />
    {view.page === "game" ? <GameArcade /> : view.page === "markdown" ? <MarkdownPreview /> : view.post ? <><PostView postNumber={String(view.post.postNumber)} />
      <LiveComments origin={shared.appOrigin} number={view.post.postNumber} /></> :
      <BlogFrame>{view.content ? <SitePageDocument page={view.page} content={view.content} defaults={view.content}
        revision="" available={false} overridden={false} /> : <PostList categorySlug={view.categorySlug} />}</BlogFrame>}
    <SiteFooter origin={shared.appOrigin} />
  </AuthProvider></PublishedContext.Provider>;
}
