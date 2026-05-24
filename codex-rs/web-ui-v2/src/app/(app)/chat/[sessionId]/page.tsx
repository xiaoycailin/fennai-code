import { redirect } from "next/navigation";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { getSession, listSessions } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const detail = getSession(sessionId);
  if (!detail) {
    const latest = listSessions()[0];
    redirect(latest ? `/chat/${latest.id}` : "/chat");
  }
  return <ChatRoom detail={detail} />;
}
