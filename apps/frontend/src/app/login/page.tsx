import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-md px-6 py-20">
      <section data-ui="panel-accent" className="bg-white p-8 dark:bg-[#252525]">
        <p className="mb-2 text-sm font-black tracking-[0.16em] text-emerald-600">ACCOUNT</p>
        <h1 className="text-3xl font-black">로그인</h1>
        <p className="mb-8 mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          최초 설정에서 만든 Owner 계정으로 로그인합니다.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
