import { NextRequest, NextResponse } from "next/server"
import { taskStore } from "@/lib/store"
import { taskQueue } from "@/lib/queue"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params
  const existing = taskStore.getTask(id)

  if (!existing) {
    return NextResponse.json(
      { error: "Không tìm thấy tác vụ tương ứng để thử lại" },
      { status: 404 }
    )
  }

  const updated = taskStore.updateTask(id, {
    status: "queued",
    error: null,
    run_result: undefined,
  })

  taskQueue.trigger()

  return NextResponse.json(updated)
}
