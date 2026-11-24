"use client";
import { createContext, useContext } from "react";
import type { Category, PostSummary, PostDetail, PostAsset } from "@/lib/contracts";
import type { ExternalLink } from "@/lib/siteLinks";

type Snapshot = {
  origin: string; base: string; categories: Category[]; posts: PostSummary[];
  externalLinks: ExternalLink[]; post?: PostDetail; assets: PostAsset[];
  links: Record<string, string>;
};
export const PublishedContext = createContext<Snapshot | null>(null);
export const usePublished = () => useContext(PublishedContext);
