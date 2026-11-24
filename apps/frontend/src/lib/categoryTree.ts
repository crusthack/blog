import type { Category } from "./contracts";

export function flattenCategories(categories: Category[]) {
  const children = new Map<string | null, Category[]>();
  for (const category of categories) {
    const parentId = category.parentId ?? null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(category);
    children.set(parentId, siblings);
  }

  const rows: { category: Category; depth: number }[] = [];
  function append(parentId: string | null, depth: number) {
    for (const category of children.get(parentId) ?? []) {
      rows.push({ category, depth });
      append(category.id, depth + 1);
    }
  }
  append(null, 0);
  return rows;
}

export function canUseCategoryParent(
  parentId: string | null,
  categoryId: string,
  categoriesById: ReadonlyMap<string, Category>,
) {
  while (parentId) {
    if (parentId === categoryId) return false;
    const parent = categoriesById.get(parentId);
    if (!parent) return false;
    parentId = parent.parentId ?? null;
  }
  return true;
}
