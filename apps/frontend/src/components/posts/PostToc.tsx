"use client";

import { useEffect, useState } from "react";
import type { MarkdownHeading } from "@/lib/markdownHeadings";

export function PostToc({ headings }: { headings: MarkdownHeading[] }) {
  const [activeId, setActiveId] = useState("");
  const baseDepth = Math.min(...headings.map((heading) => heading.depth));

  useEffect(() => {
    if (!headings.length) return;
    let frame = 0;
    function update() {
      frame = 0;
      let current = headings[0].id;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= 130) current = heading.id;
      }
      setActiveId(current);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const initialFrame = requestAnimationFrame(() => {
      try {
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (headings.some((heading) => heading.id === id)) document.getElementById(id)?.scrollIntoView();
      } catch { /* An invalid fragment does not prevent reading the post. */ }
      update();
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(initialFrame);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [headings]);

  return (
    <details className="post-toc" open>
      <summary>이 글의 목차</summary>
      {headings.length ? <nav aria-label="본문 목차">
        <ol>{headings.map((heading) => <li key={heading.id} style={{ paddingInlineStart: `${(heading.depth - baseDepth) * 0.75}rem` }}>
          <a href={`#${encodeURIComponent(heading.id)}`} aria-current={activeId === heading.id ? "location" : undefined}
            onClick={() => setActiveId(heading.id)}>{heading.title}</a>
        </li>)}</ol>
      </nav> : <p>본문에 목차로 표시할 제목이 없습니다.</p>}
    </details>
  );
}
