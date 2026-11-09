import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Ada AI — Trợ lý AI chuyên nghiệp",
  description: "Hệ thống trợ lý AI hỗ trợ công việc, xử lý yêu cầu và tùy biến chỉ dẫn phản hồi linh hoạt.",
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