"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { type Category, readProblem } from "@/lib/contracts";

export function CategoryManager() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error(await readProblem(response, "카테고리를 불러오지 못했습니다."));
    setCategories((await response.json()) as Category[]);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user?.isOwner) {
      router.replace("/login");
      return;
    }
    const timer = window.setTimeout(() => {
      void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAuthLoading, load, router, user]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description, sortOrder: categories.length * 10, isVisible: true }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "카테고리를 만들지 못했습니다."));
      setName("");
      setSlug("");
      setDescription("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리를 만들지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제할까요?`)) return;
    setError("");
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE", credentials: "include" });
    if (!response.ok) {
      setError(await readProblem(response, "카테고리를 삭제하지 못했습니다."));
      return;
    }
    await load();
  }

  if (isAuthLoading || !user?.isOwner) return <main className="content-shell"><p className="muted">권한을 확인하고 있습니다.</p></main>;

  return (
    <main className="content-shell manage-page">
      <header className="manage-header"><p className="eyebrow">Taxonomy</p><h1>카테고리 관리</h1><p className="muted">글을 주제별로 분류하고 공개 탐색 구조를 만듭니다.</p></header>
      {error ? <p className="notice notice-error">{error}</p> : null}
      <div className="manage-grid">
        <form className="editor-form" onSubmit={createCategory}>
          <h2>새 카테고리</h2>
          <label className="field"><span>이름</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
          <label className="field"><span>주소용 slug</span><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} placeholder="computer-science" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} required /><small className="hint">영문 소문자, 숫자, 하이픈만 사용합니다.</small></label>
          <label className="field"><span>설명</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} rows={4} /></label>
          <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "추가 중..." : "카테고리 추가"}</button>
        </form>
        <section className="category-admin-list">
          <h2>현재 카테고리</h2>
          {categories.length === 0 ? <p className="muted">아직 카테고리가 없습니다.</p> : categories.map((category) => (
            <article key={category.id}>
              <div><p><strong>{category.name}</strong><span>/{category.slug}</span></p><small>{category.description || "설명 없음"} · 글 {category.postCount}개</small></div>
              <button className="danger-button" type="button" onClick={() => void deleteCategory(category)} disabled={category.postCount > 0}>삭제</button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
