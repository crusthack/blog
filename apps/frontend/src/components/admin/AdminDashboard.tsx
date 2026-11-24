"use client";

import Link from "next/link";
import { AdminDrive } from "./AdminDrive";
import { MarkdownFolderImport } from "./MarkdownFolderImport";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PostList } from "@/components/posts/PostList";
import { OwnerMaintenance } from "@/components/posts/OwnerMaintenance";
import { CategoryManager } from "@/components/categories/CategoryManager";
import { SiteSettingsManager } from "@/components/settings/SiteSettingsManager";
import { HealthDashboard } from "@/components/health/HealthDashboard";
import { CommunityPanel, type CommunityTab } from "@/components/community/CommunityManagement";
import { readProblem, visibilityLabels, type PostVisibility } from "@/lib/contracts";
import { postPath } from "@/lib/postPaths";

const sections = [
  ["overview", "전체 현황"], ["posts", "게시글"], ["import", "폴더 업로드"], ["categories", "카테고리"],
  ["reports", "신고"], ["members", "회원"], ["invites", "초대"],
  ["settings", "사이트 설정"], ["trash", "휴지통"], ["storage", "첨부 파일"],
  ["drive", "관리자 클라우드"], ["audit", "감사 기록"], ["health", "서비스 상태"],
] as const;
type Section = (typeof sections)[number][0];
type Overview = {
  posts: number; trash: number; members: number; suspended: number; reports: number; categories: number;
  comments: number; invites: number; assets: number; assetBytes: number; checkedAtUtc: string;
  recentPosts: { postNumber: number; title: string; visibility: PostVisibility; categorySlug: string | null; updatedAtUtc: string }[];
  recentActivity: { id: number; action: string; target: string; createdAtUtc: string }[];
};

export function AdminDashboard() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="p-8" role="status">관리 권한 확인 중…</p>;
  if (!user?.isOwner) return <main className="admin-dashboard"><h1>사이트 관리</h1><p>운영자만 접근할 수 있습니다. <Link href="/login">로그인</Link></p></main>;
  return <Dashboard key={user.id} />;
}

function Dashboard() {
  const [section, setSection] = useState<Section>("overview");
  const [visited, setVisited] = useState<Section[]>(["overview"]);
  useEffect(() => {
    function navigate() {
      const hash = location.hash.slice(1);
      const next = sections.find(([key]) => key === hash)?.[0] ?? "overview";
      setSection(next); setVisited(current => current.includes(next) ? current : [...current, next]);
    }
    // Next Link uses pushState for hash navigation, which does not emit hashchange.
    function followSection(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const target = new URL(anchor.href);
      if (target.origin !== location.origin || target.pathname !== location.pathname || target.search !== location.search || !sections.some(([key]) => `#${key}` === target.hash)) return;
      event.preventDefault();
      if (location.hash !== target.hash) history.pushState(null, "", target.hash);
      navigate();
    }
    const timer = window.setTimeout(navigate, 0);
    window.addEventListener("hashchange", navigate);
    window.addEventListener("popstate", navigate);
    document.addEventListener("click", followSection, true);
    return () => { clearTimeout(timer); window.removeEventListener("hashchange", navigate); window.removeEventListener("popstate", navigate); document.removeEventListener("click", followSection, true); };
  }, []);
  return <main className="admin-dashboard" data-ui-page="admin">
    <header className="admin-heading"><div><p className="admin-eyebrow">ADMIN</p><h1>사이트 관리</h1><p>콘텐츠부터 회원·설정·운영 상태까지 한곳에서 관리합니다.</p></div><div className="board-heading-actions"><Link href="/">사이트 보기</Link><Link className="board-primary" href="/write">새 글 작성</Link></div></header>
    <div className="admin-layout"><nav className="admin-navigation" aria-label="사이트 관리 메뉴">{sections.map(([id, title]) => <a key={id} href={`#${id}`} aria-current={section === id ? "page" : undefined}>{title}</a>)}</nav>
      <div className="admin-content">{sections.map(([id, title]) => visited.includes(id) && <div key={id} className="admin-panel" hidden={section !== id} aria-label={title}>
        {id === "overview" ? <OverviewPanel active={section === "overview"} />
          : id === "posts" ? <PostList manage embedded />
          : id === "import" ? <MarkdownFolderImport />
          : id === "categories" ? <CategoryManager embedded />
          : id === "settings" ? <SiteSettingsManager embedded />
          : id === "trash" || id === "storage" ? <OwnerMaintenance tab={id} embedded />
          : id === "drive" ? <AdminDrive />
          : id === "health" ? <HealthDashboard embedded />
          : <CommunitySection tab={id} />}
      </div>)}</div>
    </div>
  </main>;
}

function CommunitySection({ tab }: { tab: CommunityTab }) {
  const [page, setPage] = useState(1); const [resolved, setResolved] = useState(false);
  const label = sections.find(([key]) => key === tab)?.[1];
  return <section className="community-admin"><h2 className="text-2xl font-bold">{label} 관리</h2>
    {tab === "reports" && <label className="block my-4"><input type="checkbox" checked={resolved} onChange={event => { setResolved(event.target.checked); setPage(1); }} /> 처리한 신고 보기</label>}
    <CommunityPanel key={`${page}:${resolved}`} tab={tab} page={page} resolved={resolved} onPage={setPage} />
  </section>;
}

function OverviewPanel({ active }: { active: boolean }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetch("/api/admin/overview", { cache: "no-store", credentials: "include", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(await readProblem(response, "관리 현황을 불러오지 못했습니다."));
      const data = await response.json(); if (!controller.signal.aborted) { setOverview(data); setError(""); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, refresh]);
  return <section>
    <div className="admin-section-heading"><h2>전체 현황</h2><button disabled={loading} type="button" onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>{loading ? "확인 중…" : "현황 새로고침"}</button></div>
    {error && <p className="board-notice board-error" role="alert">{error}</p>}
    {overview && <>
      <p className="admin-updated">{new Date(overview.checkedAtUtc).toLocaleString("ko-KR")} 기준 · 휴지통 글은 게시글 수에서 제외됩니다.</p>
      <div className="admin-metrics">{[
        ["게시글", overview.posts, "posts", `댓글 ${overview.comments}개`],
        ["회원", overview.members, "members", `정지 ${overview.suspended}명`],
        ["미처리 신고", overview.reports, "reports", "확인이 필요한 신고"],
        ["휴지통", overview.trash, "trash", "비공개 복원·영구 삭제"],
        ["카테고리", overview.categories, "categories", "분류·순서·공개 여부"],
        ["유효한 초대", overview.invites, "invites", "미사용 초대 코드"],
        ["등록 첨부", overview.assets, "storage", `${(overview.assetBytes / 1024 / 1024).toFixed(1)} MB · 휴지통 포함`],
        ["사이트 설정", "관리", "settings", "외부 사이트 메뉴·링크"],
      ].map(([label, value, target, hint]) => <a href={`#${target}`} className="admin-metric" key={target}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong><small>{hint}</small></a>)}</div>
      {overview.reports > 0 && <p className="admin-attention"><a href="#reports">미처리 신고 {overview.reports}건을 확인해 주세요 →</a></p>}
      <div className="admin-overview-columns"><section><div className="admin-section-heading"><h3>최근 수정한 글</h3><a href="#posts">전체 관리 →</a></div><ul className="admin-activity">{overview.recentPosts.map(post => <li key={post.postNumber}><div><Link href={`/write/${post.postNumber}`}>{post.title}</Link><small>{visibilityLabels[post.visibility]} · {new Date(post.updatedAtUtc).toLocaleString("ko-KR")}</small></div><Link href={postPath(post)} aria-label={`${post.title} 보기`}>보기</Link></li>)}{!overview.recentPosts.length && <li>등록된 글이 없습니다.</li>}</ul></section>
        <section><div className="admin-section-heading"><h3>최근 운영 기록</h3><a href="#audit">전체 기록 →</a></div><ul className="admin-activity">{overview.recentActivity.map(item => <li key={item.id}><div><span>{activityLabels[item.action] ?? item.action}</span><small>{item.target}</small><small>{new Date(item.createdAtUtc).toLocaleString("ko-KR")}</small></div></li>)}{!overview.recentActivity.length && <li>운영 기록이 없습니다.</li>}</ul></section></div>
      <div className="admin-quick-links"><a href="#settings">사이트 설정</a><a href="#health">API·DB 상태 확인</a><a href="#storage">첨부 파일 정합성 점검</a></div>
    </>}
  </section>;
}
const activityLabels: Record<string, string> = { "drive.folder": "폴더 생성", "drive.upload": "파일 업로드", "drive.update": "파일·폴더 변경", "drive.trash": "파일 휴지통 이동", "drive.restore": "파일·폴더 복원", "drive.purge": "파일·폴더 영구 삭제", "post.create": "글 게시", "post.update": "글 수정", "post.trash": "휴지통 이동", "post.restore": "글 복원", "post.purge": "글 영구 삭제", "member.join": "회원 가입", "member.suspend": "계정 정지", "member.restore": "계정 정지 해제", "invite.create": "초대 발급", "invite.revoke": "초대 회수", "comment.delete": "댓글 삭제", "report.hide": "신고 콘텐츠 조치", "report.resolve": "신고 처리" };
