/* AgentPicker — the multi-agent section of the Run Review popover: pick 2+
   agents, run them as one parallel group. Checking a box only changes the
   selection; nothing runs until the "Run multi-agent review" button. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentRunEstimates, useStartGroup } from "@/lib/hooks/multi-agent";
import { formatSeconds } from "@/lib/format";
import { estimateOf } from "@/lib/multi-agent";
import { TruncatedText } from "@/components/truncated-text/TruncatedText";
import { s } from "./styles";

export function AgentPicker({
  prId,
  repoId,
  prNumber,
  agents,
  loading,
  onRunAgent,
}: {
  prId: string;
  repoId: string;
  prNumber: number;
  agents: Agent[];
  loading: boolean;
  /** Run one agent on its own (the row's run button). */
  onRunAgent: (agentId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const { data: estimates } = useAgentRunEstimates();
  const [selected, setSelected] = React.useState<string[]>([]);

  // Only enabled agents that still exist count as checked.
  const checked = selected.filter((id) => agents.some((a) => a.id === id && a.enabled));
  const { reason, blocked, groupRunning, resultsHref, isPending, error, conflict, start } = useStartGroup({
    repoId,
    prId,
    prNumber,
    checked,
    loading,
  });

  const toggle = (id: string, value: boolean) =>
    setSelected((prev) => (value ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)));

  return (
    <div style={s.root}>
      <div style={s.head}>
        <span style={s.heading}>{t("picker.heading")}</span>
        <button type="button" style={s.clear} onClick={() => setSelected([])}>
          {t("picker.clear")}
        </button>
      </div>
      {agents.map((a) => {
        const e = estimateOf(estimates, a.id);
        return (
          <div key={a.id} style={s.row}>
            <div style={s.grow}>
              <Checkbox
                checked={a.enabled && checked.includes(a.id)}
                disabled={!a.enabled}
                onChange={(v) => toggle(a.id, v)}
                label={
                  <span style={s.name}>
                    <TruncatedText text={a.name} />
                    {!a.enabled && <span style={s.tag}>{t("picker.disabled")}</span>}
                  </span>
                }
              />
            </div>
            <span style={s.estimate}>
              {e ? t("picker.estimate", { duration: formatSeconds(e.avg_duration_ms) }) : t("picker.noData")}
            </span>
            <button
              type="button"
              style={s.runBtn}
              aria-label={t("picker.runAgent", { name: a.name })}
              title={t("picker.runAgent", { name: a.name })}
              onClick={() => onRunAgent(a.id)}
            >
              <Icon.Play size={12} />
            </button>
          </div>
        );
      })}
      <div style={s.actions}>
        <Button kind="primary" size="sm" full disabled={blocked} onClick={start}>
          {isPending ? t("picker.starting") : t("picker.start", { count: checked.length })}
        </Button>
        {reason === "loading" && <p style={s.hint}>{t("picker.loading")}</p>}
        {(reason === "none" || reason === "single") && <p style={s.hint}>{t("picker.tooFew")}</p>}
        {groupRunning && resultsHref && (
          <Link href={resultsHref} style={s.link}>
            {t("picker.groupRunning")}
          </Link>
        )}
        {error && (
          <p role="alert" style={s.error}>
            {error.message}
          </p>
        )}
        {conflict && resultsHref && (
          <Link href={resultsHref} style={s.link}>
            {t("picker.activeRun")}
          </Link>
        )}
      </div>
      <Link href={`/repos/${repoId}/multi-agent?pr=${prNumber}`} style={s.footer}>
        <Icon.Settings size={13} />
        {t("picker.configure")}
      </Link>
    </div>
  );
}
