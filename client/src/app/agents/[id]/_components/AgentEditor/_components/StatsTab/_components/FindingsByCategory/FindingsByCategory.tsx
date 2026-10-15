"use client";

import { useTranslations } from "next-intl";
import type { FindingCategoryCount } from "@devdigest/shared";
import { ShareDonut } from "../../../../../../../../../components/agent-stats";
import { s } from "./styles";

/** Finding categories as a count donut (no currency); the donut shows the five largest plus Other (AC-154). */
export function FindingsByCategory({ categories }: { categories: FindingCategoryCount[] }) {
  const t = useTranslations("agentPerformance");
  const entries = categories.map((c) => ({ key: c.category, label: c.category, value: c.count }));
  const total = categories.reduce((sum, c) => sum + c.count, 0);
  return (
    <section style={s.panel} aria-label={t("stats.category.title")}>
      <h2 style={s.title}>{t("stats.category.title")}</h2>
      <ShareDonut entries={entries} mode="count" total={total} emptyText={t("stats.noFindings")} />
    </section>
  );
}
