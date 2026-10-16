"use client";

import { PieChart, Pie, Cell } from "recharts";
import { useTranslations } from "next-intl";
import type { ShareEntry } from "../../../lib/agent-stats/breakdown";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { TruncatedName } from "../TruncatedName";
import { buildRows, type DonutRow } from "./helpers";
import { PALETTE, s } from "./styles";

const SIZE = 130;
const STROKE = 22;

/** Ring plus a text legend (label, amount, share %); the ring is decoration, the legend is the data (NFR-13). */
export function ShareDonut({
  entries,
  mode,
  total,
  emptyText,
}: {
  entries: ShareEntry[];
  mode: "usd" | "count";
  total: number;
  emptyText: string;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  if (entries.length === 0 || total <= 0) return <p style={s.empty}>{emptyText}</p>;

  const rows = buildRows(entries, mode, total, t("charts.other"));
  const amountText = (row: DonutRow): string => {
    if (mode === "count") return f.count(row.value);
    // A positive cost that rounds to zero cents is never shown as $0.00 (AC-135).
    if (row.cents === 0 && row.value > 0) return t("cost.lessThan", { amount: f.totalUsd(0.01) });
    return f.totalUsd((row.cents ?? 0) / 100);
  };

  return (
    <div style={s.wrap}>
      <div aria-hidden="true">
        <PieChart width={SIZE} height={SIZE}>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={(SIZE - STROKE) / 2 - STROKE / 2}
            outerRadius={(SIZE - STROKE) / 2 + STROKE / 2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            stroke="none"
          >
            {rows.map((row, i) => (
              <Cell key={row.key} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <ul style={s.legend}>
        {rows.map((row, i) => (
          <li key={row.key} style={s.row}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: PALETTE[i % PALETTE.length] }} />
            <span style={s.label}>
              <TruncatedName name={row.label} />
            </span>
            <span className="mono tnum" style={s.value}>
              {amountText(row)}
            </span>
            <span className="tnum" style={s.share}>
              {f.percent(row.sharePct / 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
