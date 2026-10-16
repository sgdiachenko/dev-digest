"use client";

import { useTranslations } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import { ShareDonut } from "../../../../../../../../../../components/agent-stats";
import { s } from "./styles";

/** Finding categories as a count donut (no currency sign): five largest plus "Other", legend with counts and shares. */
export function FindingsByCategoryPanel({
  categories,
  periodLabel,
}: {
  categories: SkillStats["by_category"];
  periodLabel: string;
}) {
  const t = useTranslations("skills");
  const title = t("stats.findingsByCategory", { period: periodLabel });
  const entries = categories.map((c) => ({ key: c.category, label: c.category, value: c.count }));
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  return (
    <section style={s.panel} aria-label={title}>
      <h2 style={s.title}>{title}</h2>
      <ShareDonut entries={entries} mode="count" total={total} emptyText={t("stats.noFindings")} />
    </section>
  );
}
