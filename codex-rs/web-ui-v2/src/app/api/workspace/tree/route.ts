import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type NodeRow = { id: string; name: string; path: string; type: "file" | "directory"; children?: NodeRow[] };

const IGNORE = new Set([".git", "node_modules", ".next", ".next-v2", "dist", "build"]);

async function readTree(root: string, current: string, depth: number, includeIgnored: boolean): Promise<NodeRow[]> {
  if (depth <= 0) return [];
  const rows = await fs.readdir(current, { withFileTypes: true });
  const result: NodeRow[] = [];
  for (const row of rows) {
    if (!includeIgnored && IGNORE.has(row.name)) continue;
    const absolute = path.join(current, row.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (row.isDirectory()) {
      result.push({
        id: relative || row.name,
        name: row.name,
        path: relative || ".",
        type: "directory",
        children: await readTree(root, absolute, depth - 1, includeIgnored),
      });
      continue;
    }
    result.push({ id: relative, name: row.name, path: relative, type: "file" });
  }
  return result.sort((a, b) => Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const root = url.searchParams.get("root") || process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
  const depth = Number(url.searchParams.get("depth") || "3");
  const includeIgnored = url.searchParams.get("includeIgnored") === "1";
  try {
    const tree = await readTree(root, root, Math.min(Math.max(depth, 1), 6), includeIgnored);
    return NextResponse.json({ root, data: tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read workspace tree";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
