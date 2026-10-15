"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { TruncatedName } from "../../../../../../../../../../components/agent-stats";
import { s } from "./styles";

/** One row per linked agent (names are untrusted text; links are built from ids), or the "not linked" note. */
export function AgentsUsingPanel({ agents }: { agents: { id: string; name: string }[] }) {
  const t = useTranslations("skills");
  return (
    <section style={s.panel} aria-label={t("stats.agentsUsingThisSkill")}>
      <h2 style={s.title}>
        <Icon.Cpu size={13} />
        {t("stats.agentsUsingThisSkill")}
      </h2>
      {agents.length === 0 ? (
        <p style={s.empty}>{t("stats.notLinkedFigures")}</p>
      ) : (
        <ul style={s.list}>
          {agents.map((a) => (
            <li key={a.id} style={s.row}>
              <span aria-hidden="true" style={s.iconBox}>
                <Icon.Cpu size={12} />
              </span>
              <span style={s.name}>
                <TruncatedName name={a.name} />
              </span>
              <Link
                href={`/agents/${encodeURIComponent(a.id)}?tab=skills`}
                aria-label={t("stats.openLabel", { agent: a.name })}
                style={s.open}
              >
                {t("stats.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
