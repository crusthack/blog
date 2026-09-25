import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type HomeContent = {
  title: string;
  date: string;
  description: string;
  markdown: string;
};

const defaults = {
  title: "메인 페이지",
  date: "",
  description: "Next.js와 ASP.NET Core로 만든 개발자 블로그",
};

export function getHomeContent(page: "home" | "about" = "home"): HomeContent {
  const source = readFileSync(resolveHomeContentPath(page), "utf8").replace(/\r\n/g, "\n");
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);

  if (!frontmatter) {
    return { ...defaults, markdown: source.trim() };
  }

  const fields = Object.fromEntries(
    frontmatter[1]
      .split("\n")
      .map((line) => line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], unwrapQuotedValue(match[2])]),
  );

  return {
    title: fields.title || defaults.title,
    date: fields.date || defaults.date,
    description: fields.description || defaults.description,
    markdown: source.slice(frontmatter[0].length).trim(),
  };
}

function resolveHomeContentPath(page: "home" | "about") {
  const candidates = [
    path.join(process.cwd(), "content", `${page}.md`),
    path.join(process.cwd(), "apps", "frontend", "content", `${page}.md`),
  ];
  const matchedPath = candidates.find((candidate) => existsSync(candidate));

  if (!matchedPath) {
    throw new Error(`apps/frontend/content/${page}.md 파일을 찾을 수 없습니다.`);
  }

  return matchedPath;
}

function unwrapQuotedValue(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
