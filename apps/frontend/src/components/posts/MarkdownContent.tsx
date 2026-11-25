import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/posts/CodeBlock";
import { remarkHeadingIds } from "@/lib/markdownHeadings";

const markdownComponents: Components = {
  pre({ node, children, ...props }) {
    void node;
    return <CodeBlock {...props}>{children}</CodeBlock>;
  },
  img({ node, src, alt, ...props }) {
    void node;
    const safeSource = safeMediaUrl(src);
    if (!safeSource) {
      return (
        <span className="my-4 block border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {alt || "안전하지 않은 미디어 주소라 표시할 수 없습니다."}
        </span>
      );
    }

    if (isPdfSource(safeSource)) {
      const label = alt?.trim() || "PDF 문서";
      return (
        <span className="my-6 block overflow-hidden border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <object
            aria-label={`${label} 미리보기`}
            className="block h-[70vh] min-h-[32rem] w-full"
            data={safeSource}
            type="application/pdf"
          >
            <span className="block p-5 text-sm text-gray-600 dark:text-gray-300">
              브라우저에서 PDF 미리보기를 지원하지 않습니다.
            </span>
          </object>
          <a
            className="block border-t border-gray-300 px-4 py-3 text-sm font-bold text-emerald-700 underline dark:border-gray-700 dark:text-emerald-300"
            href={safeSource}
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            target="_blank"
          >
            {label} 새 탭에서 열기
          </a>
        </span>
      );
    }

    return (
      // Markdown 이미지는 크기를 미리 알 수 없고 원격 주소도 허용하므로 네이티브 lazy loading을 사용합니다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...props}
        alt={alt ?? ""}
        decoding="async"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={safeSource}
      />
    );
  },
};

export type MarkdownLinks = { origin: string; appOrigin: string; links: Record<string, string> };

export function MarkdownContent({ source, headingIds = true, published }: {
  source: string; headingIds?: boolean; published?: MarkdownLinks;
}) {
  return (
    <div className="content-markdown markdown-body">
      <ReactMarkdown urlTransform={value => {
        const safe = defaultUrlTransform(value);
        if (!published || !safe || safe.startsWith("#")) return safe;
        const url = new URL(safe, published.origin);
        return url.origin === published.origin ? (published.links[url.pathname.replace(/\/$/, "") || "/"] ?? (published.appOrigin + url.pathname)) + url.search + url.hash : safe;
      }} components={markdownComponents} remarkPlugins={headingIds ? [remarkGfm, remarkHeadingIds] : [remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}

function safeMediaUrl(value: string | Blob | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, "https://blog.invalid");
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function isPdfSource(value: string) {
  try {
    const parsed = new URL(value, "https://blog.invalid");
    return parsed.pathname.toLowerCase().endsWith(".pdf") ||
      parsed.searchParams.get("format")?.toLowerCase() === "pdf";
  } catch {
    return false;
  }
}
