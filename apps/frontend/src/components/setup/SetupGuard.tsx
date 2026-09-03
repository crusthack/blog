"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { SetupStatus } from "@/lib/contracts";

export function SetupGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/setup") {
    return children;
  }

  return <SetupCheck key={pathname}>{children}</SetupCheck>;
}

function SetupCheck({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/setup/status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Setup 상태를 확인하지 못했습니다.");
        return (await response.json()) as SetupStatus;
      })
      .then((status) => {
        if (status.requiresSetup) {
          router.replace("/setup");
          return;
        }
        setIsChecking(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIsChecking(false);
      });

    return () => controller.abort();
  }, [router]);

  if (isChecking) {
    return (
      <main className="grid min-h-[70vh] place-items-center px-6 py-16">
        <p data-ui="notice" role="status" className="bg-gray-50 px-5 py-4 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          사이트 설정을 확인하고 있습니다.
        </p>
      </main>
    );
  }

  return children;
}
