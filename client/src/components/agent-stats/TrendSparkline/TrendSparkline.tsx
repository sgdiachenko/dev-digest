"use client";

import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import type { TrendUnit } from "../../../lib/agent-stats/period";

/** The vendored sparkline inside `role="img"` with a text equivalent of its range (NFR-13). */
export function TrendSparkline({
  data,
  kind,
  unit = "day",
  color,
  w = 120,
  h = 28,
}: {
  data: number[];
  kind: "runs" | "durations";
  unit?: TrendUnit;
  color?: string;
  w?: number;
  h?: number;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const label =
    kind === "runs"
      ? t("charts.runsSummary", { unit: t(`charts.units.${unit}`), min: f.count(min), max: f.count(max) })
      : t("charts.durationsSummary", { min: f.seconds(min), max: f.seconds(max) });
  // The vendored line divides by (length - 1): give a lone point a flat line.
  const points = data.length === 1 ? [data[0]!, data[0]!] : data;
  return (
    <span role="img" aria-label={label} style={{ display: "inline-block" }}>
      <Sparkline data={points} color={color} w={w} h={h} />
    </span>
  );
}
