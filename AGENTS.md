<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Quy Định Vận Hành Nghiêm Ngặt (Strict Mode)

## 1. Nghiêm Cấm Tuyệt Đối Hành Vi Ép Kiểu Để Lách Lỗi (No Type Bypassing)
- Nghiêm cấm mọi hình thức ép kiểu cưỡng bức để qua mặt hoặc vô hiệu hóa bộ kiểm tra kiểu của trình biên dịch:
  - Cấm sử dụng các cú pháp: `a as any as ...`, `a as unknown as ...`, `(x as any).field`.
  - Cấm sử dụng kiểu `any` hoặc ép kiểu qua trung gian để né tránh việc sửa đổi định nghĩa kiểu.
- Khi gặp tình huống kiểu dữ liệu không khớp:
  - Bắt buộc phải định nghĩa hoặc mở rộng kiểu dữ liệu (interfaces, types, structs) một cách tường minh và chính xác.
  - Phải sử dụng cơ chế kiểm tra kiểu hợp lệ (Type Narrowing, Type Guards, Type Assertions an toàn có điều kiện kiểm tra).
  - Chuẩn hóa và xử lý dữ liệu đầu vào đúng chuẩn thay vì dùng biện pháp ép kiểu tùy tiện.

## 2. Tiêu Chuẩn Kiểu Dữ Liệu Tường Minh (Strong Typing Standard)
- Mọi hàm, phương thức, biến và kết quả trả về đều phải có kiểu dữ liệu rõ ràng, minh bạch.
- Tuyệt đối không để lại các giải pháp tạm bợ làm suy giảm tính toàn vẹn và độ tin cậy của mã nguồn.