import { OwnerSetupForm } from "@/components/setup/OwnerSetupForm";

export const metadata = {
  title: "Owner 설정 | Crusthack Blog",
};

export default function SetupPage() {
  return (
    <main className="page-shell">
      <section className="panel setup-panel">
        <p className="eyebrow">First-run setup</p>
        <h1>Owner 계정 만들기</h1>
        <p className="muted">
          배포 시 설정한 일회용 Setup Code로 사이트의 첫 번째 Owner를 생성합니다.
          완료된 이후에는 이 화면을 다시 사용할 수 없습니다.
        </p>
        <OwnerSetupForm />
      </section>
    </main>
  );
}
