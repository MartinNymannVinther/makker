import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatView } from "@/components/chat/chat-view";
import { getOrgContext } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import { modelConfigured } from "@/modules/ai/service";
import { getConversation, listConversations } from "@/modules/chat/service";
import { listRoles, listTasks } from "@/modules/library/service";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getTranslations("chat");
  const ctx = await getOrgContext();
  const { id } = await params;
  const view = ctx ? await getConversation(ctx, id) : null;
  return { title: view?.conversation.title || t("untitled") };
}

/** One conversation, the person's own; any other id is not found. */
export default async function ConversationPage({ params }: Params) {
  const ctx = await getOrgContext();
  if (!ctx) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }
  const { id } = await params;
  const view = await getConversation(ctx, id);
  if (!view) notFound();
  const [conversations, roles, tasks, hasModel] = await Promise.all([
    listConversations(ctx),
    listRoles(ctx),
    listTasks(ctx),
    modelConfigured(ctx),
  ]);
  return (
    <ChatShell conversations={conversations} activeId={view.conversation.id}>
      <ChatView
        key={view.conversation.id}
        conversation={{
          id: view.conversation.id,
          title: view.conversation.title,
          roleId: view.conversation.roleId,
        }}
        messages={view.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          truncated: m.truncated,
          engine: m.engine,
        }))}
        files={view.files.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
          hasText: f.hasText,
          messageId: f.messageId,
        }))}
        roles={roles}
        tasks={tasks}
        modelConfigured={hasModel}
      />
    </ChatShell>
  );
}
