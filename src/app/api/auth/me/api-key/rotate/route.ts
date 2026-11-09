import { proxySessionRequest } from "@/lib/api"
import { parseAdminSession } from "@/lib/mock-admin"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: NextRequest): Promise<Response> {
  const session = request.cookies.get("ada_session")?.value
  if (parseAdminSession(session)) {
    return NextResponse.json({
      api_key: "ada_live_admin_test_sample_key_9921",
      key_prefix: "ada_live_adm...****",
      created_at: new Date().toISOString(),
      warning: "Khóa truy cập thử nghiệm dành cho Quản trị viên.",
    })
  }

  return proxySessionRequest(request, "/v1/me/api-key/rotate")
}
