import { NextRequest, NextResponse } from "next/server"
import { taskStore } from "@/lib/store"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params
  const task = taskStore.getTask(id)

  if (!task) {
    return NextResponse.json(
      { error: "Không tìm thấy tác vụ tương ứng" },
      { status: 404 }
    )
  }

  return NextResponse.json(task)
}
