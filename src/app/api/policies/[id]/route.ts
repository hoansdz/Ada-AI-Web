import { proxySessionRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

type PolicyRouteContext = {
  params: Promise<{ id: string }>
}

async function getPolicyPath(context: PolicyRouteContext): Promise<string> {
  const { id } = await context.params
  return `/v1/policies/${encodeURIComponent(id)}`
}

export async function GET(
  request: NextRequest,
  context: PolicyRouteContext
): Promise<Response> {
  return proxySessionRequest(request, await getPolicyPath(context))
}

export async function PUT(
  request: NextRequest,
  context: PolicyRouteContext
): Promise<Response> {
  return proxySessionRequest(request, await getPolicyPath(context))
}

export async function DELETE(
  request: NextRequest,
  context: PolicyRouteContext
): Promise<Response> {
  return proxySessionRequest(request, await getPolicyPath(context))
}
