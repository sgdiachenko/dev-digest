"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LastRun } from "@devdigest/shared";
import { TrendSparkline } from "@/components/agent-stats";
import { useStatsFormat } from "@/lib/agent-stats";
import { meanOf } from "../../helpers";
import { s } from "./styles";

/**
 * The agent's last runs (at most 5): a duration sparkline with a caption, or a text for 0 or 1 run.
 * With `href` (not the Deleted agent) the sparkline opens that agent's Stats tab.
 */
export function RowExpansion({ runs, href, agentName }: { runs: LastRun[]; href?: string; agentName: string }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  if (runs.length === 0) return <div style={s.wrap}><span style={s.caption}>{t("dashboard.expansion.noRuns")}</span></div>;
  if (runs.length === 1) return <div style={s.wrap}><span style={s.caption}>{t("dashboard.expansion.oneRun")}</span></div>;
  const durations = runs.flatMap((r) => (r.duration_ms == null ? [] : [r.duration_ms]));
  return (
    <div style={s.wrap}>
      {href ? (
        <Link href={href} style={s.chartLink} aria-label={t("dashboard.expansion.chartLink", { agent: agentName })}>
          <TrendSparkline data={durations} kind="durations" w={150} h={34} />
        </Link>
      ) : (
        <TrendSparkline data={durations} kind="durations" w={150} h={34} />
      )}
      <span className="tnum" style={s.caption}>
        {t("dashboard.expansion.caption", {
          count: runs.length,
          duration: f.seconds(meanOf(durations)),
          cost: f.avgUsd(meanOf(runs.map((r) => r.cost_usd))),
        })}
      </span>
    </div>
  );
}
