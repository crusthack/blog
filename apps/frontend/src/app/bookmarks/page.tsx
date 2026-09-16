import { PostList } from "@/components/posts/PostList";
import { BlogFrame } from "@/components/BlogFrame";
export const metadata = { title: "북마크 | Crusthack Blog" };
export default function Bookmarks() { return <BlogFrame><PostList bookmarked /></BlogFrame>; }
