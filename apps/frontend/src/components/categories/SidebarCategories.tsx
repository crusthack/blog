"use client";

import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/contracts";
import { groupCategories } from "@/lib/categoryTree";

export function SidebarCategories({ categories }: { categories: Category[] }) {
  const children = groupCategories(categories);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function branch(category: Category) {
    const nested = children.get(category.id) ?? [];
    const open = expanded.has(category.id);
    return <li key={category.id}>
      <div className="sidebar-category-row">
        <Link href={`/categories/${encodeURIComponent(category.slug)}`}>
          {category.name} <span title="이 분류에 직접 등록된 글">({category.postCount})</span>
        </Link>
        {nested.length > 0 && <button type="button" aria-expanded={open}
          aria-label={`${category.name} 하위 카테고리 ${open ? "닫기" : "펼치기"}`}
          onClick={() => toggle(category.id)}>{open ? "▾" : "▸"}</button>}
      </div>
      {open && nested.length > 0 && <ul>{nested.map(branch)}</ul>}
    </li>;
  }
  return <ul className="sidebar-categories">{children.get(null)?.map(branch)}</ul>;
}
