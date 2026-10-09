"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

export type RangeValue = "30" | "all";

/** "30 days" narrows the runs to the last month (`since`), "All" lifts the limit (AC-111). */
export function RangeFilter({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const t = useTranslations("eval");
  return (
    <div role="group" aria-label={t("agentView.rangeLabel")} style={{ display: "inline-flex", gap: 4 }}>
      <Button kind="ghost" size="sm" icon="Calendar" active={value === "30"} aria-pressed={value === "30"} onClick={() => onChange("30")}>
        {t("agentView.range30")}
      </Button>
      <Button kind="ghost" size="sm" active={value === "all"} aria-pressed={value === "all"} onClick={() => onChange("all")}>
        {t("agentView.rangeAll")}
      </Button>
    </div>
  );
}
