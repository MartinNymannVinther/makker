import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("title") };
}

/**
 * Where a person lands: their conversations. Wave 0 is the foundation
 * alone, so the page says so and nothing more; the conversation itself
 * arrives with wave 2 (CLAUDE.md, roadmap).
 */
export default async function ChatPage() {
  const t = await getTranslations("chat");
  return (
    <div className="flex flex-col gap-[22px]">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <EmptyState title={t("empty.title")} hint={t("empty.hint")} />
    </div>
  );
}
