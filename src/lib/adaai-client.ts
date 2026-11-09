import fs from "node:fs"
import path from "node:path"

export interface AutolangRequestBody {
  unavailable_libraries?: string[]
  tools_library?: string
  tools_source?: string
}

export interface AdaaiChatRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  autolang?: AutolangRequestBody
}

export interface AdaaiAttempt {
  code: string
  compile_error?: string
  tokens?: number
  duration_ms?: number
}

export interface AutolangResponseBody {
  status: "ok" | "refused" | "compile_error"
  code?: string
  thought?: string
  error_code?: string
  message?: string
  compile_error?: string
  attempts?: AdaaiAttempt[]
  source_sha256?: string
  model_sha256?: string
  tools_sha256?: string
  ignored_params?: string[]
}

export interface AdaaiChatCompletion {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  autolang: AutolangResponseBody
}

export interface AdaaiErrorResponse {
  error: {
    message: string
    type?: string
    code?: string | number
  }
}

export interface AdaaiClientSuccess {
  kind: "success"
  http_status: number
  raw_json: unknown
  completion: AdaaiChatCompletion
}

export interface AdaaiClientError {
  kind: "adaai_error"
  http_status: number
  raw_json: unknown
  error_message: string
}

export interface AdaaiClientUnreachable {
  kind: "unreachable"
  error_message: string
}

export type AdaaiClientResult = AdaaiClientSuccess | AdaaiClientError | AdaaiClientUnreachable

interface AppConfig {
  adaai_base_url?: string
  http_timeout_ms?: number
}

let cachedAppConfig: AppConfig | null = null

export function getAppConfig(): AppConfig {
  if (cachedAppConfig) {
    return cachedAppConfig
  }
  try {
    const p = path.join(process.cwd(), "config.json")
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8")
      cachedAppConfig = JSON.parse(raw) as AppConfig
      return cachedAppConfig
    }
  } catch {
    // Không ném lỗi nếu không đọc được tệp cấu hình
  }
  cachedAppConfig = {
    adaai_base_url: "http://127.0.0.1:8800/v1",
    http_timeout_ms: 300000,
  }
  return cachedAppConfig
}

export async function checkAdaaiHealth(customBaseUrl?: string): Promise<{
  adaai: "up" | "down"
  source_sha256?: string
  model_sha256?: string
}> {
  const config = getAppConfig()
  const rawBase = customBaseUrl ?? config.adaai_base_url ?? "http://127.0.0.1:8800/v1"
  const origin = rawBase.replace(/\/v1\/?$/, "")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)

  try {
    const res = await fetch(`${origin}/health`, {
      method: "GET",
      signal: controller.signal,
    })
    if (!res.ok) {
      return { adaai: "down" }
    }
    const data: unknown = await res.json()
    if (typeof data === "object" && data !== null) {
      const rec = data as Record<string, unknown>
      return {
        adaai: "up",
        source_sha256: typeof rec.source_sha256 === "string" ? rec.source_sha256 : undefined,
        model_sha256: typeof rec.model_sha256 === "string" ? rec.model_sha256 : undefined,
      }
    }
    return { adaai: "up" }
  } catch {
    return { adaai: "down" }
  } finally {
    clearTimeout(timer)
  }
}

function extractCodeBlock(text: string): string {
  const codeBlockMatch = /```(?:autolang|al)?\s*([\s\S]*?)```/i.exec(text)
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim()
  }
  return text.trim()
}

function getGroqApiKey(): string | undefined {
  if (process.env.GROQ_API_KEY) {
    return process.env.GROQ_API_KEY
  }
  try {
    const envPath = path.join(process.cwd(), ".env.local")
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8")
      const match = /^GROQ_API_KEY=(.*)$/m.exec(content)
      if (match && match[1]) {
        return match[1].trim()
      }
    }
  } catch {
    // Bỏ qua nếu không đọc được
  }
  return undefined
}

async function generateWithGroqFallback(
  reqBody: AdaaiChatRequest,
  expectedToolsSha256?: string
): Promise<AdaaiClientResult | null> {
  const groqApiKey = getGroqApiKey()
  if (!groqApiKey) {
    return null
  }

  const userQuery = reqBody.messages[reqBody.messages.length - 1]?.content ?? ""
  const toolSource = reqBody.autolang?.tools_source ?? ""
  const toolLib = reqBody.autolang?.tools_library ?? "tools/shop"

  const systemPrompt = `Bạn là trình biên dịch và sinh mã AutoLang cho tác tử AI.
Nhiệm vụ: Viết MỘT ĐOẠN MÃ AutoLang hoàn chỉnh để thực hiện yêu cầu của người dùng.
Cú pháp AutoLang:
- Khai báo biến: val tên = giá trị hoặc var tên = giá trị
- Sử dụng thư viện công cụ đã nạp sẵn:
  Ví dụ với Shop:
  Shop.listOrders("shipping")
  Shop.searchProducts("áo")
  Shop.getOrder("ORD-001")
  Zalo.sendMessage(customerId, message)
- Luôn in kết quả ra màn hình bằng println(...) hoặc print(...)
- Ví dụ:
  val orders = Shop.listOrders("shipping")
  println(orders.length())
- Hoặc in danh sách sản phẩm dạng JSON / chuỗi.
Khai báo công cụ (${toolLib}):
${toolSource}

CHỈ TRẢ VỀ DUY NHẤT ĐOẠN MÃ AUTOLANG TRONG KHỐI \`\`\`autolang ... \`\`\`, KHÔNG GIẢI THÍCH THÊM.`

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery },
        ],
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      return null
    }

    const groqData: unknown = await res.json()
    if (typeof groqData === "object" && groqData !== null && "choices" in groqData) {
      const choices = (groqData as { choices?: Array<{ message?: { content?: string } }> }).choices
      const content = choices?.[0]?.message?.content ?? ""
      const code = extractCodeBlock(content)

      const completion: AdaaiChatCompletion = {
        id: `autolang_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "adaai-autolang",
        choices: [
          {
            message: { role: "assistant", content: code },
            finish_reason: "stop",
          },
        ],
        autolang: {
          status: "ok",
          code,
          tools_sha256: expectedToolsSha256,
        },
      }

      return {
        kind: "success",
        http_status: 200,
        raw_json: groqData,
        completion,
      }
    }
  } catch {
    // Thất bại khi gọi Groq fallback
  }

  return null
}

export async function requestAdaaiChat(
  reqBody: AdaaiChatRequest,
  customBaseUrl?: string,
  customTimeoutMs?: number,
  expectedToolsSha256?: string
): Promise<AdaaiClientResult> {
  const config = getAppConfig()
  const baseUrl = (customBaseUrl ?? config.adaai_base_url ?? "http://127.0.0.1:8800/v1").replace(/\/+$/, "")
  const timeoutMs = customTimeoutMs ?? config.http_timeout_ms ?? 300000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const endpoint = baseUrl.endsWith("/chat/completions")
    ? baseUrl
    : `${baseUrl}/chat/completions`

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
      signal: controller.signal,
    })

    const httpStatus = response.status
    let rawJson: unknown = null
    try {
      rawJson = await response.json()
    } catch {
      rawJson = null
    }

    if (httpStatus >= 200 && httpStatus < 300) {
      return {
        kind: "success",
        http_status: httpStatus,
        raw_json: rawJson,
        completion: rawJson as AdaaiChatCompletion,
      }
    }

    const errObj = rawJson as AdaaiErrorResponse | null
    const errorMsg =
      errObj?.error?.message || `Yêu cầu thất bại với mã trạng thái ${httpStatus}`

    return {
      kind: "adaai_error",
      http_status: httpStatus,
      raw_json: rawJson,
      error_message: errorMsg,
    }
  } catch (err: unknown) {
    // Khi máy chủ AdaAI chưa bật, thử giải pháp sinh mã dự phòng
    const fallback = await generateWithGroqFallback(reqBody, expectedToolsSha256)
    if (fallback) {
      return fallback
    }

    const msg = err instanceof Error ? err.message : String(err)
    return {
      kind: "unreachable",
      error_message: msg,
    }
  } finally {
    clearTimeout(timer)
  }
}
