"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { type Category, readProblem } from "@/lib/contracts";
import { canUseCategoryParent, flattenCategories, groupCategories } from "@/lib/categoryTree";
import { CategoryTree } from "./CategoryTree";
import { CategoryDiagram } from "./CategoryDiagram";
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const createForm = useRef<HTMLFormElement>(null);
  const tree = flattenCategories(categories);
  const branches = groupCategories(categories);
  const rootCount = branches.get(null)?.length ?? 0;
  const categoriesById = new Map(categories.map(category => [category.id, category]));
  const branchIds = categories.filter(category => branches.has(category.id)).map(category => category.id);
  const selection = categories.filter(category => selectedIds.has(category.id)).map(category => category.id);
  const draggedSelection = draggedId ? selectedIds.has(draggedId) ? selection : [draggedId] : [];
  const busy = isMoving || busyCategoryId !== null;
  const moveTargetIsValid = moveTarget !== null && canMoveTo(selection, moveTarget || null);
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

  function beginCreate(parent: string | null) {
    setParentId(parent ?? "");
    createForm.current?.querySelector<HTMLInputElement>("input[name=category-name]")?.focus();
  }

  function toggleBranch(id: string) {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function updateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
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
    if (!window.confirm(`'${category.name}'와 모든 하위 카테고리를 삭제하고, 그 안의 글을 휴지통으로 이동할까요?`)) return;
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
      setMessage("카테고리를 삭제했습니다. 소속 글은 휴지통에서 복원할 수 있습니다.");
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

  function toggleSelection(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function canMoveTo(ids: string[], target: string | null) {
    if (!ids.every(id => categoriesById.has(id) && canUseCategoryParent(target, id, categoriesById))) return false;
    const selected = new Set(ids);
    return ids.some(id => {
      const parent = categoriesById.get(id)?.parentId ?? null;
      if (parent === target) return false;
      for (let ancestor = parent; ancestor; ancestor = categoriesById.get(ancestor)?.parentId ?? null) {
        if (selected.has(ancestor)) return false;
      }
      return true;
    });
  }

  function dragOver(event: DragEvent, target: string | null) {
    if (busy || !canMoveTo(draggedSelection, target)) return;
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

  function dropCategory(event: DragEvent, target: string | null) {
    event.preventDefault();
    void moveCategories(draggedSelection, target);
    endDrag();
  }

  async function moveCategories(ids: string[], target: string | null) {
    if (busy || !canMoveTo(ids, target)) return;
    setIsMoving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/categories/parents", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: ids, parentId: target }),
      });
      if (!response.ok) throw new Error(await readProblem(response, "카테고리를 이동하지 못했습니다."));
      await load();
      setSelectedIds(current => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      setMoveTarget(null);
      window.dispatchEvent(new Event(categoriesUpdatedEvent));
      setMessage(ids.length === 1 ? "카테고리 위치를 변경했습니다." : `선택한 카테고리 ${ids.length}개의 위치를 변경했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리를 이동하지 못했습니다.");
    } finally {
      setIsMoving(false);
    }
  }

  if (isAuthLoading || !user?.isOwner) {
    return <Container className="mx-auto max-w-6xl p-10 text-gray-500 dark:text-gray-400">권한을 확인하고 있습니다.</Container>;
  }

  return (
    <Container data-ui-page="admin" className="mx-auto min-h-[75vh] w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8">
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
      <CategoryDiagram branches={branches} />
      <section data-ui="panel" className="category-tree-panel mb-6 bg-white p-4 sm:p-6 dark:bg-[#252525]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black">카테고리 목록</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">최상위 {rootCount}개 · 전체 {categories.length}개</span>
            <button type="button" className={neutralButton} disabled={draggedId !== null || !branchIds.some(id => expandedIds.has(id))}
              onClick={() => setExpandedIds(new Set())}>모두 접기</button>
            <button type="button" className={neutralButton} disabled={draggedId !== null || branchIds.every(id => expandedIds.has(id))}
              onClick={() => setExpandedIds(new Set(branchIds))}>모두 펼치기</button>
          </div>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">여러 카테고리를 체크해 함께 이동하거나, 체크한 항목 하나를 끌어 선택한 항목을 함께 옮길 수 있습니다.</p>
        {selection.length > 0 && (
          <form className="category-tree-bulk" onSubmit={event => {
            event.preventDefault();
            if (moveTargetIsValid) void moveCategories(selection, moveTarget || null);
          }}>
            <span role="status" className="font-bold">{selection.length}개 선택</span>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">이동할 위치</span>
              <select data-ui="input" className="min-w-0 max-w-full px-3 py-2 text-sm" disabled={busy}
                value={moveTargetIsValid ? moveTarget : "select"}
                onChange={event => setMoveTarget(event.target.value)}>
                <option value="select" disabled>위치 선택</option>
                {canMoveTo(selection, null) && <option value="">최상위</option>}
                {tree.filter(({ category }) => canMoveTo(selection, category.id)).map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>{"— ".repeat(Math.min(depth, 6))}{category.name} 아래</option>
                ))}
              </select>
            </label>
            <button className={primaryButton} type="submit" disabled={busy || !moveTargetIsValid}>{isMoving ? "이동 중…" : "선택 이동"}</button>
            <button className={neutralButton} type="button" disabled={busy} onClick={() => {
              setSelectedIds(new Set());
              setMoveTarget(null);
            }}>선택 해제</button>
          </form>
        )}
        <div
          className="category-tree-root"
          data-drop-target={dropTarget === "" || undefined}
          onDragOver={event => dragOver(event, null)}
          onDragLeave={dragLeave}
          onDrop={event => void dropCategory(event, null)}
        >
          <div>
            <p className="font-bold">최상위 카테고리</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">여기에 놓아 최상위로 이동</p>
          </div>
          <button type="button" className={primaryButton} disabled={isSaving} onClick={() => beginCreate(null)}>
            최상위 추가
          </button>
        </div>
        {categories.length === 0 ? <p className="mt-4 text-sm text-gray-500">아직 카테고리가 없습니다.</p> : (
          <div className="category-tree-scroll">
            <CategoryTree branches={branches} expandedIds={expandedIds} onToggle={toggleBranch} renderCategory={(category, disclosure) => editing?.id === category.id ? (
              <form data-ui="row" className="space-y-4 border border-emerald-300 p-4 dark:border-emerald-800" onSubmit={updateCategory}>
                <div className="flex items-center gap-2">
                  {disclosure}
                  <p className="min-w-0 wrap-break-word font-bold">{category.name} 수정</p>
                </div>
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
                    <button className={primaryButton} disabled={busy} type="submit">{busyCategoryId === category.id ? "저장 중..." : "저장"}</button>
                  </div>
                </div>
              </form>
            ) : (
              <article
                data-ui="row"
                className="category-tree-node"
                data-selected={selectedIds.has(category.id) || undefined}
                data-drop-target={dropTarget === category.id || undefined}
                draggable={!busy}
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
                    <input type="checkbox" className="size-4 self-center accent-emerald-600" checked={selectedIds.has(category.id)} disabled={busy}
                      aria-label={`${category.name} 선택`} onChange={() => toggleSelection(category.id)} />
                    {disclosure}
                    <span aria-hidden="true" className="cursor-grab text-gray-500">⠿</span>
                    <strong className="wrap-break-word text-base">{category.name}</strong>
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">/{category.slug}</span>
                    <span className={`text-xs font-bold ${category.isVisible ? "text-emerald-600" : "text-amber-600"}`}>
                      {category.isVisible ? "공개" : category.isLocallyVisible ? "상위 카테고리 숨김" : "숨김"}
                    </span>
                  </p>
                  <small className="mt-1 block break-words leading-5 text-gray-500 dark:text-gray-400">
                      글 {category.postCount}개 · 순서 {category.sortOrder}{category.description && ` · ${category.description}`}
                  </small>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={neutralButton} disabled={isSaving} onClick={() => beginCreate(category.id)}
                    aria-label={`${category.name} 하위 카테고리 추가`} type="button">하위 추가</button>
                  <button className={neutralButton} disabled={busy} onClick={() => beginEdit(category)} type="button">수정</button>
                  <button
                    className="border border-red-300 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    disabled={busy}
                    onClick={() => void deleteCategory(category)}
                    aria-label={`${category.name} 삭제`}
                    type="button"
                  >
                    {busyCategoryId === category.id ? "처리 중..." : "삭제"}
                  </button>
                </div>
              </article>
            )} />
          </div>
        )}
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <form ref={createForm} data-ui="panel" className="space-y-5 bg-white p-6 dark:bg-[#252525]" onSubmit={createCategory}>
          <h2 className="text-2xl font-black">새 카테고리</h2>
          <CategoryParentField rows={tree} value={parentId} onChange={setParentId} />
          <CategoryTextField label="이름" name="category-name" maxLength={80} onChange={setName} required value={name} />
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
        <form data-ui="panel" className="bg-white p-6 dark:bg-[#252525]" onSubmit={saveHeaderShortcut}>
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
} & Pick<React.ComponentProps<"input">, "maxLength" | "name" | "pattern" | "placeholder" | "required">) {
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
