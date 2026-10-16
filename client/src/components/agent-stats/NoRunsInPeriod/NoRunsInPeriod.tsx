"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PeriodOption } from "../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { s } from "./styles";

/** "No runs in this period · last run {date}" with a way back to the last 30 days (hidden when already there). */
export function NoRunsInPeriod({
  lastRunAt,
  option,
  onShowLast30,
  timeZone,
}: {
  lastRunAt: string;
  option: PeriodOption;
  onShowLast30?: () => void;
  timeZone?: string;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  return (
    <div style={s.wrap}>
      <span>{t("states.noRunsInPeriod", { date: f.date(lastRunAt, timeZone) })}</span>
      {option !== "30d" && onShowLast30 && (
        <Button size="sm" onClick={onShowLast30}>
          {t("states.showLast30")}
        </Button>
      )}
    </div>
  );
}
