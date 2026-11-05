import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Ada AI v1 — Không gian làm việc của bạn",
  description: "Trò chuyện và tuỳ chỉnh chỉ dẫn riêng cho Ada AI v1.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}