import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 w-full border-t border-gray-200 bg-gray-50 py-8 transition-colors print:hidden dark:border-gray-800 dark:bg-[#292929]">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 px-4 text-sm text-gray-600 dark:text-gray-300">
        <p className="text-center">
          © 2026 <span className="font-semibold">Crusthack Developer Blog</span>.
          <span className="ml-1 opacity-80">All rights not reserved.</span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            href="mailto:crusthack@gmail.com"
          >
            이메일: crusthack@gmail.com
          </a>
          <Link
            className="inline-flex items-center rounded-full border border-gray-300 px-3 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            href="/health"
          >
            서비스 상태
          </Link>
        </div>
      </div>
    </footer>
  );
}
