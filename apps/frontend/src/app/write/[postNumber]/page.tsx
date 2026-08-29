import { PostEditor } from "@/components/posts/PostEditor";

export default async function EditPostPage({ params }: PageProps<"/write/[postNumber]">) {
  const { postNumber } = await params;
  return <PostEditor postNumber={postNumber} />;
}
