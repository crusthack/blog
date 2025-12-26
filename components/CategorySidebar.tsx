// /components/CategorySidebar.tsx
import Link from "next/link";
import { getPostsByCategory } from "@/lib/posts";
 
export default function CategorySidebar({ currentCategory }: { currentCategory: string }) {
  const posts = getPostsByCategory(currentCategory);
 
  return (
    <aside className="sticky top-20 space-y-2 mt-2">
      <h2 className="font-bold text-xl mb-3 capitalize">{currentCategory}</h2>  
      <ul className="space-y-1">
        {posts.map(post => (
          <li key={post.slug}>
            <Link
              href={`/${encodeURIComponent(currentCategory)}/${encodeURIComponent(post.slug)}`}
              className="block hover:text-blue-600"
            >
              {post.title ?? post.slug}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}