import { PostList } from "@/components/posts/PostList";

export const metadata = { title: "게시글 전체 관리 | Crusthack Blog" };

export default function ManagePostsPage() {
  return <main className="board-management"><PostList manage /></main>;
}
