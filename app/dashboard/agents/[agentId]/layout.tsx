import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat" };

export default function AgentChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
