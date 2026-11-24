import type { ReactNode } from "react";
import type { Category } from "@/lib/contracts";

export function CategoryDiagram({ branches }: { branches: ReadonlyMap<string | null, Category[]> }) {
  return (
    <section data-ui="panel" className="mb-6 p-4 sm:p-6" aria-labelledby="category-diagram-heading">
      <h2 id="category-diagram-heading" className="mb-4 text-2xl font-black">카테고리 구조도</h2>
      {branches.has(null) ? (
        <div className="category-diagram" role="region" aria-label="카테고리 연결 구조" tabIndex={0}>
          <div className="category-diagram-canvas">
            <p className="category-diagram-root">블로그</p>
            {renderBranch(null)}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">아직 카테고리가 없습니다.</p>
      )}
    </section>
  );

  function renderBranch(parentId: string | null): ReactNode {
    const children = branches.get(parentId);
    if (!children) return null;
    return (
      <ul className="category-diagram-level" role="list">
        {children.map(category => (
          <li key={category.id}>
            <div className="category-diagram-node" data-hidden={!category.isVisible || undefined}>
              <strong>{category.name}</strong>
              {!category.isVisible && <small>{category.isLocallyVisible ? "상위 숨김" : "숨김"}</small>}
            </div>
            {renderBranch(category.id)}
          </li>
        ))}
      </ul>
    );
  }
}
