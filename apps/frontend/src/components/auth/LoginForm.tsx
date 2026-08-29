"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "로그인하지 못했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="setup-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>사용자명</span>
        <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
      </label>
      <label className="field">
        <span>비밀번호</span>
        <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      {error ? <p className="notice notice-error">{error}</p> : null}
      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "로그인 중..." : "Owner 로그인"}
      </button>
    </form>
  );
}
