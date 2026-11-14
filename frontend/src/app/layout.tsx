import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "IELTS Academic LMS — Hệ thống học tập trực tuyến",
  description:
    "Nền tảng luyện tập IELTS Reading & Listening, theo dõi tiến độ hằng ngày và phản hồi giảng viên.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

