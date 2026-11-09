# Yêu cầu API Control Plane cho Ada AI

## Tích hợp frontend với Control Plane

Các endpoint bên dưới đã có ở Control Plane. Công việc của frontend là gọi đúng các endpoint đó qua Next.js Backend-for-Frontend (BFF), giữ session ở cookie `HttpOnly` và không gọi backend trực tiếp từ trình duyệt. Không triển khai lại nghiệp vụ backend hoặc tự suy đoán response schema.

URL Control Plane được cấu hình động bằng `ADA_CONTROL_PLANE_URL` ở môi trường server, mặc định `http://localhost:8920`. `NEXT_PUBLIC_API_BASE_URL` chỉ được dùng làm cấu hình tương thích cũ. Không đưa token đăng nhập hay API key cá nhân vào biến `NEXT_PUBLIC_*`.

Các route `/api/*` dưới đây là cùng-origin BFF của Next.js; chúng đính kèm session hiện tại khi chuyển tiếp các API yêu cầu đăng nhập.

| Method | API Control Plane | API BFF của website | Xác thực | Tác vụ |
|---|---|---|---|---|
| GET | `/v1/auth/google/authorize` | `GET /api/auth/google` | Không | Bắt đầu đăng nhập Google |
| GET | `/v1/auth/google/callback` | Callback Google tại backend | Không | Xác minh Google và chuyển authorization code dùng một lần về frontend |
| POST | `/v1/auth/google/exchange` | nội bộ `GET /api/auth/google/callback` | Không | Đổi code lấy session |
| POST | `/v1/auth/logout` | `POST /api/auth/logout` | Session | Đăng xuất |
| GET | `/v1/me` | `GET /api/auth/me` | Session | Hồ sơ và tiền tố API key |
| POST | `/v1/me/api-key/rotate` | `POST /api/auth/me/api-key/rotate` | Session | Đổi API key |
| GET, PUT | `/v1/me/agent` | `GET, PUT /api/agent` | Session | Đọc/lưu system prompt riêng |
| POST | `/v1/chat/completions` | `POST /api/chat/completions` | Session hoặc API key | Chat completions |
| GET, POST | `/v1/knowledge` | `GET, POST /api/knowledge` | Session | Liệt kê/nạp tài liệu |
| GET, DELETE | `/v1/knowledge/{id}` | `GET, DELETE /api/knowledge/{id}` | Session | Đọc/gỡ tài liệu |
| GET, PUT | `/v1/capabilities` | `GET, PUT /api/capabilities` | Session | Đọc/cập nhật quyền |
| GET, POST | `/v1/policies` | `GET, POST /api/policies` | Session | Liệt kê/tạo quy tắc |
| GET, PUT, DELETE | `/v1/policies/{id}` | `GET, PUT, DELETE /api/policies/{id}` | Session | Đọc/sửa/vô hiệu hóa quy tắc |
| GET | `/v1/approvals` | `GET /api/approvals` | Session | Danh sách chờ duyệt |
| GET | `/v1/approvals/{id}` | `GET /api/approvals/{id}` | Session | Chi tiết yêu cầu duyệt |
| POST | `/v1/approvals/{id}/approve` | `POST /api/approvals/{id}/approve` | Session | Phê duyệt |
| POST | `/v1/approvals/{id}/reject` | `POST /api/approvals/{id}/reject` | Session | Từ chối |
| GET | `/v1/audit-logs` | `GET /api/audit` | Session | Nhật ký kiểm toán |

Callback OAuth ở backend được đăng ký với Google; sau khi xác minh, backend chuyển code dùng một lần về callback frontend `/api/auth/google/callback`, nơi code được đổi lấy session. Query string được chuyển tiếp nguyên trạng. Nội dung request và `Content-Type` được giữ nguyên để hỗ trợ cả JSON lẫn tải tài liệu dạng multipart. BFF không nhận token session từ body/header của trình duyệt: nó lấy session từ cookie `ada_session` và gửi backend bằng `Authorization: Bearer <session>`. Request không có session nhận `401`.

Các endpoint nội bộ được khai báo theo bảng trên; response body được chuyển tiếp nguyên trạng từ backend. UI cần đọc theo schema backend hiện hành, không giả định tên field chưa được xác nhận.

## 1. Đăng nhập bằng Google

Người dùng bắt đầu đăng nhập từ website Ada AI. Frontend tạo một giá trị `state` ngẫu nhiên, gửi trình duyệt tới backend để backend chuyển hướng sang Google, rồi nhận lại một mã đăng nhập dùng một lần ở callback frontend. Frontend chuyển mã đó tới backend để đổi lấy phiên đăng nhập.

Hãy cung cấp:

- Một API bắt đầu Google OAuth, nhận địa chỉ callback và `state`, rồi trả về redirect tới Google.
- Một callback phía backend đã được cấu hình trong Google Cloud Console. Callback này cần xác minh chữ ký/token Google, kiểm tra `state`, từ chối lỗi xác thực và chuyển hướng về callback frontend kèm một authorization code ngắn hạn, chỉ dùng được một lần.
- Một API đổi authorization code thành session. Mã cần gắn với callback, hết hạn nhanh và không thể đổi lần thứ hai.
- Một API đọc thông tin người dùng hiện đang đăng nhập.
- Một API đăng xuất/thu hồi session.

Frontend hiện dự kiến gọi các API tương ứng với:

- `GET /v1/auth/google/authorize?redirect_uri=...&state=...`
- `POST /v1/auth/google/exchange`
- `GET /v1/me`
- `POST /v1/auth/logout`

Sau khi đổi code thành công, backend cần trả một session token ngắn hạn và hồ sơ tài khoản gồm ít nhất mã người dùng ổn định, email Google đã xác minh, tên hiển thị, ảnh đại diện (có thể rỗng) và tiền tố đã che của API key cá nhân. Không trả access token hoặc refresh token của Google cho trình duyệt.

Website giữ session token trong cookie `HttpOnly`, `SameSite=Lax`, bật `Secure` khi chạy HTTPS. Next.js chuyển tiếp session tới backend qua `Authorization: Bearer ...`; không lưu session trong `localStorage`.

Hãy nêu chính xác:

- Google Cloud Console cần cấu hình OAuth client ID, secret và redirect URI nào cho môi trường local/staging/production.
- API callback Google ở backend là URL nào.
- API authorize/exchange nhận và trả những trường gì, mã HTTP nào được trả khi `state`, code, callback hoặc Google token không hợp lệ.
- Session hết hạn, gia hạn và đăng xuất được xử lý thế nào.
- Biến môi trường nào cần đặt ở backend; không dùng tiền tố `NEXT_PUBLIC_` cho secret.

## 2. Một API key duy nhất trên mỗi người dùng

Khi tạo tài khoản Google lần đầu, hãy tạo đúng một API key riêng cho tài khoản đó. Khi người đó đăng nhập lại, không tạo khóa mới. Hai tài khoản khác nhau không bao giờ được nhận cùng một khóa.

Yêu cầu lưu trữ và vòng đời:

- Ràng buộc duy nhất trong cơ sở dữ liệu cho chủ sở hữu khóa và cho giá trị hash của khóa; không chỉ kiểm tra duy nhất ở tầng giao diện.
- Tạo khóa bằng bộ sinh ngẫu nhiên mật mã phù hợp. Lưu hash an toàn để xác thực khóa, không lưu khóa rõ trong cơ sở dữ liệu hoặc log.
- Hỗ trợ nhận biết khóa đã thu hồi, ngày tạo và thời điểm sử dụng gần nhất.
- Chỉ hiển thị tiền tố/giá trị đã che khi đọc hồ sơ tài khoản bình thường. Nếu có luồng phát hành hoặc đổi khóa, chỉ trả khóa rõ đúng một lần trong phản hồi tạo/đổi khóa; cảnh báo rõ cho người dùng rằng cần sao chép và lưu khóa an toàn.
- Đổi khóa phải thu hồi khóa trước đó ngay, đồng thời bảo đảm tài khoản chỉ có một khóa đang hoạt động sau khi giao dịch hoàn tất.
- API key dùng để tích hợp từ ứng dụng bên ngoài phải được phân biệt với session cookie của website. Không gửi API key từ trình duyệt web trong mỗi yêu cầu chat nếu session đã xác định được tài khoản.

Hãy đề xuất API đọc trạng thái khóa và API phát hành/đổi khóa khi cần. Ghi rõ cách xác thực, cách chỉ hiện khóa một lần, hành vi khi yêu cầu đồng thời và cách chống lạm dụng. Nếu API hiện tại đã có cơ chế API key, hãy giải thích cách liên kết khóa hiện tại với tài khoản Google mà không làm lộ hoặc tạo khóa trùng.

## 3. Hồ sơ tài khoản và cấu hình Agent

Mọi dữ liệu cấu hình phải gắn với mã người dùng được xác định từ session đã xác thực. Không chấp nhận `user_id` do trình duyệt truyền vào làm căn cứ phân quyền.

Website dự kiến gọi:

- `GET /v1/me` để đọc hồ sơ và tiền tố API key.
- `GET /v1/me/agent` để đọc system prompt riêng của Ada AI v1.
- `PUT /v1/me/agent` để lưu system prompt riêng, giới hạn tối đa 12.000 ký tự.

System prompt riêng của một người dùng phải được lưu bền vững ở backend, tách khỏi prompt nền của toàn hệ thống và không ảnh hưởng tới người dùng khác. Backend cần đọc cấu hình của đúng tài khoản khi xử lý chat. Prompt do client gửi kèm tin nhắn không được dùng để ghi đè cấu hình đã lưu hoặc prompt nền.

Hãy ghi rõ response body, xác thực, giới hạn kích thước, hành vi khi prompt rỗng, lỗi validation và cách bảo đảm cấu hình người dùng này không thể đọc/sửa bởi tài khoản khác.

## 4. Chat và API key trong ứng dụng tích hợp

Website Ada gọi chat qua Next.js Backend-for-Frontend. Backend cần xác thực session, ánh xạ session về đúng người dùng/API key và sử dụng system prompt riêng đã lưu cho tài khoản đó.

Frontend dự kiến chuyển tiếp:

- `POST /v1/chat/completions` với `model` và danh sách `messages` theo định dạng chat completions.
- Yêu cầu chat từ website được xác thực bằng session của người dùng.
- Yêu cầu từ tích hợp bên ngoài được xác thực bằng API key cá nhân duy nhất của tài khoản.

Không tin system prompt, quyền, `user_id`, dữ liệu kho tri thức hoặc trạng thái phê duyệt do client tự khai. Backend phải lấy cấu hình/quyền từ hồ sơ và dữ liệu được cấp của chủ sở hữu API key. Với chat completions, chỉ nhận tin nhắn `user` và `assistant` từ client; system prompt phải được ghép từ cấu hình riêng đã lưu ở backend, không nhận hoặc tin system prompt do client gửi.

Hãy cho biết:

- Hai kiểu xác thực session và API key được phân biệt ra sao.
- Có hỗ trợ stream hay không; nếu có, định dạng SSE, cách kết thúc stream và cách gửi lỗi.
- Giới hạn kích thước request, giới hạn tần suất và phản hồi khi hết quota.
- Cấu trúc phản hồi tương thích OpenAI và các mã lỗi cần xử lý.
- Cách API key cá nhân được giới hạn theo chủ sở hữu và không thể truy cập tenant khác.

## 5. Các API cho chức năng Control Plane

Hãy đối chiếu các API hiện có và cung cấp hợp đồng cụ thể cho những nhóm chức năng sau. Mỗi API phải kiểm tra quyền ở backend, chỉ trả dữ liệu thuộc tài khoản/tenant hiện tại và có pagination khi danh sách có thể dài.

### Kho tri thức

- Liệt kê tài liệu đã tải lên, trạng thái xử lý, lỗi xử lý và thông tin cập nhật gần nhất.
- Tải tài liệu mới lên, kiểm tra loại file/kích thước, rồi trả ID và trạng thái xử lý.
- Đọc chi tiết và xóa tài liệu; xóa phải ngăn tài liệu tiếp tục được dùng khi truy vấn về sau.
- Hỗ trợ bảng giá, chính sách, tài liệu hướng dẫn và các loại dữ liệu mà backend thực tế xử lý được.

### Quyền hạn và quy tắc

- Đọc danh sách capability/tool khả dụng cùng trạng thái được bật/tắt của từng Agent.
- Cập nhật các quyền thuộc tenant; backend phải từ chối thao tác khi capability bị tắt, kể cả khi lời gọi tới từ model hoặc API bên ngoài.
- Đọc, tạo, sửa và tắt quy tắc nghiệp vụ; lưu người sửa, thời điểm sửa, phạm vi áp dụng và phiên bản.
- Nếu nhận quy tắc bằng tiếng Việt tự nhiên, không thực thi trực tiếp đầu ra model. Hãy trả bản xem trước có cấu trúc để người có quyền xác nhận trước khi kích hoạt.

### Phê duyệt và nhật ký

- Liệt kê thao tác đang chờ duyệt theo trạng thái, có phân trang.
- Đọc chi tiết một yêu cầu duyệt, bao gồm dữ liệu đầu vào, hành động dự kiến và lý do cần duyệt.
- Duyệt hoặc từ chối theo ID; kiểm tra chống xử lý lặp, ghi người quyết định và thời gian.
- Liệt kê nhật ký yêu cầu, đề xuất của Agent, quyết định và kết quả thực thi. Có bộ lọc thời gian/trạng thái và không ghi token hoặc API key rõ vào log.

Đề xuất các route phù hợp với cấu trúc Go hiện tại. Các API frontend cũ như `/api/projects`, `/api/knowledge`, `/api/capabilities`, `/api/policies`, `/api/approvals` và `/api/audit` có thể cần được giữ hoặc ánh xạ; hãy mô tả rõ trạng thái thực tế, không giả định endpoint đang hỗ trợ đầy đủ nếu backend chưa có.

## 6. Kiểm soát an toàn và lỗi

- Bảo vệ mọi endpoint riêng tư bằng xác thực session hoặc API key hợp lệ.
- Kiểm tra quyền theo tenant ở backend cho mọi lần đọc, ghi, thực thi và phê duyệt.
- Các thay đổi đơn hàng, tồn kho, tin nhắn chính thức hoặc dữ liệu kinh doanh nhạy cảm phải qua kiểm tra capability và chính sách; nếu cần duyệt thì chỉ thực thi sau khi phê duyệt hợp lệ.
- Dùng mã lỗi ổn định, thông báo không tiết lộ dữ liệu bí mật và phân biệt lỗi xác thực, hết quyền, dữ liệu sai, tài nguyên không tồn tại, xung đột và giới hạn tần suất.
- Ghi audit event cho đăng nhập, thay đổi cấu hình, thao tác API key và quyết định duyệt; tuyệt đối che token và khóa bí mật.
- Nếu backend chưa có OAuth client, schema hoặc chức năng tương ứng, hãy ghi rõ thiếu gì, đề xuất migration/configuration cần thiết và không giả lập thành công.

## 7. Đầu ra bắt buộc từ agent backend

Sau khi khảo sát và xử lý backend, hãy trả lại một hướng dẫn tích hợp cụ thể, dễ làm theo cho agent frontend, gồm:

1. Danh sách endpoint thực sự tồn tại sau thay đổi, kèm phương thức, URL đầy đủ theo môi trường, xác thực và mục đích.
2. Với từng endpoint, ví dụ request/response thành công và lỗi, header cần gửi, quy tắc cookie/session và mã HTTP.
3. Luồng đăng nhập Google từng bước từ khi bấm nút đến khi website có session, bao gồm callback URL chính xác.
4. Thời điểm tạo API key, cách biết người dùng có đúng một khóa, cách hiển thị/đổi khóa và cách gọi chat từ frontend so với ứng dụng bên ngoài.
5. Hợp đồng cụ thể cho kho tri thức, quyền hạn, quy tắc, phê duyệt và nhật ký; đánh dấu nhóm nào chưa triển khai.
6. Các biến môi trường và thiết lập Google Cloud/Control Plane cần cấu hình, không bao gồm giá trị bí mật.
7. Migrations, thay đổi bảo mật, test đã chạy và những việc frontend cần điều chỉnh nếu khác các route dự kiến ở trên.

Không chỉ trả lời bằng thiết kế chung chung: hãy kiểm tra mã backend, nêu route đã có, route mới, cách gọi kiểm chứng được và các giả định còn cần chủ sản phẩm quyết định.
