// /app/[category]/page.tsx
import { getPostData, getAllPostData } from "@/lib/posts";
import { notFound, redirect } from "next/navigation";
 
export async function generateStaticParams() {
  const posts = getAllPostData();
  const uniqueCategories = Array.from(new Set(posts.map((post) => post.category)));
  return uniqueCategories.map((category) => ({ category }));
}
 
export default async function Post({
  params,
}: {                                                            
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
 
  // 디코드: URL 인코딩(%20, + 등)을 공백으로 변환
  const decodedCategory = typeof category === "string" ? 
    decodeURIComponent(category).replace(/\+/g, " ").trim() : category;
 
  // 카테고리 index.mdx가 있으면 우선 이동
  const indexPost = getPostData(decodedCategory, "index");
  if (indexPost) {
    redirect(`/${encodeURIComponent(decodedCategory)}/index`);
  }
 
  // 모든 포스트 불러오기, 날짜 내림차순 정렬
  const posts = getAllPostData();
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
 
  // 해당 카테고리 포스트만 필터 (이미 날짜 내림차순 상태 유지)
  const filtered = posts.filter((post) => post.category === decodedCategory);
    
  if (filtered.length === 0) {
    return notFound();
  }
 
  // 가장 최근 글 slug (날짜 내림차순이므로 첫 번째)
  const firstSlug = filtered[0].slug;
 
  // 자동 이동 (경로 안전 인코딩)
  redirect(`/${encodeURIComponent(decodedCategory)}/${firstSlug}`);
}