import { checkAdaaiHealth } from "@/lib/adaai-client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(): Promise<Response> {
  const adaaiStatus = await checkAdaaiHealth()
  return NextResponse.json({
    status: "healthy",
    autolang_compiler: "ready",
    adaai: adaaiStatus.adaai,
    source_sha256: adaaiStatus.source_sha256,
    model_sha256: adaaiStatus.model_sha256,
  })
}
