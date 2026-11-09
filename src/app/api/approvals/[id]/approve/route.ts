import { proxySessionRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

type ApprovalActionRouteContext = {
  params: Promise<{ id: string }>
}

export async function POST(
  request: NextRequest,
  context: ApprovalActionRouteContext
): Promise<Response> {
  const { id } = await context.params
  return proxySessionRequest(
    request,
    `/v1/approvals/${encodeURIComponent(id)}/approve`
  )
}
