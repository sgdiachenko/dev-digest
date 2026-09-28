/* BlastSymbolGroup — one changed symbol's downstream impact: its known
   callers (file:line, clickable on GitHub when repoFullName/headSha are
   known), followed by the endpoints/crons those callers reach. Collapsible
   (P3, 1:1 pattern with IntentCard's sourcesOpen/sourcesToggle) — defaults to
   expanded so data isn't hidden on first paint. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function BlastSymbolGroup({
  group,
  repoFullName,
  headSha,
}: {
  group: DownstreamImpact;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(true);
  const bodyId = React.useId();

  return (
    <div style={s.group}>
      <button
        type="button"
        style={s.toggleRow}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.ChevronDown
          size={14}
          style={{
            ...s.chevron,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform .12s",
          }}
        />
        <span className="mono" style={s.symbolName}>
          {group.symbol}
        </span>
        <span style={s.callerCount}>{t("callerCount", { count: group.callers.length })}</span>
      </button>

      {open && (
        <div id={bodyId} style={s.body}>
          <div style={s.callerList}>
            {group.callers.map((caller, i) => {
              const href =
                repoFullName && headSha
                  ? githubBlobUrl(repoFullName, headSha, caller.file, caller.line)
                  : undefined;
              return (
                <div key={i} style={s.callerRow}>
                  <MonoLink href={href}>
                    {caller.file}:{caller.line}
                  </MonoLink>
                  <span style={s.callerName}>{caller.name}</span>
                </div>
              );
            })}
          </div>

          {(group.endpoints_affected.length > 0 || group.crons_affected.length > 0) && (
            <div style={s.impactLists}>
              {group.endpoints_affected.length > 0 && <div style={s.impactGroup}>
                  <span style={s.impactLabel}>{t("legend.endpoints")}</span>
                  <div style={s.subList}>{group.endpoints_affected.map((endpoint) => (
                    <Badge key={endpoint} icon="Globe" color="var(--accent)" bg="var(--accent-bg)" mono>
                      {endpoint}
                    </Badge>
                  ))}</div>
                </div>}
              {group.crons_affected.length > 0 && <div style={s.impactGroup}>
                  <span style={s.impactLabel}>{t("legend.crons")}</span>
                  <div style={s.subList}>{group.crons_affected.map((cron) => (
                    <Badge key={cron} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono>
                      {cron}
                    </Badge>
                  ))}</div>
                </div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
