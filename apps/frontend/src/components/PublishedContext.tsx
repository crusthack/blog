"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Category, PostSummary } from "@/lib/contracts";
import type { MarkdownLinks } from "@/components/posts/MarkdownContent";
import type { ExternalLink } from "@/lib/siteLinks";

type Snapshot = {
  appOrigin: string;
  categories: Category[];
  posts: PostSummary[];
  sidebarPosts: PostSummary[];
  usefulLinks: ExternalLink[];
  externalLinks: ExternalLink[];
  links: Record<string, string>;
  markdownLinks?: MarkdownLinks;
};
const PublishedContext = createContext<Snapshot | null>(null);

export function PublishedProvider({ value, children }: { value: Snapshot; children: ReactNode }) {
  return <PublishedContext.Provider value={value}>{children}</PublishedContext.Provider>;
}
export const usePublished = () => useContext(PublishedContext);
