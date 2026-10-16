"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

/** Error title, the reason and a catalog "Retry" (the vendored ErrorState hardcodes its label). */
export function StatsErrorPanel({
  title,
  reason,
  onRetry,
}: {
  title: string;
  reason?: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations("agentPerformance");
  return (
    <div role="alert" style={s.panel}>
      <span style={s.title}>{title}</span>
      {reason && <span style={s.reason}>{reason}</span>}
      <Button size="sm" onClick={onRetry}>
        {t("states.retry")}
      </Button>
    </div>
  );
}
