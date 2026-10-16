"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PeriodOption } from "../../../../../../../../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../../../../../../../../lib/agent-stats/useStatsFormat";
import { s } from "./styles";

/**
 * The two empty states: "No usage yet" (no agent linked, no skill run) and "No runs used this skill in this
 * period" (agents linked, none used it) with "last used <date>" or "not used yet", and a way back to 30 days.
 */
export function SkillUsageEmpty({
  kind,
  lastUsedAt,
  option,
  onShowLast30,
  timeZone,
}: {
  kind: "noUsage" | "noRuns";
  lastUsedAt: string | null;
  option: PeriodOption;
  onShowLast30: () => void;
  timeZone?: string;
}) {
  const t = useTranslations("skills");
  const tp = useTranslations("agentPerformance");
  const f = useStatsFormat();
  if (kind === "noUsage") return <p style={s.wrap}>{t("stats.noUsage")}</p>;
  return (
    <div style={s.wrap}>
      <span>
        {lastUsedAt ? t("stats.noRunsInPeriod", { date: f.date(lastUsedAt, timeZone) }) : t("stats.notUsedYet")}
      </span>
      {option !== "30d" && (
        <Button size="sm" onClick={onShowLast30}>
          {tp("states.showLast30")}
        </Button>
      )}
    </div>
  );
}
