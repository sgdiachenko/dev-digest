"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AgentPerfRow } from "@devdigest/shared";
import { HoverHint, TruncatedName } from "@/components/agent-stats";
import { periodSearchParams, useStatsFormat, type Period } from "@/lib/agent-stats";
import { COLUMN_COUNT } from "../../constants";
import { AcceptCell } from "../AcceptCell";
import { RowExpansion } from "../RowExpansion";
import { s } from "./styles";

/** The View link carries the screen's period; ids and numbers only, query values via URLSearchParams (C17). */
function viewHref(agentId: string, period: Period): string {
  const qs = periodSearchParams(new URLSearchParams({ tab: "stats" }), period).toString();
  return `/agents/${encodeURIComponent(agentId)}?${qs}`;
}

/** One agent row plus its expansion row; the Deleted agent has no View link. */
export function AgentRow({
  row,
  asOf,
  period,
  expanded,
  onToggle,
}: {
  row: AgentPerfRow;
  asOf: string;
  period: Period;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const name = row.agent_name ?? t("charts.deletedAgent");
  return (
    <>
      <tr>
        <td style={s.td}>
          <div style={s.nameCell}>
            <button
              type="button"
              style={s.expand}
              aria-expanded={expanded}
              aria-label={t(expanded ? "dashboard.table.collapse" : "dashboard.table.expand", { agent: name })}
              onClick={onToggle}
            >
              <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
            </button>
            <TruncatedName name={name} />
          </div>
        </td>
        <td className="tnum" style={s.td}>
          {f.count(row.runs)}
        </td>
        <td className="tnum" style={s.td}>
          {f.avgUsd(row.avg_cost_usd)}
        </td>
        <td className="tnum" style={s.td}>
          {f.seconds(row.avg_duration_ms)}
        </td>
        <td style={s.td}>
          <AcceptCell row={row} />
        </td>
        <td style={s.td}>
          {row.last_run_at ? (
            <HoverHint text={f.dateTime(row.last_run_at)}>
              {(target) => (
                <span tabIndex={0} style={s.lastRun} {...target}>
                  {f.relative(row.last_run_at!, asOf)}
                </span>
              )}
            </HoverHint>
          ) : (
            <span style={s.muted}>{t("dashboard.table.never")}</span>
          )}
        </td>
        <td style={s.td}>
          {row.agent_id !== null && (
            <Link href={viewHref(row.agent_id, period)} style={s.link} aria-label={t("dashboard.table.viewLabel", { agent: name })}>
              {t("dashboard.table.view")}
            </Link>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={COLUMN_COUNT} style={s.expansionTd}>
            <RowExpansion runs={row.last_runs} />
          </td>
        </tr>
      )}
    </>
  );
}
