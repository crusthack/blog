"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import type { SetupStatus } from "@/lib/contracts";

export function SetupGuard({ children }: { children: ReactNode }) {
  const isSetupPage = usePathname() === "/setup";
  const router = useRouter();
  const setupCompleted = useRef(false);

  useEffect(() => {
    if (isSetupPage || setupCompleted.current) return;
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
        if (controller.signal.aborted) return;
        if (status.requiresSetup) {
          router.replace("/setup");
          return;
        }
        setupCompleted.current = true;
      })
      .catch(() => {
        // Setup discovery must not block browsing when the API is unavailable.
      });

    return () => controller.abort();
  }, [isSetupPage, router]);

  // Preserve the shared layout and auth state across route changes.
  return children;
}
