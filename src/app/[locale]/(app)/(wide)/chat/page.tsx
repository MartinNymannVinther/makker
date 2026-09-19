import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ChatShell } from "@/components/chat/chat-shell";
import { ChatView } from "@/components/chat/chat-view";
import { getOrgContext } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import { modelConfigured } from "@/modules/ai/service";
import { listConversations } from "@/modules/chat/service";
import { listRoles, listTasks } from "@/modules/library/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("title") };
}

/** A new conversation: the list beside an empty page and the writing field. */
export default async function NewChatPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }
  const [conversations, roles, tasks, hasModel] = await Promise.all([
    listConversations(ctx),
    listRoles(ctx),
    listTasks(ctx),
    modelConfigured(ctx),
  ]);
  return (
    <ChatShell conversations={conversations} activeId={null}>
      <ChatView
        key="new"
        conversation={null}
        messages={[]}
        files={[]}
        roles={roles}
        tasks={tasks}
        modelConfigured={hasModel}
      />
    </ChatShell>
  );
}
