"use client";

import { useEffect, useState } from "react";
import { getVisibleHeadings, type MarkdownHeading } from "@/lib/markdownHeadings";

export function PostToc({ headings }: { headings: MarkdownHeading[] }) {
  const [activeId, setActiveId] = useState("");
  const baseDepth = Math.min(...headings.map((heading) => heading.depth));
  const visibleHeadings = getVisibleHeadings(headings, activeId);

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
    <section className="post-toc">
      <h3 className="post-toc-title">목차</h3>
      {headings.length ? <nav aria-label="본문 목차">
        <ul>{visibleHeadings.map((heading) => <li key={heading.id} style={{ paddingInlineStart: `${(heading.depth - baseDepth) * 16}px` }}>
          <a href={`#${encodeURIComponent(heading.id)}`} aria-current={activeId === heading.id ? "location" : undefined}
            onClick={() => setActiveId(heading.id)}>{heading.title}</a>
        </li>)}</ul>
      </nav> : <p>본문에 목차로 표시할 제목이 없습니다.</p>}
    </section>
  );
}
