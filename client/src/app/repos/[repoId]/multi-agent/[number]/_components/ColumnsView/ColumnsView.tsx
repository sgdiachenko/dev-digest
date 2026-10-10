/* ColumnsView — one AgentColumnCard per member run, plus a single polite
   aria-live region that announces the column statuses as they change. */
"use client";

import { useTranslations } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import { AgentColumnCard } from "../AgentColumnCard";
import { agentLabel } from "../../helpers";
import { s } from "./styles";

export function ColumnsView({
  columns,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const summary = columns
    .map((c) => t("live.item", { name: agentLabel(c, t), status: t(`status.${c.status}`) }))
    .join(". ");

  return (
    <div>
      <div role="status" aria-live="polite" style={s.live}>
        {summary}
      </div>
      <div style={s.grid}>
        {columns.map((c) => (
          <AgentColumnCard key={c.run_id} column={c} onOpenTrace={onOpenTrace} />
        ))}
      </div>
    </div>
  );
}
