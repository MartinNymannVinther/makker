"use client";

import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";

/** The list of conversations as a phone's own picker; the rail is for wide screens. */
export function ConversationPicker({
  options,
  activeId,
  label,
}: {
  options: Array<{ id: string; label: string }>;
  activeId: string | null;
  label: string;
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  return (
    <NativeSelect
      variant="sm"
      aria-label={label}
      value={activeId ?? ""}
      onChange={(event) =>
        router.push(event.target.value ? `/chat/${event.target.value}` : "/chat")
      }
    >
      <option value="">{t("new")}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}
