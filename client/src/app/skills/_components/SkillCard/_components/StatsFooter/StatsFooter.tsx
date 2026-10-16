"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import { HoverHint } from "../../../../../../components/agent-stats";
import { acceptLevel } from "../../../../../../lib/agent-stats/accept";
import { useStatsFormat } from "../../../../../../lib/agent-stats/useStatsFormat";
import { footerParts } from "../../helpers";
import { LEVEL_COLOR, s } from "./styles";

/**
 * "n agent(s) · x% pull · y% accept" for the rail card, with the run and decision counts on hover and focus.
 * The accept figure is coloured by the accept scale (`acceptLevel`); a small sample says so in grey instead of a percent.
 */
export function StatsFooter({ stats }: { stats: SkillStats }) {
  const t = useTranslations("skills");
  const f = useStatsFormat();
  const p = footerParts(stats);
  const b = p.breakdown;
  const hint = t("card.footer.breakdown", {
    pulled: f.count(b.pulled),
    total: f.count(b.total),
    accepted: f.count(b.accepted),
    decided: f.count(b.decided),
  });
  let acceptCell: React.ReactNode;
  if (p.accept.kind === "rate") {
    acceptCell = (
      <span style={{ color: LEVEL_COLOR[acceptLevel(p.accept.rate, false)], fontWeight: 600 }}>
        {t("card.footer.accept", { percent: f.percent(p.accept.rate) })}
      </span>
    );
  } else if (p.accept.kind === "smallSample") {
    acceptCell = <span style={s.muted}>{t("card.footer.smallSample")}</span>;
  } else {
    acceptCell = t("card.footer.noAccept");
  }
  return (
    <HoverHint text={hint}>
      {(target) => (
        <span
          tabIndex={0}
          style={s.footer}
          // The card around it is a link: Enter/Space here must not navigate, Escape still closes the hint.
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          {...target}
        >
          <span className="tnum">{t("card.footer.agents", { count: p.agents })}</span>
          <span style={s.sep}>·</span>
          <span className="tnum">
            {p.pullPct == null ? t("card.footer.noPull") : t("card.footer.pull", { percent: f.percent(p.pullPct / 100) })}
          </span>
          <span style={s.sep}>·</span>
          <span className="tnum">{acceptCell}</span>
        </span>
      )}
    </HoverHint>
  );
}
