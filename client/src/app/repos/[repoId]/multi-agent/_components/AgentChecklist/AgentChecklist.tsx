/* AgentChecklist — one checkbox per agent with its estimate or "no data".
   Disabled agents get a disabled checkbox and a "disabled" label. */
"use client";

import { useTranslations } from "next-intl";
import { Checkbox, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { TruncatedText } from "@/components/truncated-text/TruncatedText";
import { agentAccent, estimateOf, formatCost, formatSeconds } from "../../helpers";
import { s } from "./styles";

const SKELETON_ROWS = 3;

export function AgentChecklist({
  agents,
  estimates,
  checked,
  loading,
  onToggle,
}: {
  agents: Agent[] | undefined;
  estimates: AgentRunEstimate[] | undefined;
  checked: string[];
  loading: boolean;
  onToggle: (agentId: string, value: boolean) => void;
}) {
  const t = useTranslations("multiAgent");

  if (loading) {
    return (
      <div style={s.skeletons} aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={56} />
        ))}
      </div>
    );
  }
  if (!agents?.length) return <p>{t("configure.noAgents")}</p>;

  return (
    <div style={s.list} role="group" aria-label={t("configure.agentsHeading")}>
      {agents.map((a) => {
        const e = estimateOf(estimates, a.id);
        const accent = agentAccent(a.name);
        const AccentIcon = Icon[accent.icon];
        return (
          <div
            key={a.id}
            style={{
              ...s.card,
              borderColor: `color-mix(in srgb, ${accent.color} 45%, transparent)`,
              background: `color-mix(in srgb, ${accent.color} 8%, transparent)`,
              ...(a.enabled ? null : s.dimmed),
            }}
          >
            <Checkbox
              checked={a.enabled && checked.includes(a.id)}
              disabled={!a.enabled}
              onChange={(v) => onToggle(a.id, v)}
            />
            <span
              style={{
                ...s.tile,
                color: accent.color,
                background: `color-mix(in srgb, ${accent.color} 18%, transparent)`,
              }}
              aria-hidden="true"
            >
              <AccentIcon size={16} />
            </span>
            <div style={s.body}>
              <span style={s.name}>
                <TruncatedText text={a.name} />
                {!a.enabled && <span style={s.tag}>{t("configure.disabled")}</span>}
              </span>
              {a.description && <p style={s.description}>{a.description}</p>}
            </div>
            <span style={s.estimate}>
              {e
                ? t("configure.estimate", {
                    duration: formatSeconds(e.avg_duration_ms),
                    cost: formatCost(e.avg_cost_usd),
                  })
                : t("configure.noData")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
