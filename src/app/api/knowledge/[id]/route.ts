import { proxySessionRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

type KnowledgeRouteContext = {
  params: Promise<{ id: string }>
}

async function getKnowledgePath(
  context: KnowledgeRouteContext
): Promise<string> {
  const { id } = await context.params
  return `/v1/knowledge/${encodeURIComponent(id)}`
}

export async function GET(
  request: NextRequest,
  context: KnowledgeRouteContext
): Promise<Response> {
  return proxySessionRequest(request, await getKnowledgePath(context))
}

export async function DELETE(
  request: NextRequest,
  context: KnowledgeRouteContext
): Promise<Response> {
  return proxySessionRequest(request, await getKnowledgePath(context))
}
