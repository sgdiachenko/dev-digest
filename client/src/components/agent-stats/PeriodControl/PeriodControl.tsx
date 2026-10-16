"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import {
  PERIOD_OPTIONS,
  resolveCustomRange,
  resolvePreset,
  validateCustomRange,
  type Period,
  type PeriodOption,
} from "../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../lib/agent-stats/useStatsFormat";
import { displayEnd, initialDates } from "./helpers";
import { s } from "./styles";

/** Period buttons (1 day / 30 days / Custom range) with inline date fields; no dialog (NFR-16). */
export function PeriodControl({
  period,
  notice = false,
  serverInvalid = false,
  onSelect,
  timeZone,
}: {
  period: Period;
  notice?: boolean;
  serverInvalid?: boolean;
  onSelect: (next: Period) => void;
  timeZone?: string;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const reasonId = React.useId();
  const [customOpen, setCustomOpen] = React.useState(period.option === "custom");
  const [dates, setDates] = React.useState(() => initialDates(period));
  // Today is only used to validate the typed range, never to build a query key (C15).
  const [today] = React.useState(() => new Date());

  const check = validateCustomRange(dates.start, dates.end, today);
  const reason = check.ok ? null : t(`period.reasons.${check.reason}`);

  const pick = (option: PeriodOption) => {
    if (option === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onSelect(resolvePreset(option, Date.now()));
  };

  const apply = () => {
    const next = resolveCustomRange(dates.start, dates.end);
    if (check.ok && next) onSelect(next);
  };

  return (
    <div style={s.wrap}>
      <div style={s.row} role="group" aria-label={t("period.label")}>
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option}
            size="sm"
            active={option === "custom" ? customOpen || period.option === "custom" : !customOpen && period.option === option}
            aria-pressed={option === "custom" ? customOpen || period.option === "custom" : !customOpen && period.option === option}
            onClick={() => pick(option)}
          >
            {t(`period.options.${option}`)}
          </Button>
        ))}
        <span className="tnum" style={s.resolved}>
          {t("period.resolved", { from: f.date(period.from, timeZone), to: f.date(displayEnd(period), timeZone) })}
        </span>
      </div>
      {customOpen && (
        <div style={s.row}>
          <label style={s.field}>
            {t("period.start")}
            <input
              type="date"
              style={s.input}
              value={dates.start}
              max={dates.end || undefined}
              onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))}
            />
          </label>
          <label style={s.field}>
            {t("period.end")}
            <input
              type="date"
              style={s.input}
              value={dates.end}
              min={dates.start || undefined}
              onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))}
            />
          </label>
          <Button size="sm" kind="primary" disabled={!check.ok} aria-describedby={reason ? reasonId : undefined} onClick={apply}>
            {t("period.apply")}
          </Button>
          {reason && (
            <span id={reasonId} style={s.reason}>
              {reason}
            </span>
          )}
        </div>
      )}
      {notice && <p style={s.notice}>{t("period.linkInvalid")}</p>}
      {serverInvalid && <p style={s.error}>{t("period.serverInvalid")}</p>}
    </div>
  );
}
