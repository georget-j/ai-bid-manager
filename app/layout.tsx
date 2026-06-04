import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/AppSidebar";
import { AppTopbar } from "@/components/AppTopbar";
import { HelpNavigator } from "@/components/HelpNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getAuthUser } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "UK Bid Intelligence Agent",
  description:
    "Find, qualify, and respond to UK public-sector tenders with AI. Monitor procurement opportunities, score bid fit, and draft compliant responses from your knowledge base.",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,400..500&family=Geist:wght@300..600&family=Geist+Mono:wght@400..500&display=swap";

const isDemoMode =
  process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = isDemoMode ? true : await getAuthUser();
  const showNav = !!user;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link href={FONTS} rel="stylesheet" />
      </head>
      <body>
        {showNav ? (
          <div className="app">
            <AppSidebar />
            <div className="main">
              <AppTopbar />
              <div className="content">
                <ErrorBoundary>{children}</ErrorBoundary>
              </div>
            </div>
          </div>
        ) : (
          <ErrorBoundary>{children}</ErrorBoundary>
        )}
        {showNav && <HelpNavigator />}
      </body>
    </html>
  );
}
