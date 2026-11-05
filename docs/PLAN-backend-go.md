# Kế hoạch: Tách Backend (Go) / Frontend (Next.js) + Agent Groq gpt-oss-20b × AutoLang

## 0. Quyết định đã chốt

| Hạng mục | Lựa chọn |
|---|---|
| LLM chat/agent | **Groq** – `https://api.groq.com/openai/v1`, model `openai/gpt-oss-20b` (OpenAI-compatible, tool calling, streaming) |
| Vai trò Groq vs AdaAI | **Chạy song song, Groq làm router**: mọi tin nhắn vào gpt-oss-20b; khi cần thao tác dữ liệu, nó gọi tool `autolang_task` → AdaAI sinh code AutoLang → runner chạy → kết quả trả về Groq để viết câu trả lời |
| Backend | **Go** (net/http chuẩn Go ≥ 1.22, worker chạy nền) |
| Chạy AutoLang | **Node runner sidecar** (autolang-compiler là npm/WASM + tool native `shop` viết bằng TS) |
| Realtime | **SSE** |
| Lưu trữ | **SQLite** (`modernc.org/sqlite`, pure Go, không cần CGO trên Windows) |

## 1. Hiện trạng (đã khảo sát)

- Một app Next.js 16 duy nhất: UI + API routes (`src/app/api/*`) + logic server trong `src/lib/`:
  - `adaai-client.ts` – gọi AdaAI `http://127.0.0.1:8800/v1/chat/completions` với phần mở rộng `autolang` (tools_library, tools_source → nhận `code`, `status`, `tools_sha256`, `attempts`…).
  - `queue.ts` – hàng đợi tuần tự trong process: queued → generating → running → done/lỗi.
  - `runner.ts` – chạy code bằng `ACompiler` với giới hạn opcode/bộ nhớ/timeout, đăng ký native của toolpack, ghi lại `tool_calls`.
  - `store.ts` – lưu `data/tasks.json` (ghi cả file mỗi lần update).
  - `toolpacks.ts` + `toolpacks/shop/` – manifest, `tools.al`, `impl.ts` (native), `data.json`; có danh sách `effects` (zalo_send_message, tasks_create = tác vụ có tác dụng phụ).
- Frontend (`src/app/page.tsx`) **polling** `/api/tasks` bằng `setInterval`.
- Không phải git repo.

## 2. Kiến trúc đích

```
Browser (Next.js – frontend/)
   │  REST: POST message, GET conversations/tasks
   │  SSE : GET /api/tasks/{id}/events
   ▼
Go backend (backend/)  :8900
   ├─ HTTP API + SSE hub
   ├─ Worker pool (xử lý ngầm, độc lập với kết nối trình duyệt)
   ├─ Agent orchestrator ──► Groq (gpt-oss-20b, stream + tool calling)
   │        │ tool: autolang_task
   │        ├──► AdaAI server :8800 (sinh code AutoLang)
   │        └──► Node runner :8910 (compile + run + native tools)
   └─ SQLite (conversations, messages, tasks, task_events)

Node runner (runner/)  :8910 – chỉ nghe 127.0.0.1
   ├─ POST /run        {code, toolpack} → RunResult
   ├─ GET  /toolpacks  → [{name, description, library, source, sha256, effects}]
   └─ GET  /health
```

### Cấu trúc thư mục mới
```
Ada-AI-chat-web/
├─ frontend/            # Next.js hiện tại, bỏ hết code server
├─ backend/             # Go
│  ├─ cmd/server/main.go
│  ├─ internal/config/      # đọc config + .env (GROQ_API_KEY…)
│  ├─ internal/httpapi/     # handlers, CORS, validate
│  ├─ internal/sse/         # hub pub/sub theo task_id, replay theo Last-Event-ID
│  ├─ internal/store/       # SQLite + migrations
│  ├─ internal/queue/       # worker pool, recover task bị gián đoạn khi khởi động
│  ├─ internal/groq/        # client OpenAI-compatible, parse stream SSE từ Groq
│  ├─ internal/adaai/       # port từ adaai-client.ts
│  ├─ internal/runnerclient/
│  └─ internal/agent/       # vòng lặp agent + định nghĩa tool
├─ runner/              # Node sidecar (TS strict)
│  ├─ src/server.ts, src/runner.ts, src/toolpacks.ts
│  └─ toolpacks/shop/   # chuyển từ ./toolpacks
├─ docs/
└─ Makefile / scripts/dev.ps1   # chạy cả 3 tiến trình
```

## 3. Luồng xử lý một tin nhắn

1. FE `POST /api/conversations/{cid}/messages {text, toolpack?}` → BE lưu message user + task `queued`, trả `202 {task_id}` ngay.
2. FE mở `EventSource /api/tasks/{task_id}/events`.
3. Worker lấy task → `status: thinking` → gọi Groq stream với: system prompt + lịch sử hội thoại (cắt theo giới hạn token) + tool `autolang_task`.
4. Groq trả:
   - **Text** → đẩy `delta` qua SSE, ghép thành câu trả lời.
   - **Tool call `autolang_task {instruction, toolpack}`** →
     a. SSE `tool_start` → gọi AdaAI (giống `queue.ts` hiện tại: tools_library/tools_source lấy từ runner `/toolpacks`).
     b. Kiểm tra `tools_sha256` khớp, xử lý `refused` / `compile_error`.
     c. SSE `code` → gọi runner `/run` → SSE `tool_result` (stdout, tool_calls, error).
     d. Gửi kết quả (đã cắt gọn) về Groq dưới dạng message `role: tool` → lặp lại bước 4 (tối đa N vòng, mặc định 3).
5. Kết thúc → lưu message assistant + toàn bộ chi tiết task → SSE `done`. Lỗi → SSE `error` với mã trạng thái (giữ các mã hiện có: `refused`, `compile_error`, `runtime_error`, `timeout`, `tools_mismatch`, `adaai_unreachable`, `adaai_error`, `interrupted` + thêm `groq_error`, `groq_rate_limited`).

### Sự kiện SSE
`status` · `reasoning` (nếu bật hiển thị suy nghĩ) · `delta` · `tool_start` · `code` · `tool_result` · `done` · `error` · `ping` (keep-alive 15s).
Mỗi event có `id` tăng dần, lưu vào bảng `task_events` → FE reconnect bằng `Last-Event-ID` không mất dữ liệu; task đã xong thì replay toàn bộ rồi đóng.

## 4. API backend (thay cho `src/app/api/*`)

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/api/health` | trạng thái backend, Groq (có key?), AdaAI, runner |
| GET | `/api/toolpacks` | proxy từ runner |
| GET | `/api/conversations` | danh sách |
| GET | `/api/conversations/{id}` | messages + tasks |
| DELETE | `/api/conversations/{id}` | 409 nếu còn task đang chạy (giữ hành vi cũ) |
| POST | `/api/conversations/{id}/messages` | tạo task, 202 |
| GET | `/api/tasks/{id}` | chi tiết task |
| GET | `/api/tasks/{id}/events` | SSE |
| POST | `/api/tasks/{id}/retry` | giữ hành vi cũ |

Hợp đồng ghi trong `docs/openapi.yaml`; type TS ở frontend viết tường minh theo hợp đồng này (tuân thủ AGENTS.md: không `any`, không `as unknown as`, dùng type guard khi parse JSON/SSE).

## 5. Lộ trình thực hiện

### Giai đoạn 1 – Tái cấu trúc thư mục (không đổi hành vi)
- Chuyển app hiện tại vào `frontend/`; tách `runner.ts`, `toolpacks.ts`, `toolpacks/` sang `runner/`.
- Viết `runner/src/server.ts` (Node `http` hoặc Fastify) với `/run`, `/toolpacks`, `/health`; mỗi request tạo `ACompiler` riêng + dispose (giữ nguyên logic giới hạn).
- Sửa luôn chỗ vi phạm AGENTS.md đang có: `compiler as unknown as {...}` trong `runner.ts`, `shopNatives as unknown as Record<...>` trong `toolpacks.ts`, `rawJson as AdaaiChatCompletion` (thay bằng type guard).
- Chuyển test `runner.test.ts`, `toolpack-integrity.test.ts`, `native-types.test.ts` sang `runner/`.
- ✅ Xong khi: `curl POST :8910/run` chạy được code mẫu shop, test runner pass.

### Giai đoạn 2 – Khung backend Go
- `go mod init`, config (`config.json` + `.env`), SQLite + migrations (`conversations`, `messages`, `tasks`, `task_events`).
- Script migrate một lần `data/tasks.json` → SQLite.
- Port API đọc/xoá conversations, tasks, health, toolpacks; CORS cho origin frontend.
- ✅ Xong khi: các endpoint đọc trả dữ liệu giống bản Next.js cũ.

### Giai đoạn 3 – Queue + luồng AdaAI cũ trong Go
- Worker pool (mặc định 1–2 worker, cấu hình được), recover task `generating/running` → `interrupted` khi khởi động.
- Port `queue.ts` + `adaai-client.ts` sang Go (AdaAI → kiểm tra sha → runner).
- SSE hub + bảng `task_events`.
- ✅ Xong khi: gửi task qua Go, nhận đủ event SSE, kết quả giống bản cũ.

### Giai đoạn 4 – Groq agent
- `internal/groq`: chat completions stream, parse `delta.content`, `delta.tool_calls` (ghép argument theo index), `reasoning` nếu có; xử lý 429 (đọc header retry-after, backoff), timeout, hủy theo context.
- `internal/agent`: định nghĩa tool `autolang_task` (JSON schema: `instruction: string`, `toolpack: enum` từ runner), vòng lặp tối đa N, cắt gọn tool result (vd ≤ 8KB) trước khi gửi lại Groq.
- System prompt: mô tả khi nào nên gọi tool, mô tả ngắn các tool trong toolpack.
- Test bằng `httptest` giả lập Groq/AdaAI/runner.
- ✅ Xong khi: câu chào → trả lời thẳng, không gọi tool; "liệt kê đơn hàng đang giao" → gọi tool → trả lời bằng ngôn ngữ tự nhiên kèm bảng.

### Giai đoạn 5 – Frontend
- Xoá `src/app/api/*`, `src/lib/{queue,store,runner,adaai-client,toolpacks}.ts`; giữ `stdout-parser.ts`.
- `src/lib/api-client.ts` (base URL từ `NEXT_PUBLIC_API_BASE_URL`) + hook `useTaskStream(taskId)` dùng `EventSource`, bỏ `setInterval` polling trong `page.tsx`.
- `MessageItem`: hiển thị chữ stream, các bước tool (code AutoLang, tool_calls, stdout dạng bảng), trạng thái lỗi.
- `ModelSelectorModal`: thêm model "Ada (Groq gpt-oss-20b + AutoLang)".
- ✅ Xong khi: chat end-to-end trên trình duyệt, reload giữa chừng vẫn tiếp tục nhận stream.

### Giai đoạn 6 – Vận hành
- `scripts/dev.ps1` (hoặc Makefile) chạy cả backend, runner, frontend; README mới.
- Log có cấu trúc (`log/slog`), request id, đo thời gian từng bước (groq_ms, generation_ms, run_ms).
- Cập nhật `scripts/e2e.ts` cho kiến trúc mới.

## 6. Việc BẠN cần làm

1. Tạo **Groq API key** tại console.groq.com, đặt vào `backend/.env`: `GROQ_API_KEY=...` (không commit; thêm vào `.gitignore`).
2. Cài **Go ≥ 1.22** (`go version` để kiểm tra).
3. Đảm bảo **AdaAI server** vẫn chạy ở `127.0.0.1:8800` khi dùng tool.
4. Nên `git init` trước khi tái cấu trúc để có thể quay lại.
5. Trả lời các câu hỏi mở ở mục 7.

## 7. Câu hỏi còn mở (chưa tự quyết)

1. **Tác vụ có tác dụng phụ** (`zalo_send_message`, `tasks_create`): agent được tự chạy, hay phải hỏi người dùng xác nhận trên UI trước khi chạy code có gọi các tool này?
2. **Đăng nhập**: hiện là đăng nhập Google giả trong localStorage. Backend Go có cần xác thực/phân tách dữ liệu theo người dùng ngay bây giờ không, hay để sau?
3. **Hiển thị reasoning** của gpt-oss-20b cho người dùng (dạng "đang suy nghĩ" thu gọn) hay ẩn hoàn toàn?
4. **Triển khai**: chỉ chạy local trên máy bạn, hay sẽ đưa lên server (ảnh hưởng tới Docker, CORS, cổng)?
5. Khi **AdaAI không chạy**: agent báo lỗi tool, hay có phương án dự phòng để chính gpt-oss-20b sinh code AutoLang?
