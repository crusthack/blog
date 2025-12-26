// /components/TOC.tsx
"use client";

import { TocItem } from "@/lib/parseToc";
import { useDynamicHeading } from "@/lib/dynamicHeading";

export default function TOC({ toc }: { toc: TocItem[] }) {
  const activeId = useDynamicHeading();
  const activeItem = toc.find(t => t.id === activeId) || null;

  const parentItem = activeItem?.parentId
    ? toc.find(t => t.id === activeItem.parentId) || null
    : null;

  const ancestorIds = new Set<string>();
  let cur = activeItem;
  while (cur?.parentId) {
    ancestorIds.add(cur.parentId);
    cur = toc.find(t => t.id === cur!.parentId) || null;
  }

  return (
    <aside className="sticky top-20 h-fit max-h-[80vh] overflow-auto">
      <h3 className="font-bold mb-4">목차</h3>

      <ul className="space-y-2">
        {toc.map((item) => {
          const isTopLevel = item.level === 1;
          const isActive = item.id === activeId;
          const isAncestor = ancestorIds.has(item.id);
          const isChildOfActive = item.parentId === activeId;
          const isSiblingOfActive =
            activeItem?.parentId &&
            item.parentId === activeItem.parentId;

          const isSiblingOfParent =
            parentItem &&
            item.parentId === parentItem.parentId &&
            item.level === parentItem.level;

          const shouldShow =
            isTopLevel ||         // rule 1 모든 h1 태그는 상시 보여야 함
            isActive ||           // rule 2 현재 보고 있는 태그
            isChildOfActive ||    // rule 3 활성화된 태그의 자식
            isSiblingOfActive ||  // rule 4 활성화된 태그의 형제
            isSiblingOfParent ||  // rule 5 활성화된 태그의 부모의 형제
            isAncestor;           // rule 6 활성화된 태그의 연쇄적인 조상

          if (!shouldShow) return null;

          return (
            <li
              key={item.id}
              style={{ paddingLeft: (item.level - 1) * 16 }}
            >
              <a
                href={`#${item.id}`}
                className={`text-sm hover:underline ${isActive ? "font-bold text-blue-500" : "text-gray-700"
                  }`}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}