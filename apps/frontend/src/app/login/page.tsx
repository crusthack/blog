import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="page-shell">
      <section className="panel setup-panel">
        <p className="eyebrow">Owner account</p>
        <h1>로그인</h1>
        <p className="muted">최초 설정에서 만든 Owner 계정으로 로그인합니다.</p>
        <LoginForm />
      </section>
    </main>
  );
}
