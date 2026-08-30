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

export type PostSummary = {
  postNumber: number;
  title: string;
  description: string | null;
  status: "Draft" | "Published";
  updatedAtUtc: string;
  publishedAtUtc: string | null;
};

export type PostDetail = PostSummary & {
  content: string;
  createdAtUtc: string;
};

export type ProblemDetails = {
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
