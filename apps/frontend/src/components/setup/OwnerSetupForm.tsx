"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { readProblem, type Owner, type SetupStatus } from "@/lib/contracts";

export function OwnerSetupForm() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [createdOwner, setCreatedOwner] = useState<Owner | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      .then(setStatus)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatusError(error instanceof Error ? error.message : "Setup 상태를 확인하지 못했습니다.");
      });

    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");

    if (password !== passwordConfirmation) {
      setSubmitError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/setup/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupCode: String(form.get("setupCode") ?? ""),
          username: String(form.get("username") ?? ""),
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(await readProblem(response, "Owner를 생성하지 못했습니다."));
      }

      setCreatedOwner((await response.json()) as Owner);
      setStatus({ requiresSetup: false, setupCodeConfigured: false });
      event.currentTarget.reset();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Owner를 생성하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (statusError) {
    return <div className="notice notice-error">{statusError}</div>;
  }

  if (!status) {
    return <div className="notice">Setup 상태를 불러오고 있습니다.</div>;
  }

  if (createdOwner) {
    return (
      <div className="notice notice-success">
        <strong>{createdOwner.username}</strong> Owner 계정이 생성되었습니다.{" "}
        <Link href="/login">Owner로 로그인</Link>
      </div>
    );
  }

  if (!status.requiresSetup) {
    return (
      <div className="notice notice-success">
        Owner 초기 설정이 이미 완료되었습니다. <Link href="/">홈으로 이동</Link>
      </div>
    );
  }

  if (!status.setupCodeConfigured) {
    return (
      <div className="notice notice-error">
        Backend에 유효한 Setup Code 파일이 설정되지 않았습니다. 32바이트 이상의 임의 코드를
        secret 파일로 제공한 후 다시 시도하세요.
      </div>
    );
  }

  return (
    <form className="setup-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="setupCode">Setup Code</label>
        <input id="setupCode" name="setupCode" type="password" autoComplete="off" required />
      </div>

      <div className="field">
        <label htmlFor="username">사용자명</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          minLength={3}
          maxLength={64}
          pattern="[a-zA-Z0-9._-]+"
          required
        />
        <p className="hint">영문, 숫자, 점, 밑줄과 하이픈을 사용할 수 있습니다.</p>
      </div>

      <div className="field">
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
        <p className="hint">8자 이상이며 서로 다른 문자를 4개 이상 포함해야 합니다.</p>
      </div>

      <div className="field">
        <label htmlFor="passwordConfirmation">비밀번호 확인</label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </div>

      {submitError ? <div className="notice notice-error">{submitError}</div> : null}

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Owner를 생성하고 있습니다..." : "Owner 계정 생성"}
      </button>
    </form>
  );
}
