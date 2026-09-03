import { BlogFrame } from "@/components/BlogFrame";
import { PostList } from "@/components/posts/PostList";

export default async function CategoryPage({ params }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  return (
    <BlogFrame>
      <PostList categorySlug={slug} />
    </BlogFrame>
  );
}
