import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppContext } from "@/components/context";
import { BackButton } from "@/components/back-button";
import { Header, Footer } from "@/components/shell";
import { settings } from "@/lib/settings";
import "./globals.css";
export async function generateMetadata(): Promise<Metadata> {
  let config;
  try {
    config = await settings();
  } catch {}
  const name = config?.siteName ?? "测测be";
  return {
    metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
    title: { default: `${name} · 你想测试什么？`, template: `%s · ${name}` },
    description:
      config?.description ?? "自然语言生成测试，确定性评分，结构化分析。",
    icons: { icon: config?.favicon || "/favicon.svg" },
  };
}
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AppContext>
          <Header />
          <main id="main">
            <BackButton />
            {children}
          </main>
          <Footer />
        </AppContext>
      </body>
    </html>
  );
}
