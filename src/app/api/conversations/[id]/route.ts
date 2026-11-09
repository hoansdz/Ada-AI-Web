import { NextRequest, NextResponse } from "next/server"
import { taskStore } from "@/lib/store"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<Response> {
  const { id } = await context.params
  const result = taskStore.deleteConversation(id)

  if (result.conflict) {
    return NextResponse.json(
      { error: "Không thể xóa cuộc trò chuyện khi có tác vụ đang được xử lý" },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
