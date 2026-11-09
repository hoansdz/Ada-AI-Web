import fs from "node:fs"
import path from "node:path"
import { ACompiler, type AutolangType, type AutolangNativeFunc } from "autolang-compiler"
import type { ToolpackInfo } from "./toolpacks"

export interface ToolCallRecord {
  tool: string
  args: unknown[]
  result: unknown
  ms: number
  effect: boolean
  error?: string
}

export type RunStatus = "ok" | "runtime_error" | "timeout" | "compile_error"

export interface RunResult {
  status: RunStatus
  stdout: string
  error: string | null
  tool_calls: ToolCallRecord[]
  ms: number
  create_compiler_ms: number
}

interface RunnerConfig {
  limits?: {
    execution_timeout_ms?: number
    limit_opcode_count?: number
    max_managed_memory?: number
  }
}

let cachedConfig: RunnerConfig | null = null

function loadConfig(): RunnerConfig {
  if (cachedConfig) {
    return cachedConfig
  }
  try {
    const p = path.join(process.cwd(), "config.json")
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8")
      cachedConfig = JSON.parse(raw) as RunnerConfig
      return cachedConfig
    }
  } catch {
    // Sử dụng cấu hình mặc định
  }
  cachedConfig = {
    limits: {
      execution_timeout_ms: 10000,
      limit_opcode_count: 10000000,
      max_managed_memory: 33554432,
    },
  }
  return cachedConfig
}

export async function runCode(code: string, toolpack?: ToolpackInfo | null): Promise<RunResult> {
  const config = loadConfig()
  const timeoutMs = config.limits?.execution_timeout_ms ?? 10000
  const opcodeLimit = config.limits?.limit_opcode_count ?? 10000000
  const memoryLimit = config.limits?.max_managed_memory ?? 33554432

  const tStartCreate = Date.now()
  const compiler = await ACompiler.create({
    libraries: {
      http: { enabled: false },
      file: { enabled: false },
    },
    limits: {
      maxOpcodeCount: opcodeLimit,
      maxMemoryBytes: memoryLimit,
    },
  })
  const createCompilerMs = Date.now() - tStartCreate

  const toolCalls: ToolCallRecord[] = []
  let compileErrorCaught = ""

  try {
    compiler.setLimitOpcodeCount(opcodeLimit)
    compiler.setMaxManagedMemory(memoryLimit)
    compiler.setAllowedDomainsRules([])
    compiler.setAllowFileRead(false)
    compiler.setAllowFileWrite(false)
    compiler.setAllowFileDelete(false)

    compiler.setOnError((err: string) => {
      compileErrorCaught = err
    })

    if (toolpack) {
      const wrappedNatives: Record<string, AutolangNativeFunc> = {}

      for (const [name, fn] of Object.entries(toolpack.natives)) {
        const isEffect =
          toolpack.effects.includes(name) ||
          toolpack.effects.some((eff) => eff.toLowerCase().endsWith(name.toLowerCase()))

        wrappedNatives[name] = (...args: AutolangType[]): AutolangType => {
          const startMs = Date.now()
          try {
            const res = fn(...args)
            const duration = Date.now() - startMs
            toolCalls.push({
              tool: name,
              args: args.map((a) => (a === undefined ? null : a)),
              result: res,
              ms: duration,
              effect: isEffect,
            })
            return res as AutolangType
          } catch (err: unknown) {
            const duration = Date.now() - startMs
            const message = err instanceof Error ? err.message : String(err)
            toolCalls.push({
              tool: name,
              args: args.map((a) => (a === undefined ? null : a)),
              result: null,
              ms: duration,
              effect: isEffect,
              error: message,
            })
            compiler.throwException(message)
            return null
          }
        }
      }

      compiler.registerBuiltInLibrary(
        toolpack.library,
        toolpack.source,
        { autoImport: true },
        wrappedNatives
      )
    }

    const tStartRun = Date.now()
    const success = await compiler.compileAndRun("main.al", code)
    const runMs = Date.now() - tStartRun

    if (compiler.hasCompilerError()) {
      return {
        status: "compile_error",
        stdout: "",
        error: compileErrorCaught || "Biên dịch thất bại",
        tool_calls: toolCalls,
        ms: runMs,
        create_compiler_ms: createCompilerMs,
      }
    }

    if (compiler.hasException()) {
      const ex = compiler.getException()
      const firstToolError = toolCalls.find((tc) => tc.error)?.error
      const msg = ex ? ex.message : (firstToolError || "Lỗi thực thi")
      const isTimeout =
        msg.toLowerCase().includes("timed out") ||
        msg.toLowerCase().includes("execution timed out") ||
        msg.toLowerCase().includes("instruction limit exceeded") ||
        msg.toLowerCase().includes("timeout")

      return {
        status: isTimeout ? "timeout" : "runtime_error",
        stdout: typeof compiler.getOutput() === "string" ? compiler.getOutput() : "",
        error: firstToolError ? `${firstToolError} (${msg})` : msg,
        tool_calls: toolCalls,
        ms: runMs,
        create_compiler_ms: createCompilerMs,
      }
    }

    if (!success) {
      return {
        status: "runtime_error",
        stdout: typeof compiler.getOutput() === "string" ? compiler.getOutput() : "",
        error: "Thực thi không thành công",
        tool_calls: toolCalls,
        ms: runMs,
        create_compiler_ms: createCompilerMs,
      }
    }

    return {
      status: "ok",
      stdout: typeof compiler.getOutput() === "string" ? compiler.getOutput() : "",
      error: null,
      tool_calls: toolCalls,
      ms: runMs,
      create_compiler_ms: createCompilerMs,
    }
  } finally {
    compiler.dispose()
  }
}
