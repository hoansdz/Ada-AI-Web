import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { shopNatives } from "../../toolpacks/shop/impl"

export interface ToolpackManifest {
  name: string
  description: string
  library: string
  effects: string[]
}

export type NativeFunction = (...args: unknown[]) => unknown

export interface ToolpackInfo {
  name: string
  description: string
  library: string
  source: string
  sha256: string
  effects: string[]
  natives: Record<string, NativeFunction>
}

const TOOLPACKS_DIR = path.join(process.cwd(), "toolpacks")

export function computeSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex")
}

export function getToolpack(name: string): ToolpackInfo | null {
  const packDir = path.join(TOOLPACKS_DIR, name)
  if (!fs.existsSync(packDir)) {
    return null
  }

  const manifestPath = path.join(packDir, "manifest.json")
  const toolsPath = path.join(packDir, "tools.al")

  if (!fs.existsSync(manifestPath) || !fs.existsSync(toolsPath)) {
    return null
  }

  const manifestRaw = fs.readFileSync(manifestPath, "utf-8")
  const manifest = JSON.parse(manifestRaw) as ToolpackManifest
  const source = fs.readFileSync(toolsPath, "utf-8")
  const sha256 = computeSha256(source)

  let natives: Record<string, NativeFunction> = {}
  if (name === "shop") {
    natives = shopNatives as unknown as Record<string, NativeFunction>
  }

  return {
    name: manifest.name || name,
    description: manifest.description || "",
    library: manifest.library,
    source,
    sha256,
    effects: manifest.effects || [],
    natives,
  }
}

export function listToolpacks(): Array<{ name: string; description: string; library: string }> {
  if (!fs.existsSync(TOOLPACKS_DIR)) {
    return []
  }
  const entries = fs.readdirSync(TOOLPACKS_DIR, { withFileTypes: true })
  const result: Array<{ name: string; description: string; library: string }> = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pack = getToolpack(entry.name)
      if (pack) {
        result.push({
          name: pack.name,
          description: pack.description,
          library: pack.library,
        })
      }
    }
  }

  return result
}
