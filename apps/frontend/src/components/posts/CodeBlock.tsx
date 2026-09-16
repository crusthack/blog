"use client";

import { Children, isValidElement, useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

export function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const codeElement = Children.toArray(children).find((child) => isValidElement(child));
  const language = isValidElement<{ className?: string }>(codeElement)
    ? /(?:^|\s)language-([^\s]+)/.exec(codeElement.props.className ?? "")?.[1]
    : undefined;

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  async function copyCode() {
    const code = preRef.current?.textContent;
    if (code === undefined || code === null) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
      timerRef.current = setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar">
        <span className="markdown-code-language">{language ?? "CODE"}</span>
        <button type="button" className="markdown-code-copy" onClick={() => void copyCode()}
          aria-label="코드 복사" disabled={copyState === "copying"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copyState === "copied" ? <polyline points="20 6 9 17 4 12" /> : <>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>}
          </svg>
          {copyState === "copied" ? "COPIED!" : copyState === "copying" ? "COPYING…" : "COPY"}
        </button>
      </div>
      <pre {...props} ref={preRef}>{children}</pre>
      <p role="status" className={copyState === "failed" ? "markdown-code-error" : "sr-only"}>
        {copyState === "copied" ? "코드를 복사했습니다." : copyState === "failed" ? "복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요." : ""}
      </p>
    </div>
  );
}
