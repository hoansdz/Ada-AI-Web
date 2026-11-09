import { NextResponse } from "next/server"
import { taskStore } from "@/lib/store"

export const runtime = "nodejs"

export async function GET(): Promise<Response> {
  const conversations = taskStore.listConversations()
  return NextResponse.json({ conversations })
}
