import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { SetupGuard } from "@/components/setup/SetupGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crusthack Blog",
  description: "개인 연구와 학습을 위한 블로그",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <SetupGuard>
          <AuthProvider>
            <SiteHeader />
            {children}
          </AuthProvider>
        </SetupGuard>
      </body>
    </html>
  );
}
