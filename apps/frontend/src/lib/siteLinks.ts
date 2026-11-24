const usefulSiteLinks = [
  { name: "Next.js 학습자료", url: "https://sangkon.com/practice-ts/" },
  { name: "C# 학습자료", url: "https://sangkon.com/practice-csharp/" },
  { name: ".NET Docs", url: "https://github.com/dotnet/docs" },
  { name: "Unity Docs", url: "https://docs.unity3d.com/Manual/" },
  { name: "Unreal Docs", url: "https://dev.epicgames.com/documentation/unreal-engine" },
  { name: "ASP.NET Docs", url: "https://learn.microsoft.com/aspnet/core/" },
  { name: "C++ reference", url: "https://www.cppreference.com/" },
  { name: "LeetCode", url: "https://leetcode.com/" },
  { name: "Linux kernel", url: "https://github.com/torvalds/linux" },
  { name: "Rust Docs", url: "https://doc.rust-lang.org/" },
] as const;

export type ExternalLink = {
  name: string;
  url: string;
  sortOrder: number;
  isVisible: boolean;
};

export const defaultUsefulLinks: ExternalLink[] = usefulSiteLinks.map(
  (link, sortOrder) => ({ ...link, sortOrder, isVisible: true }),
);

const navigationLinkSources = [
  { name: "GitHub 저장소", url: "https://github.com/crusthack/blog" },
  { name: "냥코DB", url: "https://crusthack.github.io/catbattle/" },
  ...usefulSiteLinks,
] as const;

export const navigationExternalLinks: ExternalLink[] = navigationLinkSources.map(
  (link, sortOrder) => ({ ...link, sortOrder, isVisible: true }),
);
