"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePublished } from "@/components/PublishedContext";
import { readProblem, type Category, type CurrentUser } from "@/lib/contracts";
import { categoriesUpdatedEvent } from "@/lib/uiEvents";

const categoryFreshnessMs = 60_000;
const emptyCategories: Category[] = [];
type CategoryState = { categories: Category[]; isLoading: boolean; error: string };
type CategoryResult = { user: CurrentUser | null; categories: Category[]; error: string };
const CategoriesContext = createContext<CategoryState | null>(null);

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const pathname = usePathname();
  const checkFreshness = useRef<(() => void) | null>(null);
  const [result, setResult] = useState<CategoryResult | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    let controller: AbortController | undefined;
    let lastRequestedAt = 0;
    function load() {
      lastRequestedAt = Date.now();
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void fetch("/api/categories", { cache: "no-store", credentials: "include", signal: request.signal })
        .then(async response => {
          if (!response.ok) throw new Error(await readProblem(response, "카테고리를 불러오지 못했습니다."));
          return await response.json() as Category[];
        })
        .then(categories => {
          if (!request.signal.aborted) setResult({ user, categories, error: "" });
        })
        .catch((reason: unknown) => {
          if (request.signal.aborted) return;
          const error = reason instanceof Error ? reason.message : "카테고리를 불러오지 못했습니다.";
          setResult(previous => ({ user, error, categories: previous?.user === user ? previous.categories : emptyCategories }));
        });
    }
    let timer: number;
    function scheduleLoad() {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 0);
    }
    function reloadIfStale() {
      if (Date.now() - lastRequestedAt >= categoryFreshnessMs) scheduleLoad();
    }
    checkFreshness.current = reloadIfStale;
    scheduleLoad();
    window.addEventListener("focus", reloadIfStale);
    window.addEventListener(categoriesUpdatedEvent, scheduleLoad);
    return () => {
      checkFreshness.current = null;
      window.removeEventListener("focus", reloadIfStale);
      window.clearTimeout(timer);
      controller?.abort();
      window.removeEventListener(categoriesUpdatedEvent, scheduleLoad);
    };
  }, [isAuthLoading, user]);

  useEffect(() => {
    checkFreshness.current?.();
  }, [pathname]);

  const current = !isAuthLoading && result?.user === user ? result : null;
  const value = useMemo(() => ({
    categories: current?.categories ?? emptyCategories,
    error: current?.error ?? "",
    isLoading: current === null,
  }), [current]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export function useCategories() {
  const published = usePublished();
  const state = useContext(CategoriesContext);
  if (published) return { categories: published.categories, error: "", isLoading: false };
  if (!state) throw new Error("useCategories must be used inside CategoriesProvider.");
  return state;
}
