import { taskStore, type TaskRecord } from "./store"
import { getToolpack } from "./toolpacks"
import { requestAdaaiChat, type AdaaiChatRequest } from "./adaai-client"
import { runCode } from "./runner"

export class TaskQueue {
  private isProcessing = false
  private customBaseUrl?: string

  constructor(customBaseUrl?: string) {
    this.customBaseUrl = customBaseUrl
  }

  setBaseUrl(url?: string): void {
    this.customBaseUrl = url
  }

  trigger(): void {
    if (!this.isProcessing) {
      void this.processNext()
    }
  }

  async waitForIdle(timeoutMs: number = 30000): Promise<void> {
    const start = Date.now()
    while (this.isProcessing || taskStore.getNextQueuedTask() !== null) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Hết thời gian chờ hàng đợi xử lý xong")
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return
    }
    const task = taskStore.getNextQueuedTask()
    if (!task) {
      return
    }

    this.isProcessing = true
    try {
      await this.executeTask(task)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      taskStore.updateTask(task.id, {
        status: "runtime_error",
        error: `Lỗi xử lý nội bộ: ${msg}`,
      })
    } finally {
      this.isProcessing = false
      if (taskStore.getNextQueuedTask() !== null) {
        setTimeout(() => {
          void this.processNext()
        }, 10)
      }
    }
  }

  private async executeTask(task: TaskRecord): Promise<void> {
    taskStore.updateTask(task.id, {
      status: "generating",
      error: null,
    })

    const pack = task.toolpack ? getToolpack(task.toolpack) : null
    const requestBody: AdaaiChatRequest = {
      model: "adaai-autolang",
      messages: [{ role: "user", content: task.text }],
      autolang: pack
        ? {
            tools_library: pack.library,
            tools_source: pack.source,
            unavailable_libraries: [],
          }
        : {
            unavailable_libraries: [],
          },
    }

    const tStartGen = Date.now()
    const result = await requestAdaaiChat(requestBody, this.customBaseUrl, undefined, pack?.sha256)
    const genMs = Date.now() - tStartGen

    if (result.kind === "unreachable") {
      taskStore.updateTask(task.id, {
        status: "adaai_unreachable",
        generation_ms: genMs,
        error: result.error_message,
      })
      return
    }

    if (result.kind === "adaai_error") {
      taskStore.updateTask(task.id, {
        status: "adaai_error",
        http_status: result.http_status,
        adaai_response: result.raw_json,
        adaai_error_message: result.error_message,
        generation_ms: genMs,
        error: result.error_message,
      })
      return
    }

    const completion = result.completion
    const autolang = completion.autolang

    if (autolang.status === "refused") {
      const refusalMsg =
        autolang.message ||
        completion.choices?.[0]?.message?.content ||
        "Yêu cầu bị từ chối"
      taskStore.updateTask(task.id, {
        status: "refused",
        http_status: result.http_status,
        adaai_response: result.raw_json,
        generation_ms: genMs,
        code: autolang.code,
        attempts: autolang.attempts,
        refusal: {
          code: autolang.error_code || "REFUSED",
          message: refusalMsg,
        },
        error: refusalMsg,
      })
      return
    }

    if (pack && autolang.tools_sha256 && autolang.tools_sha256 !== pack.sha256) {
      taskStore.updateTask(task.id, {
        status: "tools_mismatch",
        http_status: result.http_status,
        adaai_response: result.raw_json,
        generation_ms: genMs,
        error: `Mã băm công cụ không khớp (máy chủ: ${autolang.tools_sha256 || "trống"}, cục bộ: ${pack.sha256})`,
      })
      return
    }

    if (autolang.status === "compile_error") {
      taskStore.updateTask(task.id, {
        status: "compile_error",
        http_status: result.http_status,
        adaai_response: result.raw_json,
        generation_ms: genMs,
        code: autolang.code,
        attempts: autolang.attempts,
        error: autolang.compile_error || "Biên dịch thất bại phía máy chủ",
      })
      return
    }

    const code = autolang.code || completion.choices?.[0]?.message?.content || ""

    if (!task.run) {
      taskStore.updateTask(task.id, {
        status: "done",
        http_status: result.http_status,
        adaai_response: result.raw_json,
        generation_ms: genMs,
        code,
        attempts: autolang.attempts,
      })
      return
    }

    taskStore.updateTask(task.id, {
      status: "running",
      http_status: result.http_status,
      adaai_response: result.raw_json,
      generation_ms: genMs,
      code,
      attempts: autolang.attempts,
    })

    const runResult = await runCode(code, pack)

    let finalStatus: TaskRecord["status"] = "done"
    if (runResult.status === "compile_error") {
      finalStatus = "compile_error"
    } else if (runResult.status === "runtime_error") {
      finalStatus = "runtime_error"
    } else if (runResult.status === "timeout") {
      finalStatus = "timeout"
    }

    taskStore.updateTask(task.id, {
      status: finalStatus,
      run_ms: runResult.ms,
      run_result: runResult,
      error: runResult.error,
    })
  }
}

const globalForQueue = globalThis as unknown as { __taskQueue?: TaskQueue }
export const taskQueue = globalForQueue.__taskQueue ?? new TaskQueue()
if (process.env.NODE_ENV !== "production") {
  globalForQueue.__taskQueue = taskQueue
}
