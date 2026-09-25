import "server-only";
import { cache } from "react";
import { getHomeContent, type HomeContent } from "./homeContent";

export const getSitePage = cache(async (page: "home" | "about") => {
  const defaults = getHomeContent(page);
  try {
    const origin = (process.env.API_SERVER_URL ?? "http://localhost:5268").replace(/\/$/, "");
    const response = await fetch(`${origin}/api/site-pages/${page}`, {
      cache: "no-store", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error("Page unavailable");
    const saved = await response.json() as { revision: string; content: HomeContent | null };
    return { defaults, content: saved.content ?? defaults, revision: saved.revision, available: true, overridden: saved.content !== null };
  } catch {
    return { defaults, content: defaults, revision: "", available: false, overridden: false };
  }
});
