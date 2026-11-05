import { proxyRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  return proxyRequest("/api/capabilities", { method: "GET" })
}

export async function POST(req: NextRequest) {
  return proxyRequest("/api/capabilities", { method: "POST", body: req.body })
}