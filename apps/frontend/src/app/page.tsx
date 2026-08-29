import { PostList } from "@/components/posts/PostList";

export default function Home() {
  return (
    <main className="content-shell">
      <section className="home-hero">
        <p className="eyebrow">Crusthack Blog</p>
        <h1>배운 것을 기록하고,<br />직접 실행해 보는 공간.</h1>
        <p className="muted">
          프로그래밍 언어, 계산 이론, 형식 논리와 시스템에 관한 개인 연구 노트입니다.
        </p>
      </section>
      <section>
        <div className="section-heading"><h2>최근 글</h2></div>
        <PostList />
      </section>
    </main>
  );
}
