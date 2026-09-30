"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ContextDoc } from "@/lib/types";
import { s } from "../../styles";

type Group = { heading: "agentsHeading" | "skillsHeading"; base: "/agents" | "/skills"; items: { id: string; name: string }[] };

/**
 * "Used by N agents · M skills" disclosure. Activating it opens a scrollable list of links to each
 * agent/skill Context tab; Esc closes it and returns focus to the trigger.
 */
export function UsedBy({ usedBy }: { usedBy: ContextDoc["used_by"] }) {
  const t = useTranslations("context");
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();

  if (!usedBy) return <span style={s.rowMeta}>{t("usedBy.unavailable")}</span>;
  if (usedBy.agents.length === 0 && usedBy.skills.length === 0) {
    return <span style={s.rowMeta}>{t("usedBy.none")}</span>;
  }

  const groups: Group[] = [
    { heading: "agentsHeading", base: "/agents", items: usedBy.agents },
    { heading: "skillsHeading", base: "/skills", items: usedBy.skills },
  ];

  return (
    <span
      style={s.usedByWrap}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        style={s.usedByButton}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {t("usedBy.summary", { agents: usedBy.agents.length, skills: usedBy.skills.length })}
      </button>
      {open && (
        <div id={listId} style={s.usedByList}>
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.heading}>
                <h3 style={s.usedByHeading}>{t(`usedBy.${g.heading}`)}</h3>
                <ul style={s.list}>
                  {g.items.map((item) => (
                    <li key={item.id}>
                      <Link href={`${g.base}/${encodeURIComponent(item.id)}?tab=context`} style={s.usedByLink}>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </span>
  );
}
