import type { ReactNode } from "react";
import type { Category } from "@/lib/contracts";

export function CategoryDiagram({ branches }: { branches: ReadonlyMap<string | null, Category[]> }) {
  const roots = branches.get(null) ?? [];
  return (
    <section data-ui="panel" className="mt-6 p-4 sm:p-6" aria-labelledby="category-diagram-heading">
      <h2 id="category-diagram-heading" className="mb-4 text-2xl font-black">카테고리 구조도</h2>
      {roots.length > 0 ? (
        <ul className="category-diagram" role="list" aria-label="카테고리 연결 구조">
          {roots.map(category => (
            <li className="category-diagram-card" key={category.id}>
              {renderNode(category)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">아직 카테고리가 없습니다.</p>
      )}
    </section>
  );

  function renderNode(category: Category): ReactNode {
    const children = branches.get(category.id);
    return (
      <>
        <div className="category-diagram-node" data-hidden={!category.isVisible || undefined}>
          <strong>{category.name}</strong>
          {!category.isVisible && <small>{category.isLocallyVisible ? "상위 숨김" : "숨김"}</small>}
        </div>
        {children && (
          <ul className="category-diagram-level" role="list">
            {children.map(child => <li key={child.id}>{renderNode(child)}</li>)}
          </ul>
        )}
      </>
    );
  }
}
