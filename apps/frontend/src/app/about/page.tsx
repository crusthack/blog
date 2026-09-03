import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개발자 소개",
  description: "블로그와 개발자에 대한 소개 페이지입니다.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto min-h-[75vh] w-full max-w-[1200px] px-6 py-12">
      <article
        className="border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-[#252525] md:p-12"
        data-ui="panel"
      >
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
          <div
            aria-label="개발자 프로필 이미지"
            className="h-32 w-32 shrink-0 rounded-full bg-gray-100 bg-cover bg-center shadow-lg dark:bg-gray-800"
            role="img"
            style={{
              backgroundImage:
                'url("https://avatars.githubusercontent.com/u/161662653?v=4")',
            }}
          />
          <div>
            <p className="text-sm font-black tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
              ABOUT
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">개발자 소개</h1>
            <p className="mt-4 max-w-2xl leading-7 text-gray-600 dark:text-gray-300">
              프로그래밍과 컴퓨터 과학, 보안 연구 과정에서 얻은 지식과 시행착오를
              다시 찾을 수 있는 형태로 정리합니다. 블로그 시스템도 직접 개발하고
              운영하며, 구현 과정에서 배운 내용을 함께 기록합니다.
            </p>
          </div>
        </div>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            className="border border-gray-200 p-5 transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-gray-700 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30"
            data-ui="panel"
            href="/"
          >
            <strong className="text-lg">최근 글 보기</strong>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              공개된 최신 포스트와 카테고리를 확인합니다.
            </p>
          </Link>
          <a
            className="border border-gray-200 p-5 transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-gray-700 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/30"
            data-ui="panel"
            href="https://github.com/crusthack/blog"
            rel="noopener noreferrer"
            target="_blank"
          >
            <strong className="text-lg">GitHub 저장소 ↗</strong>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              블로그의 소스 코드와 개발 기록을 살펴봅니다.
            </p>
          </a>
        </section>
      </article>
    </main>
  );
}
