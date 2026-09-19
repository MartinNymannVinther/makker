"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingsAction } from "@/modules/library/actions";

/**
 * The sentence every conversation opens with, and how long an answer
 * may become. Server-side on purpose: the browser sends a role id, never
 * the prompt, so what the model is told is the administrator's to set
 * and nobody else's to see in transit.
 */
export function PromptForm({
  systemPrompt,
  maxTokens,
  canEdit,
}: {
  systemPrompt: string;
  maxTokens: number;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.library.prompt");
  const [prompt, setPrompt] = useState(systemPrompt);
  const [tokens, setTokens] = useState(String(maxTokens));
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await saveSettingsAction({ systemPrompt: prompt, maxTokens: tokens });
      if (!result.ok) {
        toast.error(result.error === "forbidden" ? t("notAllowed") : t("saveFailed"));
        return;
      }
      setPrompt(result.data.systemPrompt);
      setTokens(String(result.data.maxTokens));
      toast.success(t("saved"));
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="system-prompt">{t("promptLabel")}</Label>
          <Textarea
            id="system-prompt"
            value={prompt}
            rows={4}
            maxLength={8000}
            disabled={!canEdit || pending}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <p className="text-meta text-xs">{t("promptHelp")}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="max-tokens">{t("tokensLabel")}</Label>
          <Input
            id="max-tokens"
            type="number"
            inputMode="numeric"
            min={256}
            max={32000}
            value={tokens}
            disabled={!canEdit || pending}
            onChange={(event) => setTokens(event.target.value)}
            className="w-40"
          />
          <p className="text-meta text-xs">{t("tokensHelp")}</p>
        </div>
        {canEdit ? (
          <Button type="button" className="w-fit" disabled={pending} onClick={save}>
            {pending ? t("saving") : t("save")}
          </Button>
        ) : (
          <p className="text-meta text-sm">{t("notAllowed")}</p>
        )}
      </CardContent>
    </Card>
  );
}
