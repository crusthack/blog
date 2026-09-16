import { PostView } from "@/components/posts/PostView";

export default async function SlidesPage({ params }: PageProps<"/posts/[categorySlug]/[postNumber]/slides">) {
  const { postNumber } = await params;
  return <PostView postNumber={postNumber} slideMode />;
}
