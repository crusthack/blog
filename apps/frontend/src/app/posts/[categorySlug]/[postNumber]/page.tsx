import { PostView } from "@/components/posts/PostView";

export default async function CategorizedPostPage({ params }: PageProps<"/posts/[categorySlug]/[postNumber]">) {
  const { postNumber } = await params;
  return <PostView postNumber={postNumber} />;
}
