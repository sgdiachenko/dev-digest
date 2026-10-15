"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { s } from "./styles";

/**
 * "Updated 14:05" from the response's `as_of`, or the refresh-failed banner with a Retry.
 * A polite live region that never moves focus (NFR-14); it stays mounted so changes are announced.
 */
export function UpdatedStatus({
  asOf,
  refreshFailed,
  onRetry,
  timeZone,
}: {
  asOf: string | null;
  refreshFailed: boolean;
  onRetry: () => void;
  timeZone?: string;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const time = asOf ? f.time(asOf, timeZone) : null;
  return (
    <span role="status" aria-live="polite" style={s.region}>
      {time != null && refreshFailed && (
        <>
          <span style={s.failed}>{t("states.refreshFailed", { time })}</span>
          <Button size="sm" kind="ghost" onClick={onRetry}>
            {t("states.retry")}
          </Button>
        </>
      )}
      {time != null && !refreshFailed && <span>{t("states.updated", { time })}</span>}
    </span>
  );
}
