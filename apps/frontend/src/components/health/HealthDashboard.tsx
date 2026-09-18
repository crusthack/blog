"use client";

import { useCallback, useEffect, useState } from "react";

type ServiceStatus = "Healthy" | "Unhealthy";

type HealthResponse = {
  status: ServiceStatus;
  api?: { status: ServiceStatus };
  database?: { provider: string; status: ServiceStatus };
  checkedAtUtc?: string;
  release?: { commitSha: string | null; updatedAtUtc: string | null };
};

export function HealthDashboard({ embedded = false }: { embedded?: boolean } = {}) {
  const Container = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(true);

  const refresh = useCallback(async () => {
    const startedAt = performance.now();
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = (await response.json()) as HealthResponse;
      setLatency(Math.round(performance.now() - startedAt));
      setHealth(payload);
      setError(response.ok ? "" : "일부 서비스의 상태를 확인해야 합니다.");
    } catch {
      setHealth(null);
      setLatency(null);
      setError("상태 API에 연결하지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const isHealthy = health?.status === "Healthy";

  return (
    <Container data-ui-page="operational" className="mx-auto min-h-[75vh] w-full max-w-[1100px] px-4 py-12 sm:px-6">
      <section data-ui="panel" className="overflow-hidden bg-white dark:bg-[#252525]">
        <header className={`border-b px-6 py-9 sm:px-10 ${
          isHealthy
            ? "border-emerald-100 bg-emerald-50 dark:border-emerald-950 dark:bg-emerald-950/30"
            : "border-amber-100 bg-amber-50 dark:border-amber-950 dark:bg-amber-950/30"
        }`}>
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-gray-500">SYSTEM HEALTH</p>
              <Heading className="mt-2 text-4xl font-black">서비스 상태</Heading>
              <p className="mt-3 text-gray-600 dark:text-gray-300">
                블로그 API와 SQLite 연결을 30초마다 확인합니다.
              </p>
            </div>
            <div
              aria-live="polite"
              className={`flex items-center gap-3 rounded-full px-5 py-3 font-black text-white ${
                isHealthy ? "bg-emerald-600" : "bg-amber-500"
              }`}
            >
              <span aria-hidden="true" className={`size-3 rounded-full bg-white ${isRefreshing ? "animate-pulse" : ""}`} />
              {isRefreshing && !health ? "확인 중" : isHealthy ? "정상" : "확인 필요"}
            </div>
          </div>
        </header>

        <div className="grid gap-5 p-6 sm:p-10 md:grid-cols-3">
          <HealthCard
            description="인증과 콘텐츠 API"
            status={health?.api?.status ?? health?.status}
            title="ASP.NET Core"
          />
          <HealthCard
            description="블로그 데이터 저장소"
            detail={health?.database?.provider}
            status={health?.database?.status ?? health?.status}
            title="SQLite"
          />
          <section className="border border-gray-200 p-6 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-500">응답 시간</p>
            <p className="mt-3 text-3xl font-black">{latency === null ? "—" : `${latency} ms`}</p>
            <p className="mt-3 text-sm text-gray-500">현재 브라우저에서 API까지</p>
          </section>
        </div>

        <section className="px-6 pb-6 sm:px-10" aria-label="최근 업데이트">
          <p className="text-sm font-bold text-gray-500">최근 업데이트</p>
          <p className="mt-2 text-lg font-bold">
            {health?.release?.updatedAtUtc ? <time dateTime={health.release.updatedAtUtc}>{formatCheckedAt(health.release.updatedAtUtc)} (KST)</time>
              : isRefreshing && !health ? "확인 중…" : "배포 정보 없음"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            현재 배포된 소스의 마지막 커밋 기준
            {health?.release?.commitSha ? (
              <> · <code title={health.release.commitSha}>{health.release.commitSha.slice(0, 7)}</code></>
            ) : null}
          </p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 px-6 py-5 dark:border-gray-700 sm:px-10">
          <div aria-live="polite">
            {error ? (
              <p className="font-bold text-amber-700 dark:text-amber-300">{error}</p>
            ) : (
              <p className="text-sm text-gray-500">
                마지막 확인: {health?.checkedAtUtc ? formatCheckedAt(health.checkedAtUtc) : "아직 확인하지 않음"}
              </p>
            )}
          </div>
          <button
            data-ui="action"
            className="border border-gray-300 px-4 py-2 text-sm font-bold transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
            disabled={isRefreshing}
            onClick={() => void refresh()}
            type="button"
          >
            {isRefreshing ? "확인 중..." : "지금 새로고침"}
          </button>
        </footer>
      </section>
    </Container>
  );
}

function HealthCard({
  title,
  description,
  status,
  detail,
}: {
  title: string;
  description: string;
  status?: ServiceStatus;
  detail?: string;
}) {
  const healthy = status === "Healthy";
  return (
    <section className="border border-gray-200 p-6 dark:border-gray-700">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-500">{title}</p>
        <span className={`size-3 rounded-full ${healthy ? "bg-emerald-500" : "bg-amber-500"}`} />
      </div>
      <p className="mt-3 text-2xl font-black">{status ?? "확인 중"}</p>
      <p className="mt-3 text-sm text-gray-500">{description}{detail ? ` · ${detail}` : ""}</p>
    </section>
  );
}

function formatCheckedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
