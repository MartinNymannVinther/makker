import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LibraryReset } from "@/components/library/library-reset";
import { PiiForm } from "@/components/library/pii-form";
import { PromptForm } from "@/components/library/prompt-form";
import { RolesAdmin } from "@/components/library/roles-admin";
import { TasksAdmin } from "@/components/library/tasks-admin";
import { getOrgContext } from "@/core/auth/session";
import { redirect } from "@/i18n/navigation";
import {
  canEditLibrary,
  getWorkspaceSettings,
  listRoles,
  listTasks,
} from "@/modules/library/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.library");
  return { title: t("title") };
}

/**
 * What the workspace says to the model on everybody's behalf: the
 * system prompt, the roles a person can lay over it, and the tasks that
 * fill the writing field. Everyone can read it; owners and admins edit.
 */
export default async function LibraryPage() {
  const ctx = await getOrgContext();
  if (!ctx) {
    redirect({ href: "/login", locale: await getLocale() });
    return null;
  }
  const t = await getTranslations("settings.library");
  const [settings, roles, tasks, canEdit] = await Promise.all([
    getWorkspaceSettings(ctx),
    listRoles(ctx),
    listTasks(ctx),
    canEditLibrary(ctx),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>
      <PromptForm
        systemPrompt={settings.systemPrompt}
        maxTokens={settings.maxTokens}
        canEdit={canEdit}
      />
      <RolesAdmin
        roles={roles.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          instruction: r.instruction,
        }))}
        canEdit={canEdit}
      />
      <TasksAdmin
        tasks={tasks.map((task) => ({
          id: task.id,
          groupName: task.groupName,
          name: task.name,
          description: task.description,
          prompt: task.prompt,
          roleId: task.roleId,
        }))}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        canEdit={canEdit}
      />
      <PiiForm
        enabled={settings.piiEnabled}
        disabled={settings.piiDisabled}
        extraWords={settings.piiExtraWords}
        blockOnHint={settings.piiBlockOnHint}
        canEdit={canEdit}
      />
      {canEdit ? <LibraryReset /> : null}
    </div>
  );
}
