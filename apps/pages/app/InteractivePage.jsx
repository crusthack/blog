"use client";

import dynamic from "next/dynamic";

const GameArcade = dynamic(() => import("@/components/games/GameArcade"));
const MarkdownPreview = dynamic(() => import("@/components/markdown/MarkdownPreviewWorkbench").then(module => module.MarkdownPreviewWorkbench));

export default function InteractivePage({ page }) {
  return page === "game" ? <GameArcade /> : <MarkdownPreview />;
}
