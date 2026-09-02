import { PostList } from "@/components/posts/PostList";

export default async function CategoryPage({ params }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  return (
    <main className="content-shell category-page">
      <PostList categorySlug={slug} />
    </main>
  );
}
