export const metadata = { title: "소개 | Crusthack Blog" };

export default function AboutPage() {
  return (
    <main className="content-shell">
      <article className="about-page">
        <p className="eyebrow">About this archive</p>
        <h1>이해한 것을<br />설명할 수 있을 때까지.</h1>
        <p className="lead">
          프로그래밍과 컴퓨터 과학, 보안 연구 과정에서 얻은 지식과 시행착오를
          다시 찾을 수 있는 형태로 정리하는 개인 기술 블로그입니다.
        </p>
        <div className="about-grid">
          <section><span>01</span><h2>Theory</h2><p>언어, 계산 이론과 시스템의 원리를 정리합니다.</p></section>
          <section><span>02</span><h2>Practice</h2><p>직접 구현하고 검증하면서 발견한 내용을 기록합니다.</p></section>
          <section><span>03</span><h2>Research</h2><p>보안과 응용 연구의 질문, 실험, 결론을 축적합니다.</p></section>
        </div>
      </article>
    </main>
  );
}
