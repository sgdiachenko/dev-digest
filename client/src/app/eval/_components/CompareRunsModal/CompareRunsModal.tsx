"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal } from "@devdigest/ui";
import type { EvalRunComparison, EvalSuiteRun } from "@devdigest/shared";
import { useModalFocus } from "@/components/modal-focus";
import { fmtPct, METRIC_COLOR, METRIC_KEYS, metricLabelKey, deltaPts, type MetricKey } from "../helpers";
import { s } from "../styles";
import { orderByStart, wordDiff } from "./helpers";

type TranslateFn = ReturnType<typeof useTranslations<"eval">>;

function MetricTile({ metric, older, newer, t }: { metric: MetricKey; older: EvalSuiteRun; newer: EvalSuiteRun; t: TranslateFn }) {
  const delta = deltaPts(newer[metric], older[metric]);
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{t(`metrics.${metricLabelKey(metric)}Upper`)}</div>
      <div style={s.tileValue}>
        <span style={s.tileOld}>{fmtPct(older[metric])}</span>
        <Icon.ArrowRight size={14} aria-hidden="true" />
        <span style={{ color: METRIC_COLOR[metric] }}>{fmtPct(newer[metric])}</span>
        {delta != null && (
          <span style={{ fontSize: 13, color: delta === 0 ? "var(--text-muted)" : delta > 0 ? "var(--ok)" : "var(--crit)" }}>
            {delta === 0 ? t("metrics.changeSame") : t(delta > 0 ? "metrics.changeUp" : "metrics.changeDown", { value: Math.abs(delta) })}
          </span>
        )}
      </div>
    </div>
  );
}

function CostTile({ older, newer, t }: { older: EvalSuiteRun; newer: EvalSuiteRun; t: TranslateFn }) {
  const usd = (v: number | null) => (v == null ? t("common.dash") : t("common.costValue", { value: v.toFixed(2) }));
  const delta = older.cost_usd != null && newer.cost_usd != null ? Math.round((newer.cost_usd - older.cost_usd) * 100) / 100 : null;
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{t("common.cost")}</div>
      <div style={s.tileValue}>
        <span style={s.tileOld}>{usd(older.cost_usd)}</span>
        <Icon.ArrowRight size={14} aria-hidden="true" />
        <span>{usd(newer.cost_usd)}</span>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {delta > 0 ? "▲" : "▼"} {usd(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  );
}

/** Two runs side by side: metric tiles old -> new, the system-prompt word diff and the per-case flips. */
export function CompareRunsModal({ comparison, onClose }: { comparison: EvalRunComparison; onClose: () => void }) {
  const t = useTranslations("eval");
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useModalFocus(true, onClose, bodyRef);

  const [older, newer] = orderByStart(comparison.a, comparison.b);
  const oldV = t("common.version", { version: older.agent_version });
  const newV = t("common.version", { version: newer.agent_version });
  const { added, removed } = comparison.case_set;
  const segments = comparison.identical_config ? null : wordDiff(older.config.system_prompt, newer.config.system_prompt);
  const outcome = (o: string) => (o === "absent" ? t("compare.absent") : t(`status.${o as "pass" | "fail" | "error"}`));

  return (
    <Modal
      width={900}
      title={t("compare.title", { older: oldV, newer: newV })}
      subtitle={t("compare.subtitle")}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t("compare.close")}</Button>}
    >
      <div ref={bodyRef}>
        <div style={s.tiles}>
          {METRIC_KEYS.map((m) => (
            <MetricTile key={m} metric={m} older={older} newer={newer} t={t} />
          ))}
          <CostTile older={older} newer={newer} t={t} />
        </div>
        <div style={s.compareBody}>
          {(added.length > 0 || removed.length > 0) && (
            <div role="status" style={{ ...s.notice, ...s.noticeWarn }}>
              {t("compare.caseSetsDiffer", { added: added.length, removed: removed.length })}
            </div>
          )}

          <h3 style={s.sectionLabel}>
            <Icon.FileText size={13} /> {t("compare.promptDiff")}
          </h3>
          {segments ? (
            <>
              <div style={s.legend}>
                <span>
                  <span style={s.diffDel}>−</span> {oldV} ({t("compare.legendOld")})
                </span>
                <span>
                  <span style={s.diffAdd}>+</span> {newV} ({t("compare.legendNew")})
                </span>
              </div>
              <div style={s.diffBox} data-testid="prompt-diff">
                {segments.map((seg, i) =>
                  seg.type === "add" ? (
                    <ins key={i} style={s.diffAdd}>
                      {seg.text}
                    </ins>
                  ) : seg.type === "del" ? (
                    <del key={i} style={s.diffDel}>
                      {seg.text}
                    </del>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </div>
            </>
          ) : (
            <p style={s.notice}>{t("compare.identical")}</p>
          )}

          {comparison.flips.length > 0 && (
            <>
              <h3 style={s.sectionLabel}>{t("compare.casesTitle")}</h3>
              <table style={{ ...s.table, minWidth: 0 }}>
                <thead>
                  <tr>
                    <th style={s.th}>{t("compare.caseColumn")}</th>
                    <th style={s.th}>{t("compare.outcomeOld")}</th>
                    <th style={s.th}>{t("compare.outcomeNew")}</th>
                    <th style={s.th}>{t("compare.flip")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.flips.map((f) => (
                    <tr key={f.case_id}>
                      <td style={s.td}>{f.case_name}</td>
                      <td style={s.td}>{outcome(f.a)}</td>
                      <td style={s.td}>{outcome(f.b)}</td>
                      <td style={s.td}>
                        {f.flip === "pass_to_fail"
                          ? t("compare.flipPassToFail")
                          : f.flip === "fail_to_pass"
                            ? t("compare.flipFailToPass")
                            : t("compare.flipNone")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
