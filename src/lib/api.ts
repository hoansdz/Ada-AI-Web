const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8920"

export async function proxyRequest(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
    ...opts,
  })
  return res
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