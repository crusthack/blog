import { BlogFrame } from "@/components/BlogFrame";
import { PostList } from "@/components/posts/PostList";

export const metadata = { title: "전체 글 | Crusthack Blog" };

export default function PostsPage() {
  return <BlogFrame><PostList /></BlogFrame>;
}
