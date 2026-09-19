"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { deleteTaskAction, saveTaskAction } from "@/modules/library/actions";

export type TaskItem = {
  id: string;
  groupName: string;
  name: string;
  description: string;
  prompt: string;
  roleId: string | null;
};

const EMPTY: TaskItem = {
  id: "",
  groupName: "",
  name: "",
  description: "",
  prompt: "",
  roleId: null,
};

/**
 * The task library: what a person can click to fill the writing field,
 * grouped the way the list shows it, with the role each one switches to.
 */
export function TasksAdmin({
  tasks,
  roles,
  canEdit,
}: {
  tasks: TaskItem[];
  roles: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.library.tasks");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(tasks.map((task) => task.groupName))];
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? null;

  const save = () =>
    start(async () => {
      if (!editing) return;
      const result = await saveTaskAction({ ...editing, id: editing.id || null });
      if (!result.ok) {
        toast.error(
          result.error === "forbidden"
            ? t("notAllowed")
            : result.error === "invalid"
              ? t("invalid")
              : tc("error"),
        );
        return;
      }
      setEditing(null);
      toast.success(t("saved"));
      router.refresh();
    });

  const remove = async (taskId: string) => {
    const result = await deleteTaskAction({ taskId });
    if (!result.ok) toast.error(tc("error"));
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group} className="flex flex-col gap-1">
            <h3 className="text-meta text-xs font-medium tracking-wide uppercase">{group}</h3>
            <ul className="divide-border divide-y">
              {tasks
                .filter((task) => task.groupName === group)
                .map((task) => (
                  <li key={task.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-2sm font-medium">{task.name}</p>
                      <p className="text-meta text-2sm">{task.description}</p>
                      <p className="text-meta mt-0.5 text-xs">
                        {roleName(task.roleId)
                          ? t("switchesTo", { role: roleName(task.roleId)! })
                          : t("keepsRole")}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("edit", { name: task.name })}
                          onClick={() => setEditing(task)}
                        >
                          <Pencil />
                        </Button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon-xs"
                          title={t("deleteTitle", { name: task.name })}
                          body={t("deleteBody")}
                          confirmLabel={t("deleteConfirm")}
                          onConfirm={() => remove(task.id)}
                        >
                          <Trash2 aria-label={t("delete", { name: task.name })} />
                        </ConfirmButton>
                      </div>
                    ) : null}
                  </li>
                ))}
            </ul>
          </section>
        ))}
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setEditing({ ...EMPTY, groupName: groups[0] ?? "" })}
          >
            <Plus data-slot="icon" />
            {t("add")}
          </Button>
        ) : null}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("editTitle") : t("addTitle")}</DialogTitle>
            <DialogDescription>{t("editBody")}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-name">{t("name")}</Label>
                  <Input
                    id="task-name"
                    value={editing.name}
                    required
                    maxLength={80}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-group">{t("group")}</Label>
                  <Input
                    id="task-group"
                    value={editing.groupName}
                    required
                    maxLength={60}
                    list="task-groups"
                    onChange={(e) => setEditing({ ...editing, groupName: e.target.value })}
                  />
                  <datalist id="task-groups">
                    {groups.map((group) => (
                      <option key={group} value={group} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-description">{t("description")}</Label>
                <Input
                  id="task-description"
                  value={editing.description}
                  maxLength={200}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-prompt">{t("prompt")}</Label>
                <Textarea
                  id="task-prompt"
                  value={editing.prompt}
                  required
                  rows={4}
                  maxLength={4000}
                  onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                />
                <p className="text-meta text-xs">{t("promptHelp")}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-role">{t("role")}</Label>
                <NativeSelect
                  id="task-role"
                  value={editing.roleId ?? ""}
                  onChange={(e) => setEditing({ ...editing, roleId: e.target.value || null })}
                >
                  <option value="">{t("noRole")}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? t("saving") : t("save")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  {tc("cancel")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
