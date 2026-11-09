import { NextRequest, NextResponse } from "next/server"
import { taskStore } from "@/lib/store"
import { taskQueue } from "@/lib/queue"

export const runtime = "nodejs"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Nội dung yêu cầu phải là JSON hợp lệ" },
      { status: 400 }
    )
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Nội dung yêu cầu phải là đối tượng JSON" },
      { status: 400 }
    )
  }

  const conversationId = body.conversation_id
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return NextResponse.json(
      { error: "Trường conversation_id là bắt buộc" },
      { status: 400 }
    )
  }

  const text = body.text
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "Trường text là bắt buộc và không được để trống" },
      { status: 400 }
    )
  }

  const toolpack = typeof body.toolpack === "string" ? body.toolpack : "shop"
  const run = typeof body.run === "boolean" ? body.run : true

  const task = taskStore.createTask({
    conversation_id: conversationId.trim(),
    text: text.trim(),
    toolpack,
    run,
  })

  taskQueue.trigger()

  return NextResponse.json(task, { status: 201 })
}

export async function GET(request: NextRequest): Promise<Response> {
  const conversationId = request.nextUrl.searchParams.get("conversation_id") ?? undefined
  const tasks = taskStore.listTasks(conversationId)
  return NextResponse.json({ tasks })
}
