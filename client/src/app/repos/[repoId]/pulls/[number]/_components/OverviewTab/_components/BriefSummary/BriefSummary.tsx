/* BriefSummary — the AI-written "why" summary, labelled as AI-generated and
   rendered as plain text (no HTML / markdown interpretation). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";

export function BriefSummary({ summary }: { summary: string }) {
  const t = useTranslations("brief");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Sparkles">
          {t("card.aiLabel")}
        </Badge>
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
        {summary}
      </p>
    </div>
  );
}
