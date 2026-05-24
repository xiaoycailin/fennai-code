import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function resolvePath(root: string, relative: string) {
  const absolute = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (!absolute.startsWith(normalizedRoot)) throw new Error("Path escapes workspace root");
  return absolute;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const root = url.searchParams.get("root") || process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
  const relative = url.searchParams.get("path") ?? "README.md";
  try {
    const absolute = resolvePath(root, relative);
    const content = await fs.readFile(absolute, "utf8");
    return NextResponse.json({ path: relative, content, language: path.extname(relative).slice(1) || "text" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const root = body.root || process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
  try {
    const absolute = resolvePath(root, body.path);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, body.content ?? "", "utf8");
    return NextResponse.json({ ok: true, path: body.path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to write file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const root = url.searchParams.get("root") || process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
  const relative = url.searchParams.get("path");
  if (!relative) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  try {
    const absolute = resolvePath(root, relative);
    await fs.rm(absolute, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete path";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
