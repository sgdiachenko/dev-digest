/* GroupedFindings — each finding group of 2+ findings as one entry that lists
   every member's agent label and original title. A member opens the original
   finding. Titles are plain text, truncated with an ellipsis. */
"use client";

import { useTranslations } from "next-intl";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { agentLabel, groupMembers, lineRange } from "../../helpers";
import { s } from "./styles";

export function GroupedFindings({
  groups,
  columns,
  onOpenFinding,
}: {
  groups: FindingGroup[];
  columns: AgentColumn[];
  onOpenFinding: (runId: string, findingId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const shared = groups.filter((g) => g.finding_ids.length >= 2);

  return (
    <section style={s.root} aria-labelledby="grouped-findings-heading">
      <h2 id="grouped-findings-heading" style={s.heading}>
        {t("grouped.heading")}
      </h2>
      {shared.length === 0 ? (
        <p style={s.empty}>{t("grouped.empty")}</p>
      ) : (
        <ul style={s.list}>
          {shared.map((g) => (
            <li key={g.id} style={s.group}>
              <span style={s.where}>{t("grouped.lines", { file: g.file, lines: lineRange(g.start_line, g.end_line) })}</span>
              <ul style={s.members}>
                {groupMembers(g, columns).map(({ column, finding }) => (
                  <li key={finding.id}>
                    <button type="button" style={s.member} onClick={() => onOpenFinding(column.run_id, finding.id)}>
                      <span style={s.agent}>{agentLabel(column, t)}</span>
                      <span style={s.title} title={finding.title}>
                        {finding.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
