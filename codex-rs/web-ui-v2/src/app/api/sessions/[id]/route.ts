import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSession, getSession, patchSession } from "@/lib/db";

const updateSessionSchema = z.object({
  title: z.string().optional(),
  workspacePath: z.string().optional(),
  model: z.string().optional(),
  permission: z.enum(["read-only", "workspace-write", "full-access"]).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getSession(id);
  if (!detail) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = updateSessionSchema.parse(await request.json());
  const session = patchSession(id, body);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ session });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteSession(id);
  return NextResponse.json({ ok: true });
}
