import type { ReactNode } from "react";
import type { HomeContent } from "@/lib/homeContent";

export function SitePageArticle({ content, actions, children }: {
  content: Pick<HomeContent, "title" | "date" | "description">; actions?: ReactNode; children: ReactNode;
}) {
  return <article className="legacy-home-document post-view" data-view="post">
    {actions}
    <header className="legacy-document-header"><h1>{content.title}</h1>
      {content.date && <time dateTime={content.date}>{content.date}</time>}
      <p>{content.description}</p>
    </header>
    <div className="post-view-body"><div className="post-view-markdown">{children}</div></div>
  </article>;
}
