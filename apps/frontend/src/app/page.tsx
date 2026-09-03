import type { Metadata } from "next";
import { BlogFrame } from "@/components/BlogFrame";
import { MarkdownContent } from "@/components/posts/MarkdownContent";
import { getHomeContent } from "@/lib/homeContent";

export function generateMetadata(): Metadata {
  const home = getHomeContent();
  return {
    title: home.title,
    description: home.description,
  };
}

export default function Home() {
  const home = getHomeContent();

  return (
    <BlogFrame>
      <article className="legacy-home-document post-view" data-view="post">
        <header className="legacy-document-header">
          <h1>{home.title}</h1>
          {home.date ? <time dateTime={home.date}>{home.date}</time> : null}
          <p>{home.description}</p>
        </header>
        <div className="post-view-body">
          <div className="post-view-markdown">
            <MarkdownContent source={home.markdown} />
          </div>
        </div>
      </article>
    </BlogFrame>
  );
}
