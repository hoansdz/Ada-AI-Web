import { proxySessionRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

type ApprovalRouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: ApprovalRouteContext
): Promise<Response> {
  const { id } = await context.params
  return proxySessionRequest(
    request,
    `/v1/approvals/${encodeURIComponent(id)}`
  )
}
