"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { readProblem } from "@/lib/contracts";
import { navigationExternalLinks, type ExternalLink } from "@/lib/siteLinks";
import { externalLinksUpdatedEvent } from "@/lib/uiEvents";

const maxExternalLinks = 20;

export function SiteSettingsManager({ embedded = false }: { embedded?: boolean } = {}) {
  const Container = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user?.isOwner) {
      router.replace("/login");
      return;
    }

    const controller = new AbortController();
    void fetch("/api/site-settings/external-links/manage", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readProblem(response, "외부 사이트 설정을 불러오지 못했습니다."));
        }
        return (await response.json()) as ExternalLink[];
      })
      .then((loaded) => setLinks(loaded.map((link) => ({ ...link }))))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "외부 사이트 설정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [isAuthLoading, router, user]);

  function updateLink(index: number, change: Partial<ExternalLink>) {
    setLinks((current) => current.map((link, itemIndex) => (
      itemIndex === index ? { ...link, ...change } : link
    )));
    setMessage("");
  }

  function addLink() {
    if (links.length >= maxExternalLinks) {
      setError(`외부 사이트는 최대 ${maxExternalLinks}개까지 등록할 수 있습니다.`);
      return;
    }
    const nextOrder = links.length === 0
      ? 0
      : Math.max(...links.map((link) => link.sortOrder)) + 10;
    setLinks((current) => [
      ...current,
      { name: "", url: "https://", sortOrder: nextOrder, isVisible: true },
    ]);
    setError("");
    setMessage("");
  }

  function removeLink(index: number) {
    setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setMessage("");
  }

  function moveLink(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    setLinks((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered.map((link, itemIndex) => ({ ...link, sortOrder: itemIndex * 10 }));
    });
    setMessage("");
  }

  function restoreDefaults() {
    setLinks(navigationExternalLinks.map((link) => ({ ...link })));
    setError("");
    setMessage("기본 목록을 불러왔습니다. 서버에 반영하려면 저장해 주세요.");
  }

  async function save() {
    const normalized = links.map((link) => ({
      ...link,
      name: link.name.trim(),
      url: link.url.trim(),
    }));
    const invalid = normalized.find((link) => (
      link.name.length < 1
      || link.name.length > 40
      || !isHttpUrl(link.url)
      || !Number.isInteger(link.sortOrder)
      || link.sortOrder < 0
      || link.sortOrder > 10_000
    ));
    if (invalid) {
      setError("이름은 1~40자, 주소는 http/https URL, 순서는 0~10,000의 정수로 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/site-settings/external-links", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: normalized }),
      });
      if (!response.ok) {
        throw new Error(await readProblem(response, "외부 사이트 설정을 저장하지 못했습니다."));
      }
      const saved = (await response.json()) as ExternalLink[];
      setLinks(saved.map((link) => ({ ...link })));
      window.dispatchEvent(new Event(externalLinksUpdatedEvent));
      setMessage("외부 사이트 메뉴를 저장했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "외부 사이트 설정을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isAuthLoading || isLoading) {
    return (
      <Container className="mx-auto min-h-[70vh] max-w-6xl p-10 text-gray-500 dark:text-gray-400">
        사이트 설정을 불러오고 있습니다.
      </Container>
    );
  }
  if (!user?.isOwner) return null;

  return (
    <Container data-ui-page="admin" className="mx-auto min-h-[75vh] w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black tracking-[0.2em] text-emerald-600">SITE SETTINGS</p>
          <Heading className="mt-2 text-4xl font-black">외부 사이트 관리</Heading>
          <p className="mt-3 max-w-2xl leading-7 text-gray-600 dark:text-gray-300">
            상단 외부 사이트 드롭다운에 표시할 링크와 순서를 관리합니다.
          </p>
        </div>
        <span className="text-sm font-bold text-gray-500">{links.length} / {maxExternalLinks}</span>
      </header>

      <div aria-live="polite">
        {error ? (
          <p data-ui="notice" className="mb-5 border-red-500 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {message ? (
          <p data-ui="notice" className="mb-5 border-emerald-500 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
      </div>

      <section data-ui="panel" className="bg-white p-5 dark:bg-[#252525] sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">링크 목록</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              숨긴 링크는 저장되지만 공개 메뉴에는 표시되지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              data-ui="action"
              className="border border-gray-300 px-4 py-2 text-sm font-bold transition hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
              onClick={restoreDefaults}
              type="button"
            >
              기본값 불러오기
            </button>
            <button
              data-ui="action"
              className="border border-emerald-500 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
              disabled={links.length >= maxExternalLinks}
              onClick={addLink}
              type="button"
            >
              링크 추가
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {links.map((link, index) => (
            <article data-ui="row" className="grid gap-3 border border-gray-200 p-4 dark:border-gray-700 lg:grid-cols-[1fr_2fr_7rem_auto_auto]" key={index}>
              <label>
                <span className="mb-1 block text-xs font-bold text-gray-500">이름</span>
                <input
                  data-ui="input"
                  className="w-full px-3 py-2"
                  maxLength={40}
                  onChange={(event) => updateLink(index, { name: event.target.value })}
                  placeholder="사이트 이름"
                  value={link.name}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-gray-500">URL</span>
                <input
                  data-ui="input"
                  className="w-full px-3 py-2 font-mono text-sm"
                  onChange={(event) => updateLink(index, { url: event.target.value })}
                  placeholder="https://example.com"
                  type="url"
                  value={link.url}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-gray-500">순서</span>
                <input
                  data-ui="input"
                  className="w-full px-3 py-2"
                  max={10_000}
                  min={0}
                  onChange={(event) => updateLink(index, { sortOrder: Number(event.target.value) })}
                  type="number"
                  value={link.sortOrder}
                />
              </label>
              <div className="flex items-end gap-2">
                <label className="flex min-h-10 items-center gap-2 whitespace-nowrap px-1 text-sm font-bold">
                  <input
                    checked={link.isVisible}
                    className="size-4 accent-emerald-600"
                    onChange={(event) => updateLink(index, { isVisible: event.target.checked })}
                    type="checkbox"
                  />
                  공개
                </label>
                <button aria-label={`${link.name || "링크"} 위로 이동`} className={smallButton} disabled={index === 0} onClick={() => moveLink(index, -1)} type="button">↑</button>
                <button aria-label={`${link.name || "링크"} 아래로 이동`} className={smallButton} disabled={index === links.length - 1} onClick={() => moveLink(index, 1)} type="button">↓</button>
              </div>
              <div className="flex items-end">
                <button
                  className="min-h-10 border border-red-300 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                  onClick={() => removeLink(index)}
                  type="button"
                >
                  제거
                </button>
              </div>
            </article>
          ))}
          {links.length === 0 ? (
            <p data-ui="notice" className="border-dashed p-8 text-center text-gray-500">
              저장하면 외부 사이트 드롭다운을 비울 수 있습니다.
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            data-ui="action"
            className="bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "저장 중..." : "외부 사이트 저장"}
          </button>
        </div>
      </section>
    </Container>
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const smallButton = "min-h-10 min-w-10 border border-gray-300 px-2 py-2 font-bold transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-600 dark:hover:bg-gray-800";
