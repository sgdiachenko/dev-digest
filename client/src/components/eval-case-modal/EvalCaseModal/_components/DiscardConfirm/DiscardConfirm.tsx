/* DiscardConfirm — asks before throwing away unsaved edits (AC-55). Focus lands on "Keep editing". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

export function DiscardConfirm({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  const t = useTranslations("eval.modal");
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>("button[data-keep]")?.focus();
  }, []);
  return (
    <div ref={rootRef} role="alertdialog" aria-label={t("discardConfirm")} style={s.confirm}>
      <span style={{ flex: 1 }}>{t("discardConfirm")}</span>
      <Button kind="danger" size="sm" onClick={onDiscard}>
        {t("discard")}
      </Button>
      <Button kind="secondary" size="sm" data-keep onClick={onKeep}>
        {t("keepEditing")}
      </Button>
    </div>
  );
}
