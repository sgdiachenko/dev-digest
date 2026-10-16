"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerfRow } from "@devdigest/shared";
import { CostLabel } from "@/components/agent-stats";
import type { Period } from "@/lib/agent-stats";
import { AgentRow } from "./_components/AgentRow";
import { SortHeader } from "./_components/SortHeader";
import { COLUMNS } from "./constants";
import { capRows, DEFAULT_SORT, defaultDir, sortAgentRows, type SortDir, type SortKey } from "./helpers";
import { s } from "./styles";

/**
 * Per-agent table. Sorting and expanding are local state (no requests); a `pending` table shows
 * disabled headers and no rows.
 */
export function AgentsTable({
  rows,
  asOf,
  period,
  pending = false,
}: {
  rows: AgentPerfRow[];
  asOf: string;
  period: Period;
  pending?: boolean;
}) {
  const t = useTranslations("agentPerformance");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: SortDir }>(DEFAULT_SORT);
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());

  const onSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }));
  const onToggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const { shown, total } = capRows(sortAgentRows(rows, sort.key, sort.dir));
  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <SortHeader
                key={c.key}
                label={t(`dashboard.table.${c.label}`)}
                dir={sort.key === c.key ? sort.dir : null}
                disabled={pending}
                onSort={() => onSort(c.key)}
                extra={c.key === "avg_cost" ? <CostLabel /> : undefined}
              />
            ))}
            <th scope="col" style={s.viewTh}>
              <span style={s.hidden}>{t("dashboard.table.view")}</span>
            </th>
          </tr>
        </thead>
        {!pending && (
          <tbody>
            {shown.map((row) => {
              const id = row.agent_id ?? "deleted";
              return (
                <AgentRow
                  key={id}
                  row={row}
                  asOf={asOf}
                  period={period}
                  expanded={open.has(id)}
                  onToggle={() => onToggle(id)}
                />
              );
            })}
          </tbody>
        )}
      </table>
      {total > shown.length && <p style={s.cap}>{t("dashboard.table.cap", { count: total })}</p>}
    </div>
  );
}
