import type { ReactNode } from "react";
import type { Category } from "@/lib/contracts";

type Props = {
  branches: ReadonlyMap<string | null, Category[]>;
  expandedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  renderCategory: (category: Category, disclosure: ReactNode) => ReactNode;
};

export function CategoryTree({ branches, expandedIds, onToggle, renderCategory }: Props) {
  return (
    <ul aria-label="카테고리 계층" className="category-tree-branch">
      {renderBranch(null)}
    </ul>
  );

  function renderBranch(parentId: string | null): ReactNode {
    return branches.get(parentId)?.map(category => {
      const childCount = branches.get(category.id)?.length ?? 0;
      const expanded = childCount > 0 && expandedIds.has(category.id);
      const disclosure = childCount > 0 && (
        <button
          type="button"
          className="category-tree-disclosure"
          aria-label={`${category.name} 하위 카테고리 ${expanded ? "접기" : "펼치기"} (${childCount}개)`}
          aria-expanded={expanded}
          aria-controls={`category-branch-${category.id}`}
          onClick={() => onToggle(category.id)}
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </button>
      );

      return (
        <li key={category.id}>
          {renderCategory(category, disclosure)}
          {childCount > 0 && (
            <ul hidden={!expanded} id={`category-branch-${category.id}`} className="category-tree-branch">
              {expanded && renderBranch(category.id)}
            </ul>
          )}
        </li>
      );
    });
  }
}
