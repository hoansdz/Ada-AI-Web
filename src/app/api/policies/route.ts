import { proxySessionRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest): Promise<Response> {
  return proxySessionRequest(request, "/v1/policies")
}

export async function POST(request: NextRequest): Promise<Response> {
  return proxySessionRequest(request, "/v1/policies")
}
