"use client";

import { useTranslations } from "next-intl";
import type { ConventionScan } from "@devdigest/shared";
import { relativeTime } from "../../helpers";
import { s } from "./styles";

/**
 * "Detected from N sample files · last scan 1h ago" + the gate's drop
 * counters — a short board should read as "the gate worked", not "the
 * feature is broken" (grading: scan.proposed vs. the dropped_* columns).
 */
export function ScanSummary({ scan }: { scan: ConventionScan }) {
  const t = useTranslations("conventions");
  const dropped =
    scan.dropped_ungrounded + scan.dropped_unsupported + scan.dropped_duplicate + scan.dropped_existing_skill + scan.dropped_category_cap;

  return (
    <div style={s.wrap}>
      <div>
        {t("scan.sampledFiles", { count: scan.sampled_files.length })} · {t("scan.lastScan", { time: relativeTime(scan.started_at) })}
      </div>
      {scan.status === "done" && (
        <div style={s.counters}>
          {t("scan.counters", {
            proposed: scan.proposed,
            fromConfig: scan.from_config,
            dropped,
          })}
        </div>
      )}
      {scan.status === "failed" && scan.error && <div style={s.counters}>{t("scan.failed", { error: scan.error })}</div>}
    </div>
  );
}
