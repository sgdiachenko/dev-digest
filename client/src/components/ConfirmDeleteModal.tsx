"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";

export function ConfirmDeleteModal({
  title,
  message,
  cancelLabel,
  deleteLabel,
  deletingLabel,
  onClose,
  onConfirm,
  pending = false,
}: {
  title: string;
  message: string;
  cancelLabel: string;
  deleteLabel: string;
  deletingLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Modal
      width={520}
      title={title}
      onClose={pending ? undefined : onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>{cancelLabel}</Button>
          <Button kind="danger" onClick={onConfirm} disabled={pending}>
            {pending ? deletingLabel : deleteLabel}
          </Button>
        </div>
      }
    >
      <p style={{ margin: 0, padding: "24px", color: "var(--text-secondary)" }}>{message}</p>
    </Modal>
  );
}
