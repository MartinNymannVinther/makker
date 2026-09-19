import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/core/dates";
import { Link } from "@/i18n/navigation";
import type { ConversationSummary } from "@/modules/chat/service";
import { cn } from "@/lib/utils";
import { ConversationPicker } from "./conversation-picker";

/**
 * The conversation page's frame: the person's conversations down the
 * left, newest first, and the one they are in on the right. On a phone
 * the list folds into a picker above the conversation; the rail is a
 * desktop thing.
 */
export async function ChatShell({
  conversations,
  activeId,
  children,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  children: React.ReactNode;
}) {
  const t = await getTranslations("chat");
  const locale = await getLocale();
  const options = conversations.map((c) => ({
    id: c.id,
    label: c.title || t("untitled"),
  }));

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-label={t("listLabel")}
        className="border-border bg-sidebar/40 hidden w-72 shrink-0 flex-col border-r lg:flex"
      >
        <div className="px-3 pt-4 pb-2">
          <Link
            href="/chat"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
          >
            <Plus data-slot="icon" />
            {t("new")}
          </Link>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          {conversations.length === 0 ? (
            <p className="text-meta px-3 py-2 text-2sm">{t("list.empty")}</p>
          ) : null}
          {conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col gap-0.5 rounded-[9px] px-3 py-2 transition-colors duration-[120ms] ease-out",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-hover",
                )}
              >
                <span className={cn("truncate text-2sm", active ? "font-semibold" : "font-medium")}>
                  {c.title || t("untitled")}
                </span>
                <span className="text-meta text-xs">{formatDay(c.updatedAt, locale)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex items-center gap-2 border-b px-4 py-2 lg:hidden">
          <ConversationPicker options={options} activeId={activeId} label={t("listLabel")} />
          <Link
            href="/chat"
            aria-label={t("new")}
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <Plus />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
