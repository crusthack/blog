"use client";

import { useState } from "react";
import { readProblem } from "@/lib/contracts";

export function PagesDeployButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function deploy() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/pages-deploy", { method: "POST" });
      if (!response.ok) throw new Error(await readProblem(response, "배포 요청에 실패했습니다."));
      setMessage("배포를 요청했습니다. GitHub Actions에서 진행 상태를 확인하세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "배포 요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return <div><button type="button" disabled={busy} onClick={deploy}>{busy ? "요청 중…" : "Pages 즉시 배포"}</button>
    {message && <p role="status">{message} <a href="https://github.com/crusthack/blog/actions/workflows/pages.yml">배포 기록</a></p>}</div>;
}
