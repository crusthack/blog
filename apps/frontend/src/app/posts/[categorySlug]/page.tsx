import { notFound } from "next/navigation";
import { PostView } from "@/components/posts/PostView";

export default async function LegacyPostPage({ params }: PageProps<"/posts/[categorySlug]">) {
  const { categorySlug: postNumber } = await params;
  if (!/^[1-9]\d*$/.test(postNumber)) notFound();
  return <PostView postNumber={postNumber} />;
}
