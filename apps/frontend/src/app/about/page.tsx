import type { Metadata } from "next";
import { BlogFrame } from "@/components/BlogFrame";
import { SitePageDocument } from "@/components/SitePageDocument";
import { getSitePage } from "@/lib/sitePageContent";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getSitePage("about");
  return { title: content.title, description: content.description };
}

export default async function Page() {
  const data = await getSitePage("about");
  return <BlogFrame><SitePageDocument page="about" {...data} /></BlogFrame>;
}
