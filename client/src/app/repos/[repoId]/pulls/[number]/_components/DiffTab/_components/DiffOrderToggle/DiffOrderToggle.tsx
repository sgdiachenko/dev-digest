/* DiffOrderToggle — Smart / Original order switch (D7). A two-button
   role="group", each with aria-pressed reflecting the active order. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { DiffOrder } from "../../helpers";

export function DiffOrderToggle({
  order,
  onChange,
  disabled,
}: {
  order: DiffOrder;
  onChange: (order: DiffOrder) => void;
  /** D10: disabled while Smart Diff is loading or failed — Original order
   *  is shown and the switch can't turn Smart order on. */
  disabled?: boolean;
}) {
  const t = useTranslations("prReview");
  return (
    <div
      role="group"
      aria-label={t("smartDiff.orderGroupLabel")}
      title={disabled ? t("smartDiff.unavailable") : undefined}
      style={{ display: "inline-flex", gap: 4 }}
    >
      <Button
        kind={order === "smart" ? "tertiary" : "ghost"}
        active={order === "smart"}
        size="sm"
        disabled={disabled}
        aria-pressed={order === "smart"}
        onClick={() => onChange("smart")}
      >
        {t("smartDiff.smartOrder")}
      </Button>
      <Button
        kind={order === "original" ? "tertiary" : "ghost"}
        active={order === "original"}
        size="sm"
        disabled={disabled}
        aria-pressed={order === "original"}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
