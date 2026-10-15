"use client";

import { useTranslations } from "next-intl";
import { acceptArrow, acceptLevel } from "../../../lib/agent-stats/accept";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { AcceptRing } from "../AcceptRing";
import { LEVEL_COLOR } from "../AcceptRing/styles";
import { KpiCard } from "../KpiCard";
import { s } from "./styles";

/** Accept rate: ring, whole percent, "x of y decided · z pending", small-sample note, optional arrow. */
export function AcceptKpiCard({
  label,
  rate,
  smallSample,
  accepted,
  dismissed,
  pending,
  previousRate = null,
  previousSmallSample = false,
}: {
  label: string;
  rate: number | null;
  smallSample: boolean;
  accepted: number;
  dismissed: number;
  pending: number;
  previousRate?: number | null;
  previousSmallSample?: boolean;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const decided = accepted + dismissed;
  const color = LEVEL_COLOR[acceptLevel(rate, smallSample)];
  const arrow = acceptArrow(rate, smallSample, previousRate, previousSmallSample);
  return (
    <KpiCard label={label} aside={<AcceptRing rate={rate} smallSample={smallSample} />}>
      <span className="tnum" style={{ ...s.value, color }}>
        {f.percent(rate)}
      </span>
      <span style={s.line}>
        {decided === 0
          ? t("accept.zeroDecided")
          : t("accept.decidedLine", {
              accepted: f.count(accepted),
              decided: f.count(decided),
              pending: f.count(pending),
            })}
      </span>
      {smallSample && decided > 0 && <span style={s.note}>{t("accept.smallSample")}</span>}
      {arrow && (
        <span style={s.note}>
          {arrow.direction === "up" ? "↑ " : "↓ "}
          {t(arrow.direction === "up" ? "accept.up" : "accept.down", { points: arrow.points })}
        </span>
      )}
    </KpiCard>
  );
}
