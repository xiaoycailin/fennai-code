import { redirect } from "next/navigation";
import { listSessions } from "@/lib/db";

export default function ChatIndexPage() {
  const sessions = listSessions();
  if (sessions[0]) redirect(`/chat/${sessions[0].id}`);
  redirect("/");
}
