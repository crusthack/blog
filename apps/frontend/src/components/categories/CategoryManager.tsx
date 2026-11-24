"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { type Category, readProblem } from "@/lib/contracts";
import { canUseCategoryParent, flattenCategories } from "@/lib/categoryTree";
import { categoriesUpdatedEvent } from "@/lib/uiEvents";

type CategoryDraft = Pick<
  Category,
  "id" | "name" | "slug" | "description" | "sortOrder" | "isVisible" | "parentId"
>;

export function CategoryManager({ embedded = false }: { embedded?: boolean } = {}) {
  const Container = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<CategoryDraft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [shortcutDraft, setShortcutDraft] = useState<string | null>(null);
  const [isSavingShortcut, setIsSavingShortcut] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const tree = flattenCategories(categories);
  const categoriesById = new Map(categories.map(category => [category.id, category]));
  const parentIds = new Set(categories.map(category => category.parentId));
  const savedShortcut = categories.find(category => category.isHeaderShortcut);
  const visibleCategories = categories.filter(category => category.isVisible);
  const selectedShortcutId = shortcutDraft === ""
    ? ""
    : visibleCategories.find(category => category.id === shortcutDraft)?.id ?? savedShortcut?.id ?? "";
  const shortcutChanged = selectedShortcutId !== (savedShortcut?.id ?? "");

  const load = useCallback(async () => {
    const response = await fetch("/api/categories", { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error(await readProblem(response, "카테고리를 불러오지 못했습니다."));
    const loaded = ((await response.json()) as Category[]).sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"),
    );
    setCategories(loaded);
    return loaded;
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user?.isOwner) {
      router.replace("/login");
      return;
    }
    const timer = window.setTimeout(() => {
      void load()
        .then((loaded) => setSortOrder(nextSortOrder(loaded)))
        .catch((reason: unknown) => setError(
          reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다.",
        ));
    }, 0);
    function refreshCategories() {
      void load().catch((reason: unknown) => setError(
        reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다.",
      ));
    }
    window.addEventListener(categoriesUpdatedEvent, refreshCategories);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(categoriesUpdatedEvent, refreshCategories);
    };
  }, [isAuthLoading, load, router, user]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description, sortOrder, isVisible, parentId: parentId || null }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "카테고리를 만들지 못했습니다."));
      setName("");
      setSlug("");
      setDescription("");
      setIsVisible(true);
      const loaded = await load();
      setSortOrder(nextSortOrder(loaded));
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      setMessage("카테고리를 추가했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리를 만들지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  function beginEdit(category: Category) {
    setEditing({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      sortOrder: category.sortOrder,
      isVisible: category.isLocallyVisible ?? category.isVisible,
      parentId: category.parentId ?? null,
    });
    setError("");
    setMessage("");
  }

  async function updateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusyCategoryId(editing.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/categories/${editing.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          slug: editing.slug,
          description: editing.description,
          sortOrder: editing.sortOrder,
          isVisible: editing.isVisible,
          parentId: editing.parentId,
        }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "카테고리를 저장하지 못했습니다."));
      await load();
      setEditing(null);
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      setMessage("카테고리 변경사항을 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리를 저장하지 못했습니다.");
    } finally {
      setBusyCategoryId(null);
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`'${category.name}' 카테고리를 삭제할까요?`)) return;
    setBusyCategoryId(category.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readProblem(response, "카테고리를 삭제하지 못했습니다."));
      if (editing?.id === category.id) setEditing(null);
      await load();
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      setMessage("카테고리를 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리를 삭제하지 못했습니다.");
    } finally {
      setBusyCategoryId(null);
    }
  }

  async function saveHeaderShortcut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shortcutChanged || isSavingShortcut) return;
    setIsSavingShortcut(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/categories/header-shortcut", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: selectedShortcutId || null }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "상단 바로가기를 저장하지 못했습니다."));
      setCategories(current => current.map(category => ({
        ...category,
        isHeaderShortcut: category.id === selectedShortcutId,
      })));
      setShortcutDraft(null);
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      setMessage(selectedShortcutId ? "상단 카테고리 바로가기를 저장했습니다." : "상단 카테고리 바로가기를 해제했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상단 바로가기를 저장하지 못했습니다.");
    } finally {
      setIsSavingShortcut(false);
    }
  }

  function canDropOn(target: string | null) {
    const dragged = draggedId ? categoriesById.get(draggedId) : undefined;
    return Boolean(dragged && !busyCategoryId && (dragged.parentId ?? null) !== target
      && canUseCategoryParent(target, dragged.id, categoriesById));
  }

  function dragOver(event: DragEvent, target: string | null) {
    if (!canDropOn(target)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target ?? "");
  }

  function dragLeave(event: DragEvent) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setDropTarget(null);
    }
  }

  function endDrag() {
    setDraggedId(null);
    setDropTarget(null);
  }

  async function dropCategory(event: DragEvent, target: string | null) {
    event.preventDefault();
    const id = draggedId;
    const allowed = canDropOn(target);
    endDrag();
    if (!id || !allowed) return;
    setBusyCategoryId(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/categories/${id}/parent`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: target }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "카테고리를 이동하지 못했습니다."));
      await load();
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      setMessage("카테고리 위치를 변경했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리를 이동하지 못했습니다.");
    } finally {
      setBusyCategoryId(null);
    }
  }

  if (isAuthLoading || !user?.isOwner) {
    return <Container className="mx-auto max-w-6xl p-10 text-gray-500 dark:text-gray-400">권한을 확인하고 있습니다.</Container>;
  }

  return (
    <Container data-ui-page="admin" className="mx-auto min-h-[75vh] w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-black tracking-[0.2em] text-emerald-600">TAXONOMY</p>
        <Heading className="mt-2 text-4xl font-black">카테고리 관리</Heading>
        <p className="mt-3 text-gray-600 dark:text-gray-300">이름, 주소, 노출 여부와 표시 순서를 한곳에서 관리합니다.</p>
      </header>
      <div aria-live="polite">
        {error ? (
          <p data-ui="notice" className="mb-6 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {message ? (
          <p data-ui="notice" className="mb-6 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
      </div>
      <form data-ui="panel" className="mb-6 bg-white p-6 dark:bg-[#252525]" onSubmit={saveHeaderShortcut}>
        <h2 className="text-2xl font-black">상단 카테고리 바로가기</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          공개 카테고리 하나를 선택하면 방문자에게 블로그 우측 상단에 바로가기 링크가 표시됩니다.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 sm:max-w-sm">
            <span className="mb-1 block text-sm font-bold">바로가기 카테고리</span>
            <select
              data-ui="input"
              className="w-full px-3 py-2"
              disabled={isSavingShortcut}
              onChange={event => { setShortcutDraft(event.target.value); setMessage(""); }}
              value={selectedShortcutId}
            >
              <option value="">표시 안 함</option>
              {savedShortcut && !savedShortcut.isVisible && (
                <option value={savedShortcut.id} disabled>{savedShortcut.name} (비공개)</option>
              )}
              {tree.filter(({ category }) => category.isVisible).map(({ category, depth }) => (
                <option key={category.id} value={category.id}>{"— ".repeat(Math.min(depth, 6))}{category.name}</option>
              ))}
            </select>
          </label>
          <button className={primaryButton} disabled={!shortcutChanged || isSavingShortcut} type="submit">
            {isSavingShortcut ? "저장 중..." : "바로가기 저장"}
          </button>
        </div>
      </form>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <form data-ui="panel" className="space-y-5 bg-white p-6 dark:bg-[#252525]" onSubmit={createCategory}>
          <h2 className="text-2xl font-black">새 카테고리</h2>
          <CategoryParentField rows={tree} value={parentId} onChange={setParentId} />
          <CategoryTextField label="이름" maxLength={80} onChange={setName} required value={name} />
          <CategoryTextField
            help="영문 소문자, 숫자, 하이픈만 사용합니다."
            label="주소용 slug"
            maxLength={80}
            onChange={(value) => setSlug(value.toLowerCase())}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="computer-science"
            required
            value={slug}
          />
          <label className="block">
            <span className="mb-2 block text-sm font-bold">설명</span>
            <textarea
              data-ui="input"
              className="w-full resize-y border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-600"
              maxLength={300}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              value={description}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold">표시 순서</span>
              <input data-ui="input" className="w-full px-3 py-2.5" max={10_000} min={0} onChange={(event) => setSortOrder(Number(event.target.value))} type="number" value={sortOrder} />
            </label>
            <label data-ui="row" className="flex items-center gap-3 border border-gray-200 px-4 py-3 text-sm font-bold dark:border-gray-700 sm:self-end">
              <input checked={isVisible} className="size-4 accent-emerald-600" onChange={(event) => setIsVisible(event.target.checked)} type="checkbox" />
              공개 메뉴에 표시
            </label>
          </div>
          <button
            data-ui="action"
            className="w-full bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "추가 중..." : "카테고리 추가"}
          </button>
        </form>

        <section data-ui="panel" className="bg-white p-6 dark:bg-[#252525]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">카테고리 트리</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">{categories.length}개</span>
          </div>
          {categories.length === 0 ? (
            <p data-ui="notice" className="bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
              아직 카테고리가 없습니다.
            </p>
          ) : (
            <>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">카테고리를 다른 항목 위에 놓으면 그 아래로 이동합니다.</p>
            <div
              className={`mb-3 border border-dashed p-3 text-sm ${dropTarget === "" ? "border-emerald-600 bg-emerald-500/15" : "border-gray-400"}`}
              onDragOver={event => dragOver(event, null)}
              onDragLeave={dragLeave}
              onDrop={event => void dropCategory(event, null)}
            >
              여기에 놓아 최상위로 이동
            </div>
            <ul className="space-y-3">
              {tree.map(({ category, depth }) => <li key={category.id} style={{ marginInlineStart: `${Math.min(depth, 5) * 0.75}rem` }}>
              {editing?.id === category.id ? (
                <form data-ui="row" className="space-y-4 border border-emerald-300 p-4 dark:border-emerald-800" onSubmit={updateCategory}>
                  <CategoryParentField
                    rows={tree.filter(({ category: parent }) => canUseCategoryParent(parent.id, category.id, categoriesById))}
                    value={editing.parentId ?? ""}
                    onChange={value => setEditing(current => current ? { ...current, parentId: value || null } : current)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CategoryTextField label="이름" maxLength={80} onChange={(value) => setEditing((current) => current ? { ...current, name: value } : current)} required value={editing.name} />
                    <CategoryTextField label="slug" maxLength={80} onChange={(value) => setEditing((current) => current ? { ...current, slug: value.toLowerCase() } : current)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required value={editing.slug} />
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-gray-500">설명</span>
                    <textarea data-ui="input" className="w-full resize-y px-3 py-2" maxLength={300} onChange={(event) => setEditing((current) => current ? { ...current, description: event.target.value } : current)} rows={3} value={editing.description ?? ""} />
                  </label>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block w-28">
                      <span className="mb-1 block text-xs font-bold text-gray-500">표시 순서</span>
                      <input data-ui="input" className="w-full px-3 py-2" max={10_000} min={0} onChange={(event) => setEditing((current) => current ? { ...current, sortOrder: Number(event.target.value) } : current)} type="number" value={editing.sortOrder} />
                    </label>
                    <label className="flex min-h-10 items-center gap-2 px-2 text-sm font-bold">
                      <input checked={editing.isVisible} className="size-4 accent-emerald-600" onChange={(event) => setEditing((current) => current ? { ...current, isVisible: event.target.checked } : current)} type="checkbox" />
                      공개
                    </label>
                    <div className="ml-auto flex gap-2">
                      <button className={neutralButton} disabled={busyCategoryId === category.id} onClick={() => setEditing(null)} type="button">취소</button>
                      <button className={primaryButton} disabled={busyCategoryId === category.id} type="submit">{busyCategoryId === category.id ? "저장 중..." : "저장"}</button>
                    </div>
                  </div>
                </form>
              ) : (
                <article
                  data-ui="row"
                  className={`flex flex-col gap-4 border p-4 lg:flex-row lg:items-center lg:justify-between ${dropTarget === category.id ? "border-emerald-600 bg-emerald-500/15" : "border-gray-200 dark:border-gray-700"}`}
                  draggable={busyCategoryId === null}
                  onDragStart={event => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", category.id);
                    setDraggedId(category.id);
                  }}
                  onDragEnd={endDrag}
                  onDragOver={event => dragOver(event, category.id)}
                  onDragLeave={dragLeave}
                  onDrop={event => void dropCategory(event, category.id)}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span aria-hidden="true" className="cursor-grab text-gray-500">⠿</span>
                      <strong className="break-all text-base">{category.name}</strong>
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">/{category.slug}</span>
                      <span className={`text-xs font-bold ${category.isVisible ? "text-emerald-600" : "text-amber-600"}`}>
                        {category.isVisible ? "공개" : category.isLocallyVisible ? "상위 카테고리 숨김" : "숨김"}
                      </span>
                    </p>
                    <small className="mt-1 block break-words leading-5 text-gray-500 dark:text-gray-400">
                      순서 {category.sortOrder} · {category.description || "설명 없음"} · 글 {category.postCount}개
                    </small>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className={neutralButton} disabled={busyCategoryId !== null} onClick={() => beginEdit(category)} type="button">수정</button>
                    <button
                      className="border border-red-300 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      disabled={category.postCount > 0 || parentIds.has(category.id) || busyCategoryId !== null}
                      onClick={() => void deleteCategory(category)}
                      title={parentIds.has(category.id) ? "하위 카테고리를 먼저 이동하거나 삭제해 주세요."
                        : category.postCount > 0 ? "게시글이 있는 카테고리는 삭제할 수 없습니다." : undefined}
                      type="button"
                    >
                      {busyCategoryId === category.id ? "처리 중..." : "삭제"}
                    </button>
                  </div>
                </article>
              )}
              </li>)}
            </ul>
            </>
          )}
        </section>
      </div>
    </Container>
  );
}

function CategoryParentField({ rows, value, onChange }: {
  rows: ReturnType<typeof flattenCategories>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">상위 카테고리</span>
      <select data-ui="input" className="w-full px-3 py-2" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">없음 (최상위)</option>
        {rows.map(({ category, depth }) => <option key={category.id} value={category.id}>
          {"— ".repeat(Math.min(depth, 6))}{category.name}
        </option>)}
      </select>
    </label>
  );
}

function CategoryTextField({
  label,
  value,
  onChange,
  help,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
} & Pick<React.ComponentProps<"input">, "maxLength" | "pattern" | "placeholder" | "required">) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold">{label}</span>
      <input
        data-ui="input"
        className="w-full border border-gray-300 bg-transparent px-3 py-2.5 dark:border-gray-600"
        onChange={(event) => onChange(event.target.value)}
        value={value}
        {...inputProps}
      />
      {help ? <small className="mt-2 block text-xs text-gray-500 dark:text-gray-400">{help}</small> : null}
    </label>
  );
}

function nextSortOrder(categories: Category[]) {
  return categories.length === 0
    ? 0
    : Math.min(10_000, Math.max(...categories.map((category) => category.sortOrder)) + 10);
}

const neutralButton = "border border-gray-300 px-3 py-2 text-sm font-bold transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-800";
const primaryButton = "bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
