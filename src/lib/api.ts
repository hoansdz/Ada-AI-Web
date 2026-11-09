import type { NextRequest } from "next/server"

export const API_BASE_URL =
  process.env.ADA_CONTROL_PLANE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8920"

export async function proxyRequest(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(opts.headers)
  if (opts.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(new URL(path, `${API_BASE_URL.replace(/\/+$/, "")}/`), {
    ...opts,
    headers,
  })
  return res
}

export async function proxySessionRequest(
  request: NextRequest,
  path: string,
  method: string = request.method
): Promise<Response> {
  const session = request.cookies.get("ada_session")?.value
  if (!session) {
    return Response.json(
      { error: { message: "Hãy đăng nhập bằng Google để tiếp tục." } },
      { status: 401 }
    )
  }

  const headers = new Headers()
  headers.set("Authorization", `Bearer ${session}`)
  const contentType = request.headers.get("content-type")
  const accept = request.headers.get("accept")
  const idempotencyKey = request.headers.get("idempotency-key")

  if (contentType) headers.set("Content-Type", contentType)
  if (accept) headers.set("Accept", accept)
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey)

  const options: RequestInit = {
    method,
    headers,
    cache: "no-store",
  }

  if (method !== "GET" && method !== "HEAD") {
    options.body = await request.arrayBuffer()
  }

  return proxyRequest(`${path}${request.nextUrl.search}`, options)
}

export async function getJSON<T>(path: string): Promise<T> {
  const res = await proxyRequest(path)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await proxyRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await proxyRequest(path, {
    method: "PUT",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await proxyRequest(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function delJSON(path: string): Promise<void> {
  const res = await proxyRequest(path, { method: "DELETE" })
  if (!res.ok) throw new Error(`API error ${res.status}`)
}