import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "IELTS Academic LMS — Hệ thống học tập trực tuyến",
  description:
    "Nền tảng luyện tập IELTS Reading & Listening, theo dõi tiến độ hằng ngày và phản hồi giảng viên.",
};

const THEME_INIT_SCRIPT = `(function(){try{var k='web_ielts_theme';var t=localStorage.getItem(k);var d=t==='dark'||(t==='system'&&typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark');r.style.colorScheme='dark';}else{r.classList.remove('dark');r.style.colorScheme='light';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

