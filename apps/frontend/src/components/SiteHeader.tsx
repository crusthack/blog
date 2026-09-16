"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Category } from "@/lib/contracts";
import { navigationExternalLinks, type ExternalLink } from "@/lib/siteLinks";
import { categoriesUpdatedEvent, externalLinksUpdatedEvent } from "@/lib/uiEvents";

export function SiteHeader() {
  const { user, isLoading, logout } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>(navigationExternalLinks);
  const externalMenuRef = useRef<HTMLDetailsElement>(null);
  const publicMenuRef = useRef<HTMLDetailsElement>(null);
  const categoriesMenuRef = useRef<HTMLDetailsElement>(null);
  const ownerMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    const loadCategories = () => {
      controller?.abort();
      controller = new AbortController();
      void fetch("/api/categories", {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          setCategories((await response.json()) as Category[]);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setCategories([]);
        });
    };
    const timer = window.setTimeout(loadCategories, 0);
    window.addEventListener(categoriesUpdatedEvent, loadCategories);

    return () => {
      controller?.abort();
      window.clearTimeout(timer);
      window.removeEventListener(categoriesUpdatedEvent, loadCategories);
    };
  }, [user]);

  useEffect(() => {
    let controller: AbortController | null = null;
    const loadExternalLinks = () => {
      controller?.abort();
      controller = new AbortController();
      void fetch("/api/site-settings/external-links", {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return parseExternalLinks(await response.json());
        })
        .then((links) => {
          if (links) setExternalLinks(links);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
        });
    };
    const timer = window.setTimeout(loadExternalLinks, 0);
    window.addEventListener(externalLinksUpdatedEvent, loadExternalLinks);

    return () => {
      controller?.abort();
      window.clearTimeout(timer);
      window.removeEventListener(externalLinksUpdatedEvent, loadExternalLinks);
    };
  }, []);

  useEffect(() => {
    const closeMenusOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!externalMenuRef.current?.contains(target)) {
        externalMenuRef.current?.removeAttribute("open");
      }
      if (!categoriesMenuRef.current?.contains(target)) {
        categoriesMenuRef.current?.removeAttribute("open");
      }
      if (!publicMenuRef.current?.contains(target)) {
        publicMenuRef.current?.removeAttribute("open");
      }
      if (!ownerMenuRef.current?.contains(target)) {
        ownerMenuRef.current?.removeAttribute("open");
      }
    };

    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      externalMenuRef.current?.removeAttribute("open");
      publicMenuRef.current?.removeAttribute("open");
      categoriesMenuRef.current?.removeAttribute("open");
      ownerMenuRef.current?.removeAttribute("open");
    };

    document.addEventListener("pointerdown", closeMenusOnOutsideClick);
    document.addEventListener("keydown", closeMenusOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenusOnOutsideClick);
      document.removeEventListener("keydown", closeMenusOnEscape);
    };
  }, []);

  const closeMenus = () => {
    externalMenuRef.current?.removeAttribute("open");
    publicMenuRef.current?.removeAttribute("open");
    categoriesMenuRef.current?.removeAttribute("open");
    ownerMenuRef.current?.removeAttribute("open");
  };

  return (
    <header className="print:hidden">
      <nav
        aria-label="주요 메뉴"
        className="site-nav h-16 w-full border-b border-gray-200 bg-gray-50 transition-colors dark:border-gray-800 dark:bg-[#292929]"
      >
        <div className="mx-auto flex h-full w-full max-w-[1200px] items-center justify-between px-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-0">
            <Link
              aria-label="메인 페이지"
              className="site-nav-primary-link flex shrink-0 items-center whitespace-nowrap p-1 pr-1 text-xl font-black tracking-tight"
              href="/"
              onClick={closeMenus}
            >
              {/* GitHub 프로필 이미지를 그대로 사용해 기존 블로그의 정체성을 이어갑니다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                aria-hidden="true"
                className="h-10 w-10 rounded-full object-cover sm:h-12 sm:w-12"
                height="48"
                src="https://avatars.githubusercontent.com/u/161662653?v=4"
                width="48"
              />
              <span className="brand ml-1.5 hidden sm:inline">Crusthack</span>
            </Link>
            <Link
              className="site-nav-primary-link hidden h-10 items-center whitespace-nowrap px-1.5 font-bold lg:flex"
              href="/markdown"
              onClick={closeMenus}
            >
              Markdown
            </Link>
            <Link
              className="site-nav-primary-link hidden h-10 items-center whitespace-nowrap px-1.5 font-bold lg:flex"
              href="/game"
              onClick={closeMenus}
            >
              웹게임
            </Link>
            <details
              className="group/external relative hidden lg:block"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  publicMenuRef.current?.removeAttribute("open");
                  categoriesMenuRef.current?.removeAttribute("open");
                  ownerMenuRef.current?.removeAttribute("open");
                }
              }}
              ref={externalMenuRef}
            >
              <summary className="site-nav-primary-link flex h-10 cursor-pointer list-none items-center gap-0.5 whitespace-nowrap px-1.5 font-bold">
                외부 사이트
                <span
                  aria-hidden="true"
                  className="text-xs transition-transform group-open/external:rotate-180"
                >
                  ▼
                </span>
              </summary>
              <div className="site-nav-dropdown site-nav-dropdown-scroll absolute left-0 z-50 mt-2 w-56 border py-2">
                <ExternalSiteLinks links={externalLinks} onNavigate={closeMenus} />
              </div>
            </details>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <details
              className="group/public-menu relative lg:hidden"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  externalMenuRef.current?.removeAttribute("open");
                  categoriesMenuRef.current?.removeAttribute("open");
                  ownerMenuRef.current?.removeAttribute("open");
                }
              }}
              ref={publicMenuRef}
            >
              <summary className="site-nav-link flex cursor-pointer list-none items-center gap-1 px-2 py-2 font-bold transition">
                메뉴
                <span
                  aria-hidden="true"
                  className="text-xs transition-transform group-open/public-menu:rotate-180"
                >
                  ▼
                </span>
              </summary>
              <div className="site-nav-dropdown site-nav-dropdown-scroll absolute right-0 z-50 mt-2 w-56 border py-2">
                <Link
                  className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition"
                  href="/markdown"
                  onClick={closeMenus}
                >
                  Markdown
                </Link>
                <Link
                  className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition"
                  href="/game"
                  onClick={closeMenus}
                >
                  웹게임
                </Link>
                <div aria-hidden="true" className="my-1 border-t border-gray-200 dark:border-gray-700" />
                <ExternalSiteLinks links={externalLinks} onNavigate={closeMenus} />
              </div>
            </details>
            <details
              className="group/categories relative"
              onToggle={(event) => {
                if (event.currentTarget.open) {
                  externalMenuRef.current?.removeAttribute("open");
                  publicMenuRef.current?.removeAttribute("open");
                  ownerMenuRef.current?.removeAttribute("open");
                }
              }}
              ref={categoriesMenuRef}
            >
              <summary className="site-nav-link flex cursor-pointer list-none items-center gap-1 px-2 py-2 font-bold transition sm:px-3">
                <span className="sm:hidden">분류</span>
                <span className="hidden sm:inline">카테고리</span>
                <span
                  aria-hidden="true"
                  className="text-xs transition-transform group-open/categories:rotate-180"
                >
                  ▼
                </span>
              </summary>
              <div className="site-nav-dropdown absolute right-0 z-50 mt-2 w-52 overflow-hidden border py-2">
                <Link className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold" href="/posts" onClick={closeMenus}>
                  전체 글
                </Link>
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <Link
                      className="site-nav-dropdown-link flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold transition"
                      href={`/categories/${encodeURIComponent(category.slug)}`}
                      key={category.id}
                      onClick={closeMenus}
                    >
                      <span className="truncate">{category.name}</span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    표시할 카테고리가 없습니다.
                  </p>
                )}
              </div>
            </details>

            {user ? (
              <details
                className="group/owner relative"
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    externalMenuRef.current?.removeAttribute("open");
                    publicMenuRef.current?.removeAttribute("open");
                    categoriesMenuRef.current?.removeAttribute("open");
                  }
                }}
                ref={ownerMenuRef}
              >
                <summary className="flex max-w-24 cursor-pointer list-none items-center gap-1 bg-emerald-600 px-2 py-2 font-bold text-white transition hover:bg-emerald-700 sm:max-w-40 sm:px-3">
                  <span className="truncate">{user.username}</span>
                  <span
                    aria-hidden="true"
                    className="text-xs transition-transform group-open/owner:rotate-180"
                  >
                    ▼
                  </span>
                </summary>
                <div className="site-nav-dropdown absolute right-0 z-50 mt-2 w-48 overflow-hidden border py-2">
                  <Link
                    className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition"
                    href="/write"
                    onClick={closeMenus}
                  >
                    새 글 작성
                  </Link>
                  <Link className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition"
                    href={user.isOwner ? "/admin#posts" : "/posts/manage"} onClick={closeMenus}>
                    {user.isOwner ? "게시글 전체 관리" : "내 글 관리"}
                  </Link>
                  <Link className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition" href="/bookmarks" onClick={closeMenus}>북마크</Link>
                  <Link className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition" href="/workspaces" onClick={closeMenus}>내 슬라이드 필기</Link>
                  {user.isOwner && <Link className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition" href="/admin" onClick={closeMenus}>사이트 관리</Link>}
                  <button
                    className="site-nav-dropdown-link block w-full px-4 py-2.5 text-left text-sm font-bold transition"
                    onClick={() => {
                      closeMenus();
                      void logout();
                    }}
                    type="button"
                  >
                    로그아웃
                  </button>
                </div>
              </details>
            ) : (
              <Link
                aria-disabled={isLoading}
                className="whitespace-nowrap bg-emerald-600 px-2 py-2 font-bold text-white transition hover:bg-emerald-700 sm:px-3"
                href="/login"
              >
                {isLoading ? "확인 중" : "로그인"}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

function ExternalSiteLinks({
  links,
  onNavigate,
}: {
  links: ExternalLink[];
  onNavigate: () => void;
}) {
  if (links.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
        등록된 외부 사이트가 없습니다.
      </p>
    );
  }

  return links.map((link) => (
    <a
      aria-label={`${link.name} (새 탭)`}
      className="site-nav-dropdown-link block px-4 py-2.5 text-sm font-bold transition"
      href={link.url}
      key={link.url}
      onClick={onNavigate}
      rel="noopener noreferrer"
      target="_blank"
    >
      {link.name}
      <span aria-hidden="true" className="ml-1 text-xs">
        ↗
      </span>
    </a>
  ));
}

function parseExternalLinks(value: unknown): ExternalLink[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .filter((item): item is ExternalLink => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<ExternalLink>;
      return typeof candidate.name === "string"
        && candidate.name.trim().length > 0
        && typeof candidate.url === "string"
        && isSafeExternalUrl(candidate.url)
        && typeof candidate.sortOrder === "number"
        && Number.isFinite(candidate.sortOrder)
        && typeof candidate.isVisible === "boolean";
    })
    .filter((link) => link.isVisible)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "ko"));
}

function isSafeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type Theme = "light" | "dark";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("blog-theme");
      const initialTheme: Theme =
        stored === "light" || stored === "dark"
          ? stored
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      applyTheme(initialTheme);
      setTheme(initialTheme);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("blog-theme", nextTheme);
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="site-nav-link flex h-10 w-10 items-center justify-center text-lg transition"
      onClick={toggleTheme}
      title={theme === "dark" ? "라이트 모드" : "다크 모드"}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
