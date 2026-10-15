"use client";

import { useTranslations } from "next-intl";
import type { SeverityBucketCount } from "@devdigest/shared";
import { HoverHint } from "../../../../../../../../../components/agent-stats";
import type { TrendUnit } from "../../../../../../../../../lib/agent-stats/period";
import { useStatsFormat } from "../../../../../../../../../lib/agent-stats/useStatsFormat";
import { bucketEnd, bucketLabel, bucketTotal, maxBucketTotal } from "../../helpers";
import { BAR_HEIGHT, barWidth, s } from "./styles";

const SEGMENTS = [
  { key: "CRITICAL", color: "var(--crit)", label: "critical" },
  { key: "WARNING", color: "var(--warn)", label: "warning" },
  { key: "SUGGESTION", color: "var(--sugg)", label: "suggestion" },
] as const;

/** One stacked bar per bucket; each bar is focusable and spells out its dates and counts (AC-152, AC-153). */
export function FindingsBySeverity({
  buckets,
  periodTo,
  unit,
  timeZone,
}: {
  buckets: SeverityBucketCount[];
  periodTo: string;
  unit: TrendUnit;
  timeZone?: string;
}) {
  const t = useTranslations("agentPerformance");
  const f = useStatsFormat();
  const max = maxBucketTotal(buckets);
  const fmt = { date: (iso: string) => f.date(iso, timeZone), dateTime: (iso: string) => f.dateTime(iso, timeZone) };

  return (
    <section style={s.panel} aria-label={t("stats.severity.title")}>
      <h2 style={s.title}>{t("stats.severity.title")}</h2>
      {max === 0 ? (
        <p style={s.empty}>{t("stats.noFindings")}</p>
      ) : (
        <>
          <div style={s.bars}>
            {buckets.map((b, i) => {
              const text = t("stats.severity.bar", {
                bucket: bucketLabel(b.bucket_start, bucketEnd(buckets, i, periodTo), unit, fmt),
                critical: f.count(b.CRITICAL),
                warning: f.count(b.WARNING),
                suggestion: f.count(b.SUGGESTION),
              });
              return (
                <div key={b.bucket_start} style={s.slot}>
                  <HoverHint text={text}>
                    {(target) => (
                      <div
                        role="img"
                        tabIndex={0}
                        aria-label={text}
                        style={s.bar(barWidth(buckets.length), Math.max(2, Math.round((bucketTotal(b) / max) * BAR_HEIGHT)))}
                        {...target}
                      >
                        {SEGMENTS.map((seg) => (
                          <div
                            key={seg.key}
                            style={s.segment(seg.color, bucketTotal(b) === 0 ? 0 : (b[seg.key] / bucketTotal(b)) * 100)}
                          />
                        ))}
                      </div>
                    )}
                  </HoverHint>
                </div>
              );
            })}
          </div>
          <ul style={s.legend}>
            {SEGMENTS.map((seg) => (
              <li key={seg.key} style={s.legendItem}>
                <span aria-hidden="true" style={s.swatch(seg.color)} />
                {t(`stats.severity.${seg.label}`)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
