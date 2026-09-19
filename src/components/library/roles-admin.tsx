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
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { deleteRoleAction, saveRoleAction } from "@/modules/library/actions";

export type RoleItem = {
  id: string;
  key: string;
  name: string;
  description: string;
  instruction: string;
};

const EMPTY: RoleItem = { id: "", key: "", name: "", description: "", instruction: "" };

/**
 * The roles a person can lay over the system prompt. A list with the
 * instruction folded away, an edit dialog per role, and the one way to
 * remove one — which leaves every task and conversation that pointed at
 * it standing, without a role.
 */
export function RolesAdmin({ roles, canEdit }: { roles: RoleItem[]; canEdit: boolean }) {
  const t = useTranslations("settings.library.roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      if (!editing) return;
      const result = await saveRoleAction({
        id: editing.id || null,
        key: editing.key.trim().toLowerCase(),
        name: editing.name,
        description: editing.description,
        instruction: editing.instruction,
      });
      if (!result.ok) {
        toast.error(
          result.error === "conflict"
            ? t("keyTaken")
            : result.error === "forbidden"
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

  const remove = async (roleId: string) => {
    const result = await deleteRoleAction({ roleId });
    if (!result.ok) toast.error(tc("error"));
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="divide-border divide-y">
          {roles.map((role) => (
            <li key={role.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-2sm font-medium">
                  {role.name} <span className="text-meta font-mono text-xs">{role.key}</span>
                </p>
                <p className="text-meta text-2sm">{role.description}</p>
                {role.instruction ? (
                  <details className="mt-1">
                    <summary className="text-meta cursor-pointer text-xs">
                      {t("showInstruction")}
                    </summary>
                    <p className="text-2sm mt-1 leading-relaxed whitespace-pre-wrap">
                      {role.instruction}
                    </p>
                  </details>
                ) : (
                  <p className="text-meta text-xs">{t("noInstruction")}</p>
                )}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("edit", { name: role.name })}
                    onClick={() => setEditing(role)}
                  >
                    <Pencil />
                  </Button>
                  <ConfirmButton
                    variant="ghost"
                    size="icon-xs"
                    title={t("deleteTitle", { name: role.name })}
                    body={t("deleteBody")}
                    confirmLabel={t("deleteConfirm")}
                    onConfirm={() => remove(role.id)}
                  >
                    <Trash2 aria-label={t("delete", { name: role.name })} />
                  </ConfirmButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setEditing(EMPTY)}
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
                  <Label htmlFor="role-name">{t("name")}</Label>
                  <Input
                    id="role-name"
                    value={editing.name}
                    required
                    maxLength={80}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="role-key">{t("key")}</Label>
                  <Input
                    id="role-key"
                    value={editing.key}
                    required
                    maxLength={40}
                    pattern="[a-z0-9][a-z0-9-]*"
                    spellCheck={false}
                    onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                  />
                  <p className="text-meta text-xs">{t("keyHelp")}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role-description">{t("description")}</Label>
                <Input
                  id="role-description"
                  value={editing.description}
                  maxLength={200}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role-instruction">{t("instruction")}</Label>
                <Textarea
                  id="role-instruction"
                  value={editing.instruction}
                  rows={6}
                  maxLength={4000}
                  onChange={(e) => setEditing({ ...editing, instruction: e.target.value })}
                />
                <p className="text-meta text-xs">{t("instructionHelp")}</p>
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
