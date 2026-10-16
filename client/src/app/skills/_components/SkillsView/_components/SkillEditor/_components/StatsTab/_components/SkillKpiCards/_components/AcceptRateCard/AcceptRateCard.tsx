"use client";

import { useTranslations } from "next-intl";
import { AcceptRing, AcceptText } from "../../../../../../../../../../../../components/agent-stats";
import { useStatsFormat } from "../../../../../../../../../../../../lib/agent-stats/useStatsFormat";
import { SkillKpiCard } from "../SkillKpiCard";
import { s } from "./styles";

/** Accept rate: ring + coloured percent + "x of y decided · z pending"; a null rate shows "—", "0 decided" and no ring colour. */
export function AcceptRateCard({
  periodLabel,
  rate,
  smallSample,
  accepted,
  dismissed,
  pending,
}: {
  periodLabel: string;
  rate: number | null;
  smallSample: boolean;
  accepted: number;
  dismissed: number;
  pending: number;
}) {
  const t = useTranslations("skills");
  const tp = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const decided = accepted + dismissed;
  return (
    <SkillKpiCard
      label={t("stats.acceptRate", { period: periodLabel })}
      aside={<AcceptRing rate={rate} smallSample={smallSample} />}
    >
      <span className="tnum" style={s.value}>
        <AcceptText rate={rate} smallSample={smallSample} />
      </span>
      <span style={s.line}>
        {decided === 0
          ? tp("accept.zeroDecided")
          : tp("accept.decidedLine", {
              accepted: f.count(accepted),
              decided: f.count(decided),
              pending: f.count(pending),
            })}
      </span>
    </SkillKpiCard>
  );
}
