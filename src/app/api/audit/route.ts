import { proxyRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  return proxyRequest("/api/audit", { method: "GET" })
}