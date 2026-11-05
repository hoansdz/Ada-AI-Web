import { proxyRequest } from "@/lib/api"
import { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyRequest(`/api/projects/${id}`, { method: "GET" })
}

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyRequest(`/api/projects/${id}`, { method: "PUT", body: _req.body })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return proxyRequest(`/api/projects/${id}`, { method: "DELETE" })
}