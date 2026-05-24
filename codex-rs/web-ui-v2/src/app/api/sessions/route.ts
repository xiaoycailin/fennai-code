import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, listSessions } from "@/lib/db";

const createSessionSchema = z.object({
  title: z.string().optional(),
  workspacePath: z.string().optional(),
  model: z.string().optional(),
  permission: z.enum(["read-only", "workspace-write", "full-access"]).optional(),
});

export async function GET() {
  return NextResponse.json({ data: listSessions() });
}

export async function POST(request: Request) {
  const body = createSessionSchema.parse(await request.json().catch(() => ({})));
  const session = createSession(body);
  return NextResponse.json({ session }, { status: 201 });
}
