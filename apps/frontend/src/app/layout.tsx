import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SetupGuard } from "@/components/setup/SetupGuard";
import "./globals.css";

export const metadata: Metadata = {
  icons: {
    icon: "https://avatars.githubusercontent.com/u/161662653?v=4",
  },
  title: "개발자 블로그",
  description: "Next.js와 ASP.NET Core로 만든 개발자 블로그",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <SetupGuard>
          <AuthProvider>
            <SiteHeader />
            {children}
            <SiteFooter />
          </AuthProvider>
        </SetupGuard>
      </body>
    </html>
  );
}
