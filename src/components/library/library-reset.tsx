"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { useRouter } from "@/i18n/navigation";
import { resetLibraryAction } from "@/modules/library/actions";

/** The way back to the defaults, behind one question, for owners and admins. */
export function LibraryReset() {
  const t = useTranslations("settings.library.reset");
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmButton
          variant="outline"
          title={t("confirmTitle")}
          body={t("confirmBody")}
          confirmLabel={t("confirm")}
          onConfirm={async () => {
            const result = await resetLibraryAction();
            if (!result.ok) toast.error(t("failed"));
            else toast.success(t("done"));
            router.refresh();
          }}
        >
          {t("action")}
        </ConfirmButton>
      </CardContent>
    </Card>
  );
}
