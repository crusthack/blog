export type CurrentUser = {
  id: string;
  username: string;
  isOwner: boolean;
  createdAtUtc: string;
};

export type SetupStatus = {
  requiresSetup: boolean;
  setupCodeConfigured: boolean;
};

export type Owner = {
  id: string;
  username: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  postCount: number;
};

export type PostVisibility = "Public" | "Private" | "CodeProtected";

export const visibilityLabels: Record<PostVisibility, string> = {
  Public: "공개",
  Private: "비공개",
  CodeProtected: "코드로 열람",
};

export type PostSummary = {
  createdAtUtc?: string;
  priority?: number;
  revision?: number;
  authorName?: string;
  authorId?: string;
  canEdit?: boolean;
  postNumber: number;
  title: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  visibility: PostVisibility;
  updatedAtUtc: string;
  publishedAtUtc: string | null;
};

export type PostDetail = PostSummary & {
  revision: number;
  content: string;
  createdAtUtc: string;
};

export type PostAsset = {
  id: string;
  name: string;
  extension: string;
  contentType: string;
  size: number;
  url: string;
  createdAtUtc: string;
  updatedAtUtc: string;
};

type ProblemDetails = {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
};

export async function readProblem(response: Response, fallback: string) {
  const problem = (await response.json().catch(() => ({}))) as ProblemDetails;
  const validation = problem.errors
    ? Object.values(problem.errors).flat().join(" ")
    : "";
  return validation || problem.detail || problem.title || fallback;
}
