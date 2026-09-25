import { PostEditor } from "@/components/posts/PostEditor";

export default async function WritePage({ searchParams }: PageProps<"/write">) {
  const { category } = await searchParams;
  const initialCategory = typeof category === "string" ? category : undefined;
  return <PostEditor key={initialCategory ?? "new"} initialCategory={initialCategory} />;
}
