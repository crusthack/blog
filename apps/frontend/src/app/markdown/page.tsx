import type { Metadata } from "next";
import { MarkdownPreviewWorkbench } from "@/components/markdown/MarkdownPreviewWorkbench";

export const metadata: Metadata = {
  title: "Markdown 임시 미리보기",
  description: "로컬 Markdown 파일이나 붙여넣은 내용을 안전하게 미리봅니다.",
};

export default function MarkdownPreviewPage() {
  return <MarkdownPreviewWorkbench />;
}
