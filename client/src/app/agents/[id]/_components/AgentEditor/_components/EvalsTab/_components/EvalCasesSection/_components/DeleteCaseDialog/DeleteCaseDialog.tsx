/* DeleteCaseDialog — confirms deleting an eval case: names it and says its per-case history goes while
   recorded run metrics stay (AC-64). Focus is kept inside by `useModalFocus` (NFR-9). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useModalFocus } from "@/components/modal-focus";

export function DeleteCaseDialog({
  name,
  pending,
  failed,
  onConfirm,
  onCancel,
}: {
  name: string;
  pending: boolean;
  failed: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("eval");
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useModalFocus(true, onCancel, bodyRef);

  return (
    <Modal
      width={460}
      title={t("casesSection.deleteTitle")}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button kind="danger" icon="Trash" loading={pending} onClick={onConfirm}>
            {t("casesSection.deleteAction")}
          </Button>
        </div>
      }
    >
      <div ref={bodyRef} style={{ padding: "18px 24px", fontSize: 14, lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}>{t("casesSection.deleteConfirm", { name })}</p>
        {failed && (
          <p role="alert" style={{ margin: "10px 0 0", color: "var(--crit)", fontSize: 13 }}>
            {t("errors.deleteFailed")}
          </p>
        )}
      </div>
    </Modal>
  );
}
