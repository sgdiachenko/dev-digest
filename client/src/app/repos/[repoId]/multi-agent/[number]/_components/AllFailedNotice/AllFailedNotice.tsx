/* AllFailedNotice — shown instead of the findings views when every member run
   failed: the group message plus each column's error (plain text). */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { TruncatedText } from "@/components/truncated-text/TruncatedText";
import { agentLabel } from "../../helpers";
import { s } from "./styles";

export function AllFailedNotice({
  columns,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentResults");
  return (
    <div role="alert" style={s.root}>
      <h2 style={s.title}>{t("allFailed.title")}</h2>
      <p style={s.body}>{t("allFailed.body")}</p>
      <ul style={s.list}>
        {columns.map((c) => (
          <li key={c.run_id} style={s.item}>
            <span style={s.agent}>{agentLabel(c, t)}</span>
            <span style={s.error}>{c.error ? <TruncatedText text={c.error} /> : null}</span>
            <Button kind="ghost" size="sm" onClick={() => onOpenTrace(c.run_id)}>
              {t("viewTrace")}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
