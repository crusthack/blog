"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { readProblem } from "@/lib/contracts";
export default function Join() {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [inviteCode, setCode] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/community/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, inviteCode }) });
      if (!response.ok) throw new Error(await readProblem(response, "가입하지 못했습니다."));
      setPassword(""); setCode(""); setDone(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "가입 실패"); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">커뮤니티 가입</h1>{done ? <p className="my-6">가입했습니다. <Link className="underline" href="/login">로그인하기</Link></p> : <form className="community-form mt-6" onSubmit={submit}>
    <p>운영자에게 받은 일회용 초대 코드로 가입할 수 있습니다.</p>
    <label>사용자명<input autoComplete="username" required pattern="[a-zA-Z0-9._-]{3,64}" maxLength={64} value={username} onChange={event => setUsername(event.target.value)} /></label>
    <p className="text-sm">영문·숫자·마침표·밑줄·하이픈, 3~64자</p>
    <label>비밀번호<input autoComplete="new-password" type="password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
    <label>초대 코드<input required autoComplete="off" maxLength={64} value={inviteCode} onChange={event => setCode(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button type="submit" disabled={busy}>{busy ? "가입 중…" : "회원 가입"}</button>
  </form>}</main>;
}
