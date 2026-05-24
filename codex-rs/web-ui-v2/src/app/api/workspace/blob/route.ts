import fs from "node:fs/promises";
import path from "node:path";

function resolvePath(root: string, relative: string) {
  const absolute = path.resolve(root, relative);
  const normalizedRoot = path.resolve(root);
  if (!absolute.startsWith(normalizedRoot)) throw new Error("Path escapes workspace root");
  return absolute;
}

function mimeTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const root = url.searchParams.get("root") || process.env.DEFAULT_WORKSPACE_PATH || process.cwd();
  const relative = url.searchParams.get("path");
  if (!relative) return new Response("Missing path", { status: 400 });
  try {
    const absolute = resolvePath(root, relative);
    const bytes = await fs.readFile(absolute);
    return new Response(bytes, {
      headers: {
        "Content-Type": mimeTypeFor(relative),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read blob";
    return new Response(message, { status: 500 });
  }
}
