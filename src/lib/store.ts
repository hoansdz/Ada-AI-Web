import fs from "node:fs"
import path from "node:path"
import type { RunResult } from "./runner"

export type TaskStatus =
  | "queued"
  | "generating"
  | "running"
  | "done"
  | "refused"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "tools_mismatch"
  | "adaai_unreachable"
  | "adaai_error"
  | "interrupted"

export interface TaskRecord {
  id: string
  conversation_id: string
  text: string
  toolpack: string | null
  run: boolean
  status: TaskStatus
  created_at: string
  updated_at: string
  generation_ms?: number
  run_ms?: number
  http_status?: number
  adaai_response?: unknown
  adaai_error_message?: string
  code?: string
  attempts?: unknown[]
  refusal?: {
    code: string
    message: string
  }
  run_result?: RunResult
  error?: string | null
}

export interface ConversationSummary {
  id: string
  title: string
  updated_at: string
  task_count: number
}

const DATA_DIR = path.join(process.cwd(), "data")
const TASKS_FILE = path.join(DATA_DIR, "tasks.json")

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadTasksFromFile(): Map<string, TaskRecord> {
  ensureDataDir()
  const map = new Map<string, TaskRecord>()
  if (!fs.existsSync(TASKS_FILE)) {
    return map
  }
  try {
    const raw = fs.readFileSync(TASKS_FILE, "utf-8")
    const arr = JSON.parse(raw) as unknown
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === "object" && item !== null && "id" in item && typeof item.id === "string") {
          const t = item as TaskRecord
          if (!t.conversation_id) {
            t.conversation_id = `conv_legacy_${t.id}`
          }
          map.set(t.id, t)
        }
      }
    }
  } catch {
    // Trả về danh sách rỗng nếu tệp bị lỗi
  }
  return map
}

function saveTasksToFile(tasks: TaskRecord[]): void {
  ensureDataDir()
  const tmpFile = path.join(DATA_DIR, `tasks.tmp.${process.pid}.${Date.now()}`)
  const json = JSON.stringify(tasks, null, 2)
  fs.writeFileSync(tmpFile, json, "utf-8")
  fs.renameSync(tmpFile, TASKS_FILE)
}

class TaskStore {
  private tasks: Map<string, TaskRecord>

  constructor() {
    this.tasks = loadTasksFromFile()
    let modified = false
    for (const task of this.tasks.values()) {
      if (task.status === "generating" || task.status === "running") {
        task.status = "interrupted"
        task.updated_at = new Date().toISOString()
        task.error = "Tiến trình bị gián đoạn do khởi động lại hệ thống"
        modified = true
      }
    }
    if (modified) {
      this.persist()
    }
  }

  private persist(): void {
    const list = Array.from(this.tasks.values())
    saveTasksToFile(list)
  }

  createTask(params: {
    conversation_id: string
    text: string
    toolpack?: string | null
    run?: boolean
  }): TaskRecord {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = new Date().toISOString()
    const task: TaskRecord = {
      id,
      conversation_id: params.conversation_id,
      text: params.text,
      toolpack: params.toolpack === undefined ? "shop" : params.toolpack,
      run: params.run ?? true,
      status: "queued",
      created_at: now,
      updated_at: now,
    }
    this.tasks.set(id, task)
    this.persist()
    return { ...task }
  }

  getTask(id: string): TaskRecord | null {
    const task = this.tasks.get(id)
    return task ? { ...task } : null
  }

  listTasks(conversationId?: string): TaskRecord[] {
    const list = Array.from(this.tasks.values())
    const filtered = conversationId
      ? list.filter((t) => t.conversation_id === conversationId)
      : list

    filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return filtered.map((t) => ({ ...t }))
  }

  listConversations(): ConversationSummary[] {
    const groups = new Map<string, TaskRecord[]>()
    for (const task of this.tasks.values()) {
      const convId = task.conversation_id || `conv_${task.id}`
      const existing = groups.get(convId)
      if (existing) {
        existing.push(task)
      } else {
        groups.set(convId, [task])
      }
    }

    const result: ConversationSummary[] = []
    for (const [convId, tasks] of groups.entries()) {
      tasks.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      const firstTask = tasks[0]
      const lastTask = tasks[tasks.length - 1]
      const rawTitle = firstTask ? firstTask.text : "Cuộc trò chuyện"
      const title = rawTitle.length > 60 ? `${rawTitle.slice(0, 57)}...` : rawTitle

      result.push({
        id: convId,
        title,
        updated_at: lastTask ? lastTask.updated_at : new Date().toISOString(),
        task_count: tasks.length,
      })
    }

    result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    return result
  }

  deleteConversation(conversationId: string): { ok: boolean; conflict?: boolean } {
    const tasks = Array.from(this.tasks.values()).filter((t) => t.conversation_id === conversationId)
    const hasActive = tasks.some((t) => t.status === "generating" || t.status === "running")
    if (hasActive) {
      return { ok: false, conflict: true }
    }

    for (const t of tasks) {
      this.tasks.delete(t.id)
    }
    this.persist()
    return { ok: true }
  }

  updateTask(id: string, updates: Partial<TaskRecord>): TaskRecord | null {
    const existing = this.tasks.get(id)
    if (!existing) {
      return null
    }
    const updated: TaskRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    }
    this.tasks.set(id, updated)
    this.persist()
    return { ...updated }
  }

  getNextQueuedTask(): TaskRecord | null {
    const list = Array.from(this.tasks.values()).filter((t) => t.status === "queued")
    if (list.length === 0) {
      return null
    }
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return { ...list[0] }
  }

  reloadFromDisk(): void {
    this.tasks = loadTasksFromFile()
    let modified = false
    for (const task of this.tasks.values()) {
      if (task.status === "generating" || task.status === "running") {
        task.status = "interrupted"
        task.updated_at = new Date().toISOString()
        task.error = "Tiến trình bị gián đoạn do khởi động lại hệ thống"
        modified = true
      }
    }
    if (modified) {
      this.persist()
    }
  }

  clear(): void {
    this.tasks.clear()
    this.persist()
  }
}

const globalForStore = globalThis as unknown as { __taskStore?: TaskStore }
export const taskStore = globalForStore.__taskStore ?? new TaskStore()
if (process.env.NODE_ENV !== "production") {
  globalForStore.__taskStore = taskStore
}
