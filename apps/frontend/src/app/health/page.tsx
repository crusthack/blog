import type { Metadata } from "next";
import { HealthDashboard } from "@/components/health/HealthDashboard";

export const metadata: Metadata = {
  title: "서비스 상태 | 개발자 블로그",
};

export default function HealthPage() {
  return <HealthDashboard />;
}
