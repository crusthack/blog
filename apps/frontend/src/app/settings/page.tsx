import type { Metadata } from "next";
import { SiteSettingsManager } from "@/components/settings/SiteSettingsManager";

export const metadata: Metadata = {
  title: "사이트 설정 | 개발자 블로그",
};

export default function SiteSettingsPage() {
  return <SiteSettingsManager />;
}
