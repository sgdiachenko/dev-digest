"use client";

import { useTranslations } from "next-intl";
import type { AgentPerfRow } from "@devdigest/shared";
import { HoverHint } from "@/components/agent-stats";
import { LEVEL_COLOR } from "@/components/agent-stats/AcceptRing/styles";
import { acceptArrow, acceptLevel, useStatsFormat } from "@/lib/agent-stats";
import { s } from "./styles";

/**
 * Accept rate with its evidence ("78% · 39/50", or "60% · 5/10 decisions — small sample"), the
 * accepted / dismissed / pending breakdown on hover and focus, and the arrow vs the previous period.
 */
export function AcceptCell({ row }: { row: AgentPerfRow }) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const decided = row.accepted + row.dismissed;
  const color = LEVEL_COLOR[acceptLevel(row.accept_rate, row.small_sample)];
  const arrow = acceptArrow(row.accept_rate, row.small_sample, row.previous_accept_rate, row.previous_small_sample);

  if (row.accept_rate == null) {
    return (
      <span style={s.wrap}>
        <span style={{ color }}>{f.percent(null)}</span>
        <span style={s.muted}>{t("accept.zeroDecided")}</span>
      </span>
    );
  }

  const text = t(row.small_sample ? "accept.smallSampleCell" : "accept.cell", {
    percent: f.percent(row.accept_rate),
    accepted: f.count(row.accepted),
    decided: f.count(decided),
  });
  const breakdown = t("accept.breakdown", {
    accepted: f.count(row.accepted),
    dismissed: f.count(row.dismissed),
    pending: f.count(row.pending),
  });
  return (
    <HoverHint text={breakdown}>
      {(target) => (
        <span tabIndex={0} className="tnum" style={{ ...s.wrap, color }} {...target}>
          <span>{text}</span>
          {arrow && (
            <span
              role="img"
              aria-label={t(arrow.direction === "up" ? "accept.up" : "accept.down", { points: arrow.points })}
              style={arrow.direction === "up" ? s.arrowUp : s.arrowDown}
            >
              {arrow.direction === "up" ? "↑" : "↓"}
            </span>
          )}
        </span>
      )}
    </HoverHint>
  );
}
