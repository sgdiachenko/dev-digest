/* DuplicateWarning — a case from this finding already exists; informational, never blocks Save (AC-153, AC-154). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";

export function DuplicateWarning({ agentId, name }: { agentId: string; name: string }) {
  const t = useTranslations("eval.modal");
  return (
    <div role="note" style={{ ...s.warning, margin: "12px 16px 0" }}>
      <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden />
      <span>{t("duplicateWarning", { name })}</span>
      <Link href={`/agents/${agentId}?tab=evals`} style={s.link}>
        {t("duplicateLink", { name })}
      </Link>
    </div>
  );
}
