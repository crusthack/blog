import { PostView } from "@/components/posts/PostView";

export default async function PostPage({ params }: PageProps<"/posts/[postNumber]">) {
  const { postNumber } = await params;
  return <PostView postNumber={postNumber} />;
}
