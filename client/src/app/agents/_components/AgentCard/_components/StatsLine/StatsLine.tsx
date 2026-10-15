/* StatsLine — "13 runs · 76% accept · $0.038 avg" from the agent's 30-day dashboard row (AC-165 – AC-167). */
"use client";

import { useTranslations } from "next-intl";
import type { AgentPerfRow } from "@devdigest/shared";
import { HoverHint } from "../../../../../../components/agent-stats";
import { acceptLevel } from "../../../../../../lib/agent-stats/accept";
import { useStatsFormat } from "../../../../../../lib/agent-stats/useStatsFormat";
import { s } from "./styles";

const SEPARATOR = " · ";

export function StatsLine({ row }: { row: AgentPerfRow }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();

  if (row.runs === 0) {
    return <div style={s.line}>{t("card.noRuns")}</div>;
  }

  const showsPercent = row.accept_rate != null && !row.small_sample;
  return (
    <div style={s.line}>
      <span>{t("card.runs", { count: row.runs })}</span>
      <span aria-hidden="true">{SEPARATOR}</span>
      {showsPercent ? (
        <span className="tnum" style={s.accept(acceptLevel(row.accept_rate, false))}>
          {t("card.accept", { percent: f.percent(row.accept_rate) })}
        </span>
      ) : (
        <span>{row.accept_rate == null ? t("card.noAccept") : t("card.smallSample")}</span>
      )}
      <span aria-hidden="true">{SEPARATOR}</span>
      <HoverHint text={t("cost.label")}>
        {(target) => (
          <span tabIndex={0} className="tnum" style={s.avg} {...target}>
            {t("card.avg", { amount: f.avgUsd(row.avg_cost_usd) })}
          </span>
        )}
      </HoverHint>
    </div>
  );
}
