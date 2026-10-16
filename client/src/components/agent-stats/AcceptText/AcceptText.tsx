"use client";

import { useTranslations } from "next-intl";
import { acceptLevel } from "../../../lib/agent-stats/accept";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { LEVEL_COLOR } from "../AcceptRing/styles";
import { s } from "./styles";

/** Coloured whole percent; a small sample is grey and says so in words (NFR-12). */
export function AcceptText({ rate, smallSample }: { rate: number | null; smallSample: boolean }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  return (
    <span className="tnum" style={{ color: LEVEL_COLOR[acceptLevel(rate, smallSample)], fontWeight: 600 }}>
      {f.percent(rate)}
      {smallSample && rate != null && <span style={s.note}>{t("accept.smallSample")}</span>}
    </span>
  );
}
