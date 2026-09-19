"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HINTS, PATTERNS } from "@/lib/pii";
import { savePiiAction } from "@/modules/library/actions";

type Key =
  "cpr" | "card" | "iban" | "account" | "email" | "phone" | "icd" | "name" | "health" | "union";

/**
 * The filter's tuning: on or off for the workspace, which formats and
 * hint groups it looks for, the administrator's own words per group,
 * and whether a hint alone may block. The filter itself runs in the
 * browser; these settings only tell it what to look for.
 */
export function PiiForm({
  enabled,
  disabled,
  extraWords,
  blockOnHint,
  canEdit,
}: {
  enabled: boolean;
  disabled: string[];
  extraWords: Record<string, string[]>;
  blockOnHint: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.library.pii");
  const names = useTranslations("chat.pii.names");
  const [on, setOn] = useState(enabled);
  const [off, setOff] = useState<string[]>(disabled);
  const [words, setWords] = useState<Record<string, string>>(
    Object.fromEntries(HINTS.map((h) => [h.key, (extraWords[h.key] ?? []).join(", ")])),
  );
  const [strict, setStrict] = useState(blockOnHint);
  const [pending, start] = useTransition();
  const patternKeys = [...new Set(PATTERNS.map((p) => p.key))];

  const toggle = (key: string) =>
    setOff((was) => (was.includes(key) ? was.filter((k) => k !== key) : [...was, key]));

  const save = () =>
    start(async () => {
      const result = await savePiiAction({
        piiEnabled: on,
        piiDisabled: off,
        piiExtraWords: Object.fromEntries(
          Object.entries(words).map(([key, value]) => [
            key,
            value
              .split(",")
              .map((w) => w.trim())
              .filter(Boolean),
          ]),
        ),
        piiBlockOnHint: strict,
      });
      if (!result.ok) {
        toast.error(result.error === "forbidden" ? t("notAllowed") : t("saveFailed"));
        return;
      }
      toast.success(t("saved"));
    });

  const box = (id: string, checked: boolean, onChange: () => void, label: string) => (
    <label key={id} htmlFor={id} className="flex items-center gap-2 text-2sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={!canEdit || pending}
        onChange={onChange}
        className="accent-primary size-4"
      />
      {label}
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {box("pii-enabled", on, () => setOn(!on), t("enabled"))}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-2sm mb-1 font-medium">{t("patternsTitle")}</legend>
          {patternKeys.map((key) =>
            box(`pii-${key}`, !off.includes(key), () => toggle(key), names(key as Key)),
          )}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-2sm mb-1 font-medium">{t("hintsTitle")}</legend>
          {HINTS.map((hint) => (
            <div key={hint.key} className="flex flex-col gap-1.5">
              {box(
                `pii-${hint.key}`,
                !off.includes(hint.key),
                () => toggle(hint.key),
                names(hint.key as Key),
              )}
              <Label htmlFor={`pii-words-${hint.key}`} className="text-meta text-xs font-normal">
                {t("extraWords", { group: names(hint.key as Key) })}
              </Label>
              <Input
                id={`pii-words-${hint.key}`}
                value={words[hint.key] ?? ""}
                disabled={!canEdit || pending}
                placeholder={t("extraWordsPlaceholder")}
                onChange={(e) => setWords({ ...words, [hint.key]: e.target.value })}
              />
            </div>
          ))}
          <p className="text-meta text-xs">{t("extraWordsHelp")}</p>
        </fieldset>
        {box("pii-strict", strict, () => setStrict(!strict), t("blockOnHint"))}
        <p className="text-meta -mt-3 pl-6 text-xs">{t("blockOnHintHelp")}</p>
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
