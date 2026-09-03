import { OwnerSetupForm } from "@/components/setup/OwnerSetupForm";

export const metadata = {
  title: "Owner 설정 | Crusthack Blog",
};

export default function SetupPage() {
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-xl px-6 py-16 sm:py-20">
      <section data-ui="panel-accent" className="bg-white p-7 sm:p-8 dark:bg-[#252525]">
        <p className="mb-2 text-sm font-black tracking-[0.16em] text-emerald-600">FIRST-RUN SETUP</p>
        <h1 className="text-3xl font-black">Owner 계정 만들기</h1>
        <p className="mb-8 mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          배포 시 설정한 일회용 Setup Code로 사이트의 첫 번째 Owner를 생성합니다.
          완료된 이후에는 이 화면을 다시 사용할 수 없습니다.
        </p>
        <OwnerSetupForm />
      </section>
    </main>
  );
}
